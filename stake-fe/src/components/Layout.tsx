/**
 * 应用级布局：所有页面共享的「壳」。
 *
 * - fixed 背景层：纯视觉，pointer-events-none 避免挡住点击。
 * - Header：导航 + 连接钱包（见 Header.tsx）。
 * - main：Next 传入的 children，即当前路由页面内容。
 * - footer：站点信息。
 *
 * 为什么在 _app 里包 Layout 而不是每个页面自己包？
 * - 避免重复代码；换壳、换顶栏只改一处。
 */
import { ReactNode } from "react";
import Header from "./Header";
import { motion } from "framer-motion";
import { FiGithub, FiTwitter } from 'react-icons/fi';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* 全屏背景：渐变 + 网格 + 光晕，不参与交互 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
        <div className="absolute inset-0 tech-grid" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary-500/10 via-transparent to-transparent" />
      </div>

      <div className="relative flex flex-col flex-grow">
        <Header />
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex-grow max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8"
        >
          {children}
        </motion.main>

        <footer className="relative bg-gray-900/50 backdrop-blur-xl border-t border-gray-800 mt-auto">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-3 sm:space-y-4 md:space-y-0">
              <div className="text-gray-400 text-xs sm:text-sm md:text-base">
                © {new Date().getFullYear()} MetaNode Stake. All rights reserved.
              </div>
              <div className="flex items-center space-x-4 sm:space-x-6">
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-primary-400 transition-colors duration-200"
                >
                  <FiTwitter className="w-4 h-4 sm:w-5 sm:h-5" />
                </a>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-primary-400 transition-colors duration-200"
                >
                  <FiGithub className="w-4 h-4 sm:w-5 sm:h-5" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
