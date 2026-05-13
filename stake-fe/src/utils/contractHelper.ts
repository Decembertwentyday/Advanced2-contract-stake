/**
 * 用 viem 封装「合约实例」工厂，供 React hooks 调用。
 *
 * 双客户端模型（核心）
 * - public：HTTP PublicClient（见 viem.ts）。负责 eth_call 类请求：read、估算、模拟。
 * - wallet：wagmi 提供的 WalletClient（用户钱包）。负责 eth_sendRawTransaction：write、签名。
 *
 * 为什么 write 也会受 public RPC 影响？
 * - viem 在发交易前常做 simulate/estimate，会向 RPC 发只读请求；public 挂了则 write 在弹窗前就失败。
 *
 * getContract 返回的对象上：
 * - .read.xxx()  只读
 * - .write.xxx() 需 wallet 已连接且 signer 存在
 */
import {
  Abi,                    // 📘 合约接口定义（业务手册）
  Address,                // 📍 合约地址（银行位置）
  GetContractReturnType,  // 📦 返回类型
  PublicClient,           // 👁️ 公共客户端（只读）
  WalletClient,           // 💼 钱包客户端（可写）
  getContract as viemGetContract  // 🔧 viem 的原始工具
} from "viem";

import { defaultChainId } from './wagmi';
import { viemClients } from "./viem";

export const getContract = <TAbi extends Abi | readonly unknown[], TWalletClient extends WalletClient>({
  abi, // 合约 ABI（接口定义
  address, // 合约地址
  chainId = defaultChainId,
  signer, // 签名者（钱包客户端，可选, signer 就是外部传进来的钱包客户端对象)
}: {
  abi: TAbi | readonly unknown[]; // 合约的接口定义，告诉代码有哪些方法可以调用 必须填写
  address: Address; // 合约在区块链上的地址 必须填写
  chainId?: number; // 使用哪个区块链网络，默认 Sepolia
  signer?: TWalletClient; // 用户的钱包，用于签名交易
}) => {
  // 创建合约实例
  // 、viemGetContract：viem的工厂函数，用来创建合约实例根据输入的参数，输入一个双客户端
  // 输出：封装好的合约对象（带 .read 和 .write 方法）
  const c = viemGetContract({
    abi,
    address,
    // 核心 双客户端模型
    client: {
      public: viemClients(chainId), // 👁️ 公共客户端（只读）
      wallet: signer, // 💼 钱包客户端（可写） 从外部传进来
    },
    // 为什么这里要有两个客户端：
    // - 创建合约实例时，需要两个客户端：公共客户端（只读）和钱包客户端（可写）。
    // - 创建合约实例时，公共客户端（只读）用于只读请求，如 eth_call、estimateGas、getBlockNumber 等；
    // - 钱包客户端（可写）用于发送交易，如 eth_sendRawTransaction、personal_sign 等。
  // 只读 (read) 不需要私钥
  //  写入 (write) 需要私钥
  }) as unknown as GetContractReturnType<TAbi, PublicClient, Address>;
//   viemGetContract 就像是一个"工厂"
//     ↓
// 输入：
//   - 合约地址（去哪里找合约）
//   - ABI（合约有哪些功能）
//   - public client（怎么读取数据）
//   - wallet client（怎么发送交易）
// ↓
// 输出：
//   - 一个封装好的合约对象
//   - 可以直接调用 .read.xxx() 和 .write.xxx()


  return {
    // 原始的 viemGetContract 返回的对象只有合约方法，
    ...c,              // 展开原始合约对象的所有方法
    account: signer?.account, // 添加当前账户信息
    chain: signer?.chain,  // 添加当前链信息
  };
};

// 使用案例
// // 获取合约实例
// const contract = getContract({
//   abi: stakeAbi,
//   address: stakeContractAddress,
//   signer: walletClient,  // 用户连接的钱包
// });
//
// // ✅ 只读操作 - 使用 public client
// const balance = await contract.read.balanceOf([userAddress]);
//
// // ✅ 写入操作 - 使用 wallet client（会弹出钱包确认）
// await contract.write.stake([amount]);


// 用户打开网页
//     ↓
// 连接钱包（MetaMask等）
// ↓
// 获取 WalletClient（signer）
// ↓
// 调用 getContract({
//   abi: stakeAbi,
//   address: "0x123...",
//   signer: walletClient
// })
//     ↓
// 返回合约对象
//     ├─ .read.xxx()  → 通过 PublicClient 查询
//     └─ .write.xxx() → 通过 WalletClient 发送交易
//     ↓
// 用户可以：
//   - 查询自己的质押量（只读）
//   - 发起质押交易（写入，需签名）

// 设计思路
// 原因 1：安全性
// // ❌ 不好的做法：所有操作都用钱包
// await walletClient.readBalance();  // 浪费资源，不需要签名却用钱包
//
// // ✅ 好的做法：区分读写
// await publicClient.readBalance();   // 只读，快速
// await walletClient.sendTransaction(); // 写入，需要签名
//
// 原因 2：性能优化
// PublicClient 走 HTTP RPC，速度快
// WalletClient 需要用户确认，慢且体验重
//
// 原因 3：用户体验
//
// // 场景：用户点击"质押"按钮
//
// // 第1步：先模拟交易（用 public client，不弹窗）
// try {
//   await contract.read.simulateStake([amount]);
//   console.log("模拟成功");
// } catch (error) {
//   toast.error("质押会失败：" + error.message);
//   return;  // 提前阻止，不让用户浪费时间
// }
//
// // 第2步：模拟成功后，才让用户签名（用 wallet client）
// await contract.write.stake([amount]);  // 弹出钱包确认




// // 实际应用场景
// 场景 1：查询质押量（只读）
// // hooks/useRewards.ts 中
// const contract = getContract({
//   abi: stakeAbi,
//   address: STAKE_CONTRACT_ADDRESS,
//   // 不需要 signer，因为只是查询
// });
//
// const stakedAmount = await contract.read.getStakedAmount([userAddress]);
//
// 场景 2：发起质押（需要签名）
// // pages/home/page.tsx 中
// const { data: walletClient } = useWalletClient();
//
// const contract = getContract({
//   abi: stakeAbi,
//   address: STAKE_CONTRACT_ADDRESS,
//   signer: walletClient,  // 需要钱包签名
// });
//
// // 这会弹出 MetaMask 确认框
// await contract.write.stake([stakeAmount]);
