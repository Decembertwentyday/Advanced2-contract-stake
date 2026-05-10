/**
 * 路由：浏览器访问 "/" 时由 Next.js 加载本文件作为页面组件。
 *
 * 本文件刻意写得很薄：只负责把「真正的首页 UI」交给 ./home/page。
 * 这样可以把大块业务逻辑放在 home/page.tsx，index 保持入口清晰。
 *
 * 阅读路径：_app.tsx（全局壳） → 本文件（根路由） → home/page.tsx（质押首页）
 */
import type { NextPage } from 'next';
import Home from './home/page';

const Index: NextPage = () => <Home />;

export default Index;
