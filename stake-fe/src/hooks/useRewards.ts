/**
 * 聚合质押相关的「只读」链上数据，供首页、Claim 页复用。
 * 这个 Hook 负责从质押合约中读取所有展示数据，包括：
 *  * 用户数据：待领取奖励、已质押数量
 *  * 池子数据：权重、最小质押量、解锁区块数等
 * 依赖：useStakeContract（读 pool/user/stakingBalance）、useAccount（是否已连接）
 * 刷新：连接后拉一次 + 每 60s 拉用户奖励；交易成功后页面调 refresh()
 */
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'ethers'; // 把 wei 转成人类可读小数（默认 18 位）
import { useAccount } from 'wagmi'; // address, isConnected
import { useStakeContract } from './useContract';
import { Pid } from '../utils'; // 固定操作 0 号池
import { addMetaNodeToMetaMask } from '../utils/metamask'; // 可选：把奖励代币加入 MetaMask 资产列表（EIP-747）
import { retryWithDelay } from '../utils/retry'; // RPC 失败自动重试，减轻公共节点抖动

/** 导出给 UI 的用户奖励摘要 */
export type RewardsData = {
  pendingReward: string; // 待领取 MetaNode 数量（已 formatUnits）
  stakedAmount: string; // 当前质押量
  lastUpdate: number; // 上次成功拉取的时间戳（Date.now()）
};

// 与链上 user(pid, addr) 返回元组顺序一致；改合约需同步下标
// 对应solidity
// struct UserInfo {
//   uint256 amount;        // [0] 质押数量
//   uint256 rewardDebt;    // [1] 奖励债务（计算用）
//   uint256 pendingReward; // [2] 待领取奖励
// }
/** 合约 user(Pid, addr) 返回三元组，与 Solidity 定义顺序一致 */
type UserData = [bigint, bigint, bigint];

/** 合约 pool(Pid) 返回的七元组 */
// 与链上 pool(pid) 返回元组顺序一致
// 对应solidity
// struct PoolInfo {
//   address stToken;           // [0] 质押代币地址
//   uint256 allocPoint;        // [1] 池权重
//   uint256 lastRewardBlock;   // [2] 上次奖励区块
//   uint256 accMetaNodePerShare; // [3] 累计每份额奖励
//   uint256 totalStaked;       // [4] 总质押量
//   uint256 minDepositAmount;  // [5] 最小质押量
//   uint256 unstakeLockedBlocks; // [6] 解押锁定区块数
// }
type PoolData = [string, bigint, bigint, bigint, bigint, bigint, bigint];

const useRewards = () => {
  const stakeContract = useStakeContract(); // 合约实例 可能为 null（地址未配置）
  const { address, isConnected } = useAccount(); // 钱包地址与连接状态
  // rewardsData：用户相关（频繁变化）
  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0',
    stakedAmount: '0',
    lastUpdate: 0,
  });
  const [loading, setLoading] = useState(false); // 拉用户数据时的 loading
  // poolData：池子配置（相对稳定）
  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',
    lastRewardBlock: '0',
    accMetaNodePerShare: '0',
    // 运行时会追加 stTokenAmount、stTokenAddress 等字段
  });
  // metaNodeAddress：代币地址（几乎不变）
  const [metaNodeAddress, setMetaNodeAddress] = useState<string>(''); // 奖励 ERC20 地址

  /** 读池子公开信息：总质押、最小存入、抵押代币地址等 */
  const fetchPoolData = useCallback(async () => {
    // 为什么要检查这三个条件？
    //   stakeContract：合约实例必须存在
    //   address 和 isConnected：虽然池子数据是全局的，但产品设计上只在连接后显示
    if (!stakeContract || !address || !isConnected) return; // 未连接不拉（与产品一致）

    try {
      // retryWithDelay 的作用： 公共 RPC 节点经常超时或失败，
      // 这个工具会自动重试（比如重试3次，每次间隔1秒）。
      // 为什么需要 as unknown as PoolData？
      // ethers.js 返回的类型是 any[] 或 Result，TypeScript
      // 不知道具体结构。我们需要告诉编译器："这个元组符合 PoolData 的定义"。
      const pool = (await retryWithDelay(() => stakeContract.pool(Pid))) as PoolData;

      console.log('poolInfo:::', pool);

      setPoolData({
        poolWeight: formatUnits(pool[1] as bigint || BigInt(0), 18),
        lastRewardBlock: formatUnits(pool[2] as bigint || BigInt(0), 18),
        accMetaNodePerShare: formatUnits(pool[3] as bigint || BigInt(0), 18),
        stTokenAmount: formatUnits(pool[4] as bigint || BigInt(0), 18), // 池内总质押量展示
        minDepositAmount: formatUnits(pool[5] as bigint || BigInt(0), 18),
        unstakeLockedBlocks: formatUnits(pool[6] as bigint || BigInt(0), 18),
        stTokenAddress: pool[0] as string, // 0 地址表示 ETH 池
      });
    } catch (error) {
      console.error('Failed to fetch pool data:', error);
    }
  }, [stakeContract, address, isConnected]);

  /** 读奖励代币 MetaNode 的合约地址（用于添加至 MetaMask） */
  const fetchMetaNodeAddress = useCallback(async () => {
    if (!stakeContract) return; // 无合约实例：环境未配地址等

    try {
      // 公共 RPC 节点经常超时或失败，
      // 这个工具会自动重试（比如重试3次，每次间隔1秒）。
      // .MetaNode() 是abi里的函数
      const tokenAddr = await retryWithDelay(() => stakeContract.MetaNode() as Promise<string>);
      setMetaNodeAddress(tokenAddr as string);
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
    // 为什么不检查 isConnected？
    //     MetaNode() 是合约的全局配置，不需要用户地址
    //     即使未连接钱包，也可以查询这个信息
  }, [stakeContract]);

  /** 读当前用户的待领奖励与质押余额 */
  const fetchRewardsData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return;

    try {
      setLoading(true);
        // 公共 RPC 节点经常超时或失败，
      // 这个工具会自动重试（比如重试3次，每次间隔1秒）。
      const userData = (await retryWithDelay(() =>
          // user  是abi里的函数
        stakeContract.user(Pid, address),  // 读用户在该池的记账结构；含 pending 等字段
      )) as UserData;
      const stakedAmount = (await retryWithDelay(() =>
          // stakingBalance  是abi里的函数
        stakeContract.stakingBalance(Pid, address), // 单独读质押余额；有的合约与 user 中字段冗余，以链上为准
      )) as bigint;

      // 为什么要查两次？
      //   理论上 user() 返回的结构体中已经包含质押数量，但：
      //   冗余验证：有些合约实现中，stakingBalance 是实时计算的，可能与 user.amount 不同
      //   合约设计：可能 user.amount 记录的是历史快照，stakingBalance 是当前值
      //   以合约实际实现为准，这里选择相信 stakingBalance 的结果。

      console.log('User data:', userData);
      console.log('Staked amount:', stakedAmount);

      setRewardsData({
        pendingReward: formatUnits(userData[2] || BigInt(0), 18), // 第三项一般为 pending
        stakedAmount: formatUnits(stakedAmount as bigint || BigInt(0), 18),
        lastUpdate: Date.now(),
      });
    } catch (error) {
      console.error('Failed to fetch rewards data:', error);
      setRewardsData({
        pendingReward: '0',
        stakedAmount: '0',
        lastUpdate: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }, [stakeContract, address, isConnected]);

  // 连接钱包或地址变化时：拉用户数据 + 池子 + MetaNode 地址
  // 触发时机：
  //   用户刚连接钱包时
  //   切换账户时
  //   为什么要加入依赖数组？
  //    useCallback 记忆化的函数，
  //       在依赖变化时会生成新引用，
  //      useEffect 需要响应这些变化。
  useEffect(() => {
    if (isConnected && address) {
      fetchRewardsData();
      fetchPoolData();
      fetchMetaNodeAddress();
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData, fetchMetaNodeAddress]);

  // 每 60 秒自动刷新用户奖励（质押页 pending 会更新）
  useEffect(() => {
    if (!isConnected || !address) return; // 未连接：不轮询

    const interval = setInterval(() => {
      fetchRewardsData(); // 仅刷新奖励：pending 随区块变；比全量 pool 更轻
    }, 60000);
    // 清理函数，在组件卸载或依赖变化时清除定时器，防止内存泄漏。
    return () => clearInterval(interval); // 卸载或依赖变化时清除定时器
  }, [isConnected, address, fetchRewardsData]);

  /** 交易成功后由页面主动调用，立即刷新而非等 60s */
  const refresh = useCallback(() => {
    fetchRewardsData(); // 交易成功后页面手动触发
  }, [fetchRewardsData]);

  const addMetaNodeToWallet = useCallback(async () => {
    if (!metaNodeAddress) {
      console.error('MetaNode地址未获取到');
      return false;
    }

    try {
      // EIP-747 标准
      //    这是以太坊的标准提案，允许 DApp 请求用户将代币添加到 MetaMask 资产列表。
      // 点击"添加到钱包"
      //   → MetaMask 弹出确认框
      //   → 用户确认后，代币出现在资产列表
      //   → 无需手动输入合约地址
      return await addMetaNodeToMetaMask(metaNodeAddress);  // wallet_watchAsset：用户可拒绝
    } catch (error) {
      console.error('添加MetaNode到钱包失败:', error);
      return false;
    }
  }, [metaNodeAddress]);

  return {
    rewardsData,           // 用户奖励数据
    loading,               // 加载状态
    poolData,              // 池子配置
    metaNodeAddress,       // 代币地址
    refresh,               // 手动刷新函数
    addMetaNodeToWallet,   // 添加到钱包函数
    canClaim: parseFloat(rewardsData.pendingReward) > 0, // 是否可领取
    // 为什么这样判断？
    //   如果待领取奖励 > 0，启用"领取"按钮
    //      否则禁用按钮，避免无意义的交易
  };
};

export default useRewards;

// 完整工作流程
// 场景1：用户打开页面（未连接）
// 1. 组件挂载
//    ├─ stakeContract 创建（用 readProvider）
// ├─ isConnected = false
//    └─ 只显示静态内容，不查询用户数据
//
// 2. useEffect 触发
//    ├─ stakeContract 存在 → 查询 metaNodeAddress ✅
// └─ isConnected = false → 跳过其他查询
//
// 场景2：用户连接钱包
// 1. 用户点击"连接钱包"
//    ├─ isConnected = true
//    ├─ address = "0xUser..."
//    └─ signer 可用
//
// 2. useEffect 触发
//    ├─ fetchRewardsData() → 查询用户奖励
//    ├─ fetchPoolData() → 查询池子配置
//    └─ 启动 60 秒定时器
//
// 3. 页面显示
//    ├─ 待领取奖励: 12.5 META
//    ├─ 已质押: 1000 META
//    └─ 池子权重: 100
//
// 场景3：60秒后自动刷新
// 1. 定时器触发
//    └─ fetchRewardsData()
//        ├─ 查询最新的 pendingReward
//        └─ 更新显示（用户看到数字变化）
//
// 2. poolData 不变（节省 RPC 调用）
//
// 场景4：用户完成质押
//
// 1. 用户点击"质押"按钮
//    ├─ 调用 connectWithSigner 切换到 Signer
//    ├─ 发送交易
//    └─ 等待确认
//
// 2. 交易成功后
//    └─ refresh() → 立即更新显示的质押数量
