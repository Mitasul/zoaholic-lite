export type KeyRuleRetryMode = 'default' | 'force' | 'disable';

type KeyRuleMatch = 'default' | { status?: number[]; keyword?: string[] };

export interface KeyRuleConfig {
  match: KeyRuleMatch;
  duration?: number;
  remap?: number | string;
  retry?: boolean | string;
  [key: string]: unknown;
}

export function parseKeyRuleStatusInput(value: string): number[] {
  // 修改原因：状态码输入需要支持多个数字，但 HTML number 无法自然编辑列表。
  // 修改方式：使用文本框配合 inputMode="numeric"，在保存到规则前把逗号、中文逗号和空白分隔的片段转为数字数组。
  // 目的：让用户可以输入多个状态码，同时保存结构仍然符合后端 key_rules 的 status 数组格式。
  return value
    .split(/[,，\s]+/)
    .map(part => Number.parseInt(part.trim(), 10))
    .filter(code => Number.isInteger(code) && code >= 0);
}

export function parseKeyRuleKeywordsInput(value: string): string[] {
  // 修改原因：关键词匹配同样需要支持多个值，且用户通常用逗号分隔。
  // 修改方式：按英文逗号、中文逗号和换行切分，再去掉空白项。
  // 目的：保存时始终向后端传递清理后的 keyword 数组。
  return value
    .split(/[,，\n]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

export function formatKeyRuleStatusInput(status: unknown): string {
  // 修改原因：编辑已有配置时，status 可能是单个数字、字符串或数组。
  // 修改方式：统一转成逗号分隔字符串，供多状态码输入框展示。
  // 目的：避免旧配置形状不同导致输入框显示为空或不可编辑。
  if (Array.isArray(status)) return status.join(', ');
  if (status == null) return '';
  return String(status);
}

export function formatKeyRuleKeywordsInput(keyword: unknown): string {
  // 修改原因：编辑已有配置时，keyword 可能是单个字符串或数组。
  // 修改方式：统一转成逗号分隔字符串。
  // 目的：让关键词输入框在读取旧配置和新配置时表现一致。
  if (Array.isArray(keyword)) return keyword.join(', ');
  if (keyword == null) return '';
  return String(keyword);
}

export function getKeyRuleRetryMode(rule: Pick<KeyRuleConfig, 'retry'>): KeyRuleRetryMode {
  // 修改原因：前端 UI 使用三态按钮，而后端只接受 bool 或缺失。
  // 修改方式：把 true、false、缺失分别映射成 force、disable、default。
  // 目的：让界面文案和保存格式同时保持清晰。
  if (rule.retry === true) return 'force';
  if (rule.retry === false) return 'disable';
  return 'default';
}

export function setKeyRuleRetryMode<T extends KeyRuleConfig>(rule: T, mode: KeyRuleRetryMode): T {
  // 修改原因：retry 默认态必须通过删除字段表达，不能保存 retry: 'default' 或 null。
  // 修改方式：切到默认时删除 retry，切到强制重试或禁止重试时写入布尔值。
  // 目的：保证保存 payload 符合后端三态语义。
  const next = { ...rule } as T;
  if (mode === 'default') {
    delete next.retry;
    return next;
  }
  next.retry = mode === 'force';
  return next;
}

export function sanitizeKeyRuleForSave(rule: KeyRuleConfig): KeyRuleConfig {
  // 修改原因：编辑过程中 remap 可能是空字符串，retry 可能经过 UI 临时态表示。
  // 修改方式：保存前复制规则，只保留 bool retry 和有效 100-599 remap。
  // 目的：避免把“默认重试”和空 remap 写入配置文件。
  const next: KeyRuleConfig = { ...rule };

  if (rule.match && typeof rule.match === 'object') {
    next.match = { ...rule.match };
  }

  if (typeof next.retry !== 'boolean') {
    delete next.retry;
  }

  if (next.remap == null || String(next.remap).trim() === '') {
    delete next.remap;
  } else {
    const remap = Number.parseInt(String(next.remap), 10);
    if (Number.isInteger(remap) && remap >= 100 && remap <= 599) {
      next.remap = remap;
    } else {
      delete next.remap;
    }
  }

  return next;
}

export function sanitizeKeyRulesForSave(rules: unknown): KeyRuleConfig[] {
  // 修改原因：渠道保存和测试预览都应使用同一套 key_rules 清理规则。
  // 修改方式：非数组回退为空数组，数组项只处理对象规则。
  // 目的：防止不同保存入口产生 retry/remap 字段不一致的问题。
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((rule): rule is KeyRuleConfig => Boolean(rule) && typeof rule === 'object' && 'match' in rule)
    .map(rule => sanitizeKeyRuleForSave(rule));
}
