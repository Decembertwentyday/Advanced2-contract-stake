/**
 * Sepolia 链的 viem Transport：多个 HTTP RPC 做 fallback。
 *
 * 原理（viem fallback）：
 * - 第一个 URL 失败/超时时自动试下一个，提高读链和 eth_sendRawTransaction 前模拟的成功率。
 * - wagmi 内部用这份 transport 建 Client；与 ethersReadProvider 的 URL 列表应对齐。
 */
import { fallback, http } from 'viem'; // fallback = 组合多个 transport；http = 单节点 HTTP

/**
 * Infura Sepolia 端点。
 * - 有 NEXT_PUBLIC_INFURA_API_KEY 时用你自己的 key（正式环境推荐）
 * - 否则用内联默认 key，仅方便本地跑通，可能被限流
 */
const infuraSepoliaUrl =
    // 只有构建后部署后才会有环境变量
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
    : 'https://sepolia.infura.io/v3/00a0215f2301422baa16a913ee44b0f1';

/**
 * 导出给 wagmi config.transports[sepolia.id]。
 * 顺序：Infura → publicnode → 1rpc；任一可用即可。
 * fallback：第一个链失败，会切换到下一个，直到所有都失败。
 */
export const sepoliaTransport = fallback([
  http(infuraSepoliaUrl),
  http('https://ethereum-sepolia-rpc.publicnode.com'),
  http('https://1rpc.io/sepolia'),
]);
