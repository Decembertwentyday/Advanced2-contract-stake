/**
 * 这个 Hook 负责从质押合约中读取所有展示数据，包括：
 * 用户数据：待领取奖励、已质押数量
 * 池子数据：权重、最小质押量、解锁区块数等
 * 代币地址：奖励代币的合约地址
 * 读质押合约的 **view 数据**：池信息、用户待领取、质押余额等；依赖 useStakeContract 的 runner（常为 signer 或 readProvider）。
 * 用户相关调用仅在 isConnected && address 时触发，避免空地址 eth_call。
 */
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'ethers'; // 将 BigInt wei 转十进制字符串；与合约 uint 精度一致
import { useWeb3 } from '../providers/Web3Provider';
import { useStakeContract } from './useContract';
import { Pid } from '../utils'; // 池子 ID，与合约部署时索引一致（本项目为 0）
import { addMetaNodeToMetaMask } from '../utils/metamask'; // 可选：把奖励代币加入 MetaMask 资产列表（EIP-747）
import { retryWithDelay } from '../utils/retry'; // RPC 失败自动重试，减轻公共节点抖动

export type RewardsData = {
  pendingReward: string; // 待领取奖励（已 formatUnits）
  stakedAmount: string; // 用户质押量展示
  lastUpdate: number; // 上次成功拉取的时间戳（ms）
};

// 与链上 user(pid, addr) 返回元组顺序一致；改合约需同步下标
// 对应solidity
// struct UserInfo {
//   uint256 amount;        // [0] 质押数量
//   uint256 rewardDebt;    // [1] 奖励债务（计算用）
//   uint256 pendingReward; // [2] 待领取奖励
// }

type UserData = [bigint, bigint, bigint];

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
  const stakeContract = useStakeContract(); // ethers Contract；runner 随连接状态变
  const { address, isConnected } = useWeb3(); // 仅当连接且 address 有值才拉用户维度数据
  // rewardsData：用户相关（频繁变化）
  const [rewardsData, setRewardsData] = useState<RewardsData>({
    pendingReward: '0',
    stakedAmount: '0',
    lastUpdate: 0,
  });
  const [loading, setLoading] = useState(false); // fetchRewardsData 进行中的 UI 标记
  // poolData：池子配置（相对稳定）
  const [poolData, setPoolData] = useState<Record<string, string>>({
    poolWeight: '0',
    lastRewardBlock: '0',
    accMetaNodePerShare: '0',
  }); // 额外字段 stTokenAmount 等在 fetchPoolData 里 set 合并进对象
  // metaNodeAddress：代币地址（几乎不变）
  const [metaNodeAddress, setMetaNodeAddress] = useState<string>(''); // 奖励代币合约地址，来自 stakeContract.MetaNode()

  const fetchPoolData = useCallback(async () => {
    // 为什么要检查这三个条件？
    //   stakeContract：合约实例必须存在
    //   address 和 isConnected：虽然池子数据是全局的，但产品设计上只在连接后显示
    if (!stakeContract || !address || !isConnected) return; // 缺任一：无法安全调用 user 相关；pool 虽可能只读，但产品上与连接态绑定

    try {
      // retryWithDelay 的作用： 公共 RPC 节点经常超时或失败，
      // 这个工具会自动重试（比如重试3次，每次间隔1秒）。
        // 为什么需要 as unknown as PoolData？
      // ethers.js 返回的类型是 any[] 或 Result，TypeScript
      // 不知道具体结构。我们需要告诉编译器："这个元组符合 PoolData 的定义"。
      const pool = (await retryWithDelay(() =>
        stakeContract.pool(Pid) // eth_call：读池配置；Pid 指定第几个池
      )) as unknown as PoolData; // 链上 tuple → TS 元组断言
      // 直接 as PoolData 可能因为类型不兼容而报错，
      // 通过 unknown 中转可以绕过检查。

      console.log('poolInfo:::', pool);

      const z = BigInt(0); // 缺省用 0，防 undefined 下标
        // formatUnits(value, 18) 的作用：100000n = 1 ETH
        // 以太坊中的数值都是整数（没有小数点），通过"小数位数"来表示精度。
      setPoolData({
        // ?? 判断 pool[1] 存在就用 pool[1]，否则用 z
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

  // 查询奖励代币地址
  const fetchMetaNodeAddress = useCallback(async () => {
    if (!stakeContract) return; // 无合约实例：环境未配地址等

    try {
      // 公共 RPC 节点经常超时或失败，
      // 这个工具会自动重试（比如重试3次，每次间隔1秒）。
      // .MetaNode() 是abi里的函数
      const tokenAddr = await retryWithDelay(() => stakeContract.MetaNode()); // 读奖励代币地址
      setMetaNodeAddress(String(tokenAddr));
    } catch (error) {
      console.error('Failed to fetch MetaNode address:', error);
    }
    // 为什么不检查 isConnected？
    //     MetaNode() 是合约的全局配置，不需要用户地址
    //     即使未连接钱包，也可以查询这个信息
    //     提前获取代币地址，用于后续"添加到钱包"功能
  }, [stakeContract]);

  // 查询用户奖励数据
  const fetchRewardsData = useCallback(async () => {
    if (!stakeContract || !address || !isConnected) return; // 无地址不能 user(pid, address)

    try {
      setLoading(true);
      // 公共 RPC 节点经常超时或失败，
      // 这个工具会自动重试（比如重试3次，每次间隔1秒）。
      const userData = (await retryWithDelay(() =>
          // user  是abi里的函数
        stakeContract.user(Pid, address) // 读用户在该池的记账结构；含 pending 等字段
      )) as unknown as UserData;
      const stakedAmount = await retryWithDelay(() =>
          // stakingBalance  是abi里的函数
          stakeContract.stakingBalance(Pid, address) // 单独读质押余额；有的合约与 user 中字段冗余，以链上为准
      );

      // 为什么要查两次？
      //   理论上 user() 返回的结构体中已经包含质押数量，但：
      //   冗余验证：有些合约实现中，stakingBalance 是实时计算的，可能与 user.amount 不同
      //   合约设计：可能 user.amount 记录的是历史快照，stakingBalance 是当前值
      //   以合约实际实现为准，这里选择相信 stakingBalance 的结果。

      console.log('User data:', userData);
      console.log('Staked amount:', stakedAmount);
       // 更新用户数据
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

  // 触发时机：
  //   用户刚连接钱包时
  //   切换账户时
  //   为什么要加入依赖数组？
  //    useCallback 记忆化的函数，
  //       在依赖变化时会生成新引用，
  //      useEffect 需要响应这些变化。
  useEffect(() => {
    if (isConnected && address) {
      fetchRewardsData(); // 连接就绪：立刻拉用户奖励与池
      fetchPoolData();
    }
  }, [isConnected, address, fetchRewardsData, fetchPoolData]);

  // 独立于用户连接：
  //   只要合约实例可用就查询
  //     即使用户没连接钱包，也能获取代币地址
  //     为"添加到钱包"功能做准备
  useEffect(() => {
    if (stakeContract) {
      fetchMetaNodeAddress(); // 合约实例一有就拉代币地址；不依赖用户连接
    }
  }, [stakeContract, fetchMetaNodeAddress]);

  useEffect(() => {
    if (!isConnected || !address) return; // 未连接：不定轮询

    const interval = setInterval(() => {
      fetchRewardsData(); // 仅刷新奖励：pending 随区块变；比全量 pool 更轻
      // 60秒
    }, 60000);
    // 清理函数，在组件卸载或依赖变化时清除定时器，防止内存泄漏。
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
      // EIP-747 标准
      //    这是以太坊的标准提案，允许 DApp 请求用户将代币添加到 MetaMask 资产列表。
      // 点击"添加到钱包"
      //   → MetaMask 弹出确认框
      //   → 用户确认后，代币出现在资产列表
      //   → 无需手动输入合约地址

      return await addMetaNodeToMetaMask(metaNodeAddress); // wallet_watchAsset：用户可拒绝
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
