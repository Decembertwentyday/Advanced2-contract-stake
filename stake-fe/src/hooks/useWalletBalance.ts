/**
 * 用 ethers **只读**路径查余额：ETH 用 `getBalance`，ERC20 用最小 `Contract` + `balanceOf`。
 * `readProvider` 为 FallbackProvider，不经 MetaMask；适合展示与校验，不弹签名框。
 */
'use client';

import { useCallback, useEffect, useState } from 'react'; // React 状态与副作用
import { Contract, formatEther, formatUnits } from 'ethers'; // formatEther：wei→ETH 十进制串；formatUnits：任意 decimals
import { useWeb3 } from '../providers/Web3Provider'; // 取 readProvider（HTTP）

// 仅包含读余额所需的最小 ABI，减小 bundle；与任意标准 ERC20 兼容
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
  value: bigint; // 链上原始 uint256
  formatted: string; // 人类可读十进制字符串（已按 decimals 除）
  decimals: number; // 代币精度；ETH 固定 18
};

/**
 * @param options.address 要查余额的钱包地址；null 时不请求
 * @param options.tokenAddress ERC20 合约地址；ETH 模式可忽略
 * @param options.isEth true 则走原生币分支
 * @param options.enabled false 时清空数据并 return：避免未连接时 address 为空仍打 RPC
 */
export function useWalletBalance(options: {
  address: string | null;
  tokenAddress?: string | null;
  isEth: boolean;
  enabled: boolean;
}) {
  const { readProvider } = useWeb3(); // HTTP FallbackProvider：全站单例引用
  const [data, setData] = useState<WalletBalance | null>(null); // null：未查、禁用或失败

  const refetch = useCallback(async () => {
    if (!options.enabled || !options.address) {
      setData(null); // 禁用：不保留旧余额，防串地址
      return;
    }
    try {
      if (options.isEth) {
        // getBalance：JSON-RPC eth_getBalance；不经过代币合约
        const value = await readProvider.getBalance(options.address);
        setData({ value, formatted: formatEther(value), decimals: 18 }); // ETH 固定 18 位
        return;
      }
      if (options.tokenAddress) {
        // new Contract(代币地址, 片段ABI, readProvider)：只读 runner，不会发交易
        const c = new Contract(options.tokenAddress, erc20BalanceAbi, readProvider);
        // 并行两次 eth_call：减少总延迟
        const [dec, bal] = await Promise.all([c.decimals(), c.balanceOf(options.address)]);
        const d = Number(dec); // uint8 → number；极端大 decimals 的代币极少见
        setData({ value: bal, formatted: formatUnits(bal, d), decimals: d }); // formatUnits：按代币精度格式化
      }
    } catch {
      setData(null); // RPC 失败：不抛到页面，由 UI 显示无可用余额
    }
  }, [
    options.address, // 换账户要重查
    options.enabled,
    options.isEth,
    options.tokenAddress,
    readProvider, // 理论稳定；列入满足 exhaustive-deps
  ]);

  useEffect(() => {
    void refetch(); // 挂载或依赖变化：立即拉一次
  }, [refetch]);

  useEffect(() => {
    if (!options.enabled || !options.address) return; // 无有效查询目标：不定轮询
    const id = setInterval(() => void refetch(), 10000); // 每 10s 轻量刷新：链上转账后余额会变
    return () => clearInterval(id); // 卸载或依赖变：清定时器防内存泄漏
  }, [options.enabled, options.address, refetch]);

  return { data, refetch }; // refetch：父组件在交易成功后手动再拉
}
