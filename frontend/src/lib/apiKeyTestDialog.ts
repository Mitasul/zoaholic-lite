// 修改原因：API Key 测试弹窗的模型初始化和错误格式化需要可单独测试的纯函数。
// 修改方式：把模型列表归一化、初始模型选择、未知错误格式化集中放在此文件。
// 目的：避免 React 状态闭包和对象字符串化问题在后续重构中再次回归。
export function normalizeApiKeyTestModels(availableModels: unknown[] = []): string[] {
  const set = new Set<string>();
  (Array.isArray(availableModels) ? availableModels : []).forEach(model => {
    const name = String(model || '').trim();
    if (name) set.add(name);
  });
  return Array.from(set);
}

// 修改原因：弹窗每次打开时必须从当前渠道模型列表选择初始模型，而不是沿用上一次状态。
// 修改方式：复用模型归一化结果，返回当前列表中的第一个可用模型。
// 目的：自动单 Key 测试可以拿到当前渠道的模型名。
export function getInitialApiKeyTestModel(availableModels: unknown[] = []): string {
  return normalizeApiKeyTestModels(availableModels)[0] || '';
}

// 修改原因：后端和浏览器抛出的错误可能是字符串、Error、对象或不可 JSON 化的值。
// 修改方式：先保留字符串和 Error.message，对对象尝试 JSON.stringify，失败时再降级 String。
// 目的：错误详情区域展示实际信息，避免出现 [object Object]。
function stringifyApiKeyTestErrorValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

// 修改原因：测试接口失败时 detail/error/message 字段可能直接是对象。
// 修改方式：按后端常见字段 detail、error、message 取值，再统一经过安全字符串化。
// 目的：让测试面板和复制错误时都得到可读、可排查的错误文本。
export function formatApiKeyTestError(errorPayload: unknown, fallback?: string | number): string {
  if (errorPayload instanceof Error) return errorPayload.message;

  let value: unknown = errorPayload;
  if (errorPayload && typeof errorPayload === 'object') {
    const record = errorPayload as Record<string, unknown>;
    value = record.detail ?? record.error ?? record.message;
  }

  // OpenAI 风格 {message, type} 嵌套对象：再提取一层 message
  if (value && typeof value === 'object' && !(value instanceof Error)) {
    const inner = value as Record<string, unknown>;
    if (typeof inner.message === 'string') value = inner.message;
  }

  if (value === undefined || value === null || value === '') {
    value = fallback ?? 'unknown error';
  }

  return stringifyApiKeyTestErrorValue(value);
}
