/**
 * React Hooks：按「当前链 + 钱包连接状态」创建 ethers Contract 实例。
 *
 * 核心公式：runner = signer ?? readOnlyProvider
 * - 已连接：Signer 可读可写
 * - 未连接：只读 Provider，仅能 view 函数（本项目的 useRewards 仍要求 isConnected）
 */
import { Contract } from 'ethers';
import { useMemo } from 'react'; // 依赖变化时才重建 Contract，避免无意义 RPC
import { useChainId } from 'wagmi'; // 用户当前链 ID（切链会变）
import { stakeAbi } from '../assets/abis/stake'; // 质押主合约完整 ABI
import type { Erc20MinimalContract, StakeEthersContract } from '../types/ethersStake';
import { createEthersContract } from '../utils/contractHelper';
import { getSepoliaReadOnlyProvider } from '../utils/ethersReadProvider';
import { StakeContractAddress } from '../utils/env';
import { useEthersSigner } from '../utils/wagmiEthersAdapter';

/** ERC20 最小 ABI：只包含 approve + decimals，减小打包体积 */
const erc20Abi = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function' as const,
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function' as const,
  },
] as const; // as const 让 TypeScript 推断为字面量元组

/** 以太坊地址字面量类型，与 viem 的 `0x${string}` 一致 */
export type HexAddress = `0x${string}`;

type UseContractOptions = {
  chainId?: number; // 可选：强制指定链，默认用 useChainId()
};

/**
 * 通用合约 Hook：传入地址（或按 chainId 映射的地址表）+ ABI。
 */
export function useContract(
  addressOrAddressMap?: HexAddress | { [chainId: number]: HexAddress },
  abi?: readonly unknown[],
  options?: UseContractOptions,
): Contract | null {
  const currentChainId = useChainId(); // 钱包当前链
  const chainId = options?.chainId ?? currentChainId; // 解析最终使用的链
  const signer = useEthersSigner({ chainId }); // 该链上的 Signer，未连接为 undefined

  // 只读 Provider 单例，依赖数组为空 [] 表示全生命周期只创建一次
  const readOnly = useMemo(() => getSepoliaReadOnlyProvider(), []);

  return useMemo(() => {
    // 缺地址、ABI 或 chainId 时无法实例化
    if (!addressOrAddressMap || !abi || !chainId) return null;
    let address: HexAddress | undefined;
    if (typeof addressOrAddressMap === 'string') {
      address = addressOrAddressMap; // 单地址字符串
    } else {
      address = addressOrAddressMap[chainId]; // 多链部署时按 chainId 取地址
    }
    if (!address) return null;
    const runner = signer ?? readOnly; // 优先钱包 Signer，否则 HTTP 只读
    return createEthersContract(address, abi, runner);
  }, [addressOrAddressMap, abi, chainId, signer, readOnly]); // signer/chainId 变则重建实例
}

/** 质押主合约：地址来自 env，ABI 为 stakeAbi */
export const useStakeContract = (): StakeEthersContract | null => {
  return useContract(StakeContractAddress, stakeAbi as readonly unknown[]) as StakeEthersContract | null;
};

/**
 * 池子抵押 ERC20 时：用 pool() 返回的 stTokenAddress 构造代币合约。
 * 用于 approve(stake合约, amount)。
 */
export const useTokenContract = (tokenAddress?: HexAddress | string): Erc20MinimalContract | null => {
  const addr =
    tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000'
      ? (tokenAddress as HexAddress) // 非零地址才创建
      : undefined; // ETH 池无 ERC20 地址
  return useContract(addr, erc20Abi as readonly unknown[]) as Erc20MinimalContract | null;
};
