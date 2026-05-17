/**
 * ethers v6 合约实例工厂：把「地址 + ABI + runner」组装成可调用的 Contract。
 *
 * runner 决定权限：
 * - Signer → 可读可写（发交易）
 * - Provider → 只读 eth_call
 */
import {
  Contract, // ethers 合约类：封装 encode/decode 与 RPC
  ContractRunner, // Signer | Provider 的联合类型
  InterfaceAbi, // ABI 数组的类型
  getAddress, // 校验并规范化 checksum 地址
  isAddress, // 判断字符串是否为合法以太坊地址
} from 'ethers';

/**
 * 创建 ethers Contract 实例。
 * @param address - 合约部署地址（来自 env 或池子 stToken）
 * @param abi - JSON ABI 片段（stakeAbi 或 erc20 子集）
 * @param runner - Signer（已连接）或 Provider（只读）
 * @returns Contract 或 null（地址非法时）
 */
export function createEthersContract(
  address: string,
  abi: readonly unknown[],
  runner: ContractRunner,
): Contract | null {
  // 空地址或非 0x 格式直接放弃，避免 new Contract 抛错
  if (!address || !isAddress(address)) return null;
  try {
    // getAddress 统一大小写；InterfaceAbi 满足 ethers 构造函数类型
    return new Contract(getAddress(address), abi as InterfaceAbi, runner);
  } catch (e) {
    console.error('createEthersContract failed', e); // 开发时便于定位 ABI/地址问题
    return null;
  }
}
