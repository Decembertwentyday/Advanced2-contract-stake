/**
 * React 层封装：根据「当前链 + 钱包」创建 ethers `Contract`。
 *
 * useEthersSigner
 * - 未连接时为 undefined；此时 `runner` 退化为 `getSepoliaReadOnlyProvider()`，仅适合只读。
 * - 发交易前页面必须判断 signer 已就绪，必要时 `contract.connect(signer)`（runner 已为 Signer 时可直接调 write 方法）。
 *
 * useChainId
 * - 用户切链后 chainId 变化，useMemo 依赖 signer / chainId / 地址，会重建合约实例，避免用过期链对象。
 *
 * useStakeContract / useTokenContract
 * - 固定 ABI + 地址（或动态 token 地址），供页面调用 ethers 风格方法（无 viem 的 `.read` / `.write` 命名空间）。
 *
 * erc20Abi
 * - 最小子集：approve、decimals；减小打包体积。
 */
import { Contract } from 'ethers';
import { useMemo } from 'react';
import { useChainId } from 'wagmi';
import { stakeAbi } from '../assets/abis/stake';
import type { Erc20MinimalContract, StakeEthersContract } from '../types/ethersStake';
import { createEthersContract } from '../utils/contractHelper';
import { getSepoliaReadOnlyProvider } from '../utils/ethersReadProvider';
import { StakeContractAddress } from '../utils/env';
import { useEthersSigner } from '../utils/wagmiEthersAdapter';

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
] as const;

export type HexAddress = `0x${string}`;

type UseContractOptions = {
  chainId?: number;
};

export function useContract(
  addressOrAddressMap?: HexAddress | { [chainId: number]: HexAddress },
  abi?: readonly unknown[],
  options?: UseContractOptions,
): Contract | null {
  const currentChainId = useChainId();
  const chainId = options?.chainId ?? currentChainId;
  const signer = useEthersSigner({ chainId });

  const readOnly = useMemo(() => getSepoliaReadOnlyProvider(), []);

  return useMemo(() => {
    if (!addressOrAddressMap || !abi || !chainId) return null;
    let address: HexAddress | undefined;
    if (typeof addressOrAddressMap === 'string') address = addressOrAddressMap;
    else address = addressOrAddressMap[chainId];
    if (!address) return null;
    const runner = signer ?? readOnly;
    return createEthersContract(address, abi, runner);
  }, [addressOrAddressMap, abi, chainId, signer, readOnly]);
}

export const useStakeContract = (): StakeEthersContract | null => {
  return useContract(StakeContractAddress, stakeAbi as readonly unknown[]) as StakeEthersContract | null;
};

/** 池子抵押物为 ERC20 时，用池子返回的 stTokenAddress 构造 approve 目标合约 */
export const useTokenContract = (tokenAddress?: HexAddress | string): Erc20MinimalContract | null => {
  const addr =
    tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000'
      ? (tokenAddress as HexAddress)
      : undefined;
  return useContract(addr, erc20Abi as readonly unknown[]) as Erc20MinimalContract | null;
};
