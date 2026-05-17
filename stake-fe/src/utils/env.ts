/**
 * 从环境变量读取链上配置（构建时注入到浏览器 bundle）。
 *
 * Next.js 规则：只有 NEXT_PUBLIC_ 前缀的变量才能在客户端代码里通过 process.env 访问。
 */
import { ZeroAddress } from 'ethers'; // 全零地址 0x000…000，表示「未配置」时的占位

/** 质押合约地址的 TypeScript 字面量类型，约束为 0x 开头的 42 字符 */
export type StakeAddress = `0x${string}`;

/**
 * 质押主合约地址。
 * - 优先读 .env.local 里的 NEXT_PUBLIC_STAKE_ADDRESS
 * - 未配置时用 ZeroAddress，链上调用会 revert 或读到空数据 → 部署后务必配置
 */
export const StakeContractAddress =
  (process.env.NEXT_PUBLIC_STAKE_ADDRESS as StakeAddress) || (ZeroAddress as StakeAddress);
