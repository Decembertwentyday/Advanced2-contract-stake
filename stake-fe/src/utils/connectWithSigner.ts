/**
 * 将已用 Provider 构造的 `Contract` 重新绑定到 `Signer`，用于发送状态变更交易。
 *
 * ethers v6 中 `contract.connect(signer)` 的返回类型是 `BaseContract`，TypeScript 会丢失
 * 具体 ABI 推导出的方法名；此处 `as Contract` 收窄回调用方持有的 `Contract` 类型，
 * 以便 `stakeWithSigner.depositETH(...)` 等调用有完整类型提示。
 */
import { Contract, Signer } from 'ethers';

export function connectWithSigner(contract: Contract, signer: Signer): Contract {
  return contract.connect(signer) as Contract;
}
