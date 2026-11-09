"""数据库配置读写工具。"""


# 迁移说明：
# 修改原因：该模块承载业务逻辑，不应继续放在 utils_pkg 这种通用工具包中。
# 修改方式：按照 Scout 的归位方案迁移到 core 对应业务模块，并只调整必要的内部导入路径。
# 目的：让业务代码按领域归属维护，同时保留根 utils.py 和 utils_pkg shim 的旧导入兼容性。
from typing import Optional

from db import AppConfig, DB_TYPE, DISABLE_DATABASE, async_session_scope, d1_client
from core.log_config import logger

from .codec import yaml
from .serialization import dump_config_to_json_obj, dump_config_to_yaml_text


async def save_config_to_db(config_data: dict) -> None:
    """把配置写入数据库（app_config 表，id=1）。

    主存储为 JSON/JSONB（config_json）。
    - Postgres/CockroachDB：存 dict（SQLAlchemy JSONB）或存 JSON 字符串（回退）
    另外会同步存一份 YAML（config_yaml）便于人工排查（可选）。
    """

    if DISABLE_DATABASE:
        return

    config_obj = dump_config_to_json_obj(config_data)
    config_yaml = dump_config_to_yaml_text(config_data)

    # 若底层字段是 Text（例如我们对非 Postgres dialect 做的回退），存 JSON 字符串
    config_json_value = config_obj
    try:
        from db import AppConfig as _AppConfigModel
        col_type_name = type(_AppConfigModel.__table__.c.config_json.type).__name__.lower()
        if "text" in col_type_name:
            import json as _json
            config_json_value = _json.dumps(config_obj, ensure_ascii=False)
    except Exception:
        pass

    if (DB_TYPE or "sqlite").lower() == "d1":
        if d1_client is None:
            return
        import json as _json

        config_json_text = config_json_value
        if not isinstance(config_json_text, str):
            config_json_text = _json.dumps(config_json_text, ensure_ascii=False)

        existing = await d1_client.query_one("SELECT id FROM app_config WHERE id = ?", [1])
        if existing is None:
            await d1_client.execute(
                "INSERT INTO app_config (id, config_json, config_yaml, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                [1, config_json_text, config_yaml],
            )
        else:
            await d1_client.execute(
                "UPDATE app_config SET config_json = ?, config_yaml = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [config_json_text, config_yaml, 1],
            )
        return

    async with async_session_scope() as session:
        existing = await session.get(AppConfig, 1)
        if existing is None:
            existing = AppConfig(id=1, config_json=config_json_value, config_yaml=config_yaml)
            session.add(existing)
        else:
            existing.config_json = config_json_value
            existing.config_yaml = config_yaml
        await session.commit()


async def load_config_from_db() -> Optional[dict]:
    """从数据库读取配置（若不存在则返回 None）。

    优先读取 config_json；若不存在则兼容旧的 config_yaml。
    """

    if DISABLE_DATABASE:
        return None

    if (DB_TYPE or "sqlite").lower() == "d1":
        if d1_client is None:
            return None

        row = await d1_client.query_one("SELECT config_json, config_yaml FROM app_config WHERE id = ?", [1])
        if row is None:
            return None

        data = row.get("config_json")
        if isinstance(data, dict):
            return data
        if isinstance(data, str) and data.strip():
            import json as _json
            try:
                parsed = _json.loads(data)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        yaml_text = row.get("config_yaml")
        if isinstance(yaml_text, str) and yaml_text.strip():
            try:
                data = yaml.load(yaml_text)
                if isinstance(data, dict):
                    return data
            except Exception as e:
                logger.error(f"Failed to parse config_yaml from D1: {e}")

        return None

    async with async_session_scope() as session:
        row = await session.get(AppConfig, 1)
        if row is None:
            return None

        # 1) 优先 JSON/JSONB
        if getattr(row, "config_json", None):
            data = row.config_json
            if isinstance(data, dict):
                return data
            # 兼容：若字段是 Text 回退，可能存的是 JSON 字符串
            if isinstance(data, str) and data.strip():
                import json as _json
                try:
                    parsed = _json.loads(data)
                    if isinstance(parsed, dict):
                        return parsed
                except Exception:
                    pass

        # 2) 兼容旧 YAML（如果有的话）
        if getattr(row, "config_yaml", None):
            try:
                data = yaml.load(row.config_yaml)
            except Exception as e:
                logger.error(f"Failed to parse config_yaml from DB: {e}")
                return None
            if isinstance(data, dict):
                return data

        return None
