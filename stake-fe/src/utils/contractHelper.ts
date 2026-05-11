/**
 * 用 ethers v6 封装「合约实例」工厂，供 React hooks 调用。
 *
 * ContractRunner（核心）
 * - **Signer**：来自 `useEthersSigner`（已连接钱包）。只有 runner 为 Signer 时才能 **发交易**（`deposit`、`claim` 等）。
 * - **Provider**：来自 `useEthersProvider` 的只读映射，或 `getSepoliaReadOnlyProvider()` 的 HTTP fallback。
 *   只能 **eth_call / 读视图函数**；若误用 Provider 实例去发交易，ethers 会报错或行为不符合预期。
 *
 * 与旧版 viem 双 client 的对应关系
 * - 原 `public` + `wallet` 合并为「一个 Contract + 一个 runner」：连接时用 Signer（读写皆可），
 *   断连时用只读 Provider 保持与产品一致的池子展示（若不需要断连读，可收窄为仅 Signer）。
 */
import { Contract, ContractRunner, InterfaceAbi, getAddress, isAddress } from 'ethers';

export function createEthersContract(
  address: string,
  abi: readonly unknown[],
  runner: ContractRunner,
): Contract | null {
  if (!address || !isAddress(address)) return null;
  try {
    return new Contract(getAddress(address), abi as InterfaceAbi, runner);
  } catch (e) {
    console.error('createEthersContract failed', e);
    return null;
  }
}
