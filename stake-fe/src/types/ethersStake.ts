/**
 * 为 ethers Contract 补充「业务方法」的 TypeScript 类型。
 *
 * 原因：createEthersContract 返回通用 Contract，没有 depositETH、pool 等方法的类型提示；
 * 在 hooks 出口断言为  StakeEthersContract，页面调用时有自动补全且编译期检查参数。
 */
import type { Contract, ContractTransactionResponse } from 'ethers';

/** 质押主合约：与 stakeAbi 中会用到的读写方法签名一致 */

// ABI 是运行时数据，TypeScript 类型是编译时检查
// stakeAbi：在浏览器运行时使用，ethers 用它编码/解码交易
// StakeEthersContract：在编译时使用，TypeScript 用它检查代码

// 运行时 vs 编译时：ABI 是 JS 值，类型是 TS 声明，用途不同
// 格式不匹配：ABI 是 JSON，TS 需要函数签名
// 无类型推断：ethers 无法从 ABI 数组推断出具体方法
// 开发体验差：没有自动补全和类型检查

/**
 * 本质底层还是依赖 stake.ts里的 合约函数
 * 这里只是定义了ts类型，增加了类型检查和开发体验 补全提示
 * 运行时： stake.ts 运行时 ABI， stake.ts 运行时类型
 * StakeEthersContract：编译时类型，提供方法签名和参数类型检查
 */
export type StakeEthersContract = Contract & {
  pool(_pid: bigint | number): Promise<[string, bigint, bigint, bigint, bigint, bigint, bigint]>;
  user(_pid: bigint | number, _user: string): Promise<[bigint, bigint, bigint]>;
  stakingBalance(_pid: bigint | number, _user: string): Promise<bigint>;
  MetaNode(): Promise<string>; // 奖励代币合约地址
  claim(_pid: bigint | number): Promise<ContractTransactionResponse>; // 写：领取奖励
  depositETH(overrides?: { value?: bigint }): Promise<ContractTransactionResponse>; // 写：存 ETH
  deposit(_pid: bigint | number, _amount: bigint): Promise<ContractTransactionResponse>; // 写：存 ERC20
  unstake(_pid: bigint | number, _amount: bigint): Promise<ContractTransactionResponse>;
  withdraw(_pid: bigint | number): Promise<ContractTransactionResponse>;
  withdrawAmount(_pid: bigint | number, _user: string): Promise<[bigint, bigint]>; // 读：提现进度
};

/** ERC20 最小接口：approve + decimals */
export type Erc20MinimalContract = Contract & {
  approve(spender: string, amount: bigint): Promise<ContractTransactionResponse>;
  decimals(): Promise<number>;
};
