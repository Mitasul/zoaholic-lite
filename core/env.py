from __future__ import annotations

# 修改原因：当前部署的 python3 是 3.8，运行时会执行 set[str] 这类新式类型标注并导致导入失败。
# 修改方式：启用 postponed annotations，让类型标注延迟为字符串，不改变 env_bool 的运行逻辑。
# 目的：确保用户要求的 python3 导入验证可以通过，并保持对较新 Python 的兼容性。
import os
from typing import Final

_TRUE_VALUES: Final[set[str]] = {"1", "true", "yes", "y", "on"}
_FALSE_VALUES: Final[set[str]] = {"0", "false", "no", "n", "off"}


def env_bool(name: str, default: bool = False) -> bool:
    """读取布尔类型环境变量。

    兼容常见写法：1/0, true/false, yes/no, on/off。
    """

    raw = os.getenv(name)
    if raw is None:
        return default

    value = raw.strip().lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    return default
