import type { Signer } from 'ethers';
import type { Erc20MinimalContract, StakeEthersContract } from '../types/ethersStake';

/** ethers `BaseContract.connect` 的返回类型不含自定义 ABI 方法，此处收窄回业务类型。 */
export function stakeWithSigner(c: StakeEthersContract, signer: Signer): StakeEthersContract {
  return c.connect(signer) as StakeEthersContract;
}

export function erc20WithSigner(c: Erc20MinimalContract, signer: Signer): Erc20MinimalContract {
  return c.connect(signer) as Erc20MinimalContract;
}
