/**
 * 把 ethers Contract 与 Signer 绑定，并恢复 TypeScript 上的「业务方法名」。
 *
 * 背景：ethers 的 contract.connect(signer) 返回类型是 BaseContract，
 * 会丢失 stakeAbi 里定义的 depositETH、claim 等方法名，所以要 as StakeEthersContract。
 */
import type { Signer } from 'ethers'; // 已连接钱包的签名者，可发交易
import type { Erc20MinimalContract, StakeEthersContract } from '../types/ethersStake';

/**
 * 质押合约 + Signer：用于 depositETH、deposit、claim、unstake、withdraw 等写操作。
 * stakeWithSigner 函数的作用就是确保合约使用最新的 signer
 * @param c - useStakeContract 返回的合约实例（runner 可能已是 Signer，再 connect 一次确保签名路径）
 * @param signer - useEthersSigner()，未连接时为 undefined，调用方应先判断
 */
export function stakeWithSigner(c: StakeEthersContract, signer: Signer): StakeEthersContract {
  // connect 是 ethers.js 库中 Contract 类的一个核心方法，
  // 用于将合约实例与一个 Signer（签名者） 或 Provider（提供者） 绑定

  // 可以把 connect 想象成：
  //   1.合约实例 = 一台机器
  //   2.Provider = 观察模式（只能看不能动）
  //   3. Signer = 操作模式（可以真正执行操作）
  //   4. connect(signer) = 把机器从观察模式切换到操作模式
  return c.connect(signer) as StakeEthersContract; // connect 换 runner；断言收窄类型
  // 这行代码做了两件事：
  //   1.切换执行上下文：将合约实例的执行环境从当前的
  //     runner（可能是只读 Provider）切换到传入的 signer
  //   2. 类型断言：因为 ethers.js 的 connect 方法返回的是通用类型 BaseContract，
  // 会丢失具体的业务方法类型信息，所以需要用 as StakeEthersContract 重新声明类型
}
// 例子：
// 没有 connect（只读模式）：
// // 只能调用 view/pure 函数（查询数据）
// const balance = await contract.balanceOf(address); // ✅ 可以
// await contract.depositETH({ value: amount });      // ❌ 报错！无法发送交易
//
// 使用 connect（可写模式）：
// // 可以调用所有函数，包括发送交易
// const writableContract = contract.connect(signer);
// await writableContract.depositETH({ value: amount }); // ✅ 可以发送交易

/**
 * ERC20 代币合约 + Signer：用于 approve(spender, amount)。
 */
export function erc20WithSigner(c: Erc20MinimalContract, signer: Signer): Erc20MinimalContract {
  // 可以把 connect 想象成：
  //   1.合约实例 = 一台机器
  //   2.Provider = 观察模式（只能看不能动）
  //   3. Signer = 操作模式（可以真正执行操作）
  //   4. connect(signer) = 把机器从观察模式切换到操作模式

  // 这行代码做了两件事：
  //   1.切换执行上下文：将合约实例的执行环境从当前的
  //     runner（可能是只读 Provider）切换到传入的 signer
  //   2. 类型断言：因为 ethers.js 的 connect 方法返回的是通用类型 BaseContract，
  // 会丢失具体的业务方法类型信息，所以需要用 as StakeEthersContract 重新声明类型
  return c.connect(signer) as Erc20MinimalContract;
}
