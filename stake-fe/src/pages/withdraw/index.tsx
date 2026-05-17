/**
 * 路由：/withdraw
 *
 * 两阶段取回资金（与合约设计一致）：
 * 1. unstake：申请解质押，份额进入「等待期」。
 * 2. withdraw：等待期结束后，把可领取金额真正提到钱包。
 *
 * withdrawAmount(Pid, user) 的返回值在本页被拆成：
 * - pendingWithdrawAmount → 展示为「可提取」withdrawable
 * - requestAmount 与 pending 的差 → 「处理中」withdrawPending
 * （具体语义以合约为准；此处沿用原前端计算方式。）
 */
'use client'
import { motion } from 'framer-motion';
import { useStakeContract } from "../../hooks/useContract";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pid } from "../../utils";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits } from "ethers";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "react-toastify";
import { stakeWithSigner } from "../../utils/stakeContractConnect";
import { useEthersSigner } from "../../utils/wagmiEthersAdapter";
import { FiArrowUp, FiClock, FiInfo } from 'react-icons/fi';
import { cn } from '../../utils/cn';

export type UserStakeData = {
  staked: string;
  withdrawPending: string;
  withdrawable: string;
};

const InitData: UserStakeData = {
  staked: '0',
  withdrawable: '0',
  withdrawPending: '0'
};

const Withdraw = () => {
  const stakeContract = useStakeContract();
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState(''); // 用户输入的 unstake 数量
  const [unstakeLoading, setUnstakeLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const signer = useEthersSigner(); // 写 unstake / withdraw 必需
  const [userData, setUserData] = useState<UserStakeData>(InitData);

  // 有可提取金额且已连接时才允许点 Withdraw
  const isWithdrawable = useMemo(() => Number(userData.withdrawable) > 0 && isConnected, [userData, isConnected]);

  /**
   * 拉取用户质押与提现进度。
   * withdrawAmount 返回 [requestAmount, pendingWithdrawAmount]：
   * - pendingWithdrawAmount → 已过锁定期、可 withdraw 到钱包
   * - requestAmount - pending → 仍在等待期（withdrawPending）
   */
  const getUserData = useCallback(async () => {
    if (!stakeContract || !address) return;
    const staked = await stakeContract.stakingBalance(Pid, address);
    const [requestAmount, pendingWithdrawAmount] = await stakeContract.withdrawAmount(Pid, address);
    const ava = Number(formatUnits(pendingWithdrawAmount, 18));
    const total = Number(formatUnits(requestAmount, 18));
    setUserData({
      staked: formatUnits(staked as bigint, 18),
      withdrawPending: (total - ava).toFixed(4),
      withdrawable: ava.toString()
    });
  }, [stakeContract, address]);

  useEffect(() => {
    if (stakeContract && address) {
      getUserData();
    }
  }, [address, stakeContract, getUserData]);

  /** 第一阶段：申请解质押，进入合约定义的锁定期 */
  const handleUnStake = useCallback(async () => {
    if (!stakeContract || !signer) return;
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) > parseFloat(userData.staked)) {
      toast.error('Amount cannot be greater than staked amount');
      return;
    }
    try {
      setUnstakeLoading(true);
      const tx = await stakeWithSigner(stakeContract, signer).unstake(Pid, parseUnits(amount, 18));
      await tx.wait(); // 等待链上确认后再刷新 getUserData
      toast.success('Unstake successful!');
      setAmount('');
      setUnstakeLoading(false);
      getUserData();
    } catch (error) {
      setUnstakeLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error');
    }
  }, [stakeContract, signer, amount, userData.staked, getUserData]);

  /** 第二阶段：锁定期结束后，把可提金额打到钱包（无 amount 参数，合约按 pending 处理） */
  const handleWithdraw = useCallback(async () => {
    if (!stakeContract || !signer) return;
    try {
      setWithdrawLoading(true);
      const tx = await stakeWithSigner(stakeContract, signer).withdraw(Pid);
      await tx.wait();
      toast.success('Withdraw successful!');
      setWithdrawLoading(false);
      getUserData();
    } catch (error) {
      setWithdrawLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error');
    }
  }, [stakeContract, signer, getUserData]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*(\.\d*)?$/.test(val)) {
      setAmount(val);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent mb-4">
          Withdraw
        </h1>
        <p className="text-gray-600 text-lg">
          Unstake and withdraw your ETH
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="card"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard label="Staked Amount" value={`${parseFloat(userData.staked).toFixed(4)} ETH`} />
          <StatCard label="Available to Withdraw" value={`${parseFloat(userData.withdrawable).toFixed(4)} ETH`} />
          <StatCard label="Pending Withdraw" value={`${parseFloat(userData.withdrawPending).toFixed(4)} ETH`} />
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Unstake</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Amount to Unstake
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.0"
                className={cn(
                  "input-field pr-12",
                  "focus:ring-primary-500 focus:border-primary-500"
                )}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                ETH
              </span>
            </div>
          </div>

          <div className="pt-4">
            {!isConnected ? (
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUnStake}
                disabled={unstakeLoading || !amount}
                className={cn(
                  "btn-primary w-full flex items-center justify-center space-x-2",
                  unstakeLoading && "opacity-70 cursor-not-allowed"
                )}
              >
                {unstakeLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <FiArrowUp className="w-5 h-5" />
                    <span>Unstake ETH</span>
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>

        <div className="mt-12 space-y-6">
          <h2 className="text-xl font-semibold">Withdraw</h2>

          <div className="bg-primary-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Ready to Withdraw</div>
                <div className="text-2xl font-semibold text-primary-600">
                  {parseFloat(userData.withdrawable).toFixed(4)} ETH
                </div>
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <FiClock className="mr-1" />
                <span>20 min cooldown</span>
              </div>
            </div>
          </div>

          <div className="flex items-center text-sm text-gray-500">
            <FiInfo className="mr-1" />
            <span>After unstaking, you need to wait 20 minutes to withdraw.</span>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleWithdraw}
            disabled={!isWithdrawable || withdrawLoading}
            className={cn(
              "btn-primary w-full flex items-center justify-center space-x-2",
              (!isWithdrawable || withdrawLoading) && "opacity-70 cursor-not-allowed"
            )}
          >
            {withdrawLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <FiArrowUp className="w-5 h-5" />
                <span>Withdraw ETH</span>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-primary-600">{value}</div>
    </div>
  );
}

export default Withdraw;
