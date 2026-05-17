/**
 * 为 ethers Contract 补充「业务方法」的 TypeScript 类型。
 *
 * 原因：createEthersContract 返回通用 Contract，没有 depositETH、pool 等方法的类型提示；
 * 在 hooks 出口断言为 StakeEthersContract，页面调用时有自动补全且编译期检查参数。
 */
import type { Contract, ContractTransactionResponse } from 'ethers';

/** 质押主合约：与 stakeAbi 中会用到的读写方法签名一致 */
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
