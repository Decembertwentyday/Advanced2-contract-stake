/**
 * React Hook：根据全局 Web3 状态，**记忆化**创建 ethers `Contract`。
 *
 * Runner 规则（核心）：
 * - `signer` 存在 → 用 Signer：可调会改状态的函数（需用户确认交易）。
 * - 否则 → 用 `readProvider`（HTTP FallbackProvider）：只能读 view，不弹 MetaMask。
 * 为什么要这样设计？
 * Signer：代表已连接的钱包，可以发送交易（改变链上状态），需要用户签名确认
 * readProvider：只读的 HTTP 连接，只能查询数据，不会弹出钱包确认框
 * 这种设计让用户在浏览页面时（未连接钱包）也能看到数据，连接后才能操作
 *
 * 写页面时仍调用 `connectWithSigner`：显式表达「本条路径要发交易」，并收窄 TS 类型。
 */
// useMemo：React 的性能优化钩子，只有依赖项变化时才重新执行
import { useMemo } from 'react'; // useMemo：signer/readProvider/address 不变则不复建 Contract，省 RPC 与 GC
// ContractRunner：ethers.js 中的抽象类型，既可以是 Provider（只读）也可以是 Signer（可写）
import { ContractRunner } from 'ethers'; // Provider 与 Signer 的共同超类型，作为 Contract 第三参类型
import { useWeb3 } from '../providers/Web3Provider'; // 取 signer、readProvider（同一份 React Context）
import { createEthersContract } from '../utils/contractHelper'; // 统一封装 new Contract + 零地址判断
import { StakeContractAddress } from '../utils/env'; // NEXT_PUBLIC_STAKE_ADDRESS 注入的质押合约地址
import { stakeAbi } from '../assets/abis/stake'; // 质押合约完整 ABI（与部署字节码匹配）

// 最小 ERC20 片段：approve / decimals / balanceOf；用于质押页的代币授权与余额，不必导入整份 ERC20 ABI
// 为什么只需要这三个方法？
// approve：授权合约可以花费用户的代币（质押前必须先授权）
// decimals：获取代币小数位数（用于格式化显示）
// balanceOf：查询用户余额
// 为什么用 as const？ TypeScript 会把数组类型从 any[] 收窄为精确的字面量类型，让 ethers.js 的类型检查更严格，避免运行时错误。
const erc20Abi = [
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const; // as const：让 TypeScript 把字面量类型收窄，ethers 编码更严

/**
 * @param address 任意合约地址；undefined 或 0 地址时返回 null
 * @param abi 对应合约的接口描述
 */
export function useContract(address: string | undefined, abi: readonly unknown[]) {
  const { signer, readProvider } = useWeb3(); // signer：连钱包后有；readProvider：始终有（HTTP 只读）
  // signer:  通过合约的.getSigner 获取到signer
  return useMemo(() => {
    // 无有效地址时不构造 Contract，避免对 0x0 发 eth_call
    // 为什么要检查零地址？
    //   0x000...000 是以太坊的"空地址"，向它发送请求会失败
    //   防止因配置错误导致 RPC 调用报错
    //   提前返回 null，让调用方知道合约不可用
    if (!address || address === '0x0000000000000000000000000000000000000000') {
      return null;
    }
    // 已连接优先 Signer：同一 ABI 既可读又可写；未连接仅 readProvider
    const runner: ContractRunner = signer ?? readProvider;
    return createEthersContract(address, abi, runner); // 工厂内再做一层零地址防护
  }, [address, abi, signer, readProvider]); // 任一变化：例如用户从断连到连接，需换绑 Signer
}

/** 质押主合约：地址来自 env，ABI 为 stakeAbi */
// 简化调用的封装：
// 不需要每次传地址和 ABI
// 使用时直接：const stakeContract = useStakeContract()
export function useStakeContract() {
  return useContract(StakeContractAddress, stakeAbi);
}

/**
 * 质押池若为 ERC20 池，需对 **该代币合约** 调 approve；tokenAddress 无效时不创建实例。
 为什么要单独处理 tokenAddress？
 质押的代币地址可能是动态配置的，需要额外校验。
 如果地址无效，直接返回 null，避免后续调用出错。
 */
export function useTokenContract(tokenAddress?: string) {
  const addr =
    tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000'
      ? tokenAddress // 非零才当作 ERC20 合约地址
      : undefined; // undefined → useContract 返回 null
  return useContract(addr, erc20Abi); // 用最小 ERC20 ABI 绑定代币合约
}
