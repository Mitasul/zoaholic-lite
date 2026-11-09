# BYOK（Bring Your Own Key）模式

允许用户自带上游 API Key 通过 Zoaholic 代理请求，系统只负责路由/格式转换，不消耗平台自有 Key 额度。

## 目录

- [工作原理](#how-it-works)
- [后端配置](#backend-config)
- [客户端使用](#client-usage)
- [模型列表](#model-list)
- [安全与隔离](#security)
- [热更新](#hot-update)
- [注意事项](#notes)

---

<a id="how-it-works"></a>
## 工作原理

BYOK 的核心思路：用户提交的 API Key 由 **模板前缀 + 真实上游 Key** 拼接而成。

```
byok-gemini-AIzaSyD...xxx
└─ 前缀 ──┘└─ 真实上游 Key ─┘
```

系统行为：
1. **鉴权**：按模板前缀匹配到 `api_keys` 中的通配符条目（如 `byok-gemini-*`），以模板身份做本地鉴权、计费和限速
2. **转发**：仅在请求打到 BYOK provider 时，用真实上游 Key 替换请求头发往上游
3. **脱敏**：真实 Key 全程不进日志、不进数据库、不进 key pool，只在请求内存（ContextVar）中短暂存在

---

<a id="backend-config"></a>
## 后端配置

需要配置两个部分：**api_keys 条目** 和 **provider 渠道**。

### 1. api_keys — 通配符模板 Key

在 `api_keys` 中添加一个 `api` 字段以 `*` 结尾的条目：

```yaml
api_keys:
  - api: "byok-gemini-*"       # 必须以 * 结尾
    name: "BYOK Gemini 用户"
    role: "byok-user"
    model:                       # 授权可用的模型/provider
      - all                      # "all" = 所有模型
      # 或精确指定:
      # - gemini-byok-provider/*  # provider名/通配符
      # - gpt-4o
    groups:
      - default
```

**规则：**
- `api` 字段必须以 `*` 结尾，`*` 前面的部分就是匹配前缀
- 多个 BYOK 条目按**前缀长度降序**匹配（最长优先）
- 用户不能只提交模板 Key 本身（如 `byok-gemini-*`），必须附带真实 Key
- `model` 字段控制该 BYOK 用户能访问哪些 provider/模型

### 2. provider — BYOK 渠道

BYOK provider 的特征：**`api` 字段包含 `"*"`**（即 `api: ["*"]`）。

```yaml
providers:
  - provider: "gemini-byok"      # provider 名称
    base_url: "https://generativelanguage.googleapis.com/v1beta"
    engine: gemini                # 渠道引擎
    api: ["*"]                    # ← 关键：* = BYOK provider
    model:
      - "*"                       # 通配符，允许所有模型
      # 或者明确列出:
      # - gemini-2.5-pro: gemini-2.5-pro
      # - gemini-2.5-flash: gemini-2.5-flash
    enabled: true
```

**为什么用 `*`？**
- `api: ["*"]` 明确声明「此渠道的 Key 由用户自带」，语义比空列表更清晰
- `*` 不会进入 key pool，不参与轮换——handler 在路由到 BYOK provider 时，自动用请求上下文中的真实 Key 替换
- 统计和 Dashboard 中 provider key 显示为 `*`
- 非 BYOK provider（有自己 key pool 的）不会被 BYOK Key 影响

### 完整配置示例

```yaml
# api.yaml

api_keys:
  # 平台普通用户
  - api: "sk-platform-user-abc123"
    name: "普通用户"
    model: ["all"]

  # BYOK 用户 - Gemini
  - api: "byok-gemini-*"
    name: "BYOK Gemini"
    model:
      - gemini-byok/*
    groups: [default]

  # BYOK 用户 - OpenAI
  - api: "byok-oai-*"
    name: "BYOK OpenAI"
    model:
      - openai-byok/*
    groups: [default]

providers:
  # 平台自有渠道（有 key pool）
  - provider: "gemini-official"
    engine: gemini
    base_url: "https://generativelanguage.googleapis.com/v1beta"
    api:
      - "AIzaSy...(平台key1)"
      - "AIzaSy...(平台key2)"
    model:
      - gemini-2.5-pro: gemini-2.5-pro

  # BYOK Gemini 渠道（无 key pool）
  - provider: "gemini-byok"
    engine: gemini
    base_url: "https://generativelanguage.googleapis.com/v1beta"
    api: ["*"]
    model:
      - "*"
    enabled: true

  # BYOK OpenAI 渠道
  - provider: "openai-byok"
    engine: openai
    base_url: "https://api.openai.com/v1"
    api: ["*"]
    model:
      - "*"
    enabled: true
```

---

<a id="client-usage"></a>
## 客户端使用

客户端只需要把 API Key 设为 **模板前缀 + 自己的真实 Key**。

### 格式

```
{配置的前缀}{用户的真实上游 Key}
```

例如，api_keys 中配置了 `byok-gemini-*`，用户的 Gemini Key 是 `AIzaSyD...xxx`：

```
byok-gemini-AIzaSyD...xxx
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="byok-gemini-AIzaSyD...xxx",  # 前缀 + 真实 Key
    base_url="https://your-zoaholic.example.com/v1"
)

response = client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### curl

```bash
curl https://your-zoaholic.example.com/v1/chat/completions \
  -H "Authorization: Bearer byok-gemini-AIzaSyD...xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### JavaScript / TypeScript

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'byok-oai-sk-proj-xxx...xxx',  // 前缀 + 真实 Key
  baseURL: 'https://your-zoaholic.example.com/v1',
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

### 第三方客户端（ChatGPT Next Web / LobeChat / Cherry Studio 等）

在设置中：
- **API Base URL**: `https://your-zoaholic.example.com/v1`
- **API Key**: `byok-gemini-AIzaSyD...xxx`（前缀 + 你的真实 Key）

---

<a id="model-list"></a>
## 模型列表

当 BYOK 用户请求 `GET /v1/models` 时：

1. 先返回所有静态配置的模型（和普通用户一样）
2. 对于 `model: ["*"]` 的 BYOK provider，额外用用户的**真实 Key** 调用上游 `/v1/models`（或对应的模型列表 API），动态拉取该 Key 实际可用的模型
3. 去重后合并返回

> 动态拉取使用浅拷贝的 provider 配置，不会污染运行时状态。拉取失败时优雅降级为空列表。

---

<a id="security"></a>
## 安全与隔离

### 真实 Key 脱敏

| 场景 | 出现的 Key |
|------|------------|
| 统计 / Dashboard | 模板 Key（`byok-gemini-*`） |
| 日志输出 | 模板 Key |
| 数据库（request_stat） | 模板 Key |
| 请求头转发到上游 | 真实 Key（仅内存中） |
| request_info["api_key"] | 模板 Key |

### 隔离行为

- **Key pool 隔离**：BYOK provider 的 `*` 不进入 key pool，不参与 key 轮换
- **Key rules 跳过**：BYOK 请求跳过 `key_rules` 匹配、自动禁用和冷却（上游 401/403 是用户自己的 Key 问题）
- **自动重试跳过**：BYOK 请求不触发基于 key pool 的自动重试
- **ContextVar 生命周期**：真实 Key 通过 `ContextVar` 传递，请求结束后立即 reset，不会残留到后续协程
- **请求头过滤**：响应中 `x-goog-api-key` 等敏感头会被过滤

### 非 BYOK provider 不受影响

当请求路由到非 BYOK provider（有自己 key pool 的普通渠道）时，`effective_force_api_key` 不会使用 BYOK 的真实 Key，仍按正常 key pool 轮换。

---

<a id="hot-update"></a>
## 热更新

通过管理端保存配置或调用 `POST /v1/api_config/update` 后：

1. `app.state.byok_prefixes` 自动重建（基于最新的 `api_keys`）
2. 新的 BYOK 通配符条目立即生效
3. 移除的 BYOK 条目对应的 key pool 残留会被自动清理

热更新入口：
- `routes/admin.py` — 管理端保存
- `setup.py` — 启动初始化
- `utils.py load_config` — 配置文件重载

---

<a id="notes"></a>
## 注意事项

1. **前缀设计**：建议用 `byok-{provider名}-` 的格式，便于区分不同上游。前缀越长越不容易误匹配
2. **模板 Key 不可直接使用**：用户提交 `byok-gemini-*`（模板本身）会被拒绝，必须附带真实 Key
3. **provider 的 model 字段**：
   - 设为 `["*"]` = 通配符，接受任意模型名，`/v1/models` 时动态拉取
   - 设为具体列表 = 只允许指定模型
4. **api_keys 的 model 字段**：控制 BYOK 用户可以访问哪些 provider。`all` = 全部，`provider名/*` = 指定 provider 的所有模型
5. **groups 授权**：BYOK 条目和 provider 都遵循现有的 groups 交集授权规则
6. **overrides**：provider 的 overrides 仍然生效。如果要给 BYOK provider 加全局参数覆盖，正常配 overrides 即可
7. **鉴权入口**：中间件（middleware）、FastAPI Depends、方言（dialect）三个入口都支持 BYOK，行为统一
