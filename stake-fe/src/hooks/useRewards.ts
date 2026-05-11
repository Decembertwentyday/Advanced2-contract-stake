/**
 * 聚合与质押相关的只读链上数据（ethers Contract）。
 */
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'ethers';
import { useWeb3 } from '../providers/Web3Provider';
import { useStakeContract } from './useContract';
import { Pid } from '../utils';
import { addMetaNodeToMetaMask } from '../utils/metamask';
import { retryWithDelay } from '../utils/retry';

export type RewardsData = {
  pendingReward: string;
  stakedAmount: string;
  lastUpdate: number;
};

type UserData = [bigint, bigint, bigint];

type PoolData = [string, bigint, bigint, bigint, bigint, bigint, bigint];

const useRewards = () => {
  const stakeContract = useStakeContract();
  const { address, isConnected } = useWeb3();
  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0',
    stakedAmount: '0',
    lastUpdate: 0,
  });
  const [loading, setLoading] = useState(false);

  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',
    lastRewardBlock: '0',
    accMetaNodePerShare: '0',
  });

  const [metaNodeAddress, setMetaNodeAddress] = useState<string>('');

  const fetchPoolData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return;

    try {
      const pool = (await retryWithDelay(() =>
        stakeContract.pool(Pid)
      )) as unknown as PoolData;

      console.log('poolInfo:::', pool);

      const z = BigInt(0);
      setPoolData({
        poolWeight: formatUnits(pool[1] ?? z, 18),
        lastRewardBlock: formatUnits(pool[2] ?? z, 18),
        accMetaNodePerShare: formatUnits(pool[3] ?? z, 18),
        stTokenAmount: formatUnits(pool[4] ?? z, 18),
        minDepositAmount: formatUnits(pool[5] ?? z, 18),
        unstakeLockedBlocks: formatUnits(pool[6] ?? z, 18),
        stTokenAddress: String(pool[0]),
      });
    } catch (error) {
      console.error('Failed to fetch pool data:', error);
    }
  }, [stakeContract, address, isConnected]);

  const fetchMetaNodeAddress = useCallback(async () => {
    if (!stakeContract) return;

    try {
      const tokenAddr = await retryWithDelay(() => stakeContract.MetaNode());
      setMetaNodeAddress(String(tokenAddr));
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
  }, [stakeContract]);

  const fetchRewardsData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return;

    try {
      setLoading(true);

      const userData = (await retryWithDelay(() =>
        stakeContract.user(Pid, address)
      )) as unknown as UserData;
      const stakedAmount = await retryWithDelay(() =>
        stakeContract.stakingBalance(Pid, address)
      );

      console.log('User data:', userData);
      console.log('Staked amount:', stakedAmount);

      setRewardsData({
        pendingReward: formatUnits(userData[2] ?? BigInt(0), 18),
        stakedAmount: formatUnits(stakedAmount as bigint, 18),
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

  useEffect(() => {
    if (isConnected && address) {
      fetchRewardsData();
      fetchPoolData();
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData]);

  useEffect(() => {
    if (stakeContract) {
      fetchMetaNodeAddress();
    }
  }, [stakeContract, fetchMetaNodeAddress]);

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
    canClaim: parseFloat(rewardsData.pendingReward) > 0,
  };
};

export default useRewards;
