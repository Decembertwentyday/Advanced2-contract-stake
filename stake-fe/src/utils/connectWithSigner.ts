/**
 * 将 ethers `Contract` 的 **runner（执行者）** 从 Provider 换成 Signer，用于发送会改链上状态的交易。
 *
 * 原理：`new Contract(..., runner)` 里 runner 决定底层走 `eth_call` 还是 `eth_sendTransaction`；
 * `connect(signer)` 在不改 ABI/地址的前提下，换用 Signer 作为 runner。
 *
 * 为何单独抽函数：ethers v6 的 `contract.connect()` 返回类型是 `BaseContract`，会丢失 ABI 推导的方法名；
 * 这里 `as Contract` 把类型收窄，调用方写 `stakeWithSigner.depositETH(...)` 仍有完整提示。
 */
import { Contract, Signer } from 'ethers'; // Signer：抽象「能签名」；浏览器里具体实现常为 JsonRpcSigner

/**
 * @param contract 已通过 `new Contract(addr, abi, runner)` 创建的实例（runner 常为 Provider 或 Signer）
 * @param signer 当前用户的钱包 Signer（来自 BrowserProvider.getSigner()）
 * @returns 同一 ABI/地址、但 runner 已换为 signer 的 Contract（类型断言为 Contract）
 */
export function connectWithSigner(contract: Contract, signer: Signer): Contract {
  // connect：ethers 工厂方法，复用 Interface，仅替换底层 ConnectedRunner
  return contract.connect(signer) as Contract; // 断言：避免 BaseContract 导致 TS 丢失 stake 合约方法
}
