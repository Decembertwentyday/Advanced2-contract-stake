/**
 * Sepolia 的 viem Transport：优先 Infura，失败则按顺序尝试公共节点。
 *
 * 原理（fallback）
 * - 单次 RPC 报错或超时时，viem 会尝试列表中的下一个 URL。
 * - Infura 免费层容易 -32002 / 限流；后备节点提高「读 + 写前模拟」成功率。
 *
 * NEXT_PUBLIC_INFURA_API_KEY
 * - 可选；未设置时使用内联默认 URL（仅便于本地跑通，正式环境建议只走环境变量）。
 * - 以 NEXT_PUBLIC_ 开头会被打进浏览器，切勿把「密钥」误解成「链上私钥」——这里只是 Infura 项目标识。
 */
import { fallback, http } from 'viem';

const infuraSepoliaUrl =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
    : 'https://sepolia.infura.io/v3/00a0215f2301422baa16a913ee44b0f1';

export const sepoliaTransport = fallback([
  http(infuraSepoliaUrl),
  http('https://ethereum-sepolia-rpc.publicnode.com'),
  http('https://1rpc.io/sepolia'),
]);

// fallback 里面的某一个rpc报错不能用了，则尝试下一个，为了避免单点挂了