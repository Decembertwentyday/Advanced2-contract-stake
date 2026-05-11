/**
 * 使用 ethers v6 构造合约实例。
 *
 * runner 为 Signer 时可发交易；为 Provider 时仅可调用 view / pure。
 * 本应用常用 `signer ?? readProvider`，未连接钱包时仍可读公开池子数据。
 */
import { Contract, ContractRunner, InterfaceAbi } from 'ethers';

export function createEthersContract(
  address: string,
  abi: readonly unknown[],
  runner: ContractRunner
): Contract | null {
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return null;
  }
  return new Contract(address, abi as InterfaceAbi, runner);
}
