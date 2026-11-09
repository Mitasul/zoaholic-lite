import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 修改原因：本轮只迁移虚拟模型逻辑，需要一个轻量测试固定 hook 的新边界。
// 修改方式：直接读取源码，检查 useVirtualModels 不再从 useChannelsCore 挑 key，而是接收显式参数并在页面组合层接线。
// 目的：防止虚拟模型逻辑回退成薄代理，避免后续重构再次把虚拟模型状态放回核心 hook。
const page = readFileSync('src/pages/channels/ChannelsPage.tsx', 'utf8');
const core = readFileSync('src/pages/channels/hooks/useChannelsCore.tsx', 'utf8');
const virtual = readFileSync('src/pages/channels/hooks/useVirtualModels.tsx', 'utf8');

assert.match(virtual, /export interface UseVirtualModelsParams\s*\{[\s\S]*providers:/, 'useVirtualModels 应该接收显式参数对象');
assert.match(virtual, /export interface UseVirtualModelsResult\s*\{[\s\S]*virtualModels:/, 'useVirtualModels 应该暴露显式结果接口');
assert.doesNotMatch(virtual, /VIRTUAL_MODEL_KEYS/, 'useVirtualModels 不能继续使用 key-picking 代理');
assert.doesNotMatch(virtual, /UseChannelsCoreResult/, 'useVirtualModels 不应该再依赖 UseChannelsCoreResult');
assert.match(page, /useVirtualModels\(\{[\s\S]*providers: core\.providers[\s\S]*openTestDialog: channelEditor\.openTestDialog/, 'ChannelsPage 应该用核心 hook 和编辑器 hook 的显式字段调用 useVirtualModels');

const coreReturn = core.slice(core.lastIndexOf('return {'));
for (const migrated of ['virtualModels', 'virtualDraftName', 'openVirtualModelModal', 'filteredVirtualProviderEntries']) {
  assert.doesNotMatch(coreReturn, new RegExp(`\\b${migrated}\\b`), `${migrated} 不应该由 useChannelsCore 返回`);
}

console.log('useVirtualModels split structure ok');
process.exit(0);
