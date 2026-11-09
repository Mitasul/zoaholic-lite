// 修改原因：Channels 页面主体已拆分到 src/pages/channels/ChannelsPage.tsx。
// 修改方式：保留原路由入口文件，仅重新导出拆分后的页面组件。
// 目的：外部 import 路径不变，同时让页面实现按 channels 目录分层维护。
export { default } from './channels/ChannelsPage';
