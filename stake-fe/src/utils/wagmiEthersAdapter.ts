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

// 让 TypeScript 能正确推断出 useClient 和 useConnectorClient 的类型，获得完整的类型提示
type AppConfig = typeof config; // 让 useClient 泛型推断出 chains/transports

/**
 * 可读操作的 Provider ethers
 * 纯函数：把 viem 的只读/钱包 Client 转成 ethers Provider。
 * 用于 eth_call、读取 blockNumber 等，不能用来签名。
 * 参数是 viem 的只读 Client（没有账户信息，只能读链上数据）
 * 返回：ethers 的 Provider（用于 eth_call、查询余额等）
 */
export function clientToProvider(client: Client<Transport, Chain>) {
  // chain：链的元数据（chainId、名称、合约地址等）
  // transport：RPC 传输层（如何与节点通信）
  const { chain, transport } = client; // chain：链元数据；transport：RPC 实现（http/fallback）
  const network = {
    chainId: chain.id, // ethers Network 需要 chainId
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address, // ensAddress 是可选的，用于 ENS 域名解析
  };
  // ethers 的 Provider 初始化时需要 network 信息
  // 与 sepoliaTransport 的 fallback([http, http, ...]) 对应
  // 是wagmi的客户端 client 获取到 wagmi的配置对象有多个RPC，
  // 所以 transport.type ：fallback 嘛 表示多个RPC，单个RPC：transport.typ就是 http
  if (transport.type === 'fallback') { // 多 transport（viem fallback）对应 ethers 的 FallbackProvider
    // 每个子 transport 对应一个 JsonRpcProvider
    // transports： 配置了多个 RPC，但是ethers需要把每个RPC转换成JsonRpcProvider
    // JsonRpcProvider： 是只读的 Provider，可以进行读操作，如查询余额
    const providers = (transport.transports as ReturnType<Transport>[]).map(
      ({ value }) => new JsonRpcProvider(value?.url, network),
    );
    if (providers.length === 1) return providers[0]; // 只有一个则不必包 FallbackProvider
    return new FallbackProvider(providers); // FallbackProvider：当一个 RPC 失败时自动切换到下一个

  }
  //只有一个RPC，直接创建JsonRpcProvider，
  return new JsonRpcProvider(transport.url, network);
}

/**
 * Hook：当前链的 ethers Provider（读）。
 * chainId 可选：与用户 useChainId() 一致时，切链后会拿到新 client。
 * useClient：wagmi 的 Hook，获取当前链的 viem Client
 * useMemo：缓存 Provider 实例，避免每次渲染都重新创建
 * 条件判断：如果 client 不存在（比如还没加载完），返回 undefined
 */
export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
  const client = useClient<AppConfig>({ chainId }); // wagmi：当前链的 viem Client
  return useMemo(() => (client ? clientToProvider(client) : undefined), [client]);
}
// 使用
// 在组件中读取链上数据
// const provider = useEthersProvider();
// const balance = await provider?.getBalance(address);
/**
 * 写入操作的Provider（Signer）适配层。
 * 纯函数：已连接钱包的 Client → ethers Signer。
 * 将已连接的 Client 转为 ethers Signer
 * BrowserProvider(transport) 把钱包当 EIP-1193 源；JsonRpcSigner 绑定用户 address。
 * 参数Client：account：包含用户钱包地址等信息；chain：链信息；transport：钱包通信方式
 */
export function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client; // account 含 address
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  // BrowserProvider：专门用于浏览器钱包（MetaMask 等），创建一个ethers的Provider，可以进行读操作
  // 它接受一个 EIP-1193 provider（viem 的 transport 就是）并提供 ethers 的 Provider 接口。
  const provider = new BrowserProvider(transport, network); // 钱包 transport 可发交易
  // JsonRpcSigner：绑定特定地址的签名器 from 字段都是 account.address
  // 通用签名器 （不绑定地址）是 JsonRpcProvider.getSigner()，
  // 但 BrowserProvider 已经封装好了，所以直接 new JsonRpcSigner。
  return new JsonRpcSigner(provider, account.address); // 该地址作为 from 签名
}

/**
 * Hook：发交易用的 Signer。未连接钱包时 data 为 undefined，页面应先判断再 write。
 * 所有 deposit / claim / unstake 都应先 const signer = useEthersSigner() 再 stakeWithSigner(...)。
 *
 * useConnectorClient vs useClient区别：
 *  useClient：只读，不需要连接钱包
 *  useConnectorClient：需要用户已连接钱包，才有数据
 */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: client } = useConnectorClient<AppConfig>({ chainId }); // 仅「已连接」才有
  return useMemo(() => (client ? clientToSigner(client) : undefined), [client]);
}
// 使用
// const signer = useEthersSigner();
//
// // 发送交易前检查
// if (!signer) {
//   // 提示用户连接钱包
//   return;
// }
//
// // 调用合约方法
// const contract = new Contract(address, abi, signer);
// await contract.deposit(amount);
