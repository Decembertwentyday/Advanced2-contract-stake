/**
 * 聚合与质押相关的「只读」链上数据，供首页、Claim 页等复用。
 *
 * 数据来源（合约方法）
 * - pool(Pid)：池子配置、总质押量、stToken 地址等；stToken 为 0 地址通常表示原生 ETH 池。
 * - user(Pid, address)：用户维度累计信息；其中 pending 奖励用于展示与 canClaim。
 * - stakingBalance(Pid, address)：当前仍在质押的份额（与 user 内字段用途互补，以合约逻辑为准）。
 * - MetaNode()：奖励代币合约地址，可用于 addMetaNodeToMetaMask。
 *
 * 刷新策略
 * - 连接后 useEffect 拉一次；之后每 60 秒拉 rewards；页面在交易成功后可调用 refresh() 主动更新。
 *
 * retryWithDelay
 * - 包装每次 RPC，降低偶发限流导致的空白数据。
 *
 * useCallback 接收两个参数，第一个是要缓存的函数，第二个是依赖项数组 。 哪些变量变化时需要更新函数，如果数组为空，函数只在首次渲染时创建一次
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useStakeContract } from './useContract';
import { Pid } from '../utils';
import { addMetaNodeToMetaMask } from '../utils/metamask'; // 💼 MetaMask 工具：添加代币到钱包
import { retryWithDelay } from '../utils/retry';  // 🔁 重试工具：RPC 失败时自动重试
// 📊 奖励数据类型定义（用于 state 管理）
export type RewardsData = {
  pendingReward: string; // ⏳ 待领取的奖励数量（字符串
  stakedAmount: string; // 💰 已质押的数量（字符串格式）
  lastUpdate: number; // 🕒 最后更新时间戳（毫秒）
};

/**
 * 与合约 user() 返回值顺序一致
 * 合约返回的元组结构：[amount, rewardDebt, pending]
 */
type UserData = [bigint, bigint, bigint];// 质押总量   奖励债务     待领取奖励

/** 与合约 pool() 返回值顺序一致 */
/**
 * 与合约 pool() 返回值顺序一致
 * 合约返回的元组结构：[stToken, poolWeight, lastRewardBlock, accMetaNodePerShare, totalStaked, minDeposit, unstakeLockedBlocks]
 */
type PoolData = [string, bigint, bigint, bigint, bigint, bigint, bigint];
//         Token地址  池权重   最后奖励区块   累计奖励/份额      总质押量    最小质押量    解押锁定区块数

/**
 * 核心 Hook：获取和管理质押相关的所有只读数据
 *
 * @returns 包含奖励数据、池子信息、刷新函数等的对象
 *
 * 设计目的：
 * 1. 集中管理所有链上查询逻辑
 * 2. 自动处理加载状态和错误
 * 3. 提供定时刷新和手动刷新机制
 * 4. 供多个页面复用（首页、Claim 页等）
 */
const useRewards = () => {
  // 📜 获取质押合约实例（通过之前封装的 useStakeContract）
  const stakeContract = useStakeContract();
  // 👤 获取当前钱包账户信息
  // address：钱包地址（如 "0x123..."）
  // isConnected：是否已连接钱包
  const { address, isConnected } = useAccount();
  // 📊 奖励数据状态（待领取奖励、已质押量、最后更新时间）
  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0', // 初始值：0 奖励
    stakedAmount: '0',  // 初始值：0 质押
    lastUpdate: 0 // 初始值：未更新
  });
  // ⏳ 加载状态（用于显示 loading 动画）
  const [loading, setLoading] = useState(false);

  // 🏊 池子配置数据状态
  // 使用 Record<string, string> 存储键值对，方便动态访问
  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',              // 🎯 池子权重（决定奖励分配比例）
    lastRewardBlock: '0',         // 🧱 最后发放奖励的区块号
    accMetaNodePerShare: '0',     // 📈 每份额累计奖励（计算奖励的核心参数）
    stTokenAmount: '0',           // 💎 池子总质押量
    minDepositAmount: '0',        // 🔢 最小质押金额
    unstakeLockedBlocks: '0',     // 🔒 解押锁定区块数
    stTokenAddress: ''            // 📍 质押代币地址（ETH 池为空地址）
  });

  // 🪙 MetaNode 奖励代币的合约地址
  const [metaNodeAddress, setMetaNodeAddress] = useState<string>('');

  /**
   * 获取池子配置数据
   *
   * 调用合约：pool(Pid)
   * 返回池子的全局配置信息，所有用户共享
   *
   * 为什么用 useCallback？
   * - 避免每次渲染都重新创建函数
   * - 作为 useEffect 依赖时不会导致无限循环
   */
  const fetchPoolData = useCallback(async () => {
    // ✅ 前置校验：合约未就绪或未连接钱包时不执行
    if (!stakeContract || !address || !isConnected) return;

    try {
      // 🔁 使用重试机制调用合约只读方法
      // pool([Pid])：查询指定池子的配置信息
      const pool = await retryWithDelay(() =>
          // 根据客户端对象 调用合约方法 pool(Pid) 获取池子配置信息
        stakeContract.read.pool([Pid]) as Promise<PoolData>
      );

      console.log('poolInfo:::', pool);

      // 📝 更新池子数据状态
      // formatUnits：将 BigInt 转换为人类可读的字符串（如 1000000000000000000 → "1.0"）
      setPoolData({
        poolWeight: formatUnits(pool[1] as bigint || BigInt(0), 18),        // 权重（18位小数）
        lastRewardBlock: formatUnits(pool[2] as bigint || BigInt(0), 18),   // 最后奖励区块
        accMetaNodePerShare: formatUnits(pool[3] as bigint || BigInt(0), 18), // 累计奖励/份额
        stTokenAmount: formatUnits(pool[4] as bigint || BigInt(0), 18),     // 总质押量
        minDepositAmount: formatUnits(pool[5] as bigint || BigInt(0), 18),  // 最小质押量
        unstakeLockedBlocks: formatUnits(pool[6] as bigint || BigInt(0), 18), // 锁定区块数
        stTokenAddress: pool[0] as string                                    // Token 地址（不需要格式化）
      });
    } catch (error) {
      console.error('Failed to fetch pool data:', error);
    }
  }, [stakeContract, address, isConnected]);  // 📋 依赖项：任一变化都会重建函数

  /**
   * 获取 MetaNode 奖励代币的合约地址
   *
   * 调用合约：MetaNode()
   * 返回奖励代币的地址，用于后续添加到钱包
   */
  const fetchMetaNodeAddress = useCallback(async () => {
    // ✅ 只需要合约实例，不需要用户连接
    if (!stakeContract) return;

    try {
      // 🔁 重试机制调用合约
      // MetaNode()：返回奖励代币的合约地址
      const tokenAddr = await retryWithDelay(() =>
          // 根据客户端对象 调用合约方法 MetaNode() 获取奖励代币地址
          stakeContract.read.MetaNode() as Promise<string>
      );
      setMetaNodeAddress(tokenAddr as string);  // 保存奖励代币的合约地址
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
  }, [stakeContract]);  // 📋 依赖项：只有合约实例变化时才重建

  /**
   * 获取用户奖励数据（核心函数）
   *
   * 调用合约：
   * 1. user([Pid, address]) - 获取用户在池子中的信息
   * 2. stakingBalance([Pid, address]) - 获取用户当前质押量
   *
   * 这是最频繁调用的函数，包含加载状态管理
   */
  const fetchRewardsData = useCallback(async () => {
    // ✅ 前置校验：必须连接钱包才能查询用户数据
    if (!stakeContract || !address || !isConnected) return;

    try {
      // ⏳ 开始加载（页面可显示 loading 动画）
      setLoading(true);

      // 🔁 第一次 RPC 调用：获取用户信息元组
      // user([Pid, address]) 返回：[amount, rewardDebt, pending]
      const userData = await retryWithDelay(() =>
          // 根据客户端对象 调用合约方法 user([Pid, address]) 获取用户信息元组
          stakeContract.read.user([Pid, address]) as Promise<UserData>
      );

      // 🔁 第二次 RPC 调用：获取当前质押余额
      // stakingBalance([Pid, address]) 返回：bigint（质押量）
      const stakedAmount = await retryWithDelay(() =>
          // 根据客户端对象 调用合约方法 stakingBalance([Pid, address]) 获取当前质押余额
          stakeContract.read.stakingBalance([Pid, address]) as Promise<bigint>
      );


      console.log('User data:', userData);
      console.log('Staked amount:', stakedAmount);

      // 📝 更新奖励数据状态
      setRewardsData({
        pendingReward: formatUnits(userData[2] || BigInt(0), 18),  // userData[2] = pending 奖励
        stakedAmount: formatUnits(stakedAmount as bigint || BigInt(0), 18),  // 质押量
        lastUpdate: Date.now()  // 🕒 记录更新时间
      });
    } catch (error) {
      // ⚠️ 出错时重置为默认值，避免显示旧数据
      console.error('Failed to fetch rewards data:', error);
      setRewardsData({
        pendingReward: '0',
        stakedAmount: '0',
        lastUpdate: Date.now()
      });
    } finally {
      // ✅ 无论成功失败，都结束加载状态
      setLoading(false);
    }
  }, [stakeContract, address, isConnected]);  // 📋 依赖项

  /**
   * 首次连接时立即获取所有数据
   *
   * useEffect 触发时机：
   * - 组件挂载时
   * - isConnected 或 address 变化时（用户连接/断开钱包）
   */
  useEffect(() => {
    if (isConnected && address) {
      fetchRewardsData();      // 📊 获取用户奖励数据
      fetchPoolData();         // 🏊 获取池子配置
      fetchMetaNodeAddress();  // 🪙 获取代币地址
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData, fetchMetaNodeAddress]);

  /**
   * 定时刷新奖励数据（每 60 秒）
   *
   * 设计原因：
   * - 奖励随时间累积，需要定期更新显示
   * - 60 秒是平衡用户体验和 RPC 压力的合理间隔
   *
   * 清理机制：
   * - 组件卸载或依赖变化时清除定时器
   * - 防止内存泄漏
   */
  useEffect(() => {
    // ❌ 未连接钱包时不启动定时器
    if (!isConnected || !address) return;

    // ⏰ 设置 60 秒定时器
    const interval = setInterval(() => {
      fetchRewardsData();  // 只刷新奖励数据（池子配置相对稳定，不需要频繁刷新）
    }, 60000);  // 60000 毫秒 = 60 秒

    // 🧹 清理函数：组件卸载或依赖变化时清除定时器
    return () => clearInterval(interval);
  }, [isConnected, address, fetchRewardsData]);
  /**
   * 手动刷新函数（供外部调用）
   *
   * 使用场景：
   * - 用户完成质押/提现/领取操作后
   * - 点击"刷新"按钮时
   *
   * 为什么用 useCallback？
   * - 保持函数引用稳定，避免子组件重复渲染
   */
  const refresh = useCallback(() => {
    fetchRewardsData();
  }, [fetchRewardsData]);

  /**
   * 将 MetaNode 代币添加到 MetaMask 钱包
   *
   * 调用之前封装的 addMetaNodeToMetaMask 工具函数
   *
   * @returns Promise<boolean> - 用户是否成功添加
   */
  const addMetaNodeToWallet = useCallback(async () => {
    // ✅ 前置校验：必须先获取到代币地址
    if (!metaNodeAddress) {
      console.error('MetaNode地址未获取到');
      return false;
    }

    try {
      // 💼 调用 MetaMask 添加代币功能
      return await addMetaNodeToMetaMask(metaNodeAddress);
    } catch (error) {
      console.error('添加MetaNode到钱包失败:', error);
      return false;
    }
  }, [metaNodeAddress]);  // 📋 依赖项：代币地址变化时重建函数

// 📤 返回所有数据和函数，供调用方使用
  return {
    rewardsData,              // 📊 奖励数据（pendingReward, stakedAmount, lastUpdate）
    loading,                  // ⏳ 加载状态
    poolData,                 // 🏊 池子配置数据
    metaNodeAddress,          // 🪙 MetaNode 代币地址
    refresh,                  // 🔄 手动刷新函数
    addMetaNodeToWallet,      // 💼 添加到钱包函数
    canClaim: parseFloat(rewardsData.pendingReward) > 0  // ✅ 是否可以领取（奖励 > 0）
  };
};

export default useRewards;



// fetchPoolData()         // 🏊 池子配置（相对稳定，不需要频繁刷新）
// fetchMetaNodeAddress()  // 🪙 代币地址（几乎不变，只需获取一次）
// fetchRewardsData()      // 📊 用户奖励（实时变化，需要频繁刷新）