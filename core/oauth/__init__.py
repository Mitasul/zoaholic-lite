"""OAuth 凭据管理入口。"""

# 修改原因：Codex OAuth 凭据管理需要一个稳定的包级入口，供 main.py 在启动期初始化。
# 修改方式：从 manager 模块导出 OAuthManager，不在包导入时读取磁盘或发起网络请求。
# 目的：让 OAuth 功能可以按需挂载到 app.state，同时避免导入阶段产生副作用。
from .manager import OAuthManager

__all__ = ["OAuthManager"]
