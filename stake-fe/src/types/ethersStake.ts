/**
 * stakeAbi / erc20 子集在 ethers `Contract` 上的窄化类型。
 * `createEthersContract` 使用 `InterfaceAbi` 断言会丢失方法推断，故在 hooks 出口做一次显式收窄。
 */
import type { Contract, ContractTransactionResponse } from 'ethers';

export type StakeEthersContract = Contract & {
  pool(_pid: bigint | number): Promise<[string, bigint, bigint, bigint, bigint, bigint, bigint]>;
  user(_pid: bigint | number, _user: string): Promise<[bigint, bigint, bigint]>;
  stakingBalance(_pid: bigint | number, _user: string): Promise<bigint>;
  MetaNode(): Promise<string>;
  claim(_pid: bigint | number): Promise<ContractTransactionResponse>;
  depositETH(overrides?: { value?: bigint }): Promise<ContractTransactionResponse>;
  deposit(_pid: bigint | number, _amount: bigint): Promise<ContractTransactionResponse>;
  unstake(_pid: bigint | number, _amount: bigint): Promise<ContractTransactionResponse>;
  withdraw(_pid: bigint | number): Promise<ContractTransactionResponse>;
  withdrawAmount(_pid: bigint | number, _user: string): Promise<[bigint, bigint]>;
};

export type Erc20MinimalContract = Contract & {
  approve(spender: string, amount: bigint): Promise<ContractTransactionResponse>;
  decimals(): Promise<number>;
};
