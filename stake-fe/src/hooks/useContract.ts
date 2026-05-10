/**
 * React 层封装：根据「当前链 + 钱包」创建 viem 合约实例。
 *
 * useWalletClient
 * - 未连接钱包时 data 为 undefined；getContract 仍可能用于只读，但本项目的 stake 地址依赖连接后业务，一般页面会先 Connect。
 *
 * useChainId
 * - 用户切链后 chainId 变化，useMemo 依赖 walletClient / chainId 会重建合约实例，避免用过期的链对象发交易。
 *
 * useStakeContract / useTokenContract
 * - 固定 ABI + 地址（或动态 token 地址），供页面调用 .read / .write。
 *
 * erc20Abi
 * - 最小子集：只包含质押流程需要的 approve、decimals；减小打包体积。
 */
import { useMemo } from "react";
import { Abi, Address, WalletClient } from "viem";
import { useChainId, useWalletClient } from "wagmi";
import { getContract } from "../utils/contractHelper";
import { StakeContractAddress } from "../utils/env";
import { stakeAbi } from '../assets/abis/stake';

const erc20Abi = [
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' as const },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' as const },
] as const;

type UseContractOptions = {
  chainId?: number;
};

export function useContract<TAbi extends Abi>(
  addressOrAddressMap?: Address | { [chainId: number]: Address },
  abi?: TAbi,
  options?: UseContractOptions,
) {
  const currentChainId = useChainId();
  const chainId = options?.chainId || currentChainId;
  const { data: walletClient } = useWalletClient();

  return useMemo(() => {
    if (!addressOrAddressMap || !abi || !chainId) return null;
    let address: Address | undefined;
    if (typeof addressOrAddressMap === 'string') address = addressOrAddressMap;
    else address = addressOrAddressMap[chainId];
    if (!address) return null;
    try {
      return getContract({
        abi,
        address,
        chainId,
        signer: walletClient ?? undefined,
      });
    } catch (error) {
      console.error('Failed to get contract', error);
      return null;
    }
  }, [addressOrAddressMap, abi, chainId, walletClient]);
}

export const useStakeContract = () => {
  return useContract(StakeContractAddress, stakeAbi as Abi);
};

/** 池子抵押物为 ERC20 时，用池子返回的 stTokenAddress 构造 approve 目标合约 */
export const useTokenContract = (tokenAddress?: Address | string) => {
  const addr = tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000'
    ? (tokenAddress as Address)
    : undefined;
  return useContract(addr, erc20Abi as unknown as Abi);
};
