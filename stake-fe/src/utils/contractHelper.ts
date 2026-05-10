/**
 * 用 viem 封装「合约实例」工厂，供 React hooks 调用。
 *
 * 双客户端模型（核心）
 * - public：HTTP PublicClient（见 viem.ts）。负责 eth_call 类请求：read、估算、模拟。
 * - wallet：wagmi 提供的 WalletClient（用户钱包）。负责 eth_sendRawTransaction：write、签名。
 *
 * 为什么 write 也会受 public RPC 影响？
 * - viem 在发交易前常做 simulate/estimate，会向 RPC 发只读请求；public 挂了则 write 在弹窗前就失败。
 *
 * getContract 返回的对象上：
 * - .read.xxx()  只读
 * - .write.xxx() 需 wallet 已连接且 signer 存在
 */
import { Abi, Address, GetContractReturnType, PublicClient, WalletClient, getContract as viemGetContract } from "viem";
import { defaultChainId } from './wagmi';
import { viemClients } from "./viem";

export const getContract = <TAbi extends Abi | readonly unknown[], TWalletClient extends WalletClient>({
  abi,
  address,
  chainId = defaultChainId,
  signer,
}: {
  abi: TAbi | readonly unknown[];
  address: Address;
  chainId?: number;
  signer?: TWalletClient;
}) => {
  const c = viemGetContract({
    abi,
    address,
    client: {
      public: viemClients(chainId),
      wallet: signer,
    },
  }) as unknown as GetContractReturnType<TAbi, PublicClient, Address>;

  return {
    ...c,
    account: signer?.account,
    chain: signer?.chain,
  };
};
