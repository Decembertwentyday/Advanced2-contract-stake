/**
 * 按 chainId 返回 viem 的 PublicClient，供「只读 RPC」使用。
 *
 * 为什么需要 PublicClient？
 * - 浏览器里没有私钥；读链状态（balance、pool、user）应走 HTTP RPC。
 * - 在 contractHelper 里，getContract 会把 public 与 wallet 组合：read 走 public，write 走钱包，但 write 前模拟仍可能走 public。
 *
 * viemClients(chainId) 当前只配置了 Sepolia；若多链，可在 clients 映射里继续加项。
 *
 * 参数名 chaiId：保留原拼写以免大范围改动调用方；语义即 chainId。
 */
import { sepolia } from "viem/chains";
import { PublicClient, createPublicClient } from 'viem';
import { sepoliaTransport } from './sepoliaTransport';

export const viemClients = (chaiId: number): PublicClient => {
  const clients: Record<number, PublicClient> = {
    [sepolia.id]: createPublicClient({
      chain: sepolia,
      transport: sepoliaTransport,
    }),
  };
  return clients[chaiId];
};
