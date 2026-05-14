/**
 * Sepolia **只读** HTTP 入口：不经过浏览器钱包，与「连接 MetaMask」无关。
 *
 * FallbackProvider：多个 JsonRpcProvider 并联，单点故障/限流时换节点再问。
 * staticNetwork：告诉 ethers「链 ID 已知」，跳过反复 eth_chainId 探测（避免控制台刷屏）。
 */
import { FallbackProvider, JsonRpcProvider, Network } from 'ethers'; // JsonRpcProvider：单 URL HTTP；FallbackProvider：聚合多个
import { SEPOLIA_CHAIN_ID } from '../config/chain'; // 十进制 11155111，与链上 chainId 一致

// Network.from：构造 ethers 的链描述对象；与子 JsonRpcProvider 的 staticNetwork 用同一对象引用更稳
const SEPOLIA_NETWORK = Network.from(SEPOLIA_CHAIN_ID);

/**
 * 按优先级返回 RPC URL 列表：有私钥 Infura 时优先自己的节点，否则全用公共节点。
 */
function sepoliaRpcUrls(): string[] {
  // process 在 Next 服务端/客户端构建时均可能存在；无 env 时用 undefined
  const infuraKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_INFURA_API_KEY : undefined;
  const publicRpcs = [
    'https://ethereum-sepolia-rpc.publicnode.com', // 公共节点 1
    'https://1rpc.io/sepolia', // 公共节点 2
    'https://sepolia.drpc.org', // 公共节点 3
  ];
  if (infuraKey) {
    // 自己的 Infura key 放最前：配额可控、延迟通常更好；后面公共 URL 作后备
    return [`https://sepolia.infura.io/v3/${infuraKey}`, ...publicRpcs];
  }
  return publicRpcs; // 无 key：避免写死无效 key 导致第一个子 Provider 永远失败
}

/**
 * 创建全站共享的只读 Provider（在 Web3Provider 里 useMemo 一次）。
 * quorum: 1 表示读操作只要有一个子节点返回即可（不必多节点交叉验证）。
 */
export function createSepoliaReadProvider(): FallbackProvider {
  const urls = sepoliaRpcUrls(); // 字符串 URL 列表
  // 每个 URL 对应一个子 JsonRpcProvider；FallbackProvider 会按 weight/超时调度
  const configs = urls.map((url) => ({
    provider: new JsonRpcProvider(url, SEPOLIA_NETWORK, {
      staticNetwork: SEPOLIA_NETWORK, // 固定链：跳过 provider._network 自举循环
    }),
    weight: 1, // 权重相同：轮流/择优由 FallbackProvider 内部策略决定
    stallTimeout: 1500, // 子请求 stall 判定：毫秒，过短易误判，过长拖慢回退
  }));
  // 第二参传 chainId：帮助 Fallback 做网络匹配；quorum 1 适合读 dApp
  return new FallbackProvider(configs, SEPOLIA_CHAIN_ID, { quorum: 1 });
}
