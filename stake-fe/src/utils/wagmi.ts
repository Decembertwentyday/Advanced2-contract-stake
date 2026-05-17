/**
 * wagmi 全局配置：定义应用支持哪些链、RPC 走哪条 transport、RainbowKit 的 WalletConnect 项目 ID。
 *
 * 原理：WagmiProvider 读取本 config，子组件里 useAccount / useBalance 等都依赖这份配置。
 */
import { getDefaultConfig } from '@rainbow-me/rainbowkit'; // RainbowKit 封装的 wagmi 默认配置
import { sepolia } from 'wagmi/chains'; // 内置 Sepolia 链元数据（chainId 11155111 等）
import { sepoliaTransport } from './sepoliaTransport'; // 本项目的多 RPC fallback

/**
 * WalletConnect Cloud 的 projectId（在 cloud.walletconnect.com 申请）。
 * 用于移动端扫码、部分钱包连接器中继；不是 Infura Key，也不是私钥。
 */
const ProjectId = '8d76c8234e7c2d581fa5d926d8a0d31b';

/** 导出给 _app.tsx 的 <WagmiProvider config={config}> 使用 */
// 设置了一个配置对象
export const config = getDefaultConfig({
  appName: 'Meta Node Stake', // 连接钱包弹窗里显示的应用名
  projectId: ProjectId, // WalletConnect v2 必填
  chains: [sepolia], // 仅支持 Sepolia 测试网；切到其他链会提示 wrong network
  transports: {
    [sepolia.id]: sepoliaTransport, // 该链上所有 JSON-RPC 请求走 fallback transport
  },
  ssr: true, // Next.js 服务端渲染时避免访问 window.ethereum 报错
});

/**
 * 默认链 ID，与 contractHelper / hooks 里未显式传 chainId 时的行为对齐。
 */
export const defaultChainId: number = sepolia.id; // 11155111
