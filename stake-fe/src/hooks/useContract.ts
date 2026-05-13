/**
 * React 层封装：根据「当前链 + 钱包」创建 viem 合约实例。
 *
 * useWalletClient
 * - 未连接钱包时 data 为 undefined；getContract 仍可能用于只读，但本项目的 stake 地址依赖连接后业务，一般页面会先 Connect。
 *
 * useChainId
 * - 用户切链后 chainId 变化，useMemo 依赖 walletClient / chainId 会重建合约实例，避免用过期的链对象发交易。
 *
 * useStakeContract / useTokenContract
 * - 固定 ABI + 地址（或动态 token 地址），供页面调用 .read / .write。
 *
 * erc20Abi
 * - 最小子集：只包含质押流程需要的 approve、decimals；减小打包体积。
 */
import { useMemo } from "react";
import { Abi, Address, WalletClient } from "viem";
import { useChainId, useWalletClient } from "wagmi";
import { getContract } from "../utils/contractHelper";
import { StakeContractAddress } from "../utils/env";
import { stakeAbi } from '../assets/abis/stake';

const erc20Abi = [
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' as const },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' as const },
] as const;

type UseContractOptions = {
  chainId?: number;
};

/**
 * 通用合约 Hook 工厂函数
 *
 * @param addressOrAddressMap - 合约地址（可以是单个地址或根据 chainId 映射的地址对象）
 * @param abi - 合约的 ABI 接口定义
 * @param options - 可选配置项（如指定 chainId）
 *
 * @returns 返回封装好的合约实例，包含 .read 和 .write 方法
 *
 * 设计目的：
 * 1. 统一管理合约实例的创建逻辑
 * 2. 自动处理钱包连接状态和链切换
 * 3. 通过 useMemo 优化性能，避免重复创建实例
 */
// useContract<TAbi extends Abi> ts的泛型参数无法正确推导，只能用 unknown 参数是 TAbi， extends Abi 这是一个约束条件，表示 TAbi 必须是 Abi 类型或其子类型。
export function useContract<TAbi extends Abi>(
  addressOrAddressMap?: Address | { [chainId: number]: Address },
  abi?: TAbi,
  options?: UseContractOptions,
) {
  // 🔗 获取当前连接的区块链 ID（来自 wagmi）
  // 作用：确定使用哪个网络的 RPC 节点
  const currentChainId = useChainId();
  // 🎯 确定最终使用的 chainId
  // 优先级：options 中指定的 > 当前连接的链
  // 作用：允许在特定场景下强制使用某个链（如跨链查询）
  const chainId = options?.chainId || currentChainId;
  // 💼 获取钱包客户端对象（来自 wagmi）
  // data 可能是 undefined（未连接钱包时）
  // 作用：用于签名交易（写入操作）
  const { data: walletClient } = useWalletClient();

  // 🧠 使用 useMemo 缓存合约实例
  // 依赖项变化时才重新创建，避免不必要的重复计算
  // 作用：提升性能，保持实例引用稳定
  return useMemo(() => {
    // ✅ 前置校验：缺少必要参数时直接返回 null
    // 原因：防止后续代码出错，提前终止无效执行
    if (!addressOrAddressMap || !abi || !chainId) return null;
    // 📍 解析最终的合约地址
    let address: Address | undefined;
    // 判断传入的是单个地址还是多链地址映射
    if (typeof addressOrAddressMap === 'string') address = addressOrAddressMap;
    // 情况2：传入对象，根据 chainId 获取对应地址
    // 作用：支持同一合约在不同链上有不同地址的场景
    else address = addressOrAddressMap[chainId];
    // ❌ 如果最终没有获取到有效地址，返回 null
    // 原因：防止使用 undefined 地址创建合约导致错误
    if (!address) return null;
    // 🛠️ 尝试创建合约实例
    try {
      // 调用之前封装的 getContract 工具函数
      // 传入所有必要参数，创建双客户端合约实例
      return getContract({
        abi,
        address,
        chainId,
        signer: walletClient ?? undefined,
      });
    } catch (error) {
      // ⚠️ 捕获创建过程中的错误（如 ABI 格式错误、地址无效等）
      // 作用：防止整个应用崩溃，提供调试信息
      console.error('Failed to get contract', error);
      return null;
    }
  }, [addressOrAddressMap, abi, chainId, walletClient]);
}
/**
 * 专用的质押合约 Hook
 *
 * @returns 返回质押合约实例
 *
 * 设计目的：
 * 1. 简化调用：页面组件无需关心地址和 ABI
 * 2. 统一管理：质押合约地址和 ABI 集中维护
 * 3. 类型安全：自动推断正确的合约方法类型
 */
export const useStakeContract = () => {
  // 调用通用 Hook，传入固定的质押合约地址和 ABI
  // StakeContractAddress：从环境变量获取的合约地址
  // stakeAbi：质押合约的 ABI 定义
  return useContract(StakeContractAddress, stakeAbi as Abi);
};

/** 池子抵押物为 ERC20 时，用池子返回的 stTokenAddress 构造 approve 目标合约 */
/**
 * ERC20 Token 合约 Hook（用于授权等操作）
 *
 * @param tokenAddress - Token 合约地址（可选）
 * @returns 返回 ERC20 合约实例，主要用于 approve 操作
 *
 * 使用场景：
 * - 用户质押前需要先授权合约代扣 Token
 * - 池子抵押物为 ERC20 时，需要调用其 approve 方法
 *
 * 设计原因：
 * 1. ERC20 是标准协议，ABI 固定且简单
 * 2. 多个地方可能需要授权不同的 Token
 * 3. 单独封装便于复用和维护
 * 针对代币的 授权操作
 */
export const useTokenContract = (tokenAddress?: Address | string) => {
  // 🔒 地址有效性校验
  // 排除零地址（0x000...000），因为零地址不是有效的合约地址
  // 作用：防止向无效地址发送交易导致失败
  const addr = tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000'
    ? (tokenAddress as Address) // ✅ 有效地址：转换为 Address
      : undefined;   // ❌ 无效地址：返回 undefined
  // 调用通用 Hook，传入 ERC20 的最小化 ABI
  // erc20Abi 只包含 approve 和 decimals，减小打包体积
  return useContract(addr, erc20Abi as unknown as Abi);
};
