/**
 * 聚合质押相关的「只读」链上数据，供首页、Claim 页复用。
 *
 * 依赖：useStakeContract（读 pool/user/stakingBalance）、useAccount（是否已连接）
 * 刷新：连接后拉一次 + 每 60s 拉用户奖励；交易成功后页面调 refresh()
 */
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'ethers'; // 把 wei 转成人类可读小数（默认 18 位）
import { useAccount } from 'wagmi'; // address, isConnected
import { useStakeContract } from './useContract';
import { Pid } from '../utils'; // 固定操作 0 号池
import { addMetaNodeToMetaMask } from '../utils/metamask';
import { retryWithDelay } from '../utils/retry';

/** 导出给 UI 的用户奖励摘要 */
export type RewardsData = {
  pendingReward: string; // 待领取 MetaNode 数量（已 formatUnits）
  stakedAmount: string; // 当前质押量
  lastUpdate: number; // 上次成功拉取的时间戳（Date.now()）
};

/** 合约 user(Pid, addr) 返回三元组，与 Solidity 定义顺序一致 */
type UserData = [bigint, bigint, bigint];

/** 合约 pool(Pid) 返回的七元组 */
type PoolData = [string, bigint, bigint, bigint, bigint, bigint, bigint];

const useRewards = () => {
  const stakeContract = useStakeContract(); // 可能为 null（地址未配置）
  const { address, isConnected } = useAccount(); // 钱包地址与连接状态

  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0',
    stakedAmount: '0',
    lastUpdate: 0,
  });
  const [loading, setLoading] = useState(false); // 拉用户数据时的 loading

  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',
    lastRewardBlock: '0',
    accMetaNodePerShare: '0',
    // 运行时会追加 stTokenAmount、stTokenAddress 等字段
  });

  const [metaNodeAddress, setMetaNodeAddress] = useState<string>(''); // 奖励 ERC20 地址

  /** 读池子公开信息：总质押、最小存入、抵押代币地址等 */
  const fetchPoolData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return; // 未连接不拉（与产品一致）

    try {
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
    if (!stakeContract) return;

    try {
      const tokenAddr = await retryWithDelay(() => stakeContract.MetaNode() as Promise<string>);
      setMetaNodeAddress(tokenAddr as string);
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
  }, [stakeContract]);

  /** 读当前用户的待领奖励与质押余额 */
  const fetchRewardsData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return;

    try {
      setLoading(true);

      const userData = (await retryWithDelay(() =>
        stakeContract.user(Pid, address),
      )) as UserData;
      const stakedAmount = (await retryWithDelay(() =>
        stakeContract.stakingBalance(Pid, address),
      )) as bigint;

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
  useEffect(() => {
    if (isConnected && address) {
      fetchRewardsData();
      fetchPoolData();
      fetchMetaNodeAddress();
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData, fetchMetaNodeAddress]);

  // 每 60 秒自动刷新用户奖励（质押页 pending 会更新）
  useEffect(() => {
    if (!isConnected || !address) return;

    const interval = setInterval(() => {
      fetchRewardsData();
    }, 60000);

    return () => clearInterval(interval); // 卸载或依赖变化时清除定时器
  }, [isConnected, address, fetchRewardsData]);

  /** 交易成功后由页面主动调用，立即刷新而非等 60s */
  const refresh = useCallback(() => {
    fetchRewardsData();
  }, [fetchRewardsData]);

  const addMetaNodeToWallet = useCallback(async () => {
    if (!metaNodeAddress) {
      console.error('MetaNode地址未获取到');
      return false;
    }

    try {
      return await addMetaNodeToMetaMask(metaNodeAddress);
    } catch (error) {
      console.error('添加MetaNode到钱包失败:', error);
      return false;
    }
  }, [metaNodeAddress]);

  return {
    rewardsData,
    loading,
    poolData,
    metaNodeAddress,
    refresh,
    addMetaNodeToWallet,
    canClaim: parseFloat(rewardsData.pendingReward) > 0, // UI 是否允许点 Claim
  };
};

export default useRewards;
