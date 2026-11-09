"""
事件循环阻塞监控与线程栈转储。

用途：
- 当事件循环长时间没有心跳时，自动转储所有线程栈
- 支持通过信号手动触发线程栈转储
"""

from __future__ import annotations

import asyncio
import faulthandler
import os
import signal
import sys
import threading
from datetime import datetime
from pathlib import Path
from time import monotonic
from typing import Optional

from core.env import env_bool
from core.log_config import logger

_TRUE_VALUES = {"1", "true", "yes", "y", "on"}
_FALSE_VALUES = {"0", "false", "no", "n", "off"}


def _parse_bool(value: object, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in _TRUE_VALUES:
            return True
        if lowered in _FALSE_VALUES:
            return False
    return default


def _parse_float(value: object, default: float, minimum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= minimum else minimum


class EventLoopBlockWatchdog:
    """监控事件循环阻塞，并在阻塞时转储线程栈。"""

    def __init__(
        self,
        *,
        enabled: bool = True,
        stall_threshold: float = 30.0,
        check_interval: float = 5.0,
        heartbeat_interval: float = 1.0,
        dump_cooldown: float = 300.0,
        auto_kill_threshold: float = 120.0,
        dump_dir: str = "data/thread_dumps",
        register_signals: bool = True,
    ) -> None:
        self.enabled = enabled
        self.stall_threshold = max(1.0, float(stall_threshold))
        self.check_interval = max(0.5, float(check_interval))
        self.heartbeat_interval = max(0.2, float(heartbeat_interval))
        self.dump_cooldown = max(1.0, float(dump_cooldown))
        self.auto_kill_threshold = max(0.0, float(auto_kill_threshold))
        self.dump_dir = dump_dir
        self.register_signals = register_signals

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._last_heartbeat = monotonic()
        self._last_dump = 0.0
        self._registered_signals: list[int] = []
        self._installed = False

    @classmethod
    def from_settings(cls, settings: Optional[dict] = None) -> "EventLoopBlockWatchdog":
        settings = settings or {}
        return cls(
            enabled=_parse_bool(
                settings.get("thread_dump_watchdog_enabled"),
                env_bool("THREAD_DUMP_WATCHDOG_ENABLED", True),
            ),
            stall_threshold=_parse_float(
                settings.get("thread_dump_watchdog_threshold"),
                _parse_float(os.getenv("THREAD_DUMP_WATCHDOG_THRESHOLD"), 30.0, 1.0),
                1.0,
            ),
            check_interval=_parse_float(
                settings.get("thread_dump_watchdog_check_interval"),
                _parse_float(os.getenv("THREAD_DUMP_WATCHDOG_CHECK_INTERVAL"), 5.0, 0.5),
                0.5,
            ),
            heartbeat_interval=_parse_float(
                settings.get("thread_dump_watchdog_heartbeat_interval"),
                _parse_float(os.getenv("THREAD_DUMP_WATCHDOG_HEARTBEAT_INTERVAL"), 1.0, 0.2),
                0.2,
            ),
            dump_cooldown=_parse_float(
                settings.get("thread_dump_watchdog_cooldown"),
                _parse_float(os.getenv("THREAD_DUMP_WATCHDOG_COOLDOWN"), 300.0, 1.0),
                1.0,
            ),
            auto_kill_threshold=_parse_float(
                settings.get("thread_dump_watchdog_auto_kill_threshold"),
                _parse_float(os.getenv("THREAD_DUMP_WATCHDOG_AUTO_KILL_THRESHOLD"), 120.0, 0.0),
                0.0,
            ),
            dump_dir=str(
                settings.get("thread_dump_watchdog_dir")
                or os.getenv("THREAD_DUMP_WATCHDOG_DIR")
                or "data/thread_dumps"
            ),
            register_signals=_parse_bool(
                settings.get("thread_dump_watchdog_register_signals"),
                env_bool("THREAD_DUMP_WATCHDOG_REGISTER_SIGNALS", True),
            ),
        )

    def install(self) -> None:
        if self._installed:
            return

        try:
            faulthandler.enable(file=sys.stderr, all_threads=True)
        except Exception as exc:
            logger.warning(f"Failed to enable faulthandler: {exc}")

        if self.register_signals:
            for signal_name in ("SIGBREAK", "SIGUSR1"):
                signum = getattr(signal, signal_name, None)
                if signum is None:
                    continue
                try:
                    faulthandler.register(signum, file=sys.stderr, all_threads=True, chain=False)
                    self._registered_signals.append(signum)
                except Exception:
                    continue

        self._installed = True

    async def start(self) -> None:
        self.install()

        if not self.enabled:
            return
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._last_heartbeat = monotonic()
        self._last_dump = 0.0
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        self._thread = threading.Thread(
            target=self._watch_loop,
            name="zoaholic-block-watchdog",
            daemon=True,
        )
        self._thread.start()

    async def stop(self) -> None:
        self._stop_event.set()

        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=min(1.0, self.check_interval))
        self._thread = None

        for signum in self._registered_signals:
            try:
                faulthandler.unregister(signum)
            except Exception:
                pass
        self._registered_signals.clear()

    def beat(self) -> None:
        self._last_heartbeat = monotonic()

    async def _heartbeat_loop(self) -> None:
        try:
            while not self._stop_event.is_set():
                self.beat()
                await asyncio.sleep(self.heartbeat_interval)
        except asyncio.CancelledError:
            raise

    def _watch_loop(self) -> None:
        while not self._stop_event.wait(self.check_interval):
            lag = monotonic() - self._last_heartbeat

            # 如果配置了自尽阈值且超过阈值，直接自杀（依赖外部如 Docker/PM2 重启）
            if self.auto_kill_threshold > 0 and lag > self.auto_kill_threshold:
                logger.error(f"[Watchdog] Event loop blocked for {lag:.1f}s, exceeding auto_kill_threshold ({self.auto_kill_threshold}s). Sending SIGKILL to self.")
                self._dump_tracebacks(lag)
                os.kill(os.getpid(), signal.SIGKILL if hasattr(signal, 'SIGKILL') else signal.SIGTERM)

            if lag < self.stall_threshold:
                continue

            now = monotonic()
            if now - self._last_dump < self.dump_cooldown:
                continue

            self._last_dump = now
            self._dump_tracebacks(lag)

    def _dump_tracebacks(self, lag: float) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        header = (
            f"\n===== Event loop block detected at {timestamp} "
            f"(lag={lag:.1f}s) =====\n"
        )
        dump_path = None

        try:
            dump_dir = Path(self.dump_dir)
            dump_dir.mkdir(parents=True, exist_ok=True)
            dump_file = dump_dir / f"thread-dump-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
            with dump_file.open("a", encoding="utf-8") as file:
                file.write(header)
                file.flush()
                faulthandler.dump_traceback(file=file, all_threads=True)
                file.write("\n")
                file.flush()
            dump_path = str(dump_file)
        except Exception as exc:
            logger.error(f"Failed to write thread dump file: {exc}")

        try:
            sys.stderr.write(header)
            sys.stderr.flush()
            faulthandler.dump_traceback(file=sys.stderr, all_threads=True)
            sys.stderr.write("\n")
            sys.stderr.flush()
        except Exception as exc:
            logger.error(f"Failed to dump thread traceback to stderr: {exc}")

        if dump_path:
            logger.error(f"Event loop block detected, thread dump written to {dump_path}")
        else:
            logger.error("Event loop block detected, thread dump written to stderr")
