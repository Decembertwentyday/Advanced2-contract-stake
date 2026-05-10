/**
 * 顶栏：品牌、路由导航、RainbowKit 连接按钮。
 *
 * 'use client'
 * - 使用了 useState、usePathname 等浏览器端能力；在 Next 中标记为客户端组件，避免被误当成纯服务端模块。
 *
 * usePathname（next/navigation）
 * - 取当前路径，用于高亮「Stake / Withdraw / Claim」。
 * - 本项目是 Pages Router，但 Next 15 仍可在部分场景使用 navigation 里的 hook；若遇兼容问题可改回 useRouter().pathname。
 *
 * ConnectButton
 * - 来自 RainbowKit：内部会调 wagmi 的连接逻辑，弹出钱包选择器。
 */
'use client'
import { motion } from 'framer-motion';
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiMenu, FiZap } from 'react-icons/fi';
import { useState } from 'react';
import { cn } from '../utils/cn';

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  /** 与 pages 目录下的路由一一对应 */
  const Links = [
    { name: 'Stake', path: '/' },
    { name: 'Withdrawal', path: '/withdraw' },
    { name: 'Claim', path: '/claim' },
  ];

  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800"
    >
      <div className="absolute inset-0 tech-grid pointer-events-none" />
      <div className="relative z-10 max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex flex-wrap md:flex-nowrap justify-between items-center h-auto min-h-[56px] sm:min-h-[64px] py-2 gap-2 md:gap-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col md:flex-row items-center md:space-x-2 text-center md:text-left"
          >
            <FiZap className="w-5 h-5 sm:w-6 sm:h-6 text-primary-500 animate-pulse-slow mb-1 md:mb-0" />
            <Link href="/" className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent leading-tight">
              <span className="block md:inline">MetaNode</span>
              <span className="block md:inline"> Stake</span>
            </Link>
          </motion.div>

          {/* 桌面端：横向导航；layoutId 用于 framer-motion 下划线滑动动画 */}
          <nav className="hidden md:flex items-center space-x-6 lg:space-x-8">
            {Links.map((link) => {
              const isActive = pathname === link.path || pathname === link.path + '/';
              return (
                <Link
                  key={link.name}
                  href={link.path}
                  className={cn(
                    "relative text-base lg:text-lg font-medium transition-all duration-300 group",
                    isActive ? "text-primary-400" : "text-gray-400 hover:text-primary-400"
                  )}
                >
                  {link.name}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute -bottom-[1.5px] left-0 right-0 h-0.5 bg-gradient-to-r from-primary-400 to-primary-600"
                      initial={false}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary-400 group-hover:w-full transition-all duration-300" />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 md:gap-4 mt-2 md:mt-0">
            <div className="glow min-w-[100px] sm:min-w-[120px]">
              <ConnectButton />
            </div>
            <button
              className="md:hidden p-1.5 sm:p-2 ml-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-primary-400 transition-colors duration-200"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Open menu"
            >
              <FiMenu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* 移动端：折叠菜单 */}
      <motion.div
        initial={false}
        animate={{ height: isMobileMenuOpen ? "auto" : 0 }}
        className="md:hidden overflow-hidden"
      >
        <div className="px-3 sm:px-4 py-2 space-y-1 bg-gray-900/95 backdrop-blur-xl border-t border-gray-800">
          {Links.map((link) => {
            const isActive = pathname === link.path || pathname === link.path + '/';
            return (
              <Link
                key={link.name}
                href={link.path}
                className={cn(
                  "block px-3 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors duration-200",
                  isActive
                    ? "bg-primary-500/10 text-primary-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-primary-400"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      </motion.div>
    </motion.header>
  );
};

export default Header;
