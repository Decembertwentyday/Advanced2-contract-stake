/**
 * 未连接钱包时的「纯 HTTP」只读 Provider，与 wagmi 的 `useClient` 解耦。
 *
 * 为何需要
 * - `useClient` 在未连接时往往拿不到可用 client；若产品仍要在断连时展示池子总量等公开数据，
 *   可用本模块的 FallbackProvider 直连公共 RPC（URL 列表与 `sepoliaTransport.ts` 对齐）。
 *
 * 与 `wagmiEthersAdapter` 里 `useEthersProvider` 的区别
 * - 适配器：把 wagmi/viem 已建立的 client 转成 ethers Provider（依赖连接与 wagmi 状态）。
 * - 本文件：不经过 wagmi，适合作为 `runner = signer ?? readOnlyFallback` 的后半段。
 */
import { FallbackProvider, JsonRpcProvider, Network } from 'ethers';

const SEPOLIA_CHAIN_ID = 11155111;

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

let cached: FallbackProvider | null = null;

/** Sepolia 只读 Provider（多 RPC fallback），模块内单例避免重复建连。 */
export function getSepoliaReadOnlyProvider(): FallbackProvider {
  if (cached) return cached;
  const network = Network.from(SEPOLIA_CHAIN_ID);
  const providers = sepoliaRpcUrls().map(
    (url) =>
      new JsonRpcProvider(url, network, {
        staticNetwork: network,
      }),
  );
  cached = new FallbackProvider(providers);
  return cached;
}
