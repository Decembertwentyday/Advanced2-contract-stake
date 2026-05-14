/**
 * 使用 ethers v6 构造 `Contract`：把 **链上地址 + ABI + runner** 绑在一起。
 *
 * - runner = **Provider**：只读，底层 JSON-RPC 多为 `eth_call`（模拟执行，不上链）。
 * - runner = **Signer**：可写，会走 `eth_sendTransaction` 等需要签名的路径。
 * 本项目的 runner 通常来自 `useContract` 里的 `signer ?? readProvider`。
 */
import { Contract, ContractRunner, InterfaceAbi } from 'ethers'; // ContractRunner：Provider | Signer 等统一父类型

/**
 * @param address 合约部署地址（0x…）；零地址表示未配置，直接返回 null 防误调
 * @param abi 函数/事件片段数组；需与链上字节码接口一致，否则编码会错
 * @param runner 谁去执行调用：只读或签名
 * @returns Contract 实例；非法地址时返回 null
 */
export function createEthersContract(
  address: string, // 目标合约地址字符串
  abi: readonly unknown[], // 使用 readonly：ABI 常量为 as const，满足不可变
  runner: ContractRunner // 与链交互的「脚」：HTTP 读 或 钱包签
): Contract | null {
  // 零地址在 EVM 里常表示「无」；env 未配 STAKE 地址时避免 new Contract(0x0) 产生无意义 RPC
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return null; // 上层 useMemo 得到 null，页面可禁用按钮或提示配置
  }
  // InterfaceAbi：ethers 对 ABI 的类型名；as 断言因 ABI 来源可能是 JSON/unknown[]
  return new Contract(address, abi as InterfaceAbi, runner); // 绑定完成，之后 .pool() / .deposit() 等由 ABI 决定编码方式
}
