import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

// 修改原因：Channels 页面拆分依赖三个 hook 的职责边界，后续重构需要一个低成本回归检查。
// 修改方式：直接读取源码并检查 hook 调用顺序、显式接口和核心 hook 不再返回已迁出的状态。
// 目的：避免 useChannelEditor 或 useVirtualModels 再退回为 useChannelsCore 的简单代理。
const page = readFileSync('src/pages/channels/ChannelsPage.tsx', 'utf8');
const core = readFileSync('src/pages/channels/hooks/useChannelsCore.tsx', 'utf8');
const editor = readFileSync('src/pages/channels/hooks/useChannelEditor.tsx', 'utf8');
const virtual = readFileSync('src/pages/channels/hooks/useVirtualModels.tsx', 'utf8');

const coreCall = page.indexOf('const core = useChannelsCore()');
const editorCall = page.indexOf('const channelEditor = useChannelEditor(core)');
const virtualCall = page.indexOf('const virtualModelsState = useVirtualModels({');
assert(coreCall >= 0 && editorCall > coreCall && virtualCall > editorCall, 'ChannelsPage must call hooks in core → editor → virtual order');

assert.match(editor, /export interface UseChannelEditorResult\s*\{[\s\S]*isModalOpen:/, 'useChannelEditor must expose an explicit result interface');
assert.match(virtual, /export interface UseVirtualModelsResult\s*\{[\s\S]*virtualModels:/, 'useVirtualModels must expose an explicit result interface');
assert(!editor.includes('CHANNEL_EDITOR_KEYS'), 'useChannelEditor must not remain a key-picking proxy');
assert(!virtual.includes('VIRTUAL_MODEL_KEYS'), 'useVirtualModels must not remain a key-picking proxy');

const coreReturn = core.slice(core.lastIndexOf('return {'));
for (const migrated of ['isModalOpen', 'virtualModels', 'openModal', 'openVirtualModelModal']) {
  assert(!new RegExp(`\\b${migrated}\\b`).test(coreReturn), `${migrated} should not be returned from useChannelsCore after split`);
}

console.log('channels hook split structure ok');
process.exit(0);
