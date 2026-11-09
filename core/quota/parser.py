"""Scope × Metric 正交化配额规则解析器。

修改原因：旧 quota parser 把 request、cost、token、ip:max、ip:rate 都写成扁平 Dimension，新增 per-IP cost/token 时会继续增加硬编码分支。
修改方式：把配置 key 解析为 Scope（作用域）× Metric（度量）× qualifier（三元组），parse_value 保持原有数量、窗口和 fixed/sliding 语义。
目的：让 key、ip、model 三类作用域可以复用同一套 request/cost/token 运行时逻辑，同时保留 default、credits、rate_limit 等旧格式兼容。

键格式：
  default / request       → key:request:default
  cost / cost:daily       → key:cost:default / key:cost:daily
  token / token_out       → key:token:default / key:token_out:default
  claude-opus-4           → model:request:claude-opus-4
  ip:request / ip:cost    → ip:request:default / ip:cost:default
  ip:max                  → key:unique_ip:default

值格式：
  "100/5h"          → 滑动窗口
  "50/inf"          → 永久额度
  "10/day:fixed"    → 固定窗口
  "60/min,1000/day" → 多条件（逗号分隔）
"""

import math
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Tuple


class Scope(str, Enum):
    """配额作用域。

    修改原因：旧 Dimension 同时包含作用域和度量，无法表达“每个 IP 的金额”这类组合。
    修改方式：独立声明 key、ip、model 三个正交作用域。
    目的：运行时可以先定位计数对象，再按 Metric 读写对应计数器。
    """

    KEY = 'key'
    IP = 'ip'
    MODEL = 'model'


class Metric(str, Enum):
    """配额度量。

    修改原因：旧 IP_RATE、IP_MAX 是特殊维度，导致 request 与 unique IP 逻辑混在一起。
    修改方式：把 request/cost/token/token_in/token_out 作为通用度量，unique_ip 作为 key scope 下的特殊度量。
    目的：让 per-IP request/cost/token 共用统一运行时，只保留 IP 去重这一处特殊逻辑。
    """

    REQUEST = 'request'
    COST = 'cost'
    TOKEN = 'token'
    TOKEN_IN = 'token_in'
    TOKEN_OUT = 'token_out'
    UNIQUE_IP = 'unique_ip'


class WindowType(str, Enum):
    SLIDING = 'sliding'
    FIXED = 'fixed'


@dataclass
class Limit:
    """单个限额条件。"""

    value: float          # 上限
    period: float         # 秒, math.inf = 永久
    window: WindowType    # 滑动/固定


@dataclass
class Rule:
    """一条完整的配额规则。"""

    scope: Scope
    metric: Metric
    qualifier: str        # key scope: default/daily/标签；model scope: 模型名；ip scope: default
    limits: List[Limit] = field(default_factory=list)


_UNITS = {
    's': 1, 'sec': 1, 'second': 1, 'seconds': 1,
    'm': 60, 'min': 60, 'minute': 60, 'minutes': 60,
    'h': 3600, 'hr': 3600, 'hour': 3600, 'hours': 3600,
    'd': 86400, 'day': 86400, 'days': 86400,
    'w': 604800, 'week': 604800, 'weeks': 604800,
    'mo': 2592000, 'month': 2592000, 'months': 2592000,
    'y': 31536000, 'year': 31536000, 'years': 31536000,
}

_INF_NAMES = frozenset({'inf', 'infinite', 'forever', 'permanent', '\u221e'})
_KEY_METRICS = {
    'request': Metric.REQUEST,
    'default': Metric.REQUEST,
    'cost': Metric.COST,
    'token': Metric.TOKEN,
    'token_in': Metric.TOKEN_IN,
    'token_out': Metric.TOKEN_OUT,
}
_IP_METRICS = {
    'request': Metric.REQUEST,
    'rate': Metric.REQUEST,  # 兼容旧 ip:rate 写法，等价于新 ip:request。
    'cost': Metric.COST,
    'token': Metric.TOKEN,
    'token_in': Metric.TOKEN_IN,
    'token_out': Metric.TOKEN_OUT,
}


def parse_key(key: str) -> Tuple[Scope, Metric, str]:
    """解析配置 key → (scope, metric, qualifier)。"""

    raw = str(key or '').strip()
    lowered = raw.lower()
    if not raw:
        return Scope.KEY, Metric.REQUEST, 'default'

    # 修改原因：ip:* 是新设计中唯一带显式 scope 前缀的普通规则，ip:max 是特殊的 key 级 unique_ip。
    # 修改方式：先识别 ip 前缀，再把 ip:rate 兼容映射为 ip:request。
    # 目的：让旧 ip:rate 和新 ip:request/ip:cost/ip:token 都能进入统一 ScopedStore。
    if ':' in raw:
        prefix, suffix = raw.split(':', 1)
        prefix_l = prefix.lower()
        suffix_l = suffix.lower()
        if prefix_l == 'ip':
            if suffix_l == 'max':
                return Scope.KEY, Metric.UNIQUE_IP, 'default'
            metric = _IP_METRICS.get(suffix_l)
            if metric is not None:
                return Scope.IP, metric, 'default'
            return Scope.MODEL, Metric.REQUEST, raw

        # 修改原因：cost:daily 这类 key 级标签规则需要保留 qualifier，不能被误判为模型。
        # 修改方式：已知 metric 前缀解析为 key scope，suffix 作为 qualifier；空 suffix 回退 default。
        # 目的：允许同一 metric 配置多个窗口标签，并让状态输出 key:metric:qualifier。
        metric = _KEY_METRICS.get(prefix_l)
        if metric is not None:
            return Scope.KEY, metric, suffix or 'default'

        # 修改原因：模型名可能包含冒号，不能因为出现冒号就丢失完整模型名。
        # 修改方式：未知前缀保持旧行为，整体作为 model scope 的 request qualifier。
        # 目的：兼容 gpt-4:latest 这类模型请求限速。
        return Scope.MODEL, Metric.REQUEST, raw

    metric = _KEY_METRICS.get(lowered)
    if metric is not None:
        return Scope.KEY, metric, 'default'

    # 修改原因：旧 rate_limit 字典里非 default key 表示模型限速。
    # 修改方式：未知裸 key 统一解析为 model scope 的 request metric。
    # 目的：保持 claude-opus-4: 10/min 这类旧模型限速配置可用。
    return Scope.MODEL, Metric.REQUEST, raw


def parse_value(value: str) -> List[Limit]:
    """解析配额值 → 限额条件列表。"""

    results = []
    for part in value.split(','):
        part = part.strip()
        if not part:
            continue
        window = WindowType.SLIDING
        if part.endswith(':fixed'):
            window = WindowType.FIXED
            part = part[:-6]
        elif part.endswith(':sliding'):
            part = part[:-8]

        match = re.match(r'^(\d+(?:\.\d+)?\s*[kKmMgGtT]?)/(.+)$', part)
        if not match:
            raise ValueError(f"Invalid format: '{part}'")
        count_str = match.group(1).strip()
        _SI = {'k': 1e3, 'K': 1e3, 'm': 1e6, 'M': 1e6, 'g': 1e9, 'G': 1e9, 't': 1e12, 'T': 1e12}
        if count_str and count_str[-1] in _SI:
            count = float(count_str[:-1]) * _SI[count_str[-1]]
        else:
            count = float(count_str)
        unit_str = match.group(2).strip()

        if unit_str.lower() in _INF_NAMES:
            period = math.inf
        else:
            um = re.match(r'^(\d+)?([a-zA-Z]+)$', unit_str)
            if not um:
                raise ValueError(f"Unknown unit: '{unit_str}'")
            mul = int(um.group(1)) if um.group(1) else 1
            base = um.group(2).lower()
            if base not in _UNITS:
                raise ValueError(f"Unknown unit: '{base}'")
            period = mul * _UNITS[base]
        results.append(Limit(value=count, period=period, window=window))
    if not results:
        raise ValueError("Empty quota value")
    return results


def parse_config(config: dict) -> List[Rule]:
    """解析完整 quota 配置 → Rule 列表。跳过无效规则并 log 警告。"""

    import logging
    log = logging.getLogger(__name__)
    rules = []
    for key, value in config.items():
        if not isinstance(value, str) or not value.strip():
            continue
        try:
            scope, metric, qualifier = parse_key(key)
            limits = parse_value(value)
            rules.append(Rule(scope=scope, metric=metric, qualifier=qualifier, limits=limits))
        except ValueError as e:
            log.warning(f"[quota] Invalid rule '{key}={value}': {e}")
    return rules
