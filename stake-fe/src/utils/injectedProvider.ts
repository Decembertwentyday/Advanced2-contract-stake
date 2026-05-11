/**
 * 浏览器「注入钱包」工具层（EIP-1193 / EIP-6963）。
 *
 * ## 要解决什么问题？
 * 1. **多扩展并存**：多个钱包（MetaMask、OKX、Coinbase…）都会往页面里塞 `provider`。历史上只有 `window.ethereum`，谁先抢到谁就是「默认」，容易导致连错钱包或 MetaMask 注入失败（控制台常见 `Cannot set property ethereum`）。
 * 2. **选对 MetaMask**：通过 `window.ethereum.providers[]`（旧式多注入）与 **EIP-6963**（各钱包主动 `announceProvider`）拿到**独立**的 provider 引用，而不是盲用全局变量。
 *
 * ## 与本项目其它模块的关系
 * - `getConnectWalletCandidates()`：给「连接」按钮用，列出可选钱包；多于一个时由 `WalletPickerModal` 让用户点选。
 * - `resolveEthereumProvider()`：**轻量**解析（单轮 6963 + 注入），用于刷新后静默恢复、`switchToSepolia` 等，避免每次走两轮发现带来的延迟。
 * - `readWalletChainId()`：直接向**当前选中的** EIP-1193 provider 发 `eth_chainId`，得到用户**真实**所在链；与 `BrowserProvider` 上配置的 `staticNetwork` 解耦（后者用于消除 ethers 启动时的探测死循环，见 Web3Provider 注释）。
 */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  /** 部分浏览器在多钱包模式下，`window.ethereum.providers` 为并列的多个 provider */
  providers?: Eip1193Provider[];
};

/** EIP-6963 事件中 `detail` 的结构（简化版，仅使用我们需要的字段） */
type Eip6963AnnounceDetail = {
  info: { uuid: string; name: string; rdns?: string };
  provider: Eip1193Provider;
};

/** MetaMask 在 EIP-6963 里注册的 rdns，用于排序与优先匹配 */
const METAMASK_RDNS = 'io.metamask';

/** 供 UI 展示的一行候选（连接前选择钱包） */
export type WalletCandidate = {
  id: string;
  name: string;
  rdns?: string;
  provider: Eip1193Provider;
};

/** 将未知值收窄为带 `request` 的 EIP-1193 对象，否则返回 null */
function asInjected(raw: unknown): Eip1193Provider | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Eip1193Provider;
  return typeof p.request === 'function' ? p : null;
}

/**
 * 从 `window.ethereum` 解析可用的注入对象（Legacy 多注入兼容）。
 *
 * - 若存在 `ethereum.providers` 数组：优先 `isMetaMask === true` 的项，否则取第一个。
 * - 否则使用顶层的 `ethereum` 本身。
 *
 * 注意：在「别的扩展把 `window.ethereum` 设成只读 getter」的极端情况下，全局对象可能仍指向**非 MetaMask**，此时需依赖 EIP-6963 或用户手动禁用冲突扩展。
 */
export function getInjectedEthereum(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as Window & { ethereum?: unknown }).ethereum;
  const top = asInjected(eth);
  if (!top) return null;

  const nested = (eth as Eip1193Provider | undefined)?.providers;
  if (Array.isArray(nested) && nested.length > 0) {
    const candidates = nested.map(asInjected).filter(Boolean) as Eip1193Provider[];
    const mm = candidates.find((c) => c.isMetaMask === true);
    if (mm) return mm;
    return candidates[0] ?? top;
  }

  return top;
}

/**
 * 在 `timeoutMs` 内监听 EIP-6963 广播，收集所有 `announceProvider`。
 *
 * 流程：监听 `eip6963:announceProvider` → `dispatchEvent(eip6963:requestProvider)` → 超时后卸载监听并返回。
 * 每个钱包扩展会用唯一 `uuid` 注册，避免重复。
 */
function discoverEip6963Candidates(timeoutMs: number): Promise<WalletCandidate[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);

  return new Promise((resolve) => {
    const byUuid = new Map<string, WalletCandidate>();

    const onAnnounce = (event: Event) => {
      const { detail } = event as CustomEvent<Eip6963AnnounceDetail>;
      if (!detail?.info?.uuid || !detail.provider?.request) return;
      if (byUuid.has(detail.info.uuid)) return;
      byUuid.set(detail.info.uuid, {
        id: detail.info.uuid,
        name: detail.info.name?.trim() || 'Wallet',
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      resolve(Array.from(byUuid.values()));
    }, timeoutMs);
  });
}

/**
 * **连接按钮专用**：尽可能完整地列出当前页面可用的浏览器钱包。
 *
 * - 执行**两轮**短时监听（400ms + 再 350ms）：慢机器上 MetaMask 可能较晚才 announce，合并两轮结果并去重。
 * - 按 MetaMask 优先排序（`rdns === io.metamask` 或 `provider.isMetaMask`）。
 * - 若两轮都没有任何 6963 结果，再回退到单一的 `getInjectedEthereum()`，命名为「浏览器默认钱包」，供仅支持旧注入的环境使用。
 */
export async function getConnectWalletCandidates(): Promise<WalletCandidate[]> {
  if (typeof window === 'undefined') return [];

  const first = await discoverEip6963Candidates(400);
  const second = await discoverEip6963Candidates(350);
  const merged = new Map<string, WalletCandidate>();
  for (const c of [...first, ...second]) {
    merged.set(c.id, c);
  }
  const list = Array.from(merged.values()).sort((a, b) => {
    const rank = (x: WalletCandidate) =>
      x.rdns === METAMASK_RDNS || x.provider.isMetaMask === true ? 0 : 1;
    return rank(a) - rank(b);
  });

  if (list.length > 0) return list;

  const injected = getInjectedEthereum();
  if (injected) {
    return [
      {
        id: 'window-ethereum',
        name: '浏览器默认钱包 (window.ethereum)',
        provider: injected,
      },
    ];
  }
  return [];
}

/** 供 `resolveEthereumProvider` 内部使用：只关心 provider + rdns，减少类型重复 */
async function discoverEip6963WithRdns(
  timeoutMs: number
): Promise<{ provider: Eip1193Provider; rdns?: string }[]> {
  const rows = await discoverEip6963Candidates(timeoutMs);
  return rows.map((r) => ({ provider: r.provider, rdns: r.rdns }));
}

/**
 * 向当前 EIP-1193 provider 查询 `eth_chainId`，解析为十进制 chainId。
 *
 * 必须在「用户已选中的那个 provider」上调用，才能得到**钱包当前网络**；
 * 不要依赖 `BrowserProvider.getNetwork()` 在配置了 `staticNetwork` 时的语义（我们固定为 Sepolia 仅为消除 ethers 内部探测循环）。
 */
export async function readWalletChainId(
  rpc: Pick<Eip1193Provider, 'request'>
): Promise<number> {
  const hex = (await rpc.request({ method: 'eth_chainId', params: [] })) as string;
  return Number.parseInt(hex, 16);
}

/**
 * **轻量**解析：用于页面加载静默恢复、`switchToSepolia` 等，不应在这里做两轮 6963（避免拖慢首屏）。
 *
 * 策略顺序：
 * 1. 若 `getInjectedEthereum()` 已是 `isMetaMask`，直接返回（常见单钱包场景零等待）。
 * 2. 否则单轮 EIP-6963（350ms），优先 `rdns === io.metamask` 或 `isMetaMask`。
 * 3. 再回落到注入对象的 MetaMask / 任意 / 6963 第一项。
 */
export async function resolveEthereumProvider(): Promise<Eip1193Provider | null> {
  if (typeof window === 'undefined') return null;

  const quick = getInjectedEthereum();
  if (quick?.isMetaMask === true) return quick;

  const announced = await discoverEip6963WithRdns(350);

  const mmAnnounced = announced.find(
    (a) => a.rdns === METAMASK_RDNS || a.provider.isMetaMask === true
  );
  if (mmAnnounced) return mmAnnounced.provider;

  const injected = getInjectedEthereum();
  if (injected?.isMetaMask) return injected;
  if (injected) return injected;

  if (announced[0]) return announced[0].provider;

  return null;
}
