/**
 * 与环境变量相关的运行时配置。
 *
 * NEXT_PUBLIC_STAKE_ADDRESS
 * - 质押合约部署地址；必须以 NEXT_PUBLIC_ 开头才能在浏览器端读取。
 * - 未配置时退回 ZeroAddress，链上调用会失败——部署后务必在 .env.local 里设置。
 */
import { ZeroAddress } from 'ethers';

export type StakeAddress = `0x${string}`;

export const StakeContractAddress =
  (process.env.NEXT_PUBLIC_STAKE_ADDRESS as StakeAddress) || (ZeroAddress as StakeAddress);
