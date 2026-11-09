"""
Azure 通用认证插件

将任意原生渠道（openai / openai-image / claude 等）适配为 Azure 认证方式。
支持 resource:key 格式自动替换 base_url 中的 {resource} 占位符，
将 Authorization Bearer 替换为 api-key header，可选追加 api-version query param。

使用方式：
  engine: openai  # 或 openai-image / claude / 任意引擎
  base_url: "https://{resource}.openai.azure.com/openai/v1"
  api: "myresource:sk-xxxxx"
  preferences:
    enabled_plugins:
      - azure_auth
    api_version: "2025-04-01-preview"   # 可选
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode, urlparse, urlunparse, parse_qs

from core.log_config import logger
from core.plugins import (
    register_request_interceptor,
    unregister_request_interceptor,
)


PLUGIN_INFO = {
    "name": "azure_auth",
    "version": "1.0.0",
    "description": "Azure 通用认证：resource:key 解析 + api-key header + api-version",
    "author": "Zoaholic",
    "dependencies": [],
    "metadata": {
        "category": "interceptor",
        "tags": ["azure", "auth", "api-key"],
    },
}

EXTENSIONS = [
    "interceptors:azure_auth_request",
]


def _parse_resource_key(api_key: str) -> Tuple[str, Optional[str]]:
    """解析 resource:key 格式，返回 (real_key, resource)。无冒号时 resource=None。"""
    key_str = str(api_key or "").strip()
    if ":" not in key_str:
        return key_str, None
    resource, real_key = key_str.split(":", 1)
    resource = resource.strip()
    real_key = real_key.strip()
    if not resource or not real_key:
        return key_str, None
    return real_key, resource


def _append_api_version(url: str, api_version: str) -> str:
    """向 URL 追加 api-version query param（如果尚未存在）。"""
    parsed = urlparse(url)
    existing = parse_qs(parsed.query)
    if "api-version" in existing:
        return url
    sep = "&" if parsed.query else ""
    new_query = f"{parsed.query}{sep}api-version={api_version}"
    return urlunparse(parsed._replace(query=new_query))


async def azure_auth_request_interceptor(
    request: Any,
    engine: str,
    provider: Dict[str, Any],
    api_key: Optional[str],
    url: str,
    headers: Dict[str, Any],
    payload: Dict[str, Any],
) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
    """Azure 认证注入：resource:key 解析 + api-key header + api-version。"""

    real_key, resource = _parse_resource_key(api_key)

    # 替换 URL 中的 {resource} 占位符
    if resource and "{resource}" in url:
        url = url.replace("{resource}", resource)

    # Authorization → api-key
    headers.pop("Authorization", None)
    headers.pop("OpenAI-Organization", None)
    if real_key:
        headers["api-key"] = real_key

    # 可选追加 api-version
    preferences = provider.get("preferences") or {}
    api_version = preferences.get("api_version")
    if api_version:
        url = _append_api_version(url, str(api_version))

    logger.debug("[azure_auth] Azure auth injected, url=%s", url)
    return url, headers, payload


def setup(manager):
    register_request_interceptor(
        interceptor_id="azure_auth_request",
        callback=azure_auth_request_interceptor,
        priority=15,
        plugin_name=PLUGIN_INFO["name"],
        overwrite=True,
        metadata={"description": "Azure 通用认证注入"},
    )


def teardown(manager):
    unregister_request_interceptor("azure_auth_request")
