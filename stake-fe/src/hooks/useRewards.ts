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
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useStakeContract } from './useContract';
import { Pid } from '../utils';
import { addMetaNodeToMetaMask } from '../utils/metamask';
import { retryWithDelay } from '../utils/retry';

export type RewardsData = {
  pendingReward: string;
  stakedAmount: string;
  lastUpdate: number;
};

/** 与合约 user() 返回值顺序一致 */
type UserData = [bigint, bigint, bigint];

/** 与合约 pool() 返回值顺序一致 */
type PoolData = [string, bigint, bigint, bigint, bigint, bigint, bigint];

const useRewards = () => {
  const stakeContract = useStakeContract();
  const { address, isConnected } = useAccount();
  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0',
    stakedAmount: '0',
    lastUpdate: 0
  });
  const [loading, setLoading] = useState(false);

  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',
    lastRewardBlock: '0',
    accMetaNodePerShare: '0'
  });

  const [metaNodeAddress, setMetaNodeAddress] = useState<string>('');

  const fetchPoolData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return;

    try {
      const pool = await retryWithDelay(() =>
        stakeContract.read.pool([Pid]) as Promise<PoolData>
      );

      console.log('poolInfo:::', pool);

      setPoolData({
        poolWeight: formatUnits(pool[1] as bigint || BigInt(0), 18),
        lastRewardBlock: formatUnits(pool[2] as bigint || BigInt(0), 18),
        accMetaNodePerShare: formatUnits(pool[3] as bigint || BigInt(0), 18),
        stTokenAmount: formatUnits(pool[4] as bigint || BigInt(0), 18),
        minDepositAmount: formatUnits(pool[5] as bigint || BigInt(0), 18),
        unstakeLockedBlocks: formatUnits(pool[6] as bigint || BigInt(0), 18),
        stTokenAddress: pool[0] as string
      });
    } catch (error) {
      console.error('Failed to fetch pool data:', error);
    }
  }, [stakeContract, address, isConnected]);

  const fetchMetaNodeAddress = useCallback(async () => {
    if (!stakeContract) return;

    try {
      const tokenAddr = await retryWithDelay(() =>
        stakeContract.read.MetaNode() as Promise<string>
      );
      setMetaNodeAddress(tokenAddr as string);
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
  }, [stakeContract]);

  const fetchRewardsData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return;

    try {
      setLoading(true);

      const userData = await retryWithDelay(() =>
        stakeContract.read.user([Pid, address]) as Promise<UserData>
      );
      const stakedAmount = await retryWithDelay(() =>
        stakeContract.read.stakingBalance([Pid, address]) as Promise<bigint>
      );

      console.log('User data:', userData);
      console.log('Staked amount:', stakedAmount);

      setRewardsData({
        pendingReward: formatUnits(userData[2] || BigInt(0), 18),
        stakedAmount: formatUnits(stakedAmount as bigint || BigInt(0), 18),
        lastUpdate: Date.now()
      });
    } catch (error) {
      console.error('Failed to fetch rewards data:', error);
      setRewardsData({
        pendingReward: '0',
        stakedAmount: '0',
        lastUpdate: Date.now()
      });
    } finally {
      setLoading(false);
    }
  }, [stakeContract, address, isConnected]);

  useEffect(() => {
    if (isConnected && address) {
      fetchRewardsData();
      fetchPoolData();
      fetchMetaNodeAddress();
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData, fetchMetaNodeAddress]);

  useEffect(() => {
    if (!isConnected || !address) return;

    const interval = setInterval(() => {
      fetchRewardsData();
    }, 60000);

    return () => clearInterval(interval);
  }, [isConnected, address, fetchRewardsData]);

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
    canClaim: parseFloat(rewardsData.pendingReward) > 0
  };
};

export default useRewards;
