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
 * @param c - useStakeContract 返回的合约实例（runner 可能已是 Signer，再 connect 一次确保签名路径）
 * @param signer - useEthersSigner()，未连接时为 undefined，调用方应先判断
 */
export function stakeWithSigner(c: StakeEthersContract, signer: Signer): StakeEthersContract {
  return c.connect(signer) as StakeEthersContract; // connect 换 runner；断言收窄类型
}

/**
 * ERC20 代币合约 + Signer：用于 approve(spender, amount)。
 */
export function erc20WithSigner(c: Erc20MinimalContract, signer: Signer): Erc20MinimalContract {
  return c.connect(signer) as Erc20MinimalContract;
}
