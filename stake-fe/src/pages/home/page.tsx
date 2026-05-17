/**
 * 首页：质押（ETH 或 ERC20）+ 同页领取奖励。
 *
 * 核心依赖
 * - useStakeContract：ethers `Contract`（runner 为 Signer 或只读 Provider）
 * - useTokenContract：当池子是 ERC20 时，对代币合约 approve
 * - useRewards：池子与用户奖励数据
 * - useEthersSigner：发交易用的 Signer；与 `Contract` 组合后 `depositETH` / `deposit` 等返回 `tx.wait()` 可等待的响应
 * - useBalance：wagmi 封装的本币/ERC20 余额，用于校验输入与 decimals
 *
 * 池类型判断 isEthPool
 * - 合约 pool() 返回的 stTokenAddress 为 0 地址时，走 depositETH 并附带 msg.value；
 *   否则走 approve + deposit(amount)。
 *
 * 交易流程（ETH）
 * 1. depositETH({ value }) — 钱包签名广播
 * 2. tx.wait() — 等待上链
 * 3. refresh / refetchBalance — 更新 UI
 */
'use client' // 本页使用 hooks / 钱包，必须在客户端执行（Next.js 约定）
import { motion } from 'framer-motion'; // 页面入场动画
import { useStakeContract, useTokenContract, type HexAddress } from "../../hooks/useContract";
import useRewards from "../../hooks/useRewards";
import { useMemo, useState } from "react";
import { Pid } from "../../utils"; // 固定操作 0 号质押池
import { useAccount, useBalance } from "wagmi"; // 账户与 ETH/ERC20 余额（读链由 wagmi+viem 完成）
import { ZeroAddress, parseUnits } from "ethers"; // 判断 ETH 池；金额转 wei
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "react-toastify";
import { erc20WithSigner, stakeWithSigner } from "../../utils/stakeContractConnect"; // 写交易前绑定 Signer 并收窄类型
import { useEthersSigner } from "../../utils/wagmiEthersAdapter";
import { FiArrowDown, FiInfo, FiZap, FiTrendingUp, FiGift } from 'react-icons/fi';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { StakeContractAddress } from "../../utils/env";

const Home = () => {
  // --- 链与合约：读用 Contract，写 additionally 需要 signer ---
  const stakeContract = useStakeContract(); // ethers 质押合约实例（runner=Signer 或只读 Provider）
  const { address, isConnected } = useAccount(); // wagmi：当前连接地址与是否已连接
  const { rewardsData, poolData, canClaim, refresh } = useRewards(); // 池子总量、待领奖励等只读聚合
  const [amount, setAmount] = useState(''); // 用户输入的质押数量（字符串，便于 input 受控）
  const [loading, setLoading] = useState(false); // 质押按钮 loading，防止重复提交
  const [claimLoading, setClaimLoading] = useState(false); // 领取按钮 loading
  const signer = useEthersSigner(); // 钱包 Signer；未连接为 undefined，写交易前必须判断

  /**
   * 判断当前池是否为「原生 ETH 池」。
   * 原理：合约 pool() 返回的 stTokenAddress 为 0 地址表示抵押物是 ETH，走 depositETH+msg.value；
   * 否则为 ERC20，需先 approve 再 deposit(Pid, amount)。
   */
  const isEthPool = useMemo(() => {
    const addr = poolData.stTokenAddress;
    return !addr || addr === ZeroAddress || addr === '0x0000000000000000000000000000000000000000';
  }, [poolData.stTokenAddress]);

  // 仅 ERC20 池需要：对抵押代币合约做 approve
  const tokenContract = useTokenContract(poolData.stTokenAddress as HexAddress | undefined);

  /**
   * wagmi 读余额：ETH 池 token 传 undefined；ERC20 池传 stTokenAddress。
   * refetchInterval：每 10s 刷新，质押成功后也会手动 refetchBalance。
   */
  const { data: balance, refetch: refetchBalance } = useBalance({
    address: address,
    token: isEthPool ? undefined : (poolData.stTokenAddress as HexAddress | undefined),
    query: {
      enabled: isConnected && (isEthPool || !!poolData.stTokenAddress),
      refetchInterval: 10000,
      refetchIntervalInBackground: false,
    }
  });

  /** 质押：校验 → 编码金额 → 发交易 → wait 回执 → 刷新 UI */
  const handleStake = async () => {
    if (!stakeContract || !signer) return; // 无合约或无签名者不能写链
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const decimals = balance?.decimals ?? 18; // ETH 默认 18；ERC20 用代币 decimals
    const amountWei = parseUnits(amount, decimals); // 人类可读 → wei（bigint）

    if (!balance || parseFloat(amount) > parseFloat(balance.formatted)) {
      toast.error('Amount cannot be greater than current balance');
      return;
    }

    try {
      setLoading(true);

      if (isEthPool) {
        //  payable：value 字段随交易发给合约
        const tx = await stakeWithSigner(stakeContract, signer).depositETH({ value: amountWei });
        const res = await tx.wait(); // 等待打包；res.status===1 表示成功
        if (res?.status === 1) {
          toast.success('Stake successful!');
          setAmount('');
          refetchBalance?.();
          refresh(); // 更新 useRewards 中的 staked / pending
          return;
        }
        toast.error('Stake failed!');
      } else {
        if (!tokenContract) {
          toast.error('Token contract not ready');
          setLoading(false);
          return;
        }
        const stakeAddress = StakeContractAddress; // approve 的 spender = 质押合约
        // 标准 ERC20 两步：授权 → 存款
        const approveTx = await erc20WithSigner(tokenContract, signer).approve(stakeAddress, amountWei);
        await approveTx.wait();
        const depositTx = await stakeWithSigner(stakeContract, signer).deposit(Pid, amountWei);
        const res = await depositTx.wait();
        if (res?.status === 1) {
          toast.success('Stake successful!');
          setAmount('');
          refetchBalance?.();
          refresh();
          return;
        }
        toast.error('Stake failed!');
      }
    } catch (error) {
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'stake-error');
    } finally {
      setLoading(false);
    }
  };

  /** 领取 MetaNode 奖励：claim(Pid) → wait → refresh */
  const handleClaim = async () => {
    if (!stakeContract || !signer) return;

    try {
      setClaimLoading(true);
      const tx = await stakeWithSigner(stakeContract, signer).claim(Pid);
      const res = await tx.wait();

      if (res?.status === 1) {
        toast.success('Claim successful!');
        setClaimLoading(false);
        refresh();
        return;
      }
      toast.error('Claim failed!');
    } catch (error) {
      setClaimLoading(false);
      toast.error('Transaction failed. Please try again.');
      console.log(error, 'claim-error');
    }
  };

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
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="w-24 h-24 rounded-full border-2 border-primary-500/20 flex items-center justify-center shadow-xl"
            style={{ boxShadow: '0 0 60px 0 rgba(14,165,233,0.15)' }}
          >
            <FiZap className="w-12 h-12 text-primary-500" />
          </motion.div>
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent mb-2">
          MetaNode Stake
        </h1>
        <p className="text-gray-400 text-xl">
          Stake ETH to earn tokens
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
        <Card className="min-h-[420px] p-4 sm:p-8 md:p-12 bg-gradient-to-br from-gray-800/80 to-gray-900/80 shadow-2xl border-primary-500/20 border-[1.5px] rounded-2xl sm:rounded-3xl">
          <div className="space-y-8 sm:space-y-12">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 p-4 sm:p-8 bg-gray-800/70 rounded-xl sm:rounded-2xl border border-gray-700/50 group-hover:border-primary-500/50 transition-colors duration-300 shadow-lg">
              <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 bg-primary-500/10 rounded-full">
                <FiTrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-primary-400" />
              </div>
              <div className="flex flex-col justify-center flex-1 min-w-0 items-center sm:items-start">
                <span className="text-gray-400 text-base sm:text-lg mb-1">Staked Amount</span>
                <span className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent leading-tight break-all">
                  {parseFloat(poolData.stTokenAmount || '0').toFixed(4)} {isEthPool ? 'ETH' : 'Token'}
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
                rightElement={<span className="text-gray-500">{isEthPool ? 'ETH' : 'Token'}</span>}
                helperText={balance ? `Available: ${parseFloat(balance.formatted).toFixed(4)} ${isEthPool ? 'ETH' : 'Token'}` : undefined}
                className="text-lg sm:text-xl py-3 sm:py-5"
              />
            </div>

            <div className="pt-4 sm:pt-8">
              {!isConnected ? (
                <div className="flex justify-center">
                  <div className="glow">
                    <ConnectButton />
                  </div>
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
                <span className="text-gray-400 text-base sm:text-lg mb-1">Pending Rewards</span>
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
              {!isConnected ? (
                <div className="flex justify-center">
                  <div className="glow">
                    <ConnectButton />
                  </div>
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
