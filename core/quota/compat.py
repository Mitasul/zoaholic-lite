"""旧配置字段到 quota 格式的兼容转换。

处理：
  preferences.rate_limit  →  quota 请求维度
  preferences.credits     →  quota cost 维度
  preferences.quota       →  直接使用（最高优先级）
"""

from typing import Optional, Union


def convert_rate_limit(rate_limit: Union[str, dict, None]) -> Optional[dict]:
    """旧 preferences.rate_limit → quota dict (请求维度 keys)。

    "60/min"                          → {"default": "60/min"}
    {"default": "60/min", "claude": "10/min"} → 原样
    """
    if rate_limit is None:
        return None
    if isinstance(rate_limit, str):
        return {'default': rate_limit}
    if isinstance(rate_limit, dict):
        return dict(rate_limit)
    return None


def convert_credits(credits: Optional[float]) -> Optional[dict]:
    """旧 preferences.credits → quota dict (cost 维度)。

    credits: 50  →  {"cost": "50/inf"}
    """
    if credits is None or credits < 0:
        return None
    return {'cost': f'{credits}/inf'}


def merge_legacy_to_quota(preferences: dict) -> dict:
    """从 preferences 合并旧字段为统一 quota dict。

    优先级: quota > rate_limit / credits
    """
    quota = preferences.get('quota')
    if isinstance(quota, dict) and quota:
        return dict(quota)

    result = {}
    rl = convert_rate_limit(preferences.get('rate_limit'))
    if rl:
        result.update(rl)
    cr = convert_credits(preferences.get('credits'))
    if cr:
        result.update(cr)
    return result
