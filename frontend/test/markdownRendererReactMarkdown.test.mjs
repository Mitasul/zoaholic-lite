import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 修改原因：MarkdownRenderer 已经不适合继续维护手写 parser，需要用 react-markdown 生态覆盖 GFM、数学公式和原始 HTML。
// 修改方式：通过源码静态断言锁定核心依赖、组件接口、代码块复制按钮和手写 parser 的移除。
// 目的：防止后续维护把组件退回正则解析，或遗漏 rehype/remark 插件导致功能倒退。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const rendererSource = readFileSync(path.resolve(frontendRoot, 'src/components/MarkdownRenderer.tsx'), 'utf8');

assert.match(rendererSource, /import ReactMarkdown, \{ defaultUrlTransform \} from 'react-markdown';/, 'MarkdownRenderer 应使用 react-markdown 渲染 markdown');
assert.match(rendererSource, /import remarkGfm from 'remark-gfm';/, 'MarkdownRenderer 应启用 remark-gfm');
assert.match(rendererSource, /import remarkMath from 'remark-math';/, 'MarkdownRenderer 应启用 remark-math');
assert.match(rendererSource, /import rehypeKatex from 'rehype-katex';/, 'MarkdownRenderer 应启用 rehype-katex');
assert.match(rendererSource, /import rehypeRaw from 'rehype-raw';/, 'MarkdownRenderer 应启用 rehype-raw');

assert.match(rendererSource, /export function MarkdownRenderer\(\{ content, className = '', tone = 'default' \}: MarkdownRendererProps\)/, 'MarkdownRenderer 的公开 props 接口应保持不变');
assert.match(rendererSource, /remarkPlugins=\{\[remarkGfm, remarkMath\]\}/, 'ReactMarkdown 应挂载 GFM 和 math remark 插件');
assert.match(rendererSource, /rehypePlugins=\{\[rehypeRaw, rehypeKatex\]\}/, 'ReactMarkdown 应挂载 raw HTML 和 KaTeX rehype 插件');
assert.match(rendererSource, /components=\{components\}/, 'MarkdownRenderer 应通过 components prop 迁移现有样式');
assert.match(rendererSource, /function CodeBlock\(\{ code, language, tone \}/, '代码块复制按钮组件应保留');
assert.match(rendererSource, /navigator\.clipboard\.writeText\(code\)/, '代码块仍应支持复制到剪贴板');
assert.match(rendererSource, /data-footnote-ref/, '脚注引用应保留主题样式入口');
assert.match(rendererSource, /data-footnotes/, '脚注区域应保留主题样式入口');
assert.match(rendererSource, /task-list-item/, '任务列表项应保留样式入口');

assert.doesNotMatch(rendererSource, /function parseBlocks\(/, '不应保留手写块级 parser');
assert.doesNotMatch(rendererSource, /function renderInline\(/, '不应保留手写行内 parser');
assert.doesNotMatch(rendererSource, /katex\.renderToString/, 'KaTeX 渲染应交给 rehype-katex');
assert.doesNotMatch(rendererSource, /extractFootnotes/, '脚注应交给 remark-gfm');

console.log('markdown renderer react-markdown regression passed');
// 修改原因：当前部署环境的 Node 18 在部分 ESM 脚本自然结束后可能触发 Aborted。
// 修改方式：断言全部通过后显式以 0 退出，断言失败时仍会在这里之前抛出错误。
// 目的：让测试退出码只反映本文件断言是否通过。
process.exit(0);
