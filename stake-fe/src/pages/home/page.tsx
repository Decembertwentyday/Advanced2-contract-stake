/**
 * 首页：质押（ETH 或 ERC20）+ 领取奖励（ethers + Web3Provider）。
 *
 * ## 数据从哪来？
 * - `useStakeContract()`：根据 `signer ?? readProvider` 绑定的质押合约；未连接时仍可读部分 view。
 * - `useRewards()`：读池子 `pool(Pid)`、用户 `user` / `stakingBalance` 等，展示待领取与池参数。
 * - `useWalletBalance()`：用 **readProvider（HTTP）** 查当前地址 ETH 或 ERC20 余额，供输入校验。
 *
 * ## 写交易（质押 / 领取）的共同模式
 * 1. 校验 `signer` 存在（用户已连接且能签名）。
 * 2. `connectWithSigner(stakeContract, signer)`：把合约 runner 从 Provider 换成 Signer，否则 `deposit` 等会报无法发送交易。
 * 3. `const tx = await ...` → `await tx.wait()`：等链上打包；`receipt.status === 1` 表示成功。
 *
 * ## ETH 池 vs ERC20 池
 * - 池配置里的 `stTokenAddress` 为空 / 零地址 → 视为 **ETH 池**：`depositETH({ value })` 随交易附带 ETH。
 * - 否则为 **ERC20 池**：先 `approve` 质押合约花费你的代币，再调 `deposit(Pid, amount)`。
 */
'use client';

import { motion } from 'framer-motion';
import { useStakeContract, useTokenContract } from '../../hooks/useContract';
import useRewards from '../../hooks/useRewards';
import { useWalletBalance } from '../../hooks/useWalletBalance';
import { useMemo, useState } from 'react';
import { Pid } from '../../utils';
import { useWeb3 } from '../../providers/Web3Provider';
import { parseUnits, ZeroAddress } from 'ethers';
import { toast } from 'react-toastify';
import { FiArrowDown, FiInfo, FiZap, FiTrendingUp, FiGift } from 'react-icons/fi';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { StakeContractAddress } from '../../utils/env';
import { WalletConnectPrompt } from '../../components/WalletConnectPrompt';
import { connectWithSigner } from '../../utils/connectWithSigner';

const Home = () => {
  const stakeContract = useStakeContract(); // ethers Contract：ABI+地址+runner；runner 随连接变化
  const { address, isConnected, signer } = useWeb3(); // signer：发交易必需；address：余额与合约 user(pid,addr)
  const { rewardsData, poolData, canClaim, refresh } = useRewards(); // 内部大量 stakeContract.view 调用
  const [amount, setAmount] = useState(''); // 用户输入的质押数量（十进制字符串）
  const [loading, setLoading] = useState(false); // 质押交易进行中
  const [claimLoading, setClaimLoading] = useState(false); // 领取交易进行中

  /** 池子质押资产：零地址表示原生 ETH；否则为 ERC20 的合约地址 */
  const isEthPool = useMemo(() => {
    const addr = poolData.stTokenAddress; // 来自链上 pool(pid) 元组字段
    return (
      !addr || // 未返回：按 ETH 处理
      addr === ZeroAddress || // ethers 零地址常量
      addr === '0x0000000000000000000000000000000000000000' // 显式零地址字符串
    );
  }, [poolData.stTokenAddress]);

  const tokenContract = useTokenContract(poolData.stTokenAddress); // ERC20 池时才有有效实例

  const { data: balance, refetch: refetchBalance } = useWalletBalance({
    address, // 当前钱包
    tokenAddress: poolData.stTokenAddress, // ETH 池时仍传地址字段，但 isEth 为 true 会走 getBalance
    isEth: isEthPool,
    /** 未连接时不查余额，避免用 null 地址调 RPC */
    enabled: isConnected && (isEthPool || !!poolData.stTokenAddress),
  });

  /**
   * 质押：ETH 走 `depositETH`；ERC20 先 `approve` 再 `deposit`。
   * `parseUnits` 把人类可读小数转为链上 uint（wei / token smallest unit）。
   */
  const handleStake = async () => {
    if (!stakeContract || !signer) return; // 无 signer 不能发交易（Contract runner 可能仍是 provider）
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const decimals = balance?.decimals ?? 18; // 未拉到 balance 时按 18（ETH 默认）
    const amountWei = parseUnits(amount, decimals); // BigInt：链上 uint256 安全

    if (!balance || parseFloat(amount) > parseFloat(balance.formatted)) {
      toast.error('Amount cannot be greater than current balance');
      return;
    }

    try {
      setLoading(true);
      // 创建一个新的实例，避免 signer 改变时丢失
      const stakeWithSigner = connectWithSigner(stakeContract, signer); // 显式绑 Signer，准备写质押合约

      if (isEthPool) {
        const tx = await stakeWithSigner.depositETH({ value: amountWei }); // payable：value 随交易发送 ETH
        const receipt = await tx.wait(); // 等待矿工打包；返回 TransactionReceipt
        if (receipt?.status === 1) {
          // status 1：成功；0：链上回滚
          toast.success('Stake successful!');
          setAmount('');
          refetchBalance(); // 余额变：立刻用 readProvider 再查
          refresh(); // 池子/奖励视图变：useRewards 再拉链上
          return;
        }
        toast.error('Stake failed!');
      } else {
        if (!tokenContract) {
          toast.error('Token contract not ready');
          setLoading(false);
          return;
        }
        const stakeAddress = StakeContractAddress; // 质押合约作为 spender
        const tokenWithSigner = connectWithSigner(tokenContract, signer); // approve 必须由用户签 ERC20 合约
        const approveTx = await tokenWithSigner.approve(stakeAddress, amountWei); // 授权质押合约划转代币
        await approveTx.wait(); // 等 approve 上链再 deposit，否则 deposit 可能 Insufficient allowance
        const depositTx = await stakeWithSigner.deposit(Pid, amountWei); // 质押合约记录用户存款
        const receipt = await depositTx.wait();
        if (receipt?.status === 1) {
          toast.success('Stake successful!');
          setAmount('');
          refetchBalance();
          refresh();
          return;
        }
        toast.error('Stake failed!');
      }
    } catch (error) {
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error'); // 控制台保留原始错误便于调试（用户拒绝等）
    } finally {
      setLoading(false);
    }
  };

  /** 领取奖励：单步 `claim(Pid)`，由合约把奖励代币转到当前用户地址 */
  const handleClaim = async () => {
    if (!stakeContract || !signer) return;

    try {
      setClaimLoading(true);
      const stakeWithSigner = connectWithSigner(stakeContract, signer); // claim 为 nonpayable 写方法
      const tx = await stakeWithSigner.claim(Pid); // 合约内按 msg.sender 发放奖励
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        toast.success('Claim successful!');
        setClaimLoading(false);
        refresh(); // 待领取应下降为 0 附近
        return;
      }
      toast.error('Claim failed!');
    } catch (error) {
      setClaimLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'claim-error');
    }
  };

  /** 未连接时只展示连接组件，避免误触发无 signer 的交易 */
  const showWalletActions = !isConnected;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-6"
      >
        <div className="inline-block mb-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="w-24 h-24 rounded-full border-2 border-primary-500/20 flex items-center justify-center shadow-xl"
            style={{ boxShadow: '0 0 60px 0 rgba(14,165,233,0.15)' }}
          >
            <FiZap className="w-12 h-12 text-primary-500" />
          </motion.div>
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent mb-2">
          MetaNode Stake
        </h1>
        <p className="text-gray-400 text-xl">Stake ETH to earn tokens</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
        <Card className="min-h-[420px] p-4 sm:p-8 md:p-12 bg-gradient-to-br from-gray-800/80 to-gray-900/80 shadow-2xl border-primary-500/20 border-[1.5px] rounded-2xl sm:rounded-3xl">
          <div className="space-y-8 sm:space-y-12">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 p-4 sm:p-8 bg-gray-800/70 rounded-xl sm:rounded-2xl border border-gray-700/50 group-hover:border-primary-500/50 transition-colors duration-300 shadow-lg">
              <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 bg-primary-500/10 rounded-full">
                <FiTrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-primary-400" />
              </div>
              <div className="flex flex-col justify-center flex-1 min-w-0 items-center sm:items-start">
                <span className="text-gray-400 text-base sm:text-lg mb-1">
                  Staked Amount
                </span>
                <span className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent leading-tight break-all">
                  {parseFloat(poolData.stTokenAmount || '0').toFixed(4)}{' '}
                  {isEthPool ? 'ETH' : 'Token'}
                </span>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <Input
                label="Amount to Stake"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                rightElement={
                  <span className="text-gray-500">
                    {isEthPool ? 'ETH' : 'Token'}
                  </span>
                }
                helperText={
                  balance
                    ? `Available: ${parseFloat(balance.formatted).toFixed(4)} ${isEthPool ? 'ETH' : 'Token'}`
                    : undefined
                }
                className="text-lg sm:text-xl py-3 sm:py-5"
              />
            </div>

            <div className="pt-4 sm:pt-8">
              {showWalletActions ? (
                <div className="flex justify-center">
                  <WalletConnectPrompt />
                </div>
              ) : (
                <Button
                  onClick={handleStake}
                  disabled={loading || !amount}
                  loading={loading}
                  fullWidth
                  className="py-3 sm:py-5 text-lg sm:text-xl"
                >
                  <FiArrowDown className="w-6 h-6 sm:w-7 sm:h-7" />
                  <span>Stake {isEthPool ? 'ETH' : 'Token'}</span>
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="min-h-[420px] p-4 sm:p-8 md:p-12 bg-gradient-to-br from-gray-800/80 to-gray-900/80 shadow-2xl border-primary-500/20 border-[1.5px] rounded-2xl sm:rounded-3xl">
          <div className="space-y-8 sm:space-y-12">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 p-4 sm:p-8 bg-gray-800/70 rounded-xl sm:rounded-2xl border border-gray-700/50 group-hover:border-primary-500/50 transition-colors duration-300 shadow-lg">
              <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 bg-green-500/10 rounded-full">
                <FiGift className="w-8 h-8 sm:w-10 sm:h-10 text-green-400" />
              </div>
              <div className="flex flex-col justify-center flex-1 min-w-0 items-center sm:items-start">
                <span className="text-gray-400 text-base sm:text-lg mb-1">
                  Pending Rewards
                </span>
                <span className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent leading-tight break-all">
                  {parseFloat(rewardsData.pendingReward).toFixed(4)} MetaNode
                </span>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 sm:p-6">
                <div className="flex items-start space-x-3">
                  <FiInfo className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-300">
                    <p className="font-medium mb-1">How rewards work:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Rewards accumulate based on your staked amount and time</li>
                      <li>• You can claim rewards anytime</li>
                      <li>• Rewards are paid in MetaNode tokens</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 sm:pt-8">
              {showWalletActions ? (
                <div className="flex justify-center">
                  <WalletConnectPrompt />
                </div>
              ) : (
                <Button
                  onClick={handleClaim}
                  disabled={claimLoading || !canClaim}
                  loading={claimLoading}
                  fullWidth
                  className="py-3 sm:py-5 text-lg sm:text-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                >
                  <FiGift className="w-6 h-6 sm:w-7 sm:h-7" />
                  <span>Claim Rewards</span>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Home;
