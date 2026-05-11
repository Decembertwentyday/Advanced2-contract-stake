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
import { BrowserProvider, FallbackProvider, JsonRpcSigner, Network } from 'ethers';
import { createSepoliaReadProvider } from '../utils/ethersReadProvider';
import { SEPOLIA_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX } from '../config/chain';
import { formatWalletConnectError } from '../utils/formatWalletConnectError';
import {
  type Eip1193Provider,
  type WalletCandidate,
  getConnectWalletCandidates,
  readWalletChainId,
  resolveEthereumProvider,
} from '../utils/injectedProvider';
import { WalletPickerModal } from '../components/WalletPickerModal';

/** 与链配置一致；与 BrowserProvider 的 staticNetwork 共用同一引用，满足 ethers 的 matches 校验 */
const BROWSER_STATIC_SEPOLIA = Network.from(SEPOLIA_CHAIN_ID);

/** 用固定 Sepolia 网络创建 BrowserProvider，避免 _start 里对 eth_chainId 的失败重试刷屏 */
function createWalletBrowserProvider(rpc: Eip1193Provider): BrowserProvider {
  return new BrowserProvider(rpc, BROWSER_STATIC_SEPOLIA, {
    staticNetwork: BROWSER_STATIC_SEPOLIA,
  });
}

export type Web3ContextValue = {
  address: string | null;
  /** 来自 readWalletChainId，表示钱包当前所在链，用于判断是否需切换 Sepolia */
  chainId: number | null;
  /** 已授权账户且当前为 Sepolia */
  isConnected: boolean;
  /** 已连接但不在 Sepolia */
  needsNetworkSwitch: boolean;
  isConnecting: boolean;
  /** 入口：可能弹出多钱包选择框，再发起 eth_requestAccounts */
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepolia: () => Promise<void>;
  readProvider: FallbackProvider;
  browserProvider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  error: string | null;
};

const Web3Context = createContext<Web3ContextValue | null>(null);

/**
 * 请求钱包切换到 Sepolia；若钱包未登记该链则先 add 再 switch（4902）。
 * 使用标准 EIP-147：`wallet_switchEthereumChain` / `wallet_addEthereumChain`。
 */
async function ensureSepolia(provider: Pick<Eip1193Provider, 'request'>) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (e: unknown) {
    const code = (e as { code?: number }).code;
    if (code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: 'Sepolia',
            nativeCurrency: {
              name: 'Sepolia Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  /** 全站共享只读 Provider，在客户端仅创建一次 */
  const readProvider = useMemo(() => createSepoliaReadProvider(), []);

  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [browserProvider, setBrowserProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eip1193Provider, setEip1193Provider] = useState<Eip1193Provider | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletPickerChoices, setWalletPickerChoices] = useState<WalletCandidate[]>([]);

  /**
   * 连接成功后：用真实 `eth_chainId` 更新 UI，并拉 Signer + 地址。
   * 第二参 `rpc` 必须与创建 `bp` 时用的是同一个 EIP-1193 引用。
   */
  const refreshFromProvider = useCallback(async (bp: BrowserProvider, rpc: Eip1193Provider) => {
    setChainId(await readWalletChainId(rpc));
    const s = await bp.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
  }, []);

  /** 用户在错误网络上时，顶栏 / 提示里的「切到 Sepolia」 */
  const switchToSepolia = useCallback(async () => {
    const rpc = eip1193Provider ?? (await resolveEthereumProvider());
    if (!rpc) {
      setError('未检测到钱包');
      return;
    }
    setError(null);
    try {
      await ensureSepolia(rpc);
      if (browserProvider && eip1193Provider) {
        await refreshFromProvider(browserProvider, eip1193Provider);
      }
    } catch (e: unknown) {
      setError(formatWalletConnectError(e));
    }
  }, [browserProvider, eip1193Provider, refreshFromProvider]);

  /**
   * 核心连接逻辑：对指定 EIP-1193 实例请求账户授权，必要时切链，再写入 React 状态。
   * 由「自动选唯一钱包」或「用户在 WalletPickerModal 里点选」两条路径调用。
   */
  const connectWithProvider = useCallback(
    async (rpc: Eip1193Provider) => {
      const bp = createWalletBrowserProvider(rpc);
      await bp.send('eth_requestAccounts', []);
      const chain = await readWalletChainId(rpc);
      if (chain !== SEPOLIA_CHAIN_ID) {
        await ensureSepolia(rpc);
      }
      await refreshFromProvider(bp, rpc);
      setEip1193Provider(rpc);
      setBrowserProvider(bp);
    },
    [refreshFromProvider]
  );

  const cancelWalletPicker = useCallback(() => {
    setWalletPickerOpen(false);
    setWalletPickerChoices([]);
  }, []);

  /**
   * 用户点击「连接」：
   * 1. `getConnectWalletCandidates`（两轮 EIP-6963 + 回退注入）；
   * 2. 0 个 → 错误提示；多个 → 打开 `WalletPickerModal`；1 个 → 直接 `connectWithProvider`。
   */
  const connect = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const candidates = await getConnectWalletCandidates();
      if (candidates.length === 0) {
        setError(
          '未检测到可用钱包。若已安装 MetaMask，请尝试暂时关闭其它钱包扩展（如 Coinbase、OKX）后刷新页面再试。'
        );
        return;
      }
      if (candidates.length > 1) {
        setWalletPickerChoices(candidates);
        setWalletPickerOpen(true);
        return;
      }
      await connectWithProvider(candidates[0].provider);
    } catch (e: unknown) {
      setError(formatWalletConnectError(e));
    } finally {
      setIsConnecting(false);
    }
  }, [connectWithProvider]);

  /** 多钱包弹窗里选定某一 provider 后继续走 `connectWithProvider` */
  const selectWalletFromPicker = useCallback(
    async (rpc: Eip1193Provider) => {
      cancelWalletPicker();
      setIsConnecting(true);
      setError(null);
      try {
        await connectWithProvider(rpc);
      } catch (e: unknown) {
        setError(formatWalletConnectError(e));
      } finally {
        setIsConnecting(false);
      }
    },
    [cancelWalletPicker, connectWithProvider]
  );

  const disconnect = useCallback(() => {
    setAddress(null);
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
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const rpc = await resolveEthereumProvider();
        if (cancelled || !rpc) return;
        const bp = createWalletBrowserProvider(rpc);
        const accounts: string[] = await bp.send('eth_accounts', []);
        if (cancelled || !accounts[0]) return;
        await refreshFromProvider(bp, rpc);
        if (!cancelled) {
          setEip1193Provider(rpc);
          setBrowserProvider(bp);
        }
      } catch {
        /* 静默失败：用户未连钱包属正常情况 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFromProvider]);

  /**
   * 订阅钱包推送：`accountsChanged` 断开或更新地址；`chainChanged` 重新读链 ID。
   * 监听必须挂在 `eip1193Provider` 上，而不是 `window.ethereum`，否则多钱包场景会串事件。
   */
  useEffect(() => {
    const eth = eip1193Provider;
    if (!eth?.on) return;

    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.[0]) {
        disconnect();
        return;
      }
      setAddress(list[0]);
      if (browserProvider) {
        browserProvider.getSigner().then(setSigner).catch(() => setSigner(null));
      }
    };

    const onChain = () => {
      if (!browserProvider || !eip1193Provider) return;
      refreshFromProvider(browserProvider, eip1193Provider).catch(() => {});
    };

    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [browserProvider, disconnect, eip1193Provider, refreshFromProvider]);

  const value = useMemo<Web3ContextValue>(
    () => ({
      address,
      chainId,
      isConnected: Boolean(address && chainId === SEPOLIA_CHAIN_ID),
      needsNetworkSwitch: Boolean(
        address && chainId !== null && chainId !== SEPOLIA_CHAIN_ID
      ),
      isConnecting,
      connect,
      disconnect,
      switchToSepolia,
      readProvider,
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
          void selectWalletFromPicker(p);
        }}
        onCancel={cancelWalletPicker}
      />
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextValue {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error('useWeb3 must be used within Web3Provider');
  }
  return ctx;
}
