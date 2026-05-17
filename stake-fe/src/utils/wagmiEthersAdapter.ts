/**
 * wagmi（viem Client）→ ethers v6 Provider / Signer 适配层。
 *
 * 为何需要：业务层用 ethers Contract + tx.wait()；连接层用 wagmi + RainbowKit。
 * 本文件是官方文档「Ethers.js Adapters」模式，在两者之间搭桥。
 *
 * 必读区分：
 * - useConnectorClient → 已连接钱包 → Signer → 发交易
 * - useClient → 当前链 JSON-RPC → Provider → 只读
 */
import {
  BrowserProvider, // 包装 EIP-1193 provider（钱包注入的 transport）
  FallbackProvider, // 多 RPC 节点 fallback（与 viem fallback 对应）
  JsonRpcProvider, // 单 URL 的 HTTP Provider
  JsonRpcSigner, // 绑定到 Provider + 账户地址的签名者
} from 'ethers';
import { useMemo } from 'react'; // 缓存转换结果，避免每次渲染 new Provider
import type { Account, Chain, Client, Transport } from 'viem'; // viem 客户端类型
import { type Config, useClient, useConnectorClient } from 'wagmi'; // wagmi React hooks
import { config } from './wagmi'; // 本 app 的 wagmi 配置类型

type AppConfig = typeof config; // 让 useClient 泛型推断出 chains/transports

/**
 * 纯函数：把 viem 的只读/钱包 Client 转成 ethers Provider。
 * 用于 eth_call、读取 blockNumber 等，不能用来签名。
 */
export function clientToProvider(client: Client<Transport, Chain>) {
  const { chain, transport } = client; // chain：链元数据；transport：RPC 实现（http/fallback）
  const network = {
    chainId: chain.id, // ethers Network 需要 chainId
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address, // 可选 ENS 注册表
  };
  // 与 sepoliaTransport 的 fallback([http, http, ...]) 对应
  if (transport.type === 'fallback') {
    // 每个子 transport 对应一个 JsonRpcProvider
    const providers = (transport.transports as ReturnType<Transport>[]).map(
      ({ value }) => new JsonRpcProvider(value?.url, network),
    );
    if (providers.length === 1) return providers[0]; // 只有一个则不必包 FallbackProvider
    return new FallbackProvider(providers); // 多个则 ethers 侧也 fallback
  }
  // 单 http transport
  return new JsonRpcProvider(transport.url, network);
}

/**
 * Hook：当前链的 ethers Provider（读）。
 * chainId 可选：与用户 useChainId() 一致时，切链后会拿到新 client。
 */
export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
  const client = useClient<AppConfig>({ chainId }); // wagmi：当前链的 viem Client
  return useMemo(() => (client ? clientToProvider(client) : undefined), [client]);
}

/**
 * 纯函数：已连接钱包的 Client → ethers Signer。
 * BrowserProvider(transport) 把钱包当 EIP-1193 源；JsonRpcSigner 绑定用户 address。
 */
export function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client; // account 含 address
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network); // 钱包 transport 可发交易
  return new JsonRpcSigner(provider, account.address); // 该地址作为 from 签名
}

/**
 * Hook：发交易用的 Signer。未连接钱包时 data 为 undefined，页面应先判断再 write。
 * 所有 deposit / claim / unstake 都应先 const signer = useEthersSigner() 再 stakeWithSigner(...)。
 */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: client } = useConnectorClient<AppConfig>({ chainId }); // 仅「已连接」才有
  return useMemo(() => (client ? clientToSigner(client) : undefined), [client]);
}
