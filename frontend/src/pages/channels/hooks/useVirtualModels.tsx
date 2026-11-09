/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type Dispatch, type DragEvent, type ReactNode, type SetStateAction } from 'react';
import { ArrowRight, Edit, GripVertical, Link2, Play, Power, Server, Trash2 } from 'lucide-react';

import { apiFetch } from '../../../lib/api';
import { toastError, toastSuccess, toastWarning, fmtErr } from '../../../components/Toast';
import { ProviderLogo } from '../../../components/ProviderLogos';
import {
  buildVirtualProviderEntries,
  buildVirtualProviderPanelItems,
  buildVirtualRouteTestProvider,
  buildVirtualRoutingProviderItems,
  getProviderWeight,
  summarizeVirtualChain,
  type VirtualProviderEntry,
} from '../../../lib/virtualModels';
import type { ProviderModelOption, VirtualDragPayload, VirtualModelChainNode, VirtualModelConfig } from '../types';
import { readBooleanPreference } from '../utils';

export interface UseVirtualModelsParams {
  providers: any[];
  token: string | null;
  loadedVirtualModels: Record<string, VirtualModelConfig>;
  loadedVirtualModelsVersion: number;
  filterKeyword: string;
  filterEngine: string;
  filterGroup: string;
  filterStatus: '' | 'enabled' | 'disabled';
  availableEngines: string[];
  availableGroups: string[];
  totalListItemCount: number;
  visibleListItemCount: number;
  openTestDialog: (provider: any) => void;
}

export interface UseVirtualModelsResult {
  virtualModels: Record<string, VirtualModelConfig>;
  setVirtualModels: Dispatch<SetStateAction<Record<string, VirtualModelConfig>>>;
  virtualDraftName: string;
  setVirtualDraftName: Dispatch<SetStateAction<string>>;
  virtualDraftEnabled: boolean;
  setVirtualDraftEnabled: Dispatch<SetStateAction<boolean>>;
  virtualModelsDirty: boolean;
  setVirtualModelsDirty: Dispatch<SetStateAction<boolean>>;
  expandedVirtualModels: Set<string>;
  setExpandedVirtualModels: Dispatch<SetStateAction<Set<string>>>;
  expandedVirtualProviders: Set<string>;
  setExpandedVirtualProviders: Dispatch<SetStateAction<Set<string>>>;
  virtualAddNodeTypes: Record<string, 'model' | 'channel'>;
  setVirtualAddNodeTypes: Dispatch<SetStateAction<Record<string, 'model' | 'channel'>>>;
  isVirtualModalOpen: boolean;
  setIsVirtualModalOpen: Dispatch<SetStateAction<boolean>>;
  editingVirtualName: string | null;
  setEditingVirtualName: Dispatch<SetStateAction<string | null>>;
  virtualEditorChain: VirtualModelChainNode[];
  setVirtualEditorChain: Dispatch<SetStateAction<VirtualModelChainNode[]>>;
  isVirtualProviderPanelCollapsed: boolean;
  setIsVirtualProviderPanelCollapsed: Dispatch<SetStateAction<boolean>>;
  isVirtualMobileProviderPanelOpen: boolean;
  setIsVirtualMobileProviderPanelOpen: Dispatch<SetStateAction<boolean>>;
  isVirtualRoutesAccordionOpen: boolean;
  setIsVirtualRoutesAccordionOpen: Dispatch<SetStateAction<boolean>>;
  getVirtualProviderWeight: (provider: any) => number;
  getProviderModelOptions: (provider: any) => ProviderModelOption[];
  findProviderModelOption: (provider: any, modelName: string) => ProviderModelOption | null;
  getProviderByName: (providerName: string) => any | null;
  getMatchingProviderCount: (modelName: string) => number;
  formatProviderModelOption: (option: ProviderModelOption) => string;
  describeVirtualChannelNode: (node: VirtualModelChainNode, virtualName: string) => string;
  updateVirtualModelsDraft: (updater: (prev: Record<string, VirtualModelConfig>) => Record<string, VirtualModelConfig>) => void;
  serializeVirtualModels: (source: Record<string, VirtualModelConfig>) => Record<string, VirtualModelConfig>;
  saveVirtualModels: (nextVirtualModels: Record<string, VirtualModelConfig>) => Promise<void>;
  handleSaveVirtualModelsDraft: () => Promise<void>;
  handleAddVirtualModel: () => void;
  updateVirtualModelConfig: (name: string, patch: Partial<VirtualModelConfig>) => void;
  updateVirtualNode: (virtualName: string, idx: number, patch: Partial<VirtualModelChainNode>) => void;
  moveVirtualNode: (virtualName: string, fromIdx: number, toIdx: number) => void;
  insertVirtualNode: (virtualName: string, node: VirtualModelChainNode, insertIndex?: number) => void;
  appendVirtualNodeByType: (virtualName: string) => void;
  toggleVirtualModelExpanded: (name: string) => void;
  toggleVirtualProviderExpanded: (name: string) => void;
  getPreferredVirtualTarget: () => string | null;
  handlePanelModelQuickAdd: (modelName: string) => void;
  handlePanelChannelQuickAdd: (providerName: string) => void;
  handleDeleteVirtualModel: (name: string) => Promise<void>;
  setVirtualDragPayload: (event: DragEvent<HTMLElement>, payload: VirtualDragPayload) => void;
  readVirtualDragPayload: (event: DragEvent<HTMLElement>) => VirtualDragPayload | null;
  handlePanelModelDragStart: (event: DragEvent<HTMLElement>, modelName: string) => void;
  handlePanelChannelDragStart: (event: DragEvent<HTMLElement>, providerName: string) => void;
  handleChainNodeDragStart: (event: DragEvent<HTMLElement>, virtualName: string, fromIndex: number) => void;
  handleVirtualDrop: (event: DragEvent<HTMLElement>, virtualName: string, insertIndex?: number) => void;
  openVirtualModelModal: (name?: string | null) => void;
  updateVirtualEditorChainDraft: (updater: (prev: VirtualModelChainNode[]) => VirtualModelChainNode[]) => void;
  updateVirtualEditorNode: (idx: number, patch: Partial<VirtualModelChainNode>) => void;
  insertVirtualEditorNode: (node: VirtualModelChainNode, insertIndex?: number) => void;
  moveVirtualEditorNode: (fromIdx: number, toIdx: number) => void;
  swapVirtualEditorNode: (idx: number, direction: -1 | 1) => void;
  appendVirtualEditorNodeByType: () => void;
  handleVirtualEditorDrop: (event: DragEvent<HTMLElement>, insertIndex?: number) => void;
  handleSaveVirtualEditor: () => Promise<void>;
  handleToggleVirtualModelCard: (name: string, enabled: boolean) => Promise<void>;
  virtualProviderEntries: VirtualProviderEntry[];
  virtualRoutingProviderItems: any[];
  virtualProviderPanelItems: any[];
  providerNames: string[];
  filteredVirtualProviderEntries: VirtualProviderEntry[];
  availableEngines: string[];
  availableGroups: string[];
  totalListItemCount: number;
  visibleListItemCount: number;
  renderVirtualProviderPanelCollapsedRail: () => ReactNode;
  renderVirtualProviderPanelList: () => ReactNode;
  getFullVirtualChainSummary: (entry: VirtualProviderEntry) => string;
  openVirtualRouteTestDialog: (entries: VirtualProviderEntry[]) => void;
  renderDesktopVirtualRoutesAccordionRows: () => ReactNode;
  renderMobileVirtualRoutesAccordion: () => ReactNode;
  openTestDialog: (provider: any) => void;
}

export function useVirtualModels(params: UseVirtualModelsParams): UseVirtualModelsResult {
  const {
    providers,
    token,
    loadedVirtualModels,
    loadedVirtualModelsVersion,
    filterKeyword,
    filterEngine,
    filterGroup,
    filterStatus,
    availableEngines: coreAvailableEngines,
    availableGroups: coreAvailableGroups,
    totalListItemCount: coreTotalListItemCount,
    visibleListItemCount: coreVisibleListItemCount,
    openTestDialog,
  } = params;

  const [virtualModels, setVirtualModels] = useState<Record<string, VirtualModelConfig>>({});
  const [virtualDraftName, setVirtualDraftName] = useState('');
  const [virtualDraftEnabled, setVirtualDraftEnabled] = useState(true);
  const [virtualModelsDirty, setVirtualModelsDirty] = useState(false);
  const [expandedVirtualModels, setExpandedVirtualModels] = useState<Set<string>>(() => new Set());
  const [expandedVirtualProviders, setExpandedVirtualProviders] = useState<Set<string>>(() => new Set());
  const [virtualAddNodeTypes, setVirtualAddNodeTypes] = useState<Record<string, 'model' | 'channel'>>({});
  const [isVirtualModalOpen, setIsVirtualModalOpen] = useState(false);
  const [editingVirtualName, setEditingVirtualName] = useState<string | null>(null);
  const [virtualEditorChain, setVirtualEditorChain] = useState<VirtualModelChainNode[]>([]);
  const [isVirtualProviderPanelCollapsed, setIsVirtualProviderPanelCollapsed] = useState(false);
  const [isVirtualMobileProviderPanelOpen, setIsVirtualMobileProviderPanelOpen] = useState(false);
  const [isVirtualRoutesAccordionOpen, setIsVirtualRoutesAccordionOpen] = useState(false);

  useEffect(() => {
    // 修改原因：虚拟模型初始数据由核心 hook 的 /v1/api_config 请求提供，虚拟 hook 只负责本地编辑草稿。
    // 修改方式：当核心 hook 的 loadedVirtualModelsVersion 增加时同步快照，并重置 dirty 标记。
    // 目的：避免重复请求全局配置，同时让虚拟模型状态离开 useChannelsCore。
    setVirtualModels(loadedVirtualModels || {});
    setVirtualModelsDirty(false);
    setExpandedVirtualModels(prev => prev.size > 0 ? prev : new Set(Object.keys(loadedVirtualModels || {}).slice(0, 1)));
  }, [loadedVirtualModelsVersion, loadedVirtualModels]);

  const getVirtualProviderWeight = (provider: any): number => {
    // 修改原因：左侧渠道面板要求按 preferences.weight 降序展示，并把禁用渠道放到底部。
    // 修改方式：统一读取 preferences.weight，缺失时回退到 provider.weight，最后回退为 0。
    // 目的：避免不同位置重复实现权重读取规则导致排序不一致。
    return Number(provider?.preferences?.weight ?? provider?.weight ?? 0) || 0;
  };

  const getProviderModelOptions = (provider: any): ProviderModelOption[] => {
    // 修改原因：虚拟模型画布需要从真实渠道配置中提取可拖拽的对外模型名。
    // 修改方式：遍历 provider.model 或 provider.models，将字符串模型和 {upstream: alias} 映射都转成 displayName/upstreamName。
    // 目的：左栏模型列表、渠道节点下拉和节点说明使用一致的数据源。
    const rawModels = Array.isArray(provider?.model) ? provider.model : Array.isArray(provider?.models) ? provider.models : [];
    const prefix = String(provider?.model_prefix || '').trim();
    const options: ProviderModelOption[] = [];
    const seen = new Set<string>();
    const appendOption = (displayName: string, upstreamName: string) => {
      const cleanDisplay = String(displayName || '').trim();
      const cleanUpstream = String(upstreamName || '').trim();
      if (!cleanDisplay || !cleanUpstream) return;
      const key = `${cleanDisplay}\u0000${cleanUpstream}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ displayName: cleanDisplay, upstreamName: cleanUpstream, hasMapping: cleanDisplay !== cleanUpstream });
    };
    rawModels.forEach((model: any) => {
      if (typeof model === 'string') {
        const upstream = model.trim();
        if (!upstream) return;
        appendOption(model === '*' || !prefix ? upstream : `${prefix}${upstream}`, upstream);
      } else if (model && typeof model === 'object') {
        Object.entries(model).forEach(([upstream, alias]) => {
          const aliasText = String(alias || '').trim();
          const upstreamText = String(upstream || '').trim();
          if (!aliasText || !upstreamText) return;
          appendOption(prefix ? `${prefix}${aliasText}` : aliasText, upstreamText);
        });
      }
    });
    return options;
  };

  const virtualRoutingProviderItems = useMemo(() => buildVirtualRoutingProviderItems(providers), [providers]);
  const virtualProviderPanelItems = useMemo(() => buildVirtualProviderPanelItems(providers), [providers]);
  const providerNames = useMemo(() => virtualRoutingProviderItems.map(provider => String(provider?.provider || '')).filter(Boolean), [virtualRoutingProviderItems]);
  const virtualProviderEntries = useMemo(() => buildVirtualProviderEntries(virtualModels), [virtualModels]);

  const findProviderModelOption = (provider: any, modelName: string): ProviderModelOption | null => {
    const requested = String(modelName || '').trim();
    if (!requested) return null;
    const options = getProviderModelOptions(provider);
    const direct = options.find(option => option.displayName === requested);
    if (direct) return direct;
    const prefix = String(provider?.model_prefix || '').trim();
    const poolSharing = readBooleanPreference(provider?.preferences?.pool_sharing);
    if (!prefix || !poolSharing || requested.startsWith(prefix)) return null;
    return options.find(option => option.displayName === `${prefix}${requested}`) || null;
  };

  const getProviderByName = (providerName: string): any | null => virtualRoutingProviderItems.find(provider => String(provider?.provider || '') === providerName) || null;

  const getMatchingProviderCount = (modelName: string): number => virtualRoutingProviderItems.filter(provider => provider?.enabled !== false && findProviderModelOption(provider, modelName)).length;

  const formatProviderModelOption = (option: ProviderModelOption): string => option.hasMapping ? `${option.displayName} → ${option.upstreamName}` : option.displayName;

  const describeVirtualChannelNode = (node: VirtualModelChainNode, virtualName: string): string => {
    const provider = getProviderByName(node.value);
    if (!provider) return '渠道未找到';
    const requestedModel = String(node.model || virtualName || '').trim();
    const matched = findProviderModelOption(provider, requestedModel);
    if (!matched) return requestedModel ? `使用模型：${requestedModel}（未匹配）` : '未指定模型';
    return `使用模型：${formatProviderModelOption(matched)}`;
  };

  const updateVirtualModelsDraft = (updater: (prev: Record<string, VirtualModelConfig>) => Record<string, VirtualModelConfig>) => {
    // 修改原因：虚拟模型编辑应先成为本地草稿，点击保存后再写回后端。
    // 修改方式：集中包装 setVirtualModels，并同步设置 dirty 标记。
    // 目的：避免每一次拖拽或输入都立即请求后端，也提醒用户保存更改。
    setVirtualModels(prev => updater(prev));
    setVirtualModelsDirty(true);
  };

  const serializeVirtualModels = (source: Record<string, VirtualModelConfig>): Record<string, VirtualModelConfig> => {
    // 修改原因：保存前必须把画布草稿清理成 preferences.virtual_models 所需格式。
    // 修改方式：修剪模型名、移除空节点，并只为 channel 节点保留有效 model 覆盖。
    // 目的：保证 POST /v1/api_config/update 收到的 chain 数组结构简洁、稳定。
    const cleaned: Record<string, VirtualModelConfig> = {};
    Object.entries(source).forEach(([rawName, config]) => {
      const name = String(rawName || '').trim();
      if (!name || !config || typeof config !== 'object') return;
      const chain = (Array.isArray(config.chain) ? config.chain : [])
        .map(node => ({
          type: node.type === 'channel' ? 'channel' as const : 'model' as const,
          value: String(node.value || '').trim(),
          model: node.type === 'channel' && node.model ? String(node.model).trim() : undefined,
        }))
        .filter(node => node.value)
        .map(node => {
          if (node.type === 'channel' && node.model) return node;
          const { model: _unused, ...rest } = node;
          return rest;
        });
      cleaned[name] = { enabled: config.enabled !== false, chain };
    });
    return cleaned;
  };

  const saveVirtualModels = async (nextVirtualModels: Record<string, VirtualModelConfig>) => {
    const res = await apiFetch('/v1/api_config/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ preferences: { virtual_models: nextVirtualModels } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(fmtErr(err, res.status));
    }
    setVirtualModels(nextVirtualModels);
    setVirtualModelsDirty(false);
  };

  const handleSaveVirtualModelsDraft = async () => {
    try {
      const cleaned = serializeVirtualModels(virtualModels);
      await saveVirtualModels(cleaned);
      toastSuccess('虚拟模型路由已保存');
    } catch (err: any) {
      toastError(`保存失败: ${err?.message || err}`);
    }
  };

  const handleAddVirtualModel = () => {
    const name = virtualDraftName.trim();
    if (!name) {
      toastWarning('虚拟模型名为必填项');
      return;
    }
    if (virtualModels[name]) {
      toastWarning('该虚拟模型已存在');
      return;
    }
    updateVirtualModelsDraft(prev => ({ ...prev, [name]: { enabled: virtualDraftEnabled, chain: [] } }));
    setExpandedVirtualModels(prev => new Set(prev).add(name));
    setVirtualDraftName('');
    setVirtualDraftEnabled(true);
  };

  const updateVirtualModelConfig = (name: string, patch: Partial<VirtualModelConfig>) => {
    updateVirtualModelsDraft(prev => ({ ...prev, [name]: { enabled: prev[name]?.enabled !== false, chain: Array.isArray(prev[name]?.chain) ? prev[name].chain : [], ...patch } }));
  };

  const updateVirtualNode = (virtualName: string, idx: number, patch: Partial<VirtualModelChainNode>) => {
    const current = virtualModels[virtualName];
    if (!current) return;
    const nextChain = (Array.isArray(current.chain) ? current.chain : []).map((node, nodeIdx) => {
      if (nodeIdx !== idx) return node;
      const nextNode = { ...node, ...patch };
      if (patch.type === 'model') delete nextNode.model;
      return nextNode;
    });
    updateVirtualModelConfig(virtualName, { chain: nextChain });
  };

  const moveVirtualNode = (virtualName: string, fromIdx: number, toIdx: number) => {
    const current = virtualModels[virtualName];
    if (!current || fromIdx === toIdx) return;
    const nextChain = [...(Array.isArray(current.chain) ? current.chain : [])];
    if (fromIdx < 0 || fromIdx >= nextChain.length) return;
    const [item] = nextChain.splice(fromIdx, 1);
    const safeToIdx = Math.max(0, Math.min(toIdx, nextChain.length));
    nextChain.splice(safeToIdx, 0, item);
    updateVirtualModelConfig(virtualName, { chain: nextChain });
  };

  const insertVirtualNode = (virtualName: string, node: VirtualModelChainNode, insertIndex?: number) => {
    const current = virtualModels[virtualName];
    if (!current) return;
    const nextChain = [...(Array.isArray(current.chain) ? current.chain : [])];
    const targetIndex = insertIndex == null ? nextChain.length : Math.max(0, Math.min(insertIndex, nextChain.length));
    nextChain.splice(targetIndex, 0, node);
    updateVirtualModelConfig(virtualName, { chain: nextChain });
    setExpandedVirtualModels(prev => new Set(prev).add(virtualName));
  };

  const appendVirtualNodeByType = (virtualName: string) => insertVirtualNode(virtualName, { type: virtualAddNodeTypes[virtualName] || 'model', value: '' });

  const toggleVirtualModelExpanded = (name: string) => {
    setExpandedVirtualModels(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleVirtualProviderExpanded = (name: string) => {
    setExpandedVirtualProviders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const getPreferredVirtualTarget = (): string | null => {
    const names = Object.keys(virtualModels);
    return names.find(name => expandedVirtualModels.has(name)) || names[0] || null;
  };

  const handlePanelModelQuickAdd = (modelName: string) => {
    const target = getPreferredVirtualTarget();
    if (!target) {
      toastWarning('请先新建虚拟模型');
      return;
    }
    insertVirtualNode(target, { type: 'model', value: modelName });
  };

  const handlePanelChannelQuickAdd = (providerName: string) => {
    const target = getPreferredVirtualTarget();
    if (!target) {
      toastWarning('请先新建虚拟模型');
      return;
    }
    insertVirtualNode(target, { type: 'channel', value: providerName });
  };

  const handleDeleteVirtualModel = async (name: string) => {
    const displayName = name || '未命名虚拟模型';
    if (!confirm(`确定要删除虚拟模型 "${displayName}" 吗？此操作会立即写回配置。`)) return;
    const nextVirtualModels = { ...virtualModels };
    delete nextVirtualModels[name];
    try {
      await saveVirtualModels(serializeVirtualModels(nextVirtualModels));
      setExpandedVirtualModels(prev => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      if (editingVirtualName === name) setIsVirtualModalOpen(false);
      toastWarning(`已删除虚拟模型 "${displayName}"`);
    } catch (err: any) {
      toastError(`删除失败: ${err?.message || err}`);
    }
  };

  const setVirtualDragPayload = (e: DragEvent<HTMLElement>, payload: VirtualDragPayload) => {
    const raw = JSON.stringify(payload);
    e.dataTransfer.setData('application/json', raw);
    e.dataTransfer.setData('text/plain', raw);
    e.dataTransfer.effectAllowed = payload.source === 'chain-node' ? 'move' : 'copy';
  };

  const readVirtualDragPayload = (e: DragEvent<HTMLElement>): VirtualDragPayload | null => {
    const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as VirtualDragPayload;
    } catch {
      return null;
    }
  };

  const handlePanelModelDragStart = (e: DragEvent<HTMLElement>, modelName: string) => {
    e.stopPropagation();
    setVirtualDragPayload(e, { source: 'panel-model', modelName });
  };
  const handlePanelChannelDragStart = (e: DragEvent<HTMLElement>, providerName: string) => setVirtualDragPayload(e, { source: 'panel-channel', providerName });
  const handleChainNodeDragStart = (e: DragEvent<HTMLElement>, virtualName: string, fromIndex: number) => setVirtualDragPayload(e, { source: 'chain-node', virtualName, fromIndex });

  const handleVirtualDrop = (e: DragEvent<HTMLElement>, virtualName: string, insertIndex?: number) => {
    e.preventDefault();
    const payload = readVirtualDragPayload(e);
    if (!payload) return;
    if (payload.source === 'panel-model') insertVirtualNode(virtualName, { type: 'model', value: payload.modelName }, insertIndex);
    else if (payload.source === 'panel-channel') insertVirtualNode(virtualName, { type: 'channel', value: payload.providerName }, insertIndex);
    else if (payload.source === 'chain-node' && payload.virtualName === virtualName) {
      const currentLength = virtualModels[virtualName]?.chain?.length || 0;
      const targetIndex = insertIndex == null ? Math.max(0, currentLength - 1) : insertIndex;
      moveVirtualNode(virtualName, payload.fromIndex, targetIndex);
    }
  };

  const openVirtualModelModal = (name: string | null = null) => {
    const config = name ? virtualModels[name] : null;
    setEditingVirtualName(name);
    setVirtualDraftName(name || '');
    setVirtualDraftEnabled(config?.enabled !== false);
    setVirtualEditorChain((Array.isArray(config?.chain) ? config!.chain : []).map(node => ({ ...node })));
    setVirtualModelsDirty(false);
    setIsVirtualMobileProviderPanelOpen(false);
    setIsVirtualModalOpen(true);
  };

  const updateVirtualEditorChainDraft = (updater: (prev: VirtualModelChainNode[]) => VirtualModelChainNode[]) => {
    setVirtualEditorChain(prev => updater(prev));
    setVirtualModelsDirty(true);
  };

  const updateVirtualEditorNode = (idx: number, patch: Partial<VirtualModelChainNode>) => {
    updateVirtualEditorChainDraft(prev => prev.map((node, nodeIdx) => {
      if (nodeIdx !== idx) return node;
      const nextNode = { ...node, ...patch };
      if (patch.type === 'model') delete nextNode.model;
      return nextNode;
    }));
  };

  const insertVirtualEditorNode = (node: VirtualModelChainNode, insertIndex?: number) => {
    updateVirtualEditorChainDraft(prev => {
      const next = [...prev];
      const targetIndex = insertIndex == null ? next.length : Math.max(0, Math.min(insertIndex, next.length));
      next.splice(targetIndex, 0, node);
      return next;
    });
  };

  const moveVirtualEditorNode = (fromIdx: number, toIdx: number) => {
    updateVirtualEditorChainDraft(prev => {
      if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      const safeToIdx = Math.max(0, Math.min(toIdx, next.length));
      next.splice(safeToIdx, 0, item);
      return next;
    });
  };

  const swapVirtualEditorNode = (idx: number, direction: -1 | 1) => {
    updateVirtualEditorChainDraft(prev => {
      const targetIdx = idx + direction;
      if (idx < 0 || idx >= prev.length || targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const appendVirtualEditorNodeByType = () => {
    const key = virtualDraftName.trim() || editingVirtualName || '__new_virtual_model__';
    insertVirtualEditorNode({ type: virtualAddNodeTypes[key] || 'model', value: '' });
  };

  const handleVirtualEditorDrop = (e: DragEvent<HTMLElement>, insertIndex?: number) => {
    e.preventDefault();
    const payload = readVirtualDragPayload(e);
    if (!payload) return;
    if (payload.source === 'panel-model') insertVirtualEditorNode({ type: 'model', value: payload.modelName }, insertIndex);
    else if (payload.source === 'panel-channel') insertVirtualEditorNode({ type: 'channel', value: payload.providerName }, insertIndex);
    else if (payload.source === 'chain-node' && payload.virtualName === '__virtual_editor__') {
      const targetIndex = insertIndex == null ? Math.max(0, virtualEditorChain.length - 1) : insertIndex;
      moveVirtualEditorNode(payload.fromIndex, targetIndex);
    }
  };

  const handleSaveVirtualEditor = async () => {
    const name = virtualDraftName.trim();
    if (!name) {
      toastWarning('虚拟模型名为必填项');
      return;
    }
    if (editingVirtualName !== name && virtualModels[name]) {
      toastWarning('该虚拟模型已存在');
      return;
    }
    const nextVirtualModels = { ...virtualModels };
    if (editingVirtualName && editingVirtualName !== name) delete nextVirtualModels[editingVirtualName];
    nextVirtualModels[name] = { enabled: virtualDraftEnabled, chain: virtualEditorChain };
    try {
      const cleaned = serializeVirtualModels(nextVirtualModels);
      await saveVirtualModels(cleaned);
      setEditingVirtualName(name);
      setVirtualEditorChain(cleaned[name]?.chain || []);
      setVirtualModelsDirty(false);
      setIsVirtualModalOpen(false);
      toastSuccess('虚拟模型路由已保存');
    } catch (err: any) {
      toastError(`保存失败: ${err?.message || err}`);
    }
  };

  const handleToggleVirtualModelCard = async (name: string, enabled: boolean) => {
    const current = virtualModels[name];
    if (!current) return;
    const nextVirtualModels = serializeVirtualModels({ ...virtualModels, [name]: { ...current, enabled } });
    try {
      await saveVirtualModels(nextVirtualModels);
      toastSuccess(enabled ? '虚拟模型已启用' : '虚拟模型已禁用');
    } catch (err: any) {
      toastError(`操作失败: ${err?.message || err}`);
    }
  };

  const filteredVirtualProviderEntries = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    return virtualProviderEntries.filter(p => {
      const enabled = p.enabled !== false;
      if (filterStatus === 'enabled' && !enabled) return false;
      if (filterStatus === 'disabled' && enabled) return false;
      if (filterEngine && filterEngine !== '虚拟路由') return false;
      if (filterGroup && filterGroup !== '虚拟模型') return false;
      if (kw) {
        const nameMatch = p.provider.toLowerCase().includes(kw);
        const chainMatch = summarizeVirtualChain(p.chain, p.provider, 20).toLowerCase().includes(kw);
        if (!nameMatch && !chainMatch) return false;
      }
      return true;
    });
  }, [virtualProviderEntries, filterKeyword, filterEngine, filterGroup, filterStatus]);

  const availableEngines = useMemo(() => virtualProviderEntries.length > 0 ? Array.from(new Set([...coreAvailableEngines, '虚拟路由'])).sort() : coreAvailableEngines, [coreAvailableEngines, virtualProviderEntries.length]);
  const availableGroups = useMemo(() => virtualProviderEntries.length > 0 ? Array.from(new Set([...coreAvailableGroups, '虚拟模型'])).sort() : coreAvailableGroups, [coreAvailableGroups, virtualProviderEntries.length]);
  const totalListItemCount = coreTotalListItemCount + virtualProviderEntries.length;
  const visibleListItemCount = coreVisibleListItemCount + filteredVirtualProviderEntries.length;

  const renderVirtualProviderPanelCollapsedRail = () => {
    // 修改原因：桌面端虚拟模型抽屉需要保留窄侧栏，便于不展开面板时快速添加渠道节点。
    // 修改方式：把渠道面板折叠分支放入虚拟 hook 渲染函数，继续使用同一套 providerPanelItems 和拖拽函数。
    // 目的：让虚拟模型组件只负责 JSX 组合，交互状态由专用 hook 维护。
    return (
      <div className="space-y-2">
        <div className="text-[10px] text-muted-foreground text-center">{virtualProviderPanelItems.length}</div>
        {virtualProviderPanelItems.length === 0 ? (
          <div className="text-[10px] text-muted-foreground text-center border border-dashed border-border rounded-lg px-1 py-3">无</div>
        ) : virtualProviderPanelItems.map(provider => {
          const providerName = String(provider?.provider || '未命名渠道');
          const isSubChannel = provider?._is_sub_channel === true;
          return (
            <div key={providerName} draggable onDragStart={e => handlePanelChannelDragStart(e, providerName)} className="relative">
              <button type="button" onClick={() => insertVirtualEditorNode({ type: 'channel', value: providerName })} className={`w-full h-11 rounded-lg border bg-background hover:bg-purple-500/10 flex items-center justify-center transition-colors ${isSubChannel ? 'border-cyan-500/30' : 'border-border'}`} title={`添加渠道节点：${providerName}`}>
                <ProviderLogo name={providerName} engine={provider?.engine} baseUrl={provider?.base_url} />
              </button>
              {isSubChannel && <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-cyan-500" />}
            </div>
          );
        })}
      </div>
    );
  };

  const renderVirtualProviderPanelList = () => {
    return (
      <div className="space-y-2">
        {virtualProviderPanelItems.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center border border-dashed border-border rounded-lg p-4">暂无可用渠道。</div>
        ) : virtualProviderPanelItems.map(provider => {
          const providerName = String(provider?.provider || '未命名渠道');
          const isSubChannel = provider?._is_sub_channel === true;
          const parentProviderName = String(provider?._parent_provider || '').trim();
          const isExpanded = expandedVirtualProviders.has(providerName);
          const weight = getProviderWeight(provider);
          const modelOptions = getProviderModelOptions(provider);
          return (
            <div key={providerName} draggable onDragStart={e => handlePanelChannelDragStart(e, providerName)} className={`border rounded-lg bg-background transition-colors ${isSubChannel ? 'ml-2 border-cyan-500/30' : 'border-border'}`}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab flex-shrink-0" />
                <button type="button" onClick={() => toggleVirtualProviderExpanded(providerName)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                  <ProviderLogo name={providerName} engine={provider?.engine} baseUrl={provider?.base_url} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">{providerName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{isSubChannel ? `子渠道 · ${parentProviderName}` : `${provider?.engine || 'openai'} · 权重 ${weight}`}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{isExpanded ? '▲' : '▼'}</span>
                </button>
                <button type="button" onClick={() => insertVirtualEditorNode({ type: 'channel', value: providerName })} className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" title="添加渠道节点">+</button>
              </div>
              {isExpanded && (
                <div className="border-t border-border px-2.5 py-2 space-y-1.5">
                  {modelOptions.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground italic">暂无模型</div>
                  ) : modelOptions.map(option => (
                    <div key={`${providerName}-${option.displayName}-${option.upstreamName}`} draggable onDragStart={e => handlePanelModelDragStart(e, option.displayName)} className="flex items-center gap-1.5 text-[11px] rounded bg-muted/50 px-2 py-1">
                      <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab flex-shrink-0" />
                      <span className="font-mono text-foreground truncate flex-1" title={formatProviderModelOption(option)}>{formatProviderModelOption(option)}</span>
                      <button type="button" onClick={() => insertVirtualEditorNode({ type: 'model', value: option.displayName })} className="text-primary hover:text-primary/80 flex-shrink-0" title="添加模型节点">+</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const getFullVirtualChainSummary = (entry: VirtualProviderEntry): string => summarizeVirtualChain(entry.chain, entry.provider, 20);

  const openVirtualRouteTestDialog = (entries: VirtualProviderEntry[]) => {
    const testProvider = buildVirtualRouteTestProvider(entries);
    if (testProvider) openTestDialog(testProvider);
  };

  const renderDesktopVirtualRoutesAccordionRows = () => {
    if (filteredVirtualProviderEntries.length === 0) return null;
    return (
      <>
        <tr className="border-l-4 border-l-purple-500/40 bg-purple-500/[0.04]">
          <td colSpan={7} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setIsVirtualRoutesAccordionOpen(prev => !prev)} aria-expanded={isVirtualRoutesAccordionOpen} className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm font-medium text-purple-700 dark:text-purple-300">
                <span className="truncate">🔗 虚拟路由 ({filteredVirtualProviderEntries.length})</span>
              </button>
              <button type="button" onClick={e => { e.stopPropagation(); openVirtualRouteTestDialog(filteredVirtualProviderEntries); }} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors flex-shrink-0" title="测试全部虚拟模型"><Play className="w-4 h-4" /></button>
              <button type="button" onClick={() => setIsVirtualRoutesAccordionOpen(prev => !prev)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors flex-shrink-0" title={isVirtualRoutesAccordionOpen ? '收起虚拟路由' : '展开虚拟路由'}>{isVirtualRoutesAccordionOpen ? '▲' : '▼'}</button>
            </div>
          </td>
        </tr>
        {isVirtualRoutesAccordionOpen && filteredVirtualProviderEntries.map(p => {
          const isEnabled = p.enabled !== false;
          const chainSummary = getFullVirtualChainSummary(p);
          return (
            <tr key={`virtual-${p.provider}`} className={`transition-colors border-l-4 border-l-purple-500/40 bg-purple-500/[0.03] hover:bg-purple-500/10 ${!isEnabled ? 'opacity-60' : ''}`}>
              <td className="px-4 py-3 align-top"><div className="font-medium text-purple-700 dark:text-purple-300 break-words">{p.provider}</div></td>
              <td className="px-4 py-3 align-top"><span className="inline-flex items-center gap-1 w-fit bg-purple-500/10 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-xs"><Link2 className="w-3 h-3" /> 虚拟路由</span></td>
              <td className="px-4 py-3 text-center align-top"><span className="text-xs font-mono text-muted-foreground">{Array.isArray(p.chain) ? p.chain.length : 0} 节点</span></td>
              <td className="px-4 py-3 align-top"><span className="block text-xs text-foreground font-mono truncate max-w-[280px] cursor-help" title={chainSummary}>{chainSummary}</span></td>
              <td className="px-4 py-3 text-center align-top"><span className="text-muted-foreground/50">—</span></td>
              <td className="px-4 py-3 text-center align-top"><span className="font-mono text-sm text-purple-700 dark:text-purple-300">∞</span></td>
              <td className="px-4 py-3 text-right align-top">
                <div className="flex items-center justify-end gap-1">
                  {/* 修改原因：虚拟行没有分析和复制按钮，需要用占位保持与普通渠道操作列大致对齐。 */}
                  <span className="w-7 flex-shrink-0" aria-hidden="true" />
                  <button onClick={() => openVirtualRouteTestDialog([p])} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors" title="测试虚拟模型"><Play className="w-4 h-4" /></button>
                  <button onClick={() => void handleToggleVirtualModelCard(p.provider, !isEnabled)} className={`p-1.5 rounded-md transition-colors ${isEnabled ? 'text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted'}`} title={isEnabled ? '禁用虚拟模型' : '启用虚拟模型'}><Power className="w-4 h-4" /></button>
                  <span className="w-7 flex-shrink-0" aria-hidden="true" />
                  <button onClick={() => openVirtualModelModal(p.provider)} className="p-1.5 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10 rounded-md transition-colors" title="编辑虚拟模型"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => void handleDeleteVirtualModel(p.provider)} className="p-1.5 text-red-600 dark:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="删除虚拟模型"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          );
        })}
      </>
    );
  };

  const renderMobileVirtualRoutesAccordion = () => {
    if (filteredVirtualProviderEntries.length === 0) return null;
    return (
      <div className="border border-purple-500/40 bg-purple-500/5 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" onClick={() => setIsVirtualRoutesAccordionOpen(prev => !prev)} aria-expanded={isVirtualRoutesAccordionOpen} className="flex-1 min-w-0 text-left text-sm font-medium text-purple-700 dark:text-purple-300"><span className="truncate block">🔗 虚拟路由 ({filteredVirtualProviderEntries.length})</span></button>
          <button type="button" onClick={e => { e.stopPropagation(); openVirtualRouteTestDialog(filteredVirtualProviderEntries); }} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors flex-shrink-0" title="测试全部虚拟模型"><Play className="w-4 h-4" /></button>
          <button type="button" onClick={() => setIsVirtualRoutesAccordionOpen(prev => !prev)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors flex-shrink-0" title={isVirtualRoutesAccordionOpen ? '收起虚拟路由' : '展开虚拟路由'}>{isVirtualRoutesAccordionOpen ? '▲' : '▼'}</button>
        </div>
        {isVirtualRoutesAccordionOpen && (
          <div className="border-t border-purple-500/20 p-2 space-y-2">
            {filteredVirtualProviderEntries.map(p => {
              const isEnabled = p.enabled !== false;
              const chainSummary = getFullVirtualChainSummary(p);
              return (
                <div key={`mobile-virtual-${p.provider}`} className={`rounded-lg border border-purple-500/25 bg-background/70 p-3 ${!isEnabled ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1"><div className="font-medium text-sm text-purple-700 dark:text-purple-300 break-words">{p.provider}</div><div className="mt-1 text-xs text-foreground font-mono truncate" title={chainSummary}>{chainSummary}</div></div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 flex-shrink-0">虚拟路由</span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-purple-500/15 flex items-center justify-end gap-0.5">
                    <button onClick={() => openVirtualRouteTestDialog([p])} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-md transition-colors" title="测试虚拟模型"><Play className="w-4 h-4" /></button>
                    <button onClick={() => void handleToggleVirtualModelCard(p.provider, !isEnabled)} className={`p-1.5 rounded-md transition-colors ${isEnabled ? 'text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted'}`} title={isEnabled ? '禁用虚拟模型' : '启用虚拟模型'}><Power className="w-4 h-4" /></button>
                    <button onClick={() => openVirtualModelModal(p.provider)} className="p-1.5 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10 rounded-md transition-colors" title="编辑虚拟模型"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => void handleDeleteVirtualModel(p.provider)} className="p-1.5 text-red-600 dark:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="删除虚拟模型"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return {
    virtualModels, setVirtualModels,
    virtualDraftName, setVirtualDraftName,
    virtualDraftEnabled, setVirtualDraftEnabled,
    virtualModelsDirty, setVirtualModelsDirty,
    expandedVirtualModels, setExpandedVirtualModels,
    expandedVirtualProviders, setExpandedVirtualProviders,
    virtualAddNodeTypes, setVirtualAddNodeTypes,
    isVirtualModalOpen, setIsVirtualModalOpen,
    editingVirtualName, setEditingVirtualName,
    virtualEditorChain, setVirtualEditorChain,
    isVirtualProviderPanelCollapsed, setIsVirtualProviderPanelCollapsed,
    isVirtualMobileProviderPanelOpen, setIsVirtualMobileProviderPanelOpen,
    isVirtualRoutesAccordionOpen, setIsVirtualRoutesAccordionOpen,
    getVirtualProviderWeight,
    getProviderModelOptions,
    findProviderModelOption,
    getProviderByName,
    getMatchingProviderCount,
    formatProviderModelOption,
    describeVirtualChannelNode,
    updateVirtualModelsDraft,
    serializeVirtualModels,
    saveVirtualModels,
    handleSaveVirtualModelsDraft,
    handleAddVirtualModel,
    updateVirtualModelConfig,
    updateVirtualNode,
    moveVirtualNode,
    insertVirtualNode,
    appendVirtualNodeByType,
    toggleVirtualModelExpanded,
    toggleVirtualProviderExpanded,
    getPreferredVirtualTarget,
    handlePanelModelQuickAdd,
    handlePanelChannelQuickAdd,
    handleDeleteVirtualModel,
    setVirtualDragPayload,
    readVirtualDragPayload,
    handlePanelModelDragStart,
    handlePanelChannelDragStart,
    handleChainNodeDragStart,
    handleVirtualDrop,
    openVirtualModelModal,
    updateVirtualEditorChainDraft,
    updateVirtualEditorNode,
    insertVirtualEditorNode,
    moveVirtualEditorNode,
    swapVirtualEditorNode,
    appendVirtualEditorNodeByType,
    handleVirtualEditorDrop,
    handleSaveVirtualEditor,
    handleToggleVirtualModelCard,
    virtualProviderEntries,
    virtualRoutingProviderItems,
    virtualProviderPanelItems,
    providerNames,
    filteredVirtualProviderEntries,
    availableEngines,
    availableGroups,
    totalListItemCount,
    visibleListItemCount,
    renderVirtualProviderPanelCollapsedRail,
    renderVirtualProviderPanelList,
    getFullVirtualChainSummary,
    openVirtualRouteTestDialog,
    renderDesktopVirtualRoutesAccordionRows,
    renderMobileVirtualRoutesAccordion,
    openTestDialog,
  };
}
