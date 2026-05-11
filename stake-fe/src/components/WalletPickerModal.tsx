/**
 * 多钱包场景下的「选哪个扩展连接」弹层。
 *
 * 触发条件：`getConnectWalletCandidates()` 返回多于 1 个条目时，由 `Web3Provider.connect` 打开。
 * 用户点选某一钱包后，将对应的 EIP-1193 `provider` 传回并执行 `eth_requestAccounts`。
 *
 * 无障碍：`role="dialog"`、`aria-modal`、`aria-labelledby` 指向标题。
 */

'use client';

import type { Eip1193Provider, WalletCandidate } from '../utils/injectedProvider';
import { Button } from './ui/Button';

type Props = {
  open: boolean;
  choices: WalletCandidate[];
  onSelect: (provider: Eip1193Provider) => void;
  onCancel: () => void;
};

export function WalletPickerModal({ open, choices, onSelect, onCancel }: Props) {
  if (!open || choices.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-picker-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900/95 p-5 shadow-xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wallet-picker-title" className="text-lg font-semibold text-gray-100 mb-1">
          选择钱包
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          检测到多个浏览器钱包，请选择要用于本站的扩展。
        </p>
        <ul className="flex flex-col gap-2 mb-4">
          {choices.map((c) => (
            <li key={c.id}>
              <Button
                type="button"
                className="btn-primary w-full justify-center"
                onClick={() => onSelect(c.provider)}
              >
                {c.name}
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="w-full border-gray-600 text-gray-300"
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
