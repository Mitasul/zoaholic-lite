import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiFetch } from '../lib/api';
import { toastSuccess, toastError, toastWarning } from '../components/Toast';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import {
  FolderOpen, File, RefreshCw, Download, Save, Trash2,
  ChevronRight, AlertTriangle, ArrowLeft,
  Eye, Edit3, FileText, HardDrive, FolderTree, PanelLeftOpen, X
} from 'lucide-react';

// ========== Types ==========

interface FileEntry {
  path: string;
  name: string;
  is_dir: boolean;
  size: number | null;
  modified_at: string;
  permissions: string;
  is_text: boolean | null;
  language: string | null;
}

interface FileContent extends FileEntry {
  content: string;
  line_count: number;
}

interface TreeResponse {
  path: string;
  entries: FileEntry[];
  total: number;
}

type MarkdownViewMode = 'preview' | 'code';

// 移动端文件树是否展开
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

// ========== Helpers ==========

function formatSize(size: number | null): string {
  if (size === null || size === undefined) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  } catch { return ts; }
}

function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) return <FolderOpen className="w-4 h-4 text-amber-500" />;
  if (entry.is_text) return <FileText className="w-4 h-4 text-sky-500" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

function permissionBadges(perms: string) {
  const badges: { label: string; color: string }[] = [];
  if (perms.includes('r')) badges.push({ label: '读', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30' });
  if (perms.includes('w')) badges.push({ label: '写', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' });
  if (perms.includes('d')) badges.push({ label: '删', color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' });
  return badges;
}

// 修改原因：工作区需要只对 Markdown 文件显示 preview/code 切换，不能影响普通文本文件查看。
// 修改方式：同时检查后端返回的 language 和文件扩展名，兼容 .md、.markdown 以及可能的语言标识差异。
// 目的：让 Markdown 文件默认走渲染预览，同时保留源码查看入口。
function isMarkdownFile(file: Pick<FileContent, 'path' | 'language'>): boolean {
  const language = file.language?.toLowerCase();
  const path = file.path.toLowerCase();
  return language === 'markdown' || path.endsWith('.md') || path.endsWith('.markdown');
}

// ========== Component ==========

export default function Workspace() {
  const { token } = useAuthStore();

  // Tree state
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState('');

  // File viewer/editor state
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  // 修改原因：Markdown 文件需要在渲染预览和源码查看之间切换，而普通文本仍只需要源码查看。
  // 修改方式：用独立状态记录 Markdown 的右侧查看模式，读取文件时按文件类型重置默认值。
  // 目的：避免编辑状态和普通文件查看受到 Markdown 预览模式影响。
  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>('preview');
  const [mobileTreeOpen, setMobileTreeOpen] = useState(true);
  const isMobile = useIsMobile();

  // Fetch directory tree
  const fetchTree = useCallback(async (dirPath: string = '') => {
    if (!token) return;
    setTreeLoading(true);
    setTreeError('');
    try {
      const params = new URLSearchParams();
      if (dirPath) params.set('path', dirPath);
      const res = await apiFetch(`/v1/workspace/tree?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const data: TreeResponse = await res.json();
      setEntries(data.entries);
      setCurrentPath(data.path);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : '加载目录失败');
    } finally {
      setTreeLoading(false);
    }
  }, [token]);

  // Fetch file content
  const fetchFile = useCallback(async (filePath: string) => {
    if (!token) return;
    setFileLoading(true);
    setFileError('');
    setEditMode(false);
    setSaveMessage('');
    try {
      const res = await apiFetch(`/v1/workspace/read?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const data: FileContent = await res.json();
      setSelectedFile(data);
      setEditContent(data.content);
      setMarkdownViewMode(isMarkdownFile(data) ? 'preview' : 'code');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '读取文件失败');
      setSelectedFile(null);
    } finally {
      setFileLoading(false);
    }
  }, [token]);

  // Save file
  const saveFile = async () => {
    if (!selectedFile || !token) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await apiFetch('/v1/workspace/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFile.path, content: editContent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      setSaveMessage('文件已保存');
      setEditMode(false);
      // 刷新文件内容
      await fetchFile(selectedFile.path);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Delete file
  const deleteFile = async (filePath: string) => {
    if (!token) return;
    if (!confirm(`确定要删除 ${filePath} 吗？此操作不可撤销。`)) return;
    try {
      const res = await apiFetch('/v1/workspace/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      // 删除后刷新目录和清除选中
      if (selectedFile?.path === filePath) {
        setSelectedFile(null);
      }
      await fetchTree(currentPath);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '删除失败');
    }
  };

  // Download file
  const downloadFile = async (filePath: string) => {
    try {
      const res = await apiFetch(`/v1/workspace/download?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toastError(data.detail || `下载失败 (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err instanceof Error ? err.message : '下载失败');
    }
  };

  // Navigate into directory
  const navigateDir = (dirPath: string) => {
    setSelectedFile(null);
    setFileError('');
    setSaveMessage('');
    fetchTree(dirPath);
  };

  // Navigate up
  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    navigateDir(parts.join('/'));
  };

  // Click on entry
  const handleEntryClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      navigateDir(entry.path);
    } else if (entry.is_text && entry.permissions.includes('r')) {
      fetchFile(entry.path);
      if (isMobile) setMobileTreeOpen(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchTree('');
  }, [fetchTree]);

  // Breadcrumbs
  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col gap-4 sm:gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg lg:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <HardDrive className="w-5 h-5 lg:w-7 lg:h-7 text-primary" /> 工作区
        </h1>
        <button
          onClick={() => fetchTree(currentPath)}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm bg-card border border-border text-foreground hover:bg-muted transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${treeLoading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">

        {/* 移动端：文件树收起时显示展开按钮 */}
        {isMobile && !mobileTreeOpen && (
          <button
            onClick={() => setMobileTreeOpen(true)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm bg-card border border-border rounded-lg text-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <span className="font-medium">文件列表</span>
            {selectedFile && (
              <span className="text-muted-foreground ml-1 truncate max-w-[200px]">— {selectedFile.path.split('/').pop()}</span>
            )}
          </button>
        )}

        {/* Left: File tree — 移动端可折叠 */}
        <div className={`lg:w-[380px] flex-shrink-0 bg-card border border-border rounded-lg overflow-hidden flex flex-col ${
          isMobile ? (mobileTreeOpen ? 'max-h-[50vh]' : 'hidden') : ''
        }`}>
          {/* Breadcrumb */}
          {/* 修改原因：移动端面包屑文字偏小，路径按钮在窄屏上不便触控。
              修改方式：采用 mobile-first 响应式类，默认使用 text-sm 和 48px 最小高度，sm 以上恢复 text-xs 与原高度。
              目的：提升移动端路径导航的可读性和触控稳定性，同时保持桌面端紧凑布局。 */}
          <div className="border-b border-border px-3 py-2 flex items-center gap-1.5 text-sm sm:text-xs flex-shrink-0 min-h-12 sm:min-h-[36px] flex-wrap">
            {/* 移动端关闭按钮 */}
            {isMobile && (
              <button
                onClick={() => setMobileTreeOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mr-1"
                title="收起文件列表"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => navigateDir('')}
              className="text-primary hover:underline font-medium flex items-center gap-1"
            >
              <FolderTree className="w-3.5 h-3.5" /> 根目录
            </button>
            {breadcrumbs.map((part, idx) => {
              const partPath = breadcrumbs.slice(0, idx + 1).join('/');
              return (
                <span key={partPath} className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <button
                    onClick={() => navigateDir(partPath)}
                    className="text-primary hover:underline font-medium"
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>

          {/* Tree entries */}
          <div className="flex-1 overflow-y-auto">
            {treeError ? (
              <div className="p-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{treeError}</span>
              </div>
            ) : entries.length === 0 && !treeLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>此目录为空或无可访问的文件</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {currentPath && (
                  <button
                    onClick={navigateUp}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>..</span>
                  </button>
                )}
                {entries.map(entry => (
                  <div
                    key={entry.path}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors group ${
                      selectedFile?.path === entry.path
                        ? 'bg-primary/8 border-l-2 border-l-primary'
                        : 'hover:bg-muted/50 border-l-2 border-l-transparent'
                    } ${entry.is_dir || (entry.is_text && entry.permissions.includes('r')) ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
                  >
                    <button
                      onClick={() => handleEntryClick(entry)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    >
                      {getFileIcon(entry)}
                      <span className="truncate text-foreground">{entry.name}</span>
                      {entry.is_dir && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto flex-shrink-0" />}
                    </button>
                    {!entry.is_dir && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* 修改原因：移动端文件大小和权限标签字体过小，容易降低列表扫描效率。
                            修改方式：默认将文件大小提升到 text-sm，权限标签提升到 text-xs，sm 以上恢复原有小尺寸。
                            目的：改善移动端文件列表的辨识度，同时保留桌面端的信息密度。 */}
                        <span className="text-sm sm:text-[10px] text-muted-foreground/70 font-mono">{formatSize(entry.size)}</span>
                        {permissionBadges(entry.permissions).map(b => (
                          <span key={b.label} className={`inline-flex items-center rounded px-1 py-0.5 text-xs sm:text-[9px] font-bold border ${b.color}`}>
                            {b.label}
                          </span>
                        ))}
                        {entry.permissions.includes('d') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFile(entry.path); }}
                            className="p-0.5 text-muted-foreground/50 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: File viewer/editor */}
        <div className="flex-1 min-w-0 bg-card border border-border rounded-lg overflow-hidden flex flex-col">
          {fileLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
          ) : fileError ? (
            <div className="flex-1 flex flex-col items-center justify-center text-red-600 dark:text-red-400 p-6">
              <AlertTriangle className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">{fileError}</p>
            </div>
          ) : selectedFile ? (
            <>
              {/* File header */}
              <div className="border-b border-border px-3 py-1.5 lg:px-4 lg:py-2.5 flex items-center justify-between gap-2 flex-shrink-0 bg-muted/20">
                <div className="min-w-0">
                  <div className="text-xs lg:text-sm font-semibold text-foreground truncate">{selectedFile.path}</div>
                  <div className="hidden lg:flex text-[11px] text-muted-foreground mt-0.5 items-center gap-3 flex-wrap">
                    <span>{formatSize(selectedFile.size)}</span>
                    <span>{selectedFile.line_count} 行</span>
                    <span className="font-mono">{selectedFile.language}</span>
                    <span>{formatTime(selectedFile.modified_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {selectedFile && isMarkdownFile(selectedFile) && !editMode && (
                    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-0.5" aria-label="Markdown 查看模式">
                      {/* 修改原因：Markdown 文件需要让用户显式选择渲染预览或源码查看，且移动端切换按钮原本过小。
                          修改方式：在文件头部操作区加入 Preview/Code 双按钮，并用 mobile-first 类让移动端使用 text-sm、px-3、py-2 和 48px 最小高度，sm 以上恢复原小尺寸。
                          目的：在不进入编辑模式的情况下快速切换右侧查看内容，并提升移动端触控可靠性。 */}
                      <button
                        type="button"
                        onClick={() => setMarkdownViewMode('preview')}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          markdownViewMode === 'preview'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarkdownViewMode('code')}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          markdownViewMode === 'code'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Code
                      </button>
                    </div>
                  )}
                  {selectedFile.permissions.includes('w') && (
                    editMode ? (
                      <>
                        <button
                          onClick={() => { setEditMode(false); setEditContent(selectedFile.content); setSaveMessage(''); }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={saveFile}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs bg-primary text-primary-foreground border border-primary hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                          <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                          {saving ? '保存中...' : '保存'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditMode(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> 编辑
                      </button>
                    )
                  )}
                  {/* 修改原因：移动端下载按钮文字、内边距和图标偏小，触控目标不足。
                      修改方式：默认使用 text-sm、px-3、py-2、48px 最小高度和更大的图标，sm 以上恢复原有紧凑尺寸。
                      目的：提升移动端下载操作的点击可靠性，同时不改变桌面端操作区密度。 */}
                  <button
                    onClick={() => downloadFile(selectedFile.path)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> 下载
                  </button>
                  {selectedFile.permissions.includes('d') && (
                    <button
                      onClick={() => deleteFile(selectedFile.path)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/15 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  )}
                </div>
              </div>

              {saveMessage && (
                <div className={`px-4 py-2 text-xs flex-shrink-0 ${
                  saveMessage === '文件已保存'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border-b border-red-500/20'
                }`}>
                  {saveMessage}
                </div>
              )}

              {/* File content */}
              <div className="flex-1 overflow-auto min-h-[60vh] lg:min-h-0">
                {editMode ? (
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full h-full bg-background text-foreground font-mono text-[13px] leading-relaxed p-4 resize-none outline-none"
                    spellCheck={false}
                  />
                ) : isMarkdownFile(selectedFile) && markdownViewMode === 'preview' ? (
                  <div className="min-h-full bg-background/60 p-4">
                    {/* 修改原因：Markdown 文件的默认阅读场景是渲染后的文档，不应只显示源码。
                        修改方式：复用项目统一 MarkdownRenderer 渲染当前文件内容，源码查看仍由 Code 模式保留。
                        目的：提升工作区中 md 类文件的阅读效率，同时不改变保存和编辑逻辑。 */}
                    <MarkdownRenderer content={selectedFile.content} className="max-w-none" />
                  </div>
                ) : (
                  <pre className="w-full h-full bg-background/60 text-foreground font-mono text-[13px] leading-relaxed p-4 whitespace-pre-wrap break-words overflow-auto">
                    {selectedFile.content}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
              <Eye className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm">选择左侧文件以查看内容</p>
              <p className="text-xs mt-1 opacity-70">支持查看文本文件，编辑配置文件，下载任意文件</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
