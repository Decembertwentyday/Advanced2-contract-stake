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

// 这里是把publicClient 公共客户端封装了一下
export const viemClients = (chaiId: number): PublicClient => {
  const clients: Record<number, PublicClient> = {
    [sepolia.id]: createPublicClient({
      chain: sepolia, // 测试网
      transport: sepoliaTransport, // RPC 节点，里面使用了fallback 里面有多个节点，其中一个失败，会自动切换下一个节点，直到所有节点都失败
    }),
    // createPublicClient: 创建只读客户端，配置链，以及RPC - 进行合约的查询区块链数据，不需要私钥
    //   没有私钥时，可以用只读客户端 进行读合约的操作，查余额 等等
  };
  return clients[chaiId];
};

// 在外面使用
// 获取 PublicClient
// const client = viemClients(sepolia.id);
//
// // 查询用户余额
// const balance = await client.getBalance({
//   address: userAddress,
// });
//
// // 读取合约的总质押量
// const totalStaked = await client.readContract({
//   address: stakeContractAddress,
//   abi: stakeAbi,
//   functionName: 'totalStaked',
// });
//
// console.log(`总质押量: ${totalStaked}`);