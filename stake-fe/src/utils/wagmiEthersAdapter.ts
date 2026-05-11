/**
 * wagmi / viem → ethers v6 的官方参考适配层（摘自 Wagmi 文档「Ethers.js Adapters」并加中文说明）。
 *
 * 为何不能「删掉 viem 只留 ethers」
 * - wagmi v2 内部以 viem 的 `Client` / `Transport` 实现 RPC 与类型；`useConnectorClient`、`useClient`
 *   返回的也是 viem client。本文件做的是 **桥接**：同一套连接与 RainbowKit UI 不变，业务合约改用 ethers。
 *
 * useConnectorClient vs useClient（极易混用，务必分清）
 * - `useConnectorClient`：来自**已连接钱包**的 transport，可签名发交易 → 转成 `BrowserProvider` +
 *   `JsonRpcSigner`，用于 **write**。
 * - `useClient`：当前链的 JSON-RPC 读路径（无账户也能有 public client）→ 转成 `JsonRpcProvider` /
 *   `FallbackProvider`，用于 **只读 call**；不要拿它当 Signer 用。
 *
 * RainbowKit
 * - 不负责「转 ethers」；它只负责连接 UI。真正拿到 account/chain/transport 的是 wagmi，再由本适配层转换。
 *
 * chainId 参数
 * - 与 `useChainId()` 对齐传入，可在用户切链后让 hooks 拿到对应链的 client，避免用过期链发交易。
 *
 * transport.type === 'fallback'
 * - 与 `sepoliaTransport.ts` 的 `fallback([http(...), ...])` 一致；必须把子 transport 展开成多个
 *   `JsonRpcProvider`，再包成 ethers `FallbackProvider`，否则只映射到第一层会丢后备节点。
 */
import { BrowserProvider, FallbackProvider, JsonRpcProvider, JsonRpcSigner } from 'ethers';
import { useMemo } from 'react';
import type { Account, Chain, Client, Transport } from 'viem';
import { type Config, useClient, useConnectorClient } from 'wagmi';
import { config } from './wagmi';

type AppConfig = typeof config;

export function clientToProvider(client: Client<Transport, Chain>) {
  const { chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  if (transport.type === 'fallback') {
    const providers = (transport.transports as ReturnType<Transport>[]).map(
      ({ value }) => new JsonRpcProvider(value?.url, network),
    );
    if (providers.length === 1) return providers[0];
    return new FallbackProvider(providers);
  }
  return new JsonRpcProvider(transport.url, network);
}

/** 将 wagmi 当前链的 viem Client 转为 ethers Provider（读 / 模拟）。 */
export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
  const client = useClient<AppConfig>({ chainId });
  return useMemo(() => (client ? clientToProvider(client) : undefined), [client]);
}

export function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network);
  return new JsonRpcSigner(provider, account.address);
}

/** 将已连接钱包的 viem Wallet Client 转为 ethers Signer（签名、发交易）。未连接时为 undefined。 */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: client } = useConnectorClient<AppConfig>({ chainId });
  return useMemo(() => (client ? clientToSigner(client) : undefined), [client]);
}
