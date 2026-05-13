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
import { useAccount, useWalletClient } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { waitForTransactionReceipt } from "viem/actions";
import { toast } from "react-toastify";
import { FiArrowUp, FiClock, FiInfo } from 'react-icons/fi';
import { cn } from '../../utils/cn';

export type UserStakeData = {
  staked: string;
  withdrawPending: string;
  withdrawable: string;
};

// * 核心逻辑：计算三种状态的金额
// * - 已质押（staked）：还在锁定的资金
// * - 处理中（withdrawPending）：已申请解押但还在等待期
// * - 可提取（withdrawable）：等待期结束，可以真正提现的金额

const InitData: UserStakeData = {
  staked: '0',
  withdrawable: '0',
  withdrawPending: '0'

};

const Withdraw = () => {
  const stakeContract = useStakeContract();
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState('');
  const [unstakeLoading, setUnstakeLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const { data: walletClient } = useWalletClient();
  const [userData, setUserData] = useState<UserStakeData>(InitData);
  // 判断的能不能点击 提取  判断以及解押的金额，解押就是可提现的金额 并且钱包是已连接的状态
  const isWithdrawable = useMemo(() => Number(userData.withdrawable) > 0 && isConnected, [userData, isConnected]);

  const getUserData = useCallback(async () => {
    if (!stakeContract || !address) return;
    // 获取用户质押的代币数量
    // 钱包客户端 根据内置的属性读取合约中质押的代币数量
    const staked = await stakeContract.read.stakingBalance([Pid, address]);
    // 合约返回结构：以 ABI 为准；此处保持与原实现一致
    // @ts-expect-error withdrawAmount 元组类型未在 ABI 中收窄时需断言
    // 这个获取的是待提取的代币数量
    // 📝 合约返回结构说明：
    // withdrawAmount 返回一个元组 [requestAmount, pendingWithdrawAmount]
    // - requestAmount: 用户申请解押的总金额（包括等待中的和可提取的）
    // - pendingWithdrawAmount: 已经完成等待期，可以真正提取的金额

    // 🔍 第二次 RPC 调用：获取解押相关信息
    // @ts-expect-error withdrawAmount 元组类型未在 ABI 中收窄时需断言
    // 这个获取的是待提取的代币数量
    const [requestAmount, pendingWithdrawAmount] = await stakeContract.read.withdrawAmount([Pid, address]);
    // 获取待提取的代币数量
    // 🔢 数据转换：将 BigInt 转换为人类可读的数字
    // formatUnits(1000000000000000000n, 18) → "1.0"
    // Number("1.0") → 1.0（用于后续计算）
    const ava = Number(formatUnits(pendingWithdrawAmount, 18));
    const total = Number(formatUnits(requestAmount, 18));
    // 📝 更新用户数据状态
    setUserData({
      staked: formatUnits(staked as bigint, 18),
      // ⏳ 处理中金额：已申请解押但还在等待期
      // 计算公式：总申请量 - 可提取量 = 等待中的量
      // 例如：申请解押 10 ETH，其中 6 ETH 已过等待期，4 ETH 还在等待
      // withdrawPending = 10 - 6 = 4 ETH
      withdrawPending: (total - ava).toFixed(4),
      // ✅ 可提取金额：等待期已结束，可以点击"Withdraw"按钮提现
      withdrawable: ava.toString()
    });
  }, [stakeContract, address]);

  useEffect(() => {
    if (stakeContract && address) {
      getUserData();
    }
  }, [address, stakeContract, getUserData]);

  const handleUnStake = useCallback(async () => {
    if (!stakeContract || !walletClient) return;
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
      // 钱包客户端 根据内置的属性 进行解押操作 写入的操作，解押金额，会触发钱包弹窗 发起确认，点击确认后，会广播到链上，返回hash
      const tx = await stakeContract.write.unstake([Pid, parseUnits(amount, 18)]);
      // 把hash 当做参数传递，这里会进行监听，矿工直到处理完成后，会返回结果
      await waitForTransactionReceipt(walletClient, { hash: tx });
      toast.success('Unstake successful!');
      setAmount('');
      setUnstakeLoading(false);
      getUserData();
    } catch (error) {
      setUnstakeLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error');
    }
  }, [stakeContract, walletClient, amount, userData.staked, getUserData]);

  const handleWithdraw = useCallback(async () => {
    if (!stakeContract || !walletClient) return;
    try {
      setWithdrawLoading(true);
      const tx = await stakeContract.write.withdraw([Pid]);
      await waitForTransactionReceipt(walletClient, { hash: tx });
      toast.success('Withdraw successful!');
      setWithdrawLoading(false);
      getUserData();
    } catch (error) {
      setWithdrawLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error');
    }
  }, [stakeContract, walletClient, getUserData]);

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
