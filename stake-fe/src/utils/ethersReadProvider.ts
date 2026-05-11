/**
 * Sepolia 测试网 —— **只读** JSON-RPC 入口（不经过 MetaMask）。
 *
 * ## 在本项目中的职责
 * - 为未连接钱包的页面提供 `eth_call`、`getBalance`、`getBlockNumber` 等能力，用于展示**公开链上数据**（池子参数、待领取奖励等）。
 * - 与 `Web3Provider` 里的 `BrowserProvider` **并行存在**：前者走 HTTP，后者走用户扩展。
 *
 * ## 为什么用 FallbackProvider？
 * - 公共 RPC 可能限流、短暂不可用；`FallbackProvider` 按 `weight` / `quorum` 在多个子 `JsonRpcProvider` 间择优响应，提高可用性。
 *
 * ## 为什么 staticNetwork？
 * - ethers v6 的 `JsonRpcProvider` 启动时会做「探测链 ID」循环；若首个 URL 长期失败，会在控制台每秒打印重试日志（见 ethers issue #4377）。
 * - 我们明确只连 **Sepolia（chainId 固定）**，传入 `staticNetwork: SEPOLIA_NETWORK` 可跳过反复探测，**只影响 HTTP 这条读链路**，与 MetaMask 是否切换网络无关。
 *
 * ## 环境变量
 * - `NEXT_PUBLIC_INFURA_API_KEY`：若配置，则优先使用你的 Infura 节点；否则使用文件内列出的公共 URL（避免使用无效占位 Key）。
 */

import { FallbackProvider, JsonRpcProvider, Network } from 'ethers';
import { SEPOLIA_CHAIN_ID } from '../config/chain';

/** 与 `SEPOLIA_CHAIN_ID` 对应的 Network 对象，供 JsonRpcProvider 第二参 + staticNetwork 使用 */
const SEPOLIA_NETWORK = Network.from(SEPOLIA_CHAIN_ID);

/**
 * 返回按优先级排列的 Sepolia HTTP RPC URL 列表。
 * - 有 Infura Key 时：Infura 在前，公共节点作后备。
 * - 无 Key 时：仅公共节点，避免无效第三方 Key 导致首节点永远失败。
 */
function sepoliaRpcUrls(): string[] {
  const infuraKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_INFURA_API_KEY : undefined;
  const publicRpcs = [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.drpc.org',
  ];
  if (infuraKey) {
    return [`https://sepolia.infura.io/v3/${infuraKey}`, ...publicRpcs];
  }
  return publicRpcs;
}

/**
 * 构造全局单例式的只读 Provider（在 Web3Provider 内 `useMemo` 只创建一次）。
 *
 * @returns `FallbackProvider`，`quorum: 1` 表示只要有一个子节点返回一致结果即可（读场景足够）。
 */
export function createSepoliaReadProvider(): FallbackProvider {
  const urls = sepoliaRpcUrls();
  const configs = urls.map((url) => ({
    provider: new JsonRpcProvider(url, SEPOLIA_NETWORK, {
      staticNetwork: SEPOLIA_NETWORK,
    }),
    weight: 1,
    stallTimeout: 1500,
  }));
  return new FallbackProvider(configs, SEPOLIA_CHAIN_ID, { quorum: 1 });
}
