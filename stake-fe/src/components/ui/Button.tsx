/**
 * 通用按钮：封装加载态、禁用、framer-motion 点击缩放。
 *
 * variant
 * - 映射到 globals.css 里的 .btn-primary 等工具类，保持全站风格一致。
 *
 * loading
 * - 为 true 时禁用点击并显示转圈，防止重复提交链上交易。
 */
import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
}

export const Button = ({
  children,
  onClick,
  disabled = false,
  loading = false, // 为 true 时显示转圈并禁用，避免链上交易被连点两次
  className,
  type = 'button',
  variant = 'primary', // 映射到 globals.css 中预定义的按钮皮肤
  fullWidth = false,
}: ButtonProps) => {
  const baseStyles = "flex items-center justify-center space-x-2 transition-all duration-300";

  const variants = {
    primary: "btn-primary",
    secondary: "bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-6 py-3",
    outline: "border-2 border-primary-500 text-primary-500 hover:bg-primary-500/10 rounded-lg px-6 py-3",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }} // 悬停微缩放，纯 UI 反馈
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled || loading} // loading 与 disabled 等效，防止重复提交
      type={type}
      className={cn(
        baseStyles,
        variants[variant],
        fullWidth && "w-full",
        disabled && "opacity-70 cursor-not-allowed",
        className
      )}
    >
      {loading ? (
        <>
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
};
