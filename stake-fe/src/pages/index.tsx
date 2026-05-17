/**
 * 路由入口：浏览器访问 http://localhost:3000/ 时，Next.js Pages Router 会加载本文件。
 *
 * 设计意图：index 只做「转发」，真正的首页 UI 在 home/page.tsx，
 * 这样路由文件保持极简，业务代码集中在 home 目录。
 */
import type { NextPage } from 'next'; // Next 提供的页面组件类型，用于 props/类型检查
import Home from './home/page'; // 引入实际的首页组件（质押 + 领奖 UI）

// 函数组件：返回 <Home />，等价于把 home/page 当作根路径的页面
const Index: NextPage = () => <Home />;

// 默认导出：Next 用 default export 识别「这个文件就是页面组件」
export default Index;
