/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import {
  Plus, Edit, Brain, Trash2, ArrowRight, RefreshCw,
  Server, X, CheckCircle2, Settings2, Copy, ToggleRight, ToggleLeft,
  Folder, Puzzle, Network, CopyCheck, Power, Play,
  Check, Wallet, Link2, GripVertical, ChevronUp, ChevronDown,
  ClipboardPaste, LogIn, Download, LayoutList, LayoutGrid
} from 'lucide-react';
import { InterceptorSheet } from '../../../components/InterceptorSheet';
import { ProviderLogo } from '../../../components/ProviderLogos';
import {
  formatKeyRuleKeywordsInput,
  formatKeyRuleStatusInput,
  getKeyRuleRetryMode,
  parseKeyRuleKeywordsInput,
  parseKeyRuleStatusInput,
  setKeyRuleRetryMode,
  type KeyRuleRetryMode,
} from '../../../lib/keyRules';
import { summarizeVirtualChain } from '../../../lib/virtualModels';
import { apiFetch } from '../../../lib/api';
import { toastError, fmtErr } from '../../../components/Toast';
import type { ChannelOption } from '../types';
import { SCHEDULE_ALGORITHMS, getBalancePercent, hasUiSlot } from '../utils';
import { DeferredInput, RackCard, RackGrid, UiSlot } from './KeyComponents';

import type { UseVirtualModelsResult } from '../hooks/useVirtualModels';

// 修改原因：虚拟模型弹窗与手风琴渲染需要从 ChannelsPage 中独立出来。
// 修改方式：先承接原虚拟模型抽屉 JSX，并通过 props 注入 useVirtualModels 返回值。
// 目的：保持虚拟模型编辑、拖拽和保存逻辑不变，同时缩小页面骨架。
export interface VirtualModelsProps {
  state: UseVirtualModelsResult;
}

export function VirtualModels({ state }: VirtualModelsProps) {
  const {
    virtualDraftName, setVirtualDraftName, virtualDraftEnabled, setVirtualDraftEnabled,
    virtualModelsDirty, setVirtualModelsDirty, virtualAddNodeTypes, setVirtualAddNodeTypes, isVirtualModalOpen, setIsVirtualModalOpen,
    editingVirtualName, virtualEditorChain, isVirtualProviderPanelCollapsed,
    setIsVirtualProviderPanelCollapsed, isVirtualMobileProviderPanelOpen, setIsVirtualMobileProviderPanelOpen,
    getProviderModelOptions, getProviderByName,
    getMatchingProviderCount, formatProviderModelOption, describeVirtualChannelNode,
    handleChainNodeDragStart, updateVirtualEditorChainDraft, updateVirtualEditorNode,
    handleVirtualEditorDrop, appendVirtualEditorNodeByType, handleSaveVirtualEditor, swapVirtualEditorNode,
    renderVirtualProviderPanelCollapsedRail, renderVirtualProviderPanelList, virtualProviderPanelItems, providerNames,
  } = state;
  return (
    <>
      {/* 修改原因：虚拟模型编辑从顶部内联画布迁移到抽屉，列表卡片只负责折叠展示。
          修改方式：复用原有渠道模型数据源和原生拖拽逻辑，在 Dialog 中布局左侧数据源和右侧链条编辑器。
          目的：保留完整编辑能力，同时把主页面空间还给渠道列表。 */}
      <Dialog.Root open={isVirtualModalOpen} onOpenChange={(open) => { setIsVirtualModalOpen(open); if (!open) setVirtualModelsDirty(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40 animate-in fade-in duration-200" />
          <Dialog.Content className="fixed right-0 top-0 h-full w-full xl:w-[1040px] max-w-full bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 sm:p-5 border-b border-border flex justify-between items-center bg-muted/30 flex-shrink-0">
              <div className="min-w-0">
                <Dialog.Title className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-purple-500" />
                  {editingVirtualName ? `编辑虚拟模型: ${editingVirtualName}` : '新建虚拟模型'}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-1">
                  移动端可展开上方渠道面板查看完整渠道列表；桌面端可展开左侧渠道面板拖拽添加。
                </Dialog.Description>
              </div>
              <Dialog.Close className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></Dialog.Close>
            </div>

            {/* 修改原因：移动端也需要看到完整渠道列表，但默认展开会挤压链条编辑区。
                修改方式：小屏使用上方可折叠面板，展开时限制 max-height；xl 以上继续使用桌面左右两栏。
                目的：让手机用户按需查看渠道列表，同时保证链条编辑区不会被完全推走。 */}
            <div className={`flex-1 min-h-0 grid grid-cols-1 grid-rows-[auto_minmax(0,1fr)] ${isVirtualProviderPanelCollapsed ? 'xl:grid-cols-[76px_1fr]' : 'xl:grid-cols-[300px_1fr]'} xl:grid-rows-[minmax(0,1fr)] xl:divide-x divide-border overflow-hidden`}>
              <aside className={`min-h-0 bg-muted/10 border-b border-border xl:border-b-0 xl:overflow-y-auto ${isVirtualProviderPanelCollapsed ? 'xl:p-2' : 'xl:p-3'}`}>
                <div className="xl:hidden">
                  {/* 修改原因：移动端默认折叠时需要保留一行明确入口，告诉用户渠道面板仍然可用。
                      修改方式：显示渠道数量和展开箭头，点击后打开同一份完整渠道列表。
                      目的：不再完全隐藏渠道面板，同时避免默认占用链条编辑空间。 */}
                  <button
                    type="button"
                    onClick={() => setIsVirtualMobileProviderPanelOpen(prev => !prev)}
                    aria-expanded={isVirtualMobileProviderPanelOpen}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground">📦 渠道面板 ({virtualProviderPanelItems.length}个渠道)</span>
                    <span className="text-xs text-muted-foreground">{isVirtualMobileProviderPanelOpen ? '▲' : '▼'}</span>
                  </button>
                  {isVirtualMobileProviderPanelOpen && (
                    <div className="max-h-[50vh] overflow-y-auto border-t border-border p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground">渠道和模型</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">已启用渠道，按权重降序，子渠道跟在主渠道后。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsVirtualMobileProviderPanelOpen(false)}
                          className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                        >
                          收起
                        </button>
                      </div>
                      {renderVirtualProviderPanelList()}
                    </div>
                  )}
                </div>

                <div className="hidden xl:block">
                  <div className={`flex items-center gap-2 mb-2 ${isVirtualProviderPanelCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {isVirtualProviderPanelCollapsed ? (
                      <button
                        type="button"
                        onClick={() => setIsVirtualProviderPanelCollapsed(false)}
                        className="w-11 h-10 rounded-lg border border-border bg-background hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                        title="展开渠道面板"
                      >
                        <Server className="w-4 h-4" />
                        <span className="sr-only">展开渠道面板</span>
                      </button>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground">渠道和模型</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">已启用渠道，按权重降序，子渠道跟在主渠道后。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsVirtualProviderPanelCollapsed(true)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                          title="收起渠道面板"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {isVirtualProviderPanelCollapsed ? renderVirtualProviderPanelCollapsedRail() : renderVirtualProviderPanelList()}
                </div>
              </aside>

              <section className="min-h-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border bg-background/60 flex-shrink-0">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">虚拟模型名</label>
                      <input
                        type="text"
                        value={virtualDraftName}
                        onChange={e => { setVirtualDraftName(e.target.value); setVirtualModelsDirty(true); }}
                        placeholder="例如 deepseek-chat"
                        className="w-full bg-background border border-border focus:border-purple-500 px-3 py-2 rounded-lg text-sm font-mono outline-none text-foreground"
                      />
                    </div>
                    <label className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/50 rounded-lg border border-border min-w-[120px] self-end">
                      <span className="text-sm font-medium text-foreground">启用</span>
                      <Switch.Root checked={virtualDraftEnabled} onCheckedChange={val => { setVirtualDraftEnabled(val); setVirtualModelsDirty(true); }} className="w-10 h-5 bg-muted rounded-full relative data-[state=checked]:bg-purple-500 transition-colors">
                        <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-md transition-transform translate-x-0.5 data-[state=checked]:translate-x-[20px]" />
                      </Switch.Root>
                    </label>
                  </div>
                  {virtualModelsDirty && <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg inline-flex">有未保存更改</div>}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleVirtualEditorDrop(e)}
                    className="min-h-[260px] border border-dashed border-border rounded-xl bg-muted/10 p-3"
                  >
                    {virtualEditorChain.length === 0 ? (
                      <div className="h-56 flex items-center justify-center text-sm text-muted-foreground text-center">将左侧模型或渠道拖到这里，或使用底部按钮添加节点。</div>
                    ) : (
                      <div className="space-y-3">
                        {virtualEditorChain.map((node, idx) => {
                          const isChannel = node.type === 'channel';
                          const provider = isChannel ? getProviderByName(node.value) : null;
                          const channelModelOptions = provider ? getProviderModelOptions(provider) : [];
                          const displayVirtualName = virtualDraftName.trim() || editingVirtualName || '当前虚拟模型';
                          const channelModelLabel = node.model || displayVirtualName;
                          const matchCount = !isChannel ? getMatchingProviderCount(node.value) : 0;
                          return (
                            <div
                              key={`virtual-editor-${idx}-${node.type}-${node.value}`}
                              draggable
                              onDragStart={e => handleChainNodeDragStart(e, '__virtual_editor__', idx)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => { e.stopPropagation(); handleVirtualEditorDrop(e, idx); }}
                              className="relative flex gap-3"
                            >
                              {idx < virtualEditorChain.length - 1 && <div className="absolute left-[18px] top-10 bottom-[-14px] w-px bg-border" />}
                              <div className={`relative z-[1] w-9 h-9 rounded-full flex items-center justify-center border ${isChannel ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400'}`}>
                                <span className={`w-2.5 h-2.5 rounded-full ${isChannel ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                              </div>
                              <div className={`flex-1 min-w-0 border rounded-xl p-3 bg-background ${isChannel ? 'border-emerald-500/20' : 'border-blue-500/20'}`}>
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab flex-shrink-0" />
                                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isChannel ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>{isChannel ? '渠道节点' : '模型节点'}</span>
                                      <span className="text-xs text-muted-foreground">优先级 {idx + 1}</span>
                                    </div>
                                    {isChannel ? (
                                      <div className="mt-2">
                                        <div className="font-mono text-sm text-foreground truncate">{node.value ? `${node.value}: ${channelModelLabel}` : '未选择渠道'}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">{describeVirtualChannelNode(node, displayVirtualName)}</div>
                                      </div>
                                    ) : (
                                      <div className="mt-2">
                                        <div className="font-mono text-sm text-foreground truncate">{node.value || '未填写模型名'}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">匹配到 {matchCount} 个渠道</div>
                                      </div>
                                    )}
                                  </div>
                                  {/* 修改原因：移动端无法使用 HTML5 原生拖拽排序，节点卡片需要额外提供触摸可点的排序控件。
                                      修改方式：在删除按钮左侧加入上移和下移小按钮，禁用首尾无法移动的方向，并调用相邻交换函数。
                                      目的：不移除桌面拖拽能力的前提下，保证手机端也能调整链条节点顺序。 */}
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => swapVirtualEditorNode(idx, -1)}
                                      disabled={idx === 0}
                                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                      title="上移节点"
                                      aria-label={`上移第 ${idx + 1} 个节点`}
                                    >
                                      <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => swapVirtualEditorNode(idx, 1)}
                                      disabled={idx === virtualEditorChain.length - 1}
                                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                      title="下移节点"
                                      aria-label={`下移第 ${idx + 1} 个节点`}
                                    >
                                      <ChevronDown className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => updateVirtualEditorChainDraft(prev => prev.filter((_, removeIdx) => removeIdx !== idx))} className="p-1.5 text-red-600 dark:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="删除节点">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {isChannel ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <select
                                      value={node.value}
                                      onChange={e => updateVirtualEditorNode(idx, { value: e.target.value })}
                                      className="w-full bg-background border border-border px-3 py-2 rounded-lg text-xs text-foreground outline-none focus:border-purple-500"
                                    >
                                      <option value="">选择渠道</option>
                                      {node.value && !providerNames.includes(node.value) && <option value={node.value}>{node.value}</option>}
                                      {providerNames.map(providerName => <option key={providerName} value={providerName}>{providerName}</option>)}
                                    </select>
                                    <select
                                      value={node.model || ''}
                                      onChange={e => updateVirtualEditorNode(idx, { model: e.target.value || undefined })}
                                      className="w-full bg-background border border-border px-3 py-2 rounded-lg text-xs text-foreground outline-none focus:border-purple-500"
                                    >
                                      <option value="">使用虚拟模型名：{displayVirtualName}</option>
                                      {node.model && !channelModelOptions.some(option => option.displayName === node.model) && <option value={node.model}>{node.model}</option>}
                                      {channelModelOptions.map(option => <option key={`${option.displayName}-${option.upstreamName}`} value={option.displayName}>{formatProviderModelOption(option)}</option>)}
                                    </select>
                                  </div>
                                ) : (
                                  <input
                                    value={node.value}
                                    onChange={e => updateVirtualEditorNode(idx, { value: e.target.value })}
                                    placeholder="模型名，例如 deepseek-chat"
                                    className="w-full bg-background border border-border px-3 py-2 rounded-lg text-xs font-mono text-foreground outline-none focus:border-purple-500"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">节点从上到下依次解析。模型节点全局匹配，渠道节点只匹配指定渠道。</p>
                    <div className="flex items-center gap-2">
                      <select
                        value={virtualAddNodeTypes[virtualDraftName.trim() || editingVirtualName || '__new_virtual_model__'] || 'model'}
                        onChange={e => {
                          const key = virtualDraftName.trim() || editingVirtualName || '__new_virtual_model__';
                          setVirtualAddNodeTypes(prev => ({ ...prev, [key]: e.target.value as 'model' | 'channel' }));
                        }}
                        className="bg-background border border-border rounded-lg px-2 py-2 text-xs text-foreground"
                      >
                        <option value="model">模型节点</option>
                        <option value="channel">渠道节点</option>
                      </select>
                      <button onClick={appendVirtualEditorNodeByType} className="bg-muted hover:bg-muted/80 text-foreground px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors">
                        <Plus className="w-3.5 h-3.5" /> 添加节点
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="p-4 bg-muted/30 border-t border-border flex justify-end gap-3 flex-shrink-0">
              <Dialog.Close className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg">取消</Dialog.Close>
              <button onClick={handleSaveVirtualEditor} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> 保存虚拟模型
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>


    </>
  );
}
