"""
针对安全审计报告 (VULN-01 ~ VULN-17) 中全部真实漏洞修复的回归测试。
"""

import base64
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException, Request

from core.auth import authenticate_admin_api_key_token, verify_admin_api_key
from core.channels.openai_channel import get_gpt_payload
from core.dialects import openai_responses_ws
from core.middleware import StatsMiddleware
from core.models import RequestModel
from core.streaming import LoggingStreamingResponse
from core.utils import scrub_sensitive_error_text
from plugins.file_to_text import MAX_FILE_BASE64_CHARS, _decode_content
from routes import admin as admin_routes
from routes import auth as auth_routes
from routes import setup as setup_routes
from routes import workspace as workspace_routes


def test_vuln07_client_ip_ignores_forged_xff_first_hop_and_prefers_cf_connecting_ip():
    scope = {"client": ("10.0.0.1", 12345)}
    headers = [
        (b"x-forwarded-for", b"1.1.1.1, 198.51.100.42"),
    ]
    assert StatsMiddleware._get_client_ip(scope, headers) == "198.51.100.42"

    headers_with_cf = [
        (b"cf-connecting-ip", b"203.0.113.99"),
        (b"x-forwarded-for", b"1.1.1.1, 198.51.100.42"),
    ]
    assert StatsMiddleware._get_client_ip(scope, headers_with_cf) == "203.0.113.99"

    ws_mock = SimpleNamespace(
        headers={"x-forwarded-for": "8.8.8.8, 192.0.2.77"},
        client=SimpleNamespace(host="127.0.0.1"),
    )
    assert openai_responses_ws._get_client_ip(ws_mock) == "192.0.2.77"


def test_vuln11_scrub_sensitive_error_text_redacts_query_keys_and_provider_secrets():
    raw_err = (
        "Client error '404 Not Found' for url "
        "'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=AIzaSyD1234567890abcdefghijk&alt=sse' "
        "with header Authorization: Bearer sk-proj-supersecretkey1234567890 and custom=my-custom-upstream-secret"
    )
    scrubbed = scrub_sensitive_error_text(raw_err, ["my-custom-upstream-secret"])
    assert "AIzaSyD1234567890abcdefghijk" not in scrubbed
    assert "sk-proj-supersecretkey1234567890" not in scrubbed
    assert "my-custom-upstream-secret" not in scrubbed
    assert "key=***" in scrubbed
    assert "Bearer ***" in scrubbed


def test_vuln12_no_silent_promotion_of_user_key_to_admin():
    conf_only_users = {
        "api_keys": [
            {"api": "zk-user-first", "role": "user"},
            {"api": "zk-user-second", "role": "user"},
        ]
    }
    assert auth_routes._select_admin_api_key_from_config(conf_only_users) is None
    assert setup_routes._select_admin_api_key_from_config(conf_only_users) is None

    app = FastAPI()
    app.state.api_list = ["zk-user-only"]
    app.state.api_keys_db = [{"api": "zk-user-only", "role": "user"}]
    app.state.admin_initialized = True
    app.state.needs_setup = False
    app.state.global_ip_blacklist_matcher = None

    with pytest.raises(HTTPException) as exc_info:
        authenticate_admin_api_key_token(app, "zk-user-only", "127.0.0.1")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_vuln09_login_brute_force_lockout(monkeypatch):
    auth_routes._LOGIN_FAILURES.clear()
    fake_app = FastAPI()
    monkeypatch.setattr(auth_routes, "get_app", lambda: fake_app)
    monkeypatch.setattr(auth_routes, "ensure_initialized", AsyncMock(return_value=None))
    monkeypatch.setattr(
        auth_routes,
        "get_admin_user",
        AsyncMock(return_value=SimpleNamespace(username="admin", password_hash="hashed")),
    )
    monkeypatch.setattr(auth_routes, "verify_password", lambda plain, hashed: plain == "correct-password")

    req = SimpleNamespace(
        headers={"x-forwarded-for": "1.2.3.4, 198.51.100.88"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    for _ in range(auth_routes.MAX_LOGIN_FAILURES):
        with pytest.raises(HTTPException) as exc_info:
            await auth_routes.login(
                request=req,
                payload=auth_routes.LoginRequest(username="admin", password="wrong-password"),
            )
        assert exc_info.value.status_code == 403

    # 第 MAX_LOGIN_FAILURES + 1 次即使提供正确密码也应触发 429 锁定
    with pytest.raises(HTTPException) as locked_exc:
        await auth_routes.login(
            request=req,
            payload=auth_routes.LoginRequest(username="admin", password="correct-password"),
        )
    assert locked_exc.value.status_code == 429
    auth_routes._LOGIN_FAILURES.clear()


def test_vuln08_workspace_blocks_symlink_escape(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace_routes, "PROJECT_ROOT", tmp_path.resolve())
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secret_file = tmp_path / ".env.production"
    secret_file.write_text("SECRET=123", encoding="utf-8")

    # 即使在白名单 data/ 下创建指向项目内敏感文件的软链接，也必须被拦截
    link_path = data_dir / "leak.txt"
    try:
        link_path.symlink_to(secret_file)
    except OSError:
        pytest.skip("当前环境不支持创建测试软链接")

    assert workspace_routes._get_permissions("data/leak.txt") == ""
    with pytest.raises(HTTPException) as exc_info:
        workspace_routes._resolve_path("data/leak.txt")
    assert exc_info.value.status_code == 403


def test_vuln14_generate_api_key_requires_admin_dependency():
    for route in admin_routes.router.routes:
        if getattr(route, "path", None) == "/v1/generate-api-key":
            dep_calls = [dep.call for dep in route.dependant.dependencies]
            assert verify_admin_api_key in dep_calls
            return
    pytest.fail("Route /v1/generate-api-key not found")


def test_vuln15_file_to_text_rejects_oversized_base64():
    small_b64 = base64.b64encode(b"hello world").decode("ascii")
    assert _decode_content(small_b64) == "hello world"

    oversized_str = "A" * (MAX_FILE_BASE64_CHARS + 16)
    assert _decode_content(oversized_str) is None


@pytest.mark.asyncio
async def test_vuln16_openai_stream_enforces_include_usage_and_499_disconnect_fallback():
    req = RequestModel(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hello"}],
        stream=True,
        stream_options={"include_usage": False},
    )
    provider = {
        "provider": "openai-test",
        "base_url": "https://api.openai.com/v1/chat/completions",
        "model": [{"gpt-4o": "gpt-4o"}],
    }
    _, _, payload = await get_gpt_payload(req, "openai", provider, "sk-test")
    assert payload["stream_options"]["include_usage"] is True

    # 验证流式响应在客户端断连 (499) 且未收到尾帧 usage 时，回退记录预估输入/输出 token
    captured_stats = []

    async def body_gen():
        yield b'data: {"choices":[{"delta":{"content":"Hello world from stream!"}}]}\n\n'
        raise RuntimeError("Simulated client disconnect during send")

    current_info = {
        "start_time": 1000.0,
        "_estimated_prompt_tokens": 25,
    }
    resp = LoggingStreamingResponse(body_gen(), media_type="text/event-stream", current_info=current_info)

    async def fake_send(msg):
        if msg["type"] == "http.response.body" and msg.get("body"):
            return

    from core import streaming as streaming_mod
    orig_enqueue = streaming_mod.enqueue_stats
    streaming_mod.enqueue_stats = lambda info, app=None: captured_stats.append(dict(info))
    try:
        await resp({"type": "http"}, AsyncMock(), fake_send)
    finally:
        streaming_mod.enqueue_stats = orig_enqueue

    assert len(captured_stats) == 1
    recorded = captured_stats[0]
    assert recorded["prompt_tokens"] == 25
    assert recorded["completion_tokens"] >= 1
    assert recorded["total_tokens"] == 25 + recorded["completion_tokens"]


@pytest.mark.asyncio
async def test_vuln13_model_path_traversal_and_follow_redirects_disabled():
    from core.client_manager import ClientManager
    from core.handler import ModelRequestHandler

    cm = ClientManager()
    await cm.init({})
    async with cm.get_client("https://api.openai.com/v1/chat/completions") as client:
        assert client.follow_redirects is False
    await cm.close()

    app = FastAPI()
    app.state.config = {"api_keys": [{"api": "zk-test", "role": "user", "model": ["*"]}], "providers": []}
    app.state.api_list = ["zk-test"]
    app.state.api_keys_db = app.state.config["api_keys"]
    handler = ModelRequestHandler(app, lambda: {}, AsyncMock())

    for bad_model in ("../v1beta/tunedModels", "gemini-2.5-pro?key=evil", "gpt-4o#frag", "foo\\bar"):
        req = RequestModel(model=bad_model, messages=[{"role": "user", "content": "hi"}])
        with pytest.raises(HTTPException) as exc_info:
            await handler.request_model(req, api_index=0, background_tasks=SimpleNamespace())
        assert exc_info.value.status_code == 400

