/**
 * 与环境变量相关的运行时配置。
 *
 * NEXT_PUBLIC_STAKE_ADDRESS
 * - 质押合约部署地址；必须以 NEXT_PUBLIC_ 开头才能在浏览器端读取。
 */
import { ZeroAddress } from 'ethers';

export type EthAddress = `0x${string}`;

export const StakeContractAddress: EthAddress =
  (process.env.NEXT_PUBLIC_STAKE_ADDRESS as EthAddress) || (ZeroAddress as EthAddress);
