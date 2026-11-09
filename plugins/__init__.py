"""
Zoaholic Plugins

将自定义插件放在此目录下，系统会自动加载。

插件规范：
1. 必须定义 PLUGIN_INFO 字典提供插件元信息（推荐）
2. 可选实现 setup(manager) 函数用于初始化
3. 可选实现 teardown(manager) 函数用于清理
4. 可选实现 unload() 函数用于卸载

详见 docs/plugin-development.md

同时提供常用插件拦截器便捷函数的再导出，方便插件作者从 plugins 包或 core.plugins 包读取同一套能力。
"""

# 修改原因：balance_enricher 新增后，根 plugins 包也需要提供与 core.plugins 一致的常用导出。
# 修改方式：从 core.plugins 转发余额补充器的注册、注销和应用函数。
# 目的：避免插件作者在不同导入路径之间遇到能力不一致。
from core.plugins import (
    apply_balance_enrichers,
    register_balance_enricher,
    unregister_balance_enricher,
)

__all__ = [
    "apply_balance_enrichers",
    "register_balance_enricher",
    "unregister_balance_enricher",
]