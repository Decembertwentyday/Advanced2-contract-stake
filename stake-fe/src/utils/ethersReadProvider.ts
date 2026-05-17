/**
 * 未连接钱包时的「纯 HTTP」只读 Provider（不经过 wagmi）。
 *
 * 使用场景：useContract 里 runner = signer ?? readOnly；
 * 用户断连时仍可用 readOnly 对合约做 eth_call（若业务需要展示公开池数据）。
 *
 * 与 useEthersProvider 区别：后者把 wagmi 的 useClient 转成 Provider，依赖 wagmi 状态；
 * 本模块直接 new JsonRpcProvider，断连也能建连。
 */
import { FallbackProvider, JsonRpcProvider, Network } from 'ethers';

const SEPOLIA_CHAIN_ID = 11155111; // Sepolia 链 ID，与 wagmi/chains sepolia.id 一致

/** 与 sepoliaTransport.ts 保持同一组 RPC URL，避免「读」和「写」走不同节点导致状态不一致 */
function sepoliaRpcUrls(): string[] {
  const infuraSepoliaUrl =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_INFURA_API_KEY
      ? `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      : 'https://sepolia.infura.io/v3/00a0215f2301422baa16a913ee44b0f1';
  return [
    infuraSepoliaUrl,
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
  ];
}

/** 模块级单例：避免每次 useMemo 都 new 一堆 Provider 连接 */
let cached: FallbackProvider | null = null;

/**
 * 返回 Sepolia 的 ethers FallbackProvider。
 * - 多个 JsonRpcProvider 包在一个 FallbackProvider 里，请求失败会换节点重试
 * - staticNetwork：固定网络，减少 ethers v6 自动探测链 ID 的额外 RPC
 */
export function getSepoliaReadOnlyProvider(): FallbackProvider {
  if (cached) return cached; // 已创建则复用
  const network = Network.from(SEPOLIA_CHAIN_ID); // 描述链 ID 与名称
  const providers = sepoliaRpcUrls().map(
    (url) =>
      new JsonRpcProvider(url, network, {
        staticNetwork: network, // 不反复 eth_chainId
      }),
  );
  cached = new FallbackProvider(providers); // 聚合为 fallback
  return cached;
}
