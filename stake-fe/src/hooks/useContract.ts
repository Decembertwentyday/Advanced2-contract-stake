/**
 * 基于 Web3Provider 的 ethers `Contract` 工厂。
 *
 * - **Runner** 使用 `signer ?? readProvider`：已连接时用 Signer（可写），否则用只读 HTTP Provider（仅 view）。
 * - 页面里执行 `deposit` / `claim` 等会改状态的方法前，务必先 `connectWithSigner(contract, signer)`，
 *   否则 runner 可能是 Provider，无法签名交易。
 */
import { useMemo } from 'react';
import { ContractRunner } from 'ethers';
import { useWeb3 } from '../providers/Web3Provider';
import { createEthersContract } from '../utils/contractHelper';
import { StakeContractAddress } from '../utils/env';
import { stakeAbi } from '../assets/abis/stake';

const erc20Abi = [
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

export function useContract(address: string | undefined, abi: readonly unknown[]) {
  const { signer, readProvider } = useWeb3();

  return useMemo(() => {
    if (!address || address === '0x0000000000000000000000000000000000000000') {
      return null;
    }
    const runner: ContractRunner = signer ?? readProvider;
    return createEthersContract(address, abi, runner);
  }, [address, abi, signer, readProvider]);
}

export function useStakeContract() {
  return useContract(StakeContractAddress, stakeAbi);
}

export function useTokenContract(tokenAddress?: string) {
  const addr =
    tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000'
      ? tokenAddress
      : undefined;
  return useContract(addr, erc20Abi);
}
