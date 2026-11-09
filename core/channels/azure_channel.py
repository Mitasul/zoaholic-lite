"""
Azure OpenAI 渠道适配器 (Responses API)

锁定使用 Azure v1 Responses API，不走 chat completions。
base_url 配到 Azure resource 即可，渠道自动拼 /openai/v1/responses。

API Key 格式支持：
- 纯 key: "sk-xxxxxxxx" — 需要手动配 base_url
- resource:key: "myresource:sk-xxxxxxxx" — 自动拼 base_url
  反代也支持: base_url 配 "https://workers.dev/{resource}.openai.azure.com"
  {resource} 会被替换成冒号前的部分
"""

from ..utils import safe_get


# ============================================================
# Azure 专有逻辑
# ============================================================

DEFAULT_BASE_URL = "https://{resource}.openai.azure.com"


def _parse_resource_key(api_key: str, base_url: str):
    """解析 resource:key 格式，返回 (实际 api_key, 最终 base_url)。

    支持三种场景：
    1. 纯 key（无冒号）→ base_url 不变
    2. resource:key → base_url 里的 {resource} 占位符被替换
    3. resource:key + 反代 base_url → 同样替换 {resource}
    """
    api_key_str = str(api_key or "")
    if ":" not in api_key_str:
        return api_key_str, base_url

    resource, real_key = api_key_str.split(":", 1)
    resource = resource.strip()
    real_key = real_key.strip()

    if not resource or not real_key:
        return api_key_str, base_url

    # 替换 base_url 中的 {resource} 占位符
    if "{resource}" in base_url:
        resolved_url = base_url.replace("{resource}", resource)
    else:
        # base_url 没有占位符，可能是直接写了完整 URL，不做替换
        resolved_url = base_url

    return real_key, resolved_url


def _resolve_azure_v1_base(api_key, provider):
    """解析 Azure 凭据并构建 v1 base_url。

    返回 (real_key, azure_v1_base_url)
    azure_v1_base_url 形如 https://xxx.openai.azure.com/openai/v1
    """
    raw_base_url = provider.get('base_url', DEFAULT_BASE_URL)
    real_key, resolved_url = _parse_resource_key(api_key, raw_base_url)

    # {resource} 还在说明没有 resource:key 格式也没手动填 base_url
    if "{resource}" in resolved_url:
        raise ValueError("Azure 渠道需要配置 resource:key 格式的 API Key 或手动指定 base_url")

    # 拼接 /openai/v1（Azure v1 的 base path）
    resolved_url = resolved_url.rstrip('/')
    if not resolved_url.endswith('/openai/v1'):
        # 兼容已经填了 /openai/v1 的用户
        resolved_url += '/openai/v1'

    return real_key, resolved_url


def _apply_azure_auth(headers, real_key, provider, url):
    """替换认证头为 Azure api-key，可选追加 api-version query param。"""
    headers.pop('Authorization', None)
    headers.pop('OpenAI-Organization', None)
    headers['api-key'] = real_key

    # 用户配了 api_version（如 "preview"）时追加 query param
    api_version = safe_get(provider, "preferences", "api_version", default=None)
    if api_version and '?' not in url:
        url = f"{url}?api-version={api_version}"

    return url, headers


# ============================================================
# 请求构建 — 复用 OAI Responses 逻辑，只改认证和 URL
# ============================================================


async def get_azure_payload(request, engine, provider, api_key=None):
    """构建 Azure Responses API payload，复用 OAI responses 逻辑"""
    from .openai_responses_channel import get_responses_payload

    real_key, azure_base = _resolve_azure_v1_base(api_key, provider)

    # 用 Azure v1 base_url 调 OAI responses 的 payload 构建
    azure_provider = {**provider, 'base_url': azure_base}
    url, headers, payload = await get_responses_payload(request, engine, azure_provider, real_key)

    url, headers = _apply_azure_auth(headers, real_key, provider, url)
    return url, headers, payload


async def get_azure_passthrough_meta(request, engine, provider, api_key=None):
    """Azure responses 透传 meta"""
    from .openai_responses_channel import get_responses_passthrough_meta

    real_key, azure_base = _resolve_azure_v1_base(api_key, provider)

    azure_provider = {**provider, 'base_url': azure_base}
    url, headers, _ = await get_responses_passthrough_meta(request, engine, azure_provider, real_key)

    url, headers = _apply_azure_auth(headers, real_key, provider, url)
    return url, headers, {}


# ============================================================
# 模型列表
# ============================================================


async def fetch_azure_models(client, provider):
    """获取 Azure OpenAI 的模型列表（数据平面 API）。

    使用 GET {endpoint}/openai/models 端点，api-key 认证。
    返回该 Azure 资源下所有可用模型。
    """
    raw_base_url = provider.get('base_url', DEFAULT_BASE_URL)
    api_key = provider.get('api')
    if isinstance(api_key, list):
        api_key = api_key[0] if api_key else None

    # 解析 resource:key
    real_key, resolved_url = _parse_resource_key(api_key, raw_base_url)

    # {resource} 还在说明没有 resource:key 格式也没手动填 base_url
    if "{resource}" in resolved_url:
        raise ValueError("Azure 渠道需要配置 resource:key 格式的 API Key 或手动指定 base_url")

    resolved_url = resolved_url.rstrip('/')
    # 数据平面模型列表端点
    models_url = f"{resolved_url}/openai/models?api-version=2024-10-21"

    headers = {
        'Content-Type': 'application/json',
        'api-key': real_key,
    }

    response = await client.get(models_url, headers=headers)
    response.raise_for_status()

    data = response.json()
    models = []
    if isinstance(data, dict) and 'data' in data:
        for m in data['data']:
            if isinstance(m, dict) and m.get('id'):
                models.append(m['id'])
    elif isinstance(data, list):
        models = [m.get('id') if isinstance(m, dict) else m for m in data]

    return models


# ============================================================
# 注册
# ============================================================


_AZURE_KEY_HINT = """
export default function render(ctx) {
    ctx.el.textContent = 'Azure Portal → 资源 → Keys and Endpoint 中获取 API Key';
}
""".strip()

_AZURE_BASE_URL_HINT = """
export default function render(ctx) {
    ctx.el.textContent = '格式：https://{资源名}.openai.azure.com（部署名在模型映射中配置）';
}
""".strip()


def register():
    """注册 Azure 渠道到注册中心"""
    from .registry import register_channel
    from .openai_responses_channel import fetch_responses_response, fetch_responses_stream

    register_channel(
        id="azure",
        type_name="openai-responses",
        default_base_url=DEFAULT_BASE_URL,
        auth_header="api-key: {api_key}",
        description="Azure OpenAI Service (Responses API)",
        request_adapter=get_azure_payload,
        passthrough_adapter=get_azure_passthrough_meta,
        response_adapter=fetch_responses_response,
        stream_adapter=fetch_responses_stream,
        models_adapter=fetch_azure_models,
        ui_slots={
            "key_hint": _AZURE_KEY_HINT,
            "base_url_hint": _AZURE_BASE_URL_HINT,
        },
        source="builtin",
    )
