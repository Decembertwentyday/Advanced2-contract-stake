/**
 * 浏览器注入钱包发现层：EIP-1193（request/on）+ EIP-6963（多钱包广播）。
 * 与 ethers 的关系：ethers `BrowserProvider` 需要的是 **Eip1193Provider** 引用；本文件负责「找到正确的那个引用」。
 */
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; // 所有 JSON-RPC 经此发往扩展
  on?: (event: string, callback: (...args: unknown[]) => void) => void; // 订阅链/账户变化
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void; // 取消订阅
  isMetaMask?: boolean; // 旧式标记：辅助在 providers[] 里找 MetaMask
  /** 部分浏览器在多钱包模式下，`window.ethereum.providers` 为并列的多个 provider */
  providers?: Eip1193Provider[]; // Legacy 多注入：并列多个钱包
};

/** EIP-6963 事件中 `detail` 的结构（简化版，仅使用我们需要的字段） */
type Eip6963AnnounceDetail = {
  info: { uuid: string; name: string; rdns?: string }; // uuid：去重；rdns：反向 DNS 标识扩展
  provider: Eip1193Provider; // 独立注入对象：比盲用 window.ethereum 可靠
};

/** MetaMask 在 EIP-6963 里注册的 rdns，用于排序与优先匹配 */
const METAMASK_RDNS = 'io.metamask';

/** 供 UI 展示的一行候选（连接前选择钱包） */
export type WalletCandidate = {
  id: string; // 6963 uuid 或占位 id
  name: string; // 钱包展示名
  rdns?: string; // 反向 DNS，如 io.metamask
  provider: Eip1193Provider; // 传给 BrowserProvider 的引用
};

/** 将未知值收窄为带 `request` 的 EIP-1193 对象，否则返回 null */
function asInjected(raw: unknown): Eip1193Provider | null {
  if (!raw || typeof raw !== 'object') return null; // 非对象不可能是 provider
  const p = raw as Eip1193Provider;
  return typeof p.request === 'function' ? p : null; // EIP-1193 核心：必须有 request
}

/**
 * 从 `window.ethereum` 解析可用的注入对象（Legacy 多注入兼容）。
 */
export function getInjectedEthereum(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null; // SSR
  const eth = (window as Window & { ethereum?: unknown }).ethereum; // 读全局注入
  const top = asInjected(eth); // 顶层可能是单个 provider
  if (!top) return null;

  const nested = (eth as Eip1193Provider | undefined)?.providers; // 多钱包数组形态
  if (Array.isArray(nested) && nested.length > 0) {
    const candidates = nested.map(asInjected).filter(Boolean) as Eip1193Provider[]; // 过滤非法项
    const mm = candidates.find((c) => c.isMetaMask === true); // 优先 MetaMask：产品默认预期
    if (mm) return mm;
    return candidates[0] ?? top; // 否则取第一个可用
  }

  return top; // 单注入：直接返回
}

/**
 * 在 `timeoutMs` 内监听 EIP-6963 广播，收集所有 `announceProvider`。
 */
function discoverEip6963Candidates(timeoutMs: number): Promise<WalletCandidate[]> {
  if (typeof window === 'undefined') return Promise.resolve([]); // SSR 返回空

  return new Promise((resolve) => {
    const byUuid = new Map<string, WalletCandidate>(); // Map：按 uuid 去重

    const onAnnounce = (event: Event) => {
      const { detail } = event as CustomEvent<Eip6963AnnounceDetail>; // 6963 用 CustomEvent 携带 detail
      if (!detail?.info?.uuid || !detail.provider?.request) return; // 缺字段则忽略
      if (byUuid.has(detail.info.uuid)) return; // 已收录
      byUuid.set(detail.info.uuid, {
        id: detail.info.uuid,
        name: detail.info.name?.trim() || 'Wallet', // 空名兜底
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce); // 先监听再请求：防丢早到事件
    window.dispatchEvent(new Event('eip6963:requestProvider')); // 触发各钱包 announce

    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce); // 超时卸载：防泄漏
      resolve(Array.from(byUuid.values())); // 转数组给上层
    }, timeoutMs);
  });
}

/**
 * **连接按钮专用**：尽可能完整地列出当前页面可用的浏览器钱包。
 */
export async function getConnectWalletCandidates(): Promise<WalletCandidate[]> {
  if (typeof window === 'undefined') return [];

  const first = await discoverEip6963Candidates(400); // 第一轮：稍长，覆盖慢机器
  const second = await discoverEip6963Candidates(350); // 第二轮：合并晚到的 announce
  const merged = new Map<string, WalletCandidate>();
  for (const c of [...first, ...second]) {
    merged.set(c.id, c); // 后写覆盖前写：同名 uuid 保留最后一次（通常相同）
  }
  const list = Array.from(merged.values()).sort((a, b) => {
    const rank = (x: WalletCandidate) =>
      x.rdns === METAMASK_RDNS || x.provider.isMetaMask === true ? 0 : 1; // 0 优先
    return rank(a) - rank(b); // 升序：MetaMask 在前
  });

  if (list.length > 0) return list; // 有 6963 结果：优先用（多钱包可区分）

  const injected = getInjectedEthereum(); // 回退旧注入
  if (injected) {
    return [
      {
        id: 'window-ethereum',
        name: '浏览器默认钱包 (window.ethereum)',
        provider: injected,
      },
    ];
  }
  return []; // 真没有可用钱包
}

/** 供 `resolveEthereumProvider` 内部使用：只关心 provider + rdns，减少类型重复 */
async function discoverEip6963WithRdns(
  timeoutMs: number
): Promise<{ provider: Eip1193Provider; rdns?: string }[]> {
  const rows = await discoverEip6963Candidates(timeoutMs);
  return rows.map((r) => ({ provider: r.provider, rdns: r.rdns })); // 拍平结构
}

/**
 * 向当前 EIP-1193 provider 查询 `eth_chainId`，解析为十进制 chainId。
 */
export async function readWalletChainId(
  rpc: Pick<Eip1193Provider, 'request'> // 只依赖 request：便于测试 mock
): Promise<number> {
  const hex = (await rpc.request({ method: 'eth_chainId', params: [] })) as string; // 返回 0x 前缀 hex 字符串
  return Number.parseInt(hex, 16); // 转十进制与 SEPOLIA_CHAIN_ID 比较
}

/**
 * **轻量**解析：用于页面加载静默恢复、`switchToSepolia` 等，不应在这里做两轮 6963（避免拖慢首屏）。
 */
export async function resolveEthereumProvider(): Promise<Eip1193Provider | null> {
  if (typeof window === 'undefined') return null;

  const quick = getInjectedEthereum(); // 快路径：已有单注入
  if (quick?.isMetaMask === true) return quick; // 已是 MetaMask：直接返回，零等待

  const announced = await discoverEip6963WithRdns(350); // 单轮 6963

  const mmAnnounced = announced.find(
    (a) => a.rdns === METAMASK_RDNS || a.provider.isMetaMask === true
  );
  if (mmAnnounced) return mmAnnounced.provider; // 找到 announced 的 MetaMask

  const injected = getInjectedEthereum(); // 再试 legacy（可能不是 MM）
  if (injected?.isMetaMask) return injected;
  if (injected) return injected; // 任意单注入

  if (announced[0]) return announced[0].provider; // 至少有一个 6963 钱包

  return null; // 彻底没有
}
