"""HTTP header 合并工具。"""


from typing import Optional


def has_header_case_insensitive(headers: Optional[dict], key: str) -> bool:
    """大小写无关地检查请求头是否存在。"""
    if not isinstance(headers, dict):
        return False

    key_lower = str(key).lower()
    return any(str(existing_key).lower() == key_lower for existing_key in headers.keys())


def _set_header_case_insensitive(headers: Optional[dict], key: str, value) -> None:
    """大小写无关地写入请求头，避免 Content-Type/content-type 一类重复键。"""
    if not isinstance(headers, dict):
        return

    key_str = str(key)
    key_lower = key_str.lower()
    target_key = None

    for existing_key in headers.keys():
        if str(existing_key).lower() == key_lower:
            target_key = existing_key
            break

    normalized_value = ",".join(str(i) for i in value) if isinstance(value, list) else str(value)

    if target_key is None:
        headers[key_str] = normalized_value
    else:
        headers[target_key] = normalized_value


def apply_custom_headers(headers: dict, custom_headers: Optional[dict]) -> None:
    """将渠道自定义 headers 合并到请求头中。

    custom_headers 的值支持两种格式：
    - str: 直接设置
    - list[str]: 用逗号拼接后设置（符合 RFC 7230 §3.2.2）

    示例::
        {"anthropic-beta": ["val1", "val2"]}  →  "anthropic-beta": "val1,val2"
        {"X-Custom": "abc"}                   →  "X-Custom": "abc"
    """
    if not isinstance(custom_headers, dict):
        return
    for k, v in custom_headers.items():
        if v is None:
            continue
        # 值为 "null" 字符串时删除该 header（用于屏蔽渠道硬编码的头）
        if isinstance(v, str) and v.strip().lower() == "null":
            key_lower = str(k).lower()
            for existing_key in list(headers.keys()):
                if str(existing_key).lower() == key_lower:
                    del headers[existing_key]
                    break
            continue
        _set_header_case_insensitive(headers, k, v)
