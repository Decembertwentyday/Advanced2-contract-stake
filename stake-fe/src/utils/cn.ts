/**
 * 合并 Tailwind 类名：clsx 负责条件拼接，tailwind-merge 负责解决冲突（后者覆盖前者）。
 *
 * 例：cn('p-4', isActive && 'bg-red-500', className)
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
