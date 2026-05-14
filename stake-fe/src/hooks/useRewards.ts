/**
 * 读质押合约的 **view 数据**：池信息、用户待领取、质押余额等；依赖 useStakeContract 的 runner（常为 signer 或 readProvider）。
 * 用户相关调用仅在 isConnected && address 时触发，避免空地址 eth_call。
 */
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'ethers'; // 将 BigInt wei 转十进制字符串；与合约 uint 精度一致
import { useWeb3 } from '../providers/Web3Provider';
import { useStakeContract } from './useContract';
import { Pid } from '../utils'; // 池子 ID，与合约部署时索引一致（本项目为 0）
import { addMetaNodeToMetaMask } from '../utils/metamask'; // 可选：把奖励代币加入 MetaMask 资产列表（EIP-747）
import { retryWithDelay } from '../utils/retry'; // RPC 失败重试，减轻公共节点抖动

export type RewardsData = {
  pendingReward: string; // 待领取奖励（已 formatUnits）
  stakedAmount: string; // 用户质押量展示
  lastUpdate: number; // 上次成功拉取的时间戳（ms）
};

// 与链上 user(pid, addr) 返回元组顺序一致；改合约需同步下标
type UserData = [bigint, bigint, bigint];

// 与链上 pool(pid) 返回元组顺序一致
type PoolData = [string, bigint, bigint, bigint, bigint, bigint, bigint];

const useRewards = () => {
  const stakeContract = useStakeContract(); // ethers Contract；runner 随连接状态变
  const { address, isConnected } = useWeb3(); // 仅当连接且 address 有值才拉用户维度数据
  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0',
    stakedAmount: '0',
    lastUpdate: 0,
  });
  const [loading, setLoading] = useState(false); // fetchRewardsData 进行中的 UI 标记

  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',
    lastRewardBlock: '0',
    accMetaNodePerShare: '0',
  }); // 额外字段 stTokenAmount 等在 fetchPoolData 里 set 合并进对象

  const [metaNodeAddress, setMetaNodeAddress] = useState<string>(''); // 奖励代币合约地址，来自 stakeContract.MetaNode()

  const fetchPoolData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return; // 缺任一：无法安全调用 user 相关；pool 虽可能只读，但产品上与连接态绑定

    try {
      const pool = (await retryWithDelay(() =>
        stakeContract.pool(Pid) // eth_call：读池配置；Pid 指定第几个池
      )) as unknown as PoolData; // 链上 tuple → TS 元组断言

      console.log('poolInfo:::', pool);

      const z = BigInt(0); // 缺省用 0，防 undefined 下标
      setPoolData({
        poolWeight: formatUnits(pool[1] ?? z, 18), // 各字段位数按合约设计；此处统一 18 与项目代币精度一致
        lastRewardBlock: formatUnits(pool[2] ?? z, 18),
        accMetaNodePerShare: formatUnits(pool[3] ?? z, 18),
        stTokenAmount: formatUnits(pool[4] ?? z, 18), // 池内总质押展示
        minDepositAmount: formatUnits(pool[5] ?? z, 18),
        unstakeLockedBlocks: formatUnits(pool[6] ?? z, 18),
        stTokenAddress: String(pool[0]), // address 在 ABI 中常以 string 形式给前端用
      });
    } catch (error) {
      console.error('Failed to fetch pool data:', error);
    }
  }, [stakeContract, address, isConnected]);

  const fetchMetaNodeAddress = useCallback(async () => {
    if (!stakeContract) return; // 无合约实例：环境未配地址等

    try {
      const tokenAddr = await retryWithDelay(() => stakeContract.MetaNode()); // 读奖励代币地址
      setMetaNodeAddress(String(tokenAddr));
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
  }, [stakeContract]);

  const fetchRewardsData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return; // 无地址不能 user(pid, address)

    try {
      setLoading(true);

      const userData = (await retryWithDelay(() =>
        stakeContract.user(Pid, address) // 读用户在该池的记账结构；含 pending 等字段
      )) as unknown as UserData;
      const stakedAmount = await retryWithDelay(() =>
        stakeContract.stakingBalance(Pid, address) // 单独读质押余额；有的合约与 user 中字段冗余，以链上为准
      );

      console.log('User data:', userData);
      console.log('Staked amount:', stakedAmount);

      setRewardsData({
        pendingReward: formatUnits(userData[2] ?? BigInt(0), 18), // 下标 2：与合约返回顺序一致
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
      fetchRewardsData(); // 连接就绪：立刻拉用户奖励与池
      fetchPoolData();
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData]);

  useEffect(() => {
    if (stakeContract) {
      fetchMetaNodeAddress(); // 合约实例一有就拉代币地址；不依赖用户连接
    }
  }, [stakeContract, fetchMetaNodeAddress]);

  useEffect(() => {
    if (!isConnected || !address) return; // 未连接：不定轮询

    const interval = setInterval(() => {
      fetchRewardsData(); // 仅刷新奖励：pending 随区块变；比全量 pool 更轻
    }, 60000);

    return () => clearInterval(interval);
  }, [isConnected, address, fetchRewardsData]);

  const refresh = useCallback(() => {
    fetchRewardsData(); // 交易成功后页面手动触发
  }, [fetchRewardsData]);

  const addMetaNodeToWallet = useCallback(async () => {
    if (!metaNodeAddress) {
      console.error('MetaNode地址未获取到');
      return false;
    }

    try {
      return await addMetaNodeToMetaMask(metaNodeAddress); // wallet_watchAsset：用户可拒绝
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
    canClaim: parseFloat(rewardsData.pendingReward) > 0, // 简单阈值：>0 才可点领取
  };
};

export default useRewards;
