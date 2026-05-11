'use client';

import { useCallback, useEffect, useState } from 'react';
import { Contract, formatEther, formatUnits } from 'ethers';
import { useWeb3 } from '../providers/Web3Provider';

const erc20BalanceAbi = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type WalletBalance = {
  value: bigint;
  formatted: string;
  decimals: number;
};

export function useWalletBalance(options: {
  address: string | null;
  tokenAddress?: string | null;
  isEth: boolean;
  enabled: boolean;
}) {
  const { readProvider } = useWeb3();
  const [data, setData] = useState<WalletBalance | null>(null);

  const refetch = useCallback(async () => {
    if (!options.enabled || !options.address) {
      setData(null);
      return;
    }
    try {
      if (options.isEth) {
        const value = await readProvider.getBalance(options.address);
        setData({ value, formatted: formatEther(value), decimals: 18 });
        return;
      }
      if (options.tokenAddress) {
        const c = new Contract(options.tokenAddress, erc20BalanceAbi, readProvider);
        const [dec, bal] = await Promise.all([c.decimals(), c.balanceOf(options.address)]);
        const d = Number(dec);
        setData({ value: bal, formatted: formatUnits(bal, d), decimals: d });
      }
    } catch {
      setData(null);
    }
  }, [
    options.address,
    options.enabled,
    options.isEth,
    options.tokenAddress,
    readProvider,
  ]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!options.enabled || !options.address) return;
    const id = setInterval(refetch, 10000);
    return () => clearInterval(id);
  }, [options.enabled, options.address, refetch]);

  return { data, refetch };
}
