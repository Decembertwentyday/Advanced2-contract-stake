/**
 * 提现页：合约里「解质押」与「取出已到期的本金」往往是两步。
 *
 * - **unstake**：发起赎回请求，资金进入「锁定期 / 排队」状态（与合约 `withdrawAmount` 语义一致）。
 * - **withdraw**：锁定期结束后，把可领取额度真正转回钱包；`userData.withdrawable` 来自链上读数。
 *
 * 读数据用 `useStakeContract()` 返回的实例即可（view）；写操作必须 `connectWithSigner(..., signer)`。
 */
'use client';

import { motion } from 'framer-motion';
import { useStakeContract } from '../../hooks/useContract';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pid } from '../../utils';
import { useWeb3 } from '../../providers/Web3Provider';
import { formatUnits, parseUnits } from 'ethers';
import { toast } from 'react-toastify';
import { FiArrowUp, FiClock, FiInfo } from 'react-icons/fi';
import { cn } from '../../utils/cn';
import { WalletConnectPrompt } from '../../components/WalletConnectPrompt';
import { connectWithSigner } from '../../utils/connectWithSigner';

export type UserStakeData = {
  staked: string;
  withdrawPending: string;
  withdrawable: string;
};

const InitData: UserStakeData = {
  staked: '0',
  withdrawable: '0',
  withdrawPending: '0',
};

const Withdraw = () => {
  const stakeContract = useStakeContract(); // view 读可用；写需 signer
  const { address, isConnected, signer } = useWeb3();
  const [amount, setAmount] = useState(''); // 解质押数量（十进制字符串）
  const [unstakeLoading, setUnstakeLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [userData, setUserData] = useState<UserStakeData>(InitData);

  const isWithdrawable = useMemo(
    () => Number(userData.withdrawable) > 0 && isConnected, // 有可取余额且已连接才可点 withdraw
    [userData, isConnected]
  );

  /** 同步链上用户质押与提现队列状态，供三个统计卡片与按钮禁用逻辑使用 */
  const getUserData = useCallback(async () => {
    if (!stakeContract || !address) return; // 无地址：无法查 user 维度（此处用 address 调 view）
    const staked = await stakeContract.stakingBalance(Pid, address); // eth_call：读质押余额（BigInt）
    /** `withdrawAmount` 返回结构由合约定义：此处解构为「申请总量」与「已可提」等 */
    const [requestAmount, pendingWithdrawAmount] = await stakeContract.withdrawAmount(
      Pid,
      address
    );
    const ava = Number(formatUnits(pendingWithdrawAmount, 18)); // 已解锁可提：转 JS number 做简单比较
    const total = Number(formatUnits(requestAmount, 18)); // 赎回申请总量
    setUserData({
      staked: formatUnits(staked, 18),
      withdrawPending: (total - ava).toFixed(4), // 仍在锁定期内的部分：展示用
      withdrawable: ava.toString(),
    });
  }, [stakeContract, address]);

  useEffect(() => {
    if (stakeContract && address) {
      getUserData(); // 进入页或依赖变化：同步链上
    }
  }, [address, stakeContract, getUserData]);

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
      /** 解质押：减少链上记账本金，进入合约定义的锁定期 */
      const stakeWithSigner = connectWithSigner(stakeContract, signer); // unstake 为写方法
      const tx = await stakeWithSigner.unstake(Pid, parseUnits(amount, 18)); // 本页假设 18 位与池一致
      await tx.wait(); // 等上链
      toast.success('Unstake successful!');
      setAmount('');
      setUnstakeLoading(false);
      getUserData(); // 刷新统计
    } catch (error) {
      setUnstakeLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error');
    }
  }, [stakeContract, signer, amount, userData.staked, getUserData]);

  const handleWithdraw = useCallback(async () => {
    if (!stakeContract || !signer) return;
    try {
      setWithdrawLoading(true);
      /** 到期后把「可提余额」从合约提到用户钱包 */
      const stakeWithSigner = connectWithSigner(stakeContract, signer);
      const tx = await stakeWithSigner.withdraw(Pid); // 把已到期本金转回 msg.sender
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
        <p className="text-gray-600 text-lg">Unstake and withdraw your ETH</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="card"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard label="Staked Amount" value={`${parseFloat(userData.staked).toFixed(4)} ETH`} />
          <StatCard
            label="Available to Withdraw"
            value={`${parseFloat(userData.withdrawable).toFixed(4)} ETH`}
          />
          <StatCard
            label="Pending Withdraw"
            value={`${parseFloat(userData.withdrawPending).toFixed(4)} ETH`}
          />
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
                  'input-field pr-12',
                  'focus:ring-primary-500 focus:border-primary-500'
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
                <WalletConnectPrompt />
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUnStake}
                disabled={unstakeLoading || !amount}
                className={cn(
                  'btn-primary w-full flex items-center justify-center space-x-2',
                  unstakeLoading && 'opacity-70 cursor-not-allowed'
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
              'btn-primary w-full flex items-center justify-center space-x-2',
              (!isWithdrawable || withdrawLoading) && 'opacity-70 cursor-not-allowed'
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
