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
 * 发起交易使用
 * @param contract 已通过 `new Contract(addr, abi, runner)` 创建的实例（runner 常为 Provider 或 Signer）
 * @param signer 当前用户的钱包 Signer（来自 BrowserProvider.getSigner()）
 * @returns 同一 ABI/地址、但 runner 已换为 signer 的 Contract（类型断言为 Contract）
 *
 * // ✅ 正确做法：先用 connectWithSigner 切换成 Signer
 * await stakeWithSigner.stake(1000); // 现在会弹出 MetaMask 确认框
 */
export function connectWithSigner(contract: Contract, signer: Signer): Contract {
  // connect：ethers 工厂方法，复用 Interface，仅替换底层 ConnectedRunner
  // .connect()  这是 ethers.js 提供的工厂方法，用于创建一个新的合约实例
  //特点： 1.复用原有配置：
  //   ✅ 合约地址不变
  //   ✅ ABI 不变
  //   ✅ Interface（接口解析器）不变
  // 2.仅替换 runner：
  //   ❌ 原来的 runner（Provider 或 Signer）被替换
  //   ✅ 新的 runner 是你传入的 signer
  // 3.不可变性：
  //     原 contract 实例不受影响
  //   返回一个新实例

  // 为什么需要断言
  // 在 ethers.js v6 中，.connect() 方法的返回类型定义是：BaseContract
      // connect(runner: ContractRunner): BaseContract
//  BaseContract vs Contract 的区别
//   BaseContract（基类）
//      只提供通用方法：connect(), waitForDeployment() 等
//       没有你的合约自定义方法（如 stake(), withdraw() 等）
// Contract（完整类）
//    继承自 BaseContract
//      包含 ABI 推导出的所有自定义方法
//       TypeScript 能提供完整的智能提示
//   使用断言的话 BaseContract 不会有 contract里的方法。
//    断言是为了避免 TS 丢失 stake 合约方法
//   为啥会有这个问题：
  // 这是 ethers.js v6 的类型系统设计缺陷：
  // v5 的做法（更好的类型推断）
  // connect<T extends Contract>(this: T, signer: Signer): T;
      // 返回类型与调用者相同

    // v6 的做法（简化但丢失类型）
  // connect(runner: ContractRunner): BaseContract;
      // 统一返回 BaseContract，导致子类型信息丢失

  return contract.connect(signer) as Contract; // 断言：避免 BaseContract 导致 TS 丢失 stake 合约方法
}
