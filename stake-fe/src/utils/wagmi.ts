/**
 * wagmi 全局配置：链列表、RPC 传输、RainbowKit 所需的 WalletConnect projectId。
 *
 * getDefaultConfig（@rainbow-me/rainbowkit）
 * - 封装了常见需求：chains + transports + ssr 等，与 RainbowKit 对齐。
 *
 * projectId（Cloud.walletconnect.com）
 * - 用于 WalletConnect v2 中继，不是 Infura key；移动端扫码连接等场景需要。
 * Infura 是一个提供区块链节点服务的平台，它为开发者提供访问以太坊等区块链网络的 API 接口。
 * Infura key：访问区块链节点的 RPC 服务
 *
 * transports[chainId]
 * - 告诉 wagmi：该链的 JSON-RPC 走哪条 HTTP（或 WebSocket）。
 * - 读操作、部分 wagmi 内部请求会用到；与 viem 里 PublicClient 使用同一套 sepoliaTransport 可减少「读用 A、模拟用 B」的不一致。
 *
 * ssr: true
 * - Next.js 会在服务端先渲染一版 HTML；设为 true 时 wagmi 会避免在服务端错误地访问 window。
 */
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { sepoliaTransport } from './sepoliaTransport';

/** WalletConnect Cloud 项目 ID，与 Infura / 合约无关 */
const ProjectId = '8d76c8234e7c2d581fa5d926d8a0d31b';

// 配置对象
export const config = getDefaultConfig({
  appName: 'Meta Node Stake',
  projectId: ProjectId,
  chains: [sepolia],
  transports: {
    [sepolia.id]: sepoliaTransport,
  },
  ssr: true, // Next.js
});

/** 与合约 helper 默认链保持一致，避免未传 chainId 时错链 */
export const defaultChainId: number = sepolia.id;
