/**
 * 合并 Tailwind className 的工具函数。
 *
 * 原理：
 * 1. clsx：把字符串、对象、数组拼成最终 class 列表（支持条件 class）
 * 2. tailwind-merge：当两个 class 冲突（如 p-2 和 p-4）时，保留后者，避免样式错乱
 */
import { clsx, type ClassValue } from 'clsx'; // ClassValue = clsx 接受的参数类型
import { twMerge } from 'tailwind-merge'; // 解析 Tailwind 类名优先级并去重

/** 项目内统一用 cn(...) 代替字符串拼接，Header/Button 等组件都会用到 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs)); // 先 clsx 展开，再 twMerge 解决冲突
}
