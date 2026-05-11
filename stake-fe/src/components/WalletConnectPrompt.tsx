/**
 * 页面内「未连接 / 需切 Sepolia」时的连接入口。
 *
 * 实际连接逻辑在 `Web3Provider.connect`（含多钱包弹窗）；本组件负责按钮与
 * `MULTI_WALLET_ENV_HINT` 环境提示（多扩展冲突时用户可先按提示处理）。
 */
'use client';

import { useWeb3 } from '../providers/Web3Provider';
import { MULTI_WALLET_ENV_HINT } from '../utils/walletUiCopy';
import { Button } from './ui/Button';

/**
 * 页面内「未连接 / 错误网络」时的统一入口（替代 RainbowKit ConnectButton）。
 */
export function WalletConnectPrompt() {
  const { connect, switchToSepolia, isConnecting, needsNetworkSwitch, error } =
    useWeb3();

  if (typeof window !== 'undefined' && !window.ethereum) {
    return (
      <div className="text-center text-amber-400 text-sm space-y-2 max-w-sm mx-auto">
        <p>未检测到浏览器钱包，请安装 MetaMask 等 EIP-1193 插件。</p>
        <p className="text-gray-500 text-xs leading-relaxed">{MULTI_WALLET_ENV_HINT}</p>
      </div>
    );
  }

  if (needsNetworkSwitch) {
    return (
      <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
        <Button
          onClick={() => switchToSepolia()}
          loading={isConnecting}
          className="btn-primary"
        >
          切换到 Sepolia 网络
        </Button>
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        <p className="text-gray-500 text-xs text-center leading-relaxed">{MULTI_WALLET_ENV_HINT}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
      <div className="glow">
        <Button
          onClick={() => connect()}
          loading={isConnecting}
          className="btn-primary px-8"
        >
          连接钱包
        </Button>
      </div>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <p className="text-gray-500 text-xs text-center leading-relaxed">{MULTI_WALLET_ENV_HINT}</p>
    </div>
  );
}
