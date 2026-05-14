/**
 * 与环境变量相关的运行时配置。
 *
 * ## NEXT_PUBLIC_STAKE_ADDRESS
 * - 质押合约部署地址；`NEXT_PUBLIC_` 前缀会在 Next.js 构建时注入**浏览器可见**的 bundle，勿放私钥。
 * - 未设置时回落为 `ZeroAddress`：`useContract` 会拒绝构造合约，避免向空地址乱发调用。
 */
import { ZeroAddress } from 'ethers';

export type EthAddress = `0x${string}`;

export const StakeContractAddress: EthAddress =
  (process.env.NEXT_PUBLIC_STAKE_ADDRESS as EthAddress) || (ZeroAddress as EthAddress);
