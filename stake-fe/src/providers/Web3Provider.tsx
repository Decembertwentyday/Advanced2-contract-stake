/**
 * 全站 Web3 上下文：ethers v6 + 自研连接层。
 *
 * ## 设计目标（需求侧）
 * - 用户用 MetaMask 等扩展连接 **Sepolia**，对质押合约做 **读（view）** 与 **写（交易）**。
 * - **未连接钱包**时，仍能通过 HTTP RPC 读公开链上数据（池子、奖励等），页面不完全空白。
 * - 兼容 **多钱包扩展**：避免盲用 `window.ethereum`；支持 EIP-6963 多选；错误信息可读。
 *
 * ## 两条数据通路（必读）
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  A. 只读 HTTP：readProvider（FallbackProvider + JsonRpc）    │  ← 不经过 MetaMask，与「点连接」无关
 *   │  B. 浏览器钱包：BrowserProvider 包一层 EIP-1193 provider   │  ← eth_requestAccounts / 发交易
 *   └─────────────────────────────────────────────────────────────┘
 *
 * 合约统一写法：`new Contract(addr, abi, signer ?? readProvider)`（见 useContract）。
 * **发交易前**必须把 Contract 绑到 Signer：`connectWithSigner(contract, signer)`。
 *
 * ## BrowserProvider 为何使用 staticNetwork？
 * ethers 的 `BrowserProvider` 继承自内部 JsonRpc 栈，启动时会循环 `eth_chainId` 做「网络自举」；
 * 在扩展冲突或异常时可能**每秒重试并刷控制台**。我们已知业务只面向 Sepolia，故传入
 * `Network.from(SEPOLIA_CHAIN_ID)` + `staticNetwork`，跳过该探测循环。
 * **真实链 ID** 用 `readWalletChainId(rpc)` 从用户选中的扩展读取，用于 `needsNetworkSwitch` 与切链。
 *
 * ## 状态一览
 * - `eip1193Provider`：当前会话实际使用的 EIP-1193 对象（可能与 `window.ethereum` 不同）。
 * - `browserProvider`：ethers 包装层；事件监听挂在 `eip1193Provider` 上，保证与选中钱包一致。
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
/**
 * ## ethers v6 在本文件用到的几个「类」分别是什么？（速查）
 *
 * 先分清两个角色：**Provider（提供者）** 只负责和链通信（发 `eth_call`、读区块等）；
 * **Signer（签名者）** 在 Provider 能力之上，还能让钱包用私钥**签名并广播交易**（`eth_sendTransaction`）。
 *
 * - **FallbackProvider**
 *   - 把多个 HTTP RPC 子节点「包成一层」；某个 URL 超时或限流时，可自动换别的 URL 再问。
 *   - 本项目的 `readProvider` 类型就是它（在 `createSepoliaReadProvider` 里构造），用于**不连钱包**时的只读查询。
 *
 * - **JsonRpcSigner**
 *   - `BrowserProvider.getSigner()` 返回的具体类型之一：通过浏览器钱包（MetaMask）用 JSON-RPC
 *     发交易、对交易做 EIP-191 签名。名字里的 JsonRpc 指的是「和钱包之间仍走 JSON-RPC 协议」，
 *     不是说私钥在网页里；私钥始终在扩展里。
 *   - 只要调用会改链上状态的方法（`deposit`、`claim`…），合约实例必须绑在 Signer 上（见 `connectWithSigner`）。
 *
 * - **BrowserProvider**
 *   - ethers 对 **EIP-1193** 注入对象（`window.ethereum` 或 6963 选中的那个 `provider`）的封装，
 *     用来 `getSigner()`、`send('eth_requestAccounts')` 等。
 *
 * - **Network**
 *   - 描述「链 ID + 名称」等元数据；这里与 `staticNetwork` 配合，告诉 ethers「我们固定只面向 Sepolia」，
 *     避免它在后台反复 `eth_chainId` 自举失败时刷屏重试（详见文件顶部长注释）。
 */
import { BrowserProvider, FallbackProvider, JsonRpcSigner, Network } from 'ethers';
import { createSepoliaReadProvider } from '../utils/ethersReadProvider';
import { SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX } from '../config/chain';
import { formatWalletConnectError } from '../utils/formatWalletConnectError'; // 报错处理转中文
import {
  type Eip1193Provider,
  type WalletCandidate,
  getConnectWalletCandidates,
  readWalletChainId,
  resolveEthereumProvider,
} from '../utils/injectedProvider';
import { WalletPickerModal } from '../components/WalletPickerModal';

/** 与链配置一致；与 BrowserProvider 的 staticNetwork 共用同一引用，满足 ethers 的 matches 校验 */
const BROWSER_STATIC_SEPOLIA = Network.from(SEPOLIA_CHAIN_ID); // Network.from(chainId)：生成固定链元数据，避免重复探测

/** 用固定 Sepolia 网络创建 BrowserProvider，避免 _start 里对 eth_chainId 的失败重试刷屏 */
function createWalletBrowserProvider(rpc: Eip1193Provider): BrowserProvider {
  // 第一参 rpc：EIP-1193 注入对象；第二参 network：告诉 ethers「默认网络」；第三参 staticNetwork：关闭自举轮询
  return new BrowserProvider(rpc, BROWSER_STATIC_SEPOLIA, {
    staticNetwork: BROWSER_STATIC_SEPOLIA, // 与第二参一致：ethers v6 要求 static 时双参对齐
  });
}

export type Web3ContextValue = {
  address: string | null; // 当前选中账户 checksummed 地址；未连接为 null
  /** 来自 readWalletChainId，表示钱包当前所在链，用于判断是否需切换 Sepolia */
  chainId: number | null; // 十进制 chainId；与 BrowserProvider staticNetwork 解耦，此处为「真实钱包网络」
  /** 已授权账户且当前为 Sepolia */
  isConnected: boolean; // UI：可启用写交易按钮
  /** 已连接但不在 Sepolia */
  needsNetworkSwitch: boolean; // UI：提示切链
  isConnecting: boolean; // connect / 弹窗选择 进行中，防重复点击
  /** 入口：可能弹出多钱包选择框，再发起 eth_requestAccounts */
  connect: () => Promise<void>; // 异步：可能抛错，内部已 setError
  disconnect: () => void; // 仅清本地 React 状态；不会卸载 MetaMask 授权（链上无「断开」）
  switchToSepolia: () => Promise<void>; // wallet_switchEthereumChain / add
  readProvider: FallbackProvider; // HTTP 只读：给 Contract 与 getBalance 用
  browserProvider: BrowserProvider | null; // 钱包包装器；未连接为 null
  signer: JsonRpcSigner | null; // 交易签名者；未连接为 null
  error: string | null; // 连接/切链失败文案；由 formatWalletConnectError 生成
};

const Web3Context = createContext<Web3ContextValue | null>(null);

/**
 * 请求钱包切换到 Sepolia；若钱包未登记该链则先 add 再 switch（4902）。
 * 使用标准 EIP-147：`wallet_switchEthereumChain` / `wallet_addEthereumChain`。
 */
async function ensureSepolia(provider: Pick<Eip1193Provider, 'request'>) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain', // EIP-147：切到已存在的链配置
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }], // 必须用 0x 十六进制 chainId 字符串
    });
  } catch (e: unknown) {
    const code = (e as { code?: number }).code; // 钱包返回的 EIP-1193 错误码
    if (code === 4902) {
      // 4902：未添加该链 → 先 add 再让用户确认；add 成功后多数钱包会自动切换
      await provider.request({
        method: 'wallet_addEthereumChain', // 把 Sepolia 元数据写入钱包
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX, // 与 switch 使用同一常量，防不一致
            chainName: 'Sepolia',
            nativeCurrency: {
              name: 'Sepolia Ether',
              symbol: 'ETH',
              decimals: 18, // Sepolia ETH 仍为 18 位小数
            },
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'], // 钱包用于 RPC 的默认 URL 列表之一
            blockExplorerUrls: ['https://sepolia.etherscan.io'], // 浏览器链接，便于用户查看
          },
        ],
      });
    } else {
      throw e; // 用户拒绝、已有待处理请求等：交给上层 setError
    }
  }
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  /** 全站共享只读 Provider，在客户端仅创建一次 */
  const readProvider = useMemo(() => createSepoliaReadProvider(), []); // 依赖 []：挂载一次；子组件共用同一 HTTP 入口

  const [address, setAddress] = useState<string | null>(null); // 当前账户；null 表示未选或未连
  const [chainId, setChainId] = useState<number | null>(null); // 钱包真实链 ID
  const [browserProvider, setBrowserProvider] = useState<BrowserProvider | null>(null); // ethers 对 EIP-1193 的封装
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null); // 来自 bp.getSigner()
  const [isConnecting, setIsConnecting] = useState(false); // 连接流程 loading
  const [error, setError] = useState<string | null>(null); // 用户可读错误
  const [eip1193Provider, setEip1193Provider] = useState<Eip1193Provider | null>(null); // 事件监听必须挂在此引用上
  const [walletPickerOpen, setWalletPickerOpen] = useState(false); // 多钱包弹窗开关
  const [walletPickerChoices, setWalletPickerChoices] = useState<WalletCandidate[]>([]); // 弹窗列表数据

  /**
   * 连接成功后：用真实 `eth_chainId` 更新 UI，并拉 Signer + 地址。
   * 第二参 `rpc` 必须与创建 `bp` 时用的是同一个 EIP-1193 引用。
   */
  const refreshFromProvider = useCallback(async (bp: BrowserProvider, rpc: Eip1193Provider) => {
    setChainId(await readWalletChainId(rpc)); // 直接问钱包：避免依赖 BrowserProvider.getNetwork 在 staticNetwork 下的语义
    const s = await bp.getSigner(); // 默认「第一个已授权账户」的 Signer
    setSigner(s);
    setAddress(await s.getAddress()); // checksummed address
  }, []);

  /** 用户在错误网络上时，顶栏 / 提示里的「切到 Sepolia」 */
  const switchToSepolia = useCallback(async () => {
    const rpc = eip1193Provider ?? (await resolveEthereumProvider()); // 已连过用旧引用；否则轻量解析一个注入
    if (!rpc) {
      setError('未检测到钱包'); // 无注入对象
      return;
    }
    setError(null); // 新一轮操作清旧错
    try {
      await ensureSepolia(rpc); // 请求钱包切链 / 加链
      if (browserProvider && eip1193Provider) {
        await refreshFromProvider(browserProvider, eip1193Provider); // 切链后刷新 chainId 与 signer 状态
      }
    } catch (e: unknown) {
      setError(formatWalletConnectError(e)); // 统一中文错误
    }
  }, [browserProvider, eip1193Provider, refreshFromProvider]);

  /**
   * 核心连接逻辑：对指定 EIP-1193 实例请求账户授权，必要时切链，再写入 React 状态。
   * 由「自动选唯一钱包」或「用户在 WalletPickerModal 里点选」两条路径调用。
   */
  const connectWithProvider = useCallback(
    async (rpc: Eip1193Provider) => {
      const bp = createWalletBrowserProvider(rpc); // 针对「用户选中的」注入建 BrowserProvider
      await bp.send('eth_requestAccounts', []); // 等价 eth_requestAccounts：弹出授权/选账户
      const chain = await readWalletChainId(rpc); // 授权后立刻读真实链 ID
      if (chain !== SEPOLIA_CHAIN_ID) {
        await ensureSepolia(rpc); // 非 Sepolia：引导切或加
      }
      await refreshFromProvider(bp, rpc); // 写入 address/signer/chainId
      setEip1193Provider(rpc); // 保存：后续事件监听与 switchToSepolia 用同一引用
      setBrowserProvider(bp); // 保存：供需要 BrowserProvider 的场景（如 getSigner）
    },
    [refreshFromProvider]
  );

  const cancelWalletPicker = useCallback(() => {
    setWalletPickerOpen(false); // 关弹窗
    setWalletPickerChoices([]); // 清选项，防下次闪现旧列表
  }, []);

  /**
   * 用户点击「连接」：
   * 1. `getConnectWalletCandidates`（两轮 EIP-6963 + 回退注入）；
   * 2. 0 个 → 错误提示；多个 → 打开 `WalletPickerModal`；1 个 → 直接 `connectWithProvider`。
   */
  const connect = useCallback(async () => {
    if (typeof window === 'undefined') {
      return; // SSR 安全：不在服务端调钱包
    }
    setIsConnecting(true);
    setError(null);
    try {
      const candidates = await getConnectWalletCandidates(); // 可能耗时：两轮 6963 监听
      if (candidates.length === 0) {
        setError(
          '未检测到可用钱包。若已安装 MetaMask，请尝试暂时关闭其它钱包扩展（如 Coinbase、OKX）后刷新页面再试。'
        );
        return; // finally 仍会执行，重置 isConnecting
      }
      if (candidates.length > 1) {
        setWalletPickerChoices(candidates); // 交给用户选择 provider
        setWalletPickerOpen(true);
        return; // 等用户 onSelect 再继续连
      }
      await connectWithProvider(candidates[0].provider); // 仅一个：直接连
    } catch (e: unknown) {
      setError(formatWalletConnectError(e));
    } finally {
      setIsConnecting(false); // 成功/失败/早退都要结束 loading（多钱包弹窗打开时也算结束「连接中」）
    }
  }, [connectWithProvider]);

  /** 多钱包弹窗里选定某一 provider 后继续走 `connectWithProvider` */
  const selectWalletFromPicker = useCallback(
    async (rpc: Eip1193Provider) => {
      cancelWalletPicker(); // 先关 UI，再开始可能弹 MetaMask 的流程
      setIsConnecting(true);
      setError(null);
      try {
        await connectWithProvider(rpc); // 用户明确选的注入
      } catch (e: unknown) {
        setError(formatWalletConnectError(e));
      } finally {
        setIsConnecting(false);
      }
    },
    [cancelWalletPicker, connectWithProvider]
  );

  const disconnect = useCallback(() => {
    setAddress(null); // 清状态即「前端断开」；钱包里站点授权仍在
    setSigner(null);
    setBrowserProvider(null);
    setEip1193Provider(null);
    setChainId(null);
    setError(null);
  }, []);

  /**
   * 刷新页面后：若站点已被授权过 `eth_accounts`，则静默恢复，无需用户再点连接。
   * 使用轻量 `resolveEthereumProvider`，避免与「连接按钮」同等级别的双轮 6963 延迟。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR：无 window
    let cancelled = false; // 卸载或依赖重跑时置 true，避免 setState 已卸载组件
    (async () => {
      try {
        const rpc = await resolveEthereumProvider(); // 轻量：不跑两轮 6963，加快首屏
        if (cancelled || !rpc) return; // 已卸载或无注入
        const bp = createWalletBrowserProvider(rpc);
        const accounts: string[] = await bp.send('eth_accounts', []); // 不弹窗：仅读已授权账户列表
        if (cancelled || !accounts[0]) return; // 用户从未授权过站点 → 空数组
        await refreshFromProvider(bp, rpc); // 静默恢复 address/signer/chainId
        if (!cancelled) {
          setEip1193Provider(rpc); // 与手动连接一致：后续监听 accountsChanged
          setBrowserProvider(bp);
        }
      } catch {
        /* 静默失败：用户未连钱包属正常情况 */
      }
    })();
    return () => {
      cancelled = true; // 清理：防竞态
    };
  }, [refreshFromProvider]);

  /**
   * 订阅钱包推送：`accountsChanged` 断开或更新地址；`chainChanged` 重新读链 ID。
   * 监听必须挂在 `eip1193Provider` 上，而不是 `window.ethereum`，否则多钱包场景会串事件。
   */
  useEffect(() => {
    const eth = eip1193Provider; // 当前会话选中的注入
    if (!eth?.on) return; // 部分 mock 环境无 on：直接跳过

    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[]; // MetaMask 传入字符串数组
      if (!list?.[0]) {
        disconnect(); // 用户锁钱包或移除账户授权：等价前端断开
        return;
      }
      setAddress(list[0]); // 切换账户：更新 UI
      if (browserProvider) {
        browserProvider.getSigner().then(setSigner).catch(() => setSigner(null)); // 新账户对应新 Signer
      }
    };

    const onChain = () => {
      if (!browserProvider || !eip1193Provider) return;
      refreshFromProvider(browserProvider, eip1193Provider).catch(() => {}); // chainChanged  often reload page in MM，仍尽量同步
    };

    eth.on('accountsChanged', onAccounts); // EIP-1193 标准事件
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts); // 可选链：兼容无 removeListener 的注入
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [browserProvider, disconnect, eip1193Provider, refreshFromProvider]);

  const value = useMemo<Web3ContextValue>(
    () => ({
      address,
      chainId,
      isConnected: Boolean(address && chainId === SEPOLIA_CHAIN_ID), // 必须「有地址且在 Sepolia」才算业务连接
      needsNetworkSwitch: Boolean(
        address && chainId !== null && chainId !== SEPOLIA_CHAIN_ID // 有地址但链不对：提示切链而非连钱包
      ),
      isConnecting,
      connect,
      disconnect,
      switchToSepolia,
      readProvider, // 引用稳定（useMemo 空依赖）
      browserProvider,
      signer,
      error,
    }),
    [
      address,
      chainId,
      isConnecting,
      connect,
      disconnect,
      switchToSepolia,
      readProvider,
      browserProvider,
      signer,
      error,
    ]
  );

  return (
    <Web3Context.Provider value={value}>
      {children}
      <WalletPickerModal
        open={walletPickerOpen}
        choices={walletPickerChoices}
        onSelect={(p) => {
          void selectWalletFromPicker(p); // void：显式忽略 Promise，eslint 友好
        }}
        onCancel={cancelWalletPicker}
      />
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextValue {
  const ctx = useContext(Web3Context); // 读最近的 Provider value
  if (!ctx) {
    throw new Error('useWeb3 must be used within Web3Provider'); // 编译期无法强制，运行时兜底
  }
  return ctx;
}
