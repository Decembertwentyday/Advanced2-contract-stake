/**
 * 浏览器注入钱包发现层：EIP-1193（request/on）+ EIP-6963（多钱包广播）。
 * 与 ethers 的关系：ethers `BrowserProvider` 需要的是 **Eip1193Provider** 引用；本文件负责「找到正确的那个引用」。
 * 这个文件的作用：帮你的网页找到用户浏览器里安装的钱包
 *  为什么要这个文件？
 *  * - 用户的浏览器可能装了多个钱包（MetaMask、Coinbase等）
 *  * - 我们需要一种方法找出所有可用的钱包
 *  * - 然后让用户选择用哪个钱包连接
 * /

/**
 * EIP-1193 Provider 接口定义
 * 这是以太坊钱包的标准接口规范，所有现代钱包扩展都必须实现这个接口
 *
 * 为什么需要这个接口？
 * - 统一了不同钱包的调用方式，让开发者可以编写兼容所有钱包的代码
 * - ethers.js 的 BrowserProvider 就是基于这个接口工作的
 *  EIP-1193：所有钱包都要遵守这个规则:定义了如何与钱包通信
 *  EIP-6963: 新一代的多钱包发现标准，解决了多个钱包共存的问题
 */
export type Eip1193Provider = {
  /**
   * 核心方法：发送 JSON-RPC 请求到区块链节点
   * 所有与区块链的交互都通过这个方法进行
   *
   * 常见用法示例：
   * - provider.request({ method: 'eth_accounts' }) // 获取账户地址
   * - provider.request({ method: 'eth_chainId' })  // 获取链ID
   * - provider.request({ method: 'personal_sign', params: [...] }) // 签名消息
   */
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; // unknown 表示返回值的类型不确定

  /**
   * 事件监听器：用于订阅区块链状态变化
   *
   * 常用事件类型：
   * - 'accountsChanged': 用户切换账户时触发
   * - 'chainChanged': 网络切换时触发
   * - 'disconnect': 连接断开时触发
   * event: 字符串，表示"要监听什么事情"
   * *   - 'accountsChanged': 账户变了
   *    *   - 'chainChanged': 网络变了
   *    *   - 'disconnect': 连接断开了
   *    callback: 函数，表示"当这个事情发生时，要做什么"
   * args: 事件传递过来的数据，不同事件传来的数据不一样
   *
   */
  on?: (event: string, callback: (...args: unknown[]) => void) => void;

  /**
   * 移除事件监听器：防止内存泄漏
   * 当组件卸载或不再需要监听时必须调用
   *  * 注意：
   *    * - 取消监听时，必须传入和监听时完全相同的回调函数
   *    * - 所以通常要把回调函数保存到一个变量里
   */
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;

  /**
   * MetaMask 特有的标识符
   * 在多个钱包同时存在时，用来识别哪个是 MetaMask
   * 注意：不是所有钱包都有这个属性
   * 只有 MetaMask 有这个属性，而且值是 true
   * 其他钱包要么没有这个属性，要么是 false
   * 但这不是 100% 可靠的，有些钱包可能会伪造这个标记
   */
  isMetaMask?: boolean;

  /**
   * 旧式浏览器的多钱包支持方式
   * 某些浏览器会在 window.ethereum.providers 数组中提供多个钱包实例
   * 这种方式已被 EIP-6963 取代，但为了兼容性仍需处理
   * 但为了兼容老浏览器，还是要处理这种情况
   */
  providers?: Eip1193Provider[];
};

/**
 * Eip6963AnnounceDetail: EIP-6963 标准中钱包广播的信息结构
 *
 * 什么是 EIP-6963？
 * - 新一代的多钱包发现标准（比上面的 providers 数组更先进）
 * - 解决了多个钱包互相冲突的问题
 * 每个钱包都会广播自己的信息，包含唯一标识符(uuid)和提供者对象
 * - 工作原理：每个钱包都会"主动喊话"，说"我在这里！"
 *
 * 工作流程比喻：
 * 1. 我们的网页大喊一声："有哪些钱包在？"（发送 eip6963:requestProvider 事件）
 * 2. 每个钱包听到后都会回答："我是 MetaMask！"、"我是 Coinbase！"（发送 eip6963:announceProvider 事件）
 * 3. 我们收集所有回答，就知道有哪些钱包可用了
 */
type Eip6963AnnounceDetail = {
  /**
   * info 钱包的基本信息
   * uuid: 全局唯一标识符，用于区分不同的钱包实例
   * name: 钱包显示名称，如 "MetaMask"、"Coinbase Wallet"
   * rdns: 反向域名表示法，如 "io.metamask"，比名称更可靠
   */
  info: { uuid: string; name: string; rdns?: string };

  /**
   * provider: 钱包的实际遥控器对象
   * 实际的 provider 对象
   * 每个钱包都会提供自己独立的 provider 实例
   * 这避免了传统方式下多个钱包争夺 window.ethereum 的问题
   */
  provider: Eip1193Provider;
};


/**
 * MetaMask 在 EIP-6963 标准中注册的官方 rdns 标识
 * 用于准确识别 MetaMask 钱包，避免依赖可能伪造的 isMetaMask 标志
 */
const METAMASK_RDNS = 'io.metamask';


/**
 * WalletCandidate: 钱包候选者
 *
 * 这是什么？
 * - 当我们发现一个可用的钱包时，就把它包装成这个格式
 * - 用于在 UI 界面上展示给用户选择
 *
 * 想象一个场景：
 * - 用户点击"连接钱包"按钮
 * - 弹出一个对话框，列出所有可用的钱包
 * - 列表里的每一项就是一个 WalletCandidate
 */
export type WalletCandidate = {
  /** 唯一标识符，来自 EIP-6963 的 uuid 或自定义占位符
   * 用途：作为 React 列表的 key，或者用来区分不同钱包
   * */
  id: string;

  /**
   * name: 显示给用户的钱包名称
   * - 会在按钮或列表项上显示这个名字
   * - 比如 "MetaMask"、"Coinbase Wallet"
   * - 对于老式钱包，可能是 "浏览器默认钱包"
   */
  name: string;

  /**
   * rdns: 可选的反向域名标识
   * - 如果有这个字段，可以更准确地识别钱包类型
   * - 老式钱包可能没有这个字段
   * 提供可靠的钱包识别
   */
  rdns?: string;

  /** 实际的 provider 对象，将传递给 ethers.js 使用 */
  /**
   * provider: 钱包的遥控器
   * - 当用户选择这个钱包后，我们就用这个 provider 来操作钱包
   * - 传给 ethers.js 的 BrowserProvider 使用
   */
  provider: Eip1193Provider;
};

/**
 * 类型守卫函数：验证一个未知值是否为有效的 EIP-1193 Provider
 * 检查一个东西是不是有效的钱包 provider
 * 为什么需要这个函数？
 * - window.ethereum 的类型是不确定的，可能是对象、可能是 null、可能是 undefined
 * - 必须确保对象具有必需的 request 方法才能安全使用
 * - 提供运行时类型检查，避免后续代码出错
 *  * 工作原理：
 *  * 1. 先检查是不是对象（不是对象肯定不是 provider）
 *  * 2. 再检查有没有 request 方法（没有就不能用）
 *  * 3. 如果都满足，就返回这个 provider；否则返回 null
 */
function asInjected(raw: unknown): Eip1193Provider | null {
  // 第一道检查：必须是对象
  // 首先检查是否为非空对象，因为 provider 必须是对象类型
  // !raw 表示：null、undefined、false、0、空字符串等都是 false
  // typeof raw !== 'object' 表示：数字、字符串、布尔值等都不是对象
  if (!raw || typeof raw !== 'object') return null;
  // TypeScript 类型转换：告诉编译器"我相信这是个 Eip1193Provider"
  const p = raw as Eip1193Provider;

  // EIP-1193 的核心要求：必须有 request 方法
  // 第二道检查：必须有 request 方法，而且必须是函数
  // 这是判断一个对象是否为有效 provider 的最关键条件
  return typeof p.request === 'function' ? p : null;
}

/**
 * 从传统的 window.ethereum 获取可用的 provider:钱包
 * * 这是什么意思？
 *  * - 在 EIP-6963 之前，钱包都是通过 window.ethereum 注入的
 *  * - 这个方法就是为了兼容这种老方式
 * 这个方法主要为了向后兼容：
 * 什么时候会用到？
 * 1. 用户的浏览器不支持 EIP-6963
 * 2. 用户装的是老版本的钱包插件
 * 3. EIP-6963 发现失败时的备选方案
 * 返回值：
 * - 如果找到了可用的钱包，返回 provider
 * - 如果没找到，返回 null
 */
export function getInjectedEthereum(): Eip1193Provider | null {
  // SSR 保护：防止在服务端渲染时报错
  // typeof window === 'undefined' 表示当前不在浏览器环境
  // 比如在 Next.js 的服务端渲染阶段，是没有 window 对象的
  if (typeof window === 'undefined') return null;

  // 读取全局的 window.ethereum 对象
  // 注意：这里使用 unknown 类型是因为 window.ethereum 没有标准的 TypeScript 定义
  // 为什么要这么写？(window as Window & { ethereum?: unknown })
  // - TypeScript 不知道 window.ethereum 的存在
  // - 所以我们用类型断言告诉 TS："相信我，window 上有个 ethereum 属性"
  // - ethereum?: unknown 表示这个属性可能存在，类型未知
  const eth = (window as Window & { ethereum?: unknown }).ethereum;

  // 尝试把 window.ethereum 转换成有效的 provider
  const top = asInjected(eth);
  // 如果转换失败（比如 window.ethereum 不存在），直接返回 null
  if (!top) return null;

  // 检查是否有嵌套的 providers 数组（旧式多钱包支持）
  // 某些浏览器会这样提供多个钱包：
  // window.ethereum.providers = [MetaMask, Coinbase, ...]
  const nested = (eth as Eip1193Provider | undefined)?.providers;

  // 如果存在 providers 数组，而且数组不为空
  if (Array.isArray(nested) && nested.length > 0) {
    // 对数组里的每个元素执行 asInjected，过滤掉无效的
    // .map(asInjected) 把每个元素转换成 provider 或 null
    // .filter(Boolean) 去掉所有的 null 和 undefined
    const candidates = nested.map(asInjected).filter(Boolean) as Eip1193Provider[];

    // 优先选择 MetaMask：因为大多数用户习惯使用 MetaMask
    // 这是一个产品决策，可以根据需求调整优先级
    // .find() 方法：找到第一个满足条件的元素
    // c.isMetaMask === true 表示：这个钱包的 isMetaMask 属性是 true

    const mm = candidates.find((c) => c.isMetaMask === true);
    // 如果找到了 MetaMask，就返回它
    if (mm) return mm;

    // 如果没找到 MetaMask，返回第一个可用的钱包 provider
    // candidates[0] ?? top 的意思是：
    // - 如果 candidates[0] 存在，就用它
    // - 否则用 top（兜底方案）
    return candidates[0] ?? top;
  }

  // 如果没有 providers 数组，说明只有一个钱包
  // 直接返回顶层的 provider
  return top;
}

/**
 * 通过 EIP-6963 标准发现所有可用的钱包
 * * 这个方法做了什么事？
 *  * 1. 监听钱包的广播事件
 *  * 2. 触发一个事件让所有钱包自我介绍
 *  * 3. 收集所有钱包的信息
 *  * 4. 等待一段时间后返回结果
 * 工作原理：
 * 1. 监听 'eip6963:announceProvider' 事件
 * 2. 触发 'eip6963:requestProvider' 事件请求钱包广播
 * 3. 收集所有响应的钱包信息
 * 4. 在指定超时时间后返回结果
 *
 * @param timeoutMs 等待钱包响应的最大时间（毫秒）
 *
 * @param timeoutMs - 等待多长时间（毫秒），比如 400 表示等待 400 毫秒
 * @returns 返回一个数组，包含所有发现的钱包
 */
function discoverEip6963Candidates(timeoutMs: number): Promise<WalletCandidate[]> {
  // SSR 保护 SSR 保护：服务端没有 window，直接返回空数组
  if (typeof window === 'undefined') return Promise.resolve([]);

  // 返回一个 Promise（异步操作的结果）
  return new Promise((resolve) => {
    // 创建一个 Map 用来存储发现的钱包
    // Map 的特点：键值对存储，可以通过 key 快速查找
    // 这里用 uuid 作为 key，确保同一个钱包不会被重复添加
    // 同一个钱包可能会多次广播，我们只需要保留一份
    const byUuid = new Map<string, WalletCandidate>();

    /**
     * 当有钱包广播时的处理函数
     * 处理钱包广播事件的回调函数
     * 每当有钱包响应我们的请求时就会被调用
     * 什么时候会被调用？
     * - 每当有钱包响应我们的请求时
     * - 比如 MetaMask 会说"我是 MetaMask"，就会触发这个函数
     * event - 事件对象，包含钱包的信息
     */
    const onAnnounce = (event: Event) => {
      // 把普通的 Event 转换成 CustomEvent，并提取 detail 字段
      // CustomEvent 是浏览器的一种事件类型，可以携带自定义数据
      // detail 就是钱包传递过来的详细信息
      const { detail } = event as CustomEvent<Eip6963AnnounceDetail>;


      // 数据验证：确保必要的信息都存在
      // ?. 是可选链操作符，如果前面的值为 null/undefined，就返回 undefined
      // 比如 detail?.info?.uuid 意思是：
      // - 如果 detail 存在，且 detail.info 存在，才取 detail.info.uuid
      // - 否则返回 undefined
      // 如果没有 uuid 或者没有 provider.request，说明这个钱包信息不完整，
      if (!detail?.info?.uuid || !detail.provider?.request) return;

      // 去重检查：如果已经收录过这个钱包，就跳过
      // byUuid.has() 检查 Map 中是否已经有这个 key
      if (byUuid.has(detail.info.uuid)) return;

      // 把这个钱包添加到 Map 中
      // byUuid.set(key, value) 添加一个键值对
      byUuid.set(detail.info.uuid, {
        id: detail.info.uuid,
        // 提供默认名称以防钱包没有设置名称
        name: detail.info.name?.trim() || 'Wallet',
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
    };

    // 重要：先注册监听器，再发送请求
    // 这样可以确保不会错过快速响应的钱包
    // 监听 'eip6963:announceProvider' 事件
    // 当钱包广播时，onAnnounce 函数就会被调用
    window.addEventListener('eip6963:announceProvider', onAnnounce);

    // 第二步：触发请求事件，让所有钱包开始广播
    // dispatchEvent 发送一个事件到页面上
    // 所有监听了这个事件的钱包都会收到通知
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // 设置超时机制  设置定时器，等待一段时间后结束收集
    window.setTimeout(() => {
      // 清理工作：移除事件监听器防止内存泄漏
      window.removeEventListener('eip6963:announceProvider', onAnnounce);

      // 把 Map 转换成数组并返回给调用者
      // Array.from(byUuid.values()) 取出 Map 中所有的值，转成数组
      resolve(Array.from(byUuid.values()));
    }, timeoutMs);
  });
}

/**
 * 获取所有可连接的钱包候选列表（专为连接按钮设计）
 * 这是干什么用的？
 * - 当用户点击"连接钱包"按钮时调用这个函数
 * - 它会找出所有可用的钱包，返回一个列表
 * - 然后在 UI 上显示这个列表，让用户选择
 * 为什么需要两轮发现？
 * - 第一轮(400ms)：捕获大部分正常响应的钱包
 * - 第二轮(350ms)：捕获那些启动较慢或延迟响应的钱包
 * - 合并两轮结果可以得到更完整的钱包列表
 * 为什么要这么久？
 * - 钱包插件需要时间启动和响应
 * - 太短可能漏掉一些钱包
 * - 太长用户体验不好（要等很久）
 * - 400ms + 350ms = 750ms，不到1秒，可以接受
 */
export async function getConnectWalletCandidates(): Promise<WalletCandidate[]> {
  // SSR 保护：服务端没有 window，直接返回空数组
  if (typeof window === 'undefined') return [];

  // 执行两轮钱包发现以提高覆盖率
  // 第一轮发现：等待 400 毫秒
  const first = await discoverEip6963Candidates(400);  // 第一轮：较长时间
  // 第二轮发现：再等待 350 毫秒
  // await 表示等待这个异步操作完成后再继续
  const second = await discoverEip6963Candidates(350); // 第二轮：补充遗漏

  // 合并两轮的结果，使用 Map 自动去重
  const merged = new Map<string, WalletCandidate>();
  for (const c of [...first, ...second]) {
    // 后面的覆盖前面的，确保使用最新的信息
    // 用 id 作为 key 存入 Map
    // 如果同一个 id 出现两次，后面的会覆盖前面的
    // 这样可以确保使用最新的钱包信息
    merged.set(c.id, c);
  }

  // 对钱包列表进行排序，将 MetaMask 排在前面
  const list = Array.from(merged.values()).sort((a, b) => {
    // 评分函数：MetaMask 得分为 0，其他钱包得分为 1
    const rank = (x: WalletCandidate) =>
      x.rdns === METAMASK_RDNS || x.provider.isMetaMask === true ? 0 : 1;

    // 升序排列：得分低的(MetaMask)排在前面
    // 升序排列：分数小的排前面
    // 如果 a 是 MetaMask（0分），b 是其他（1分），0 - 1 = -1，a 排在前面
    // 如果 a 是其他（1分），b 是 MetaMask（0分），1 - 0 = 1，b 排在前面
    return rank(a) - rank(b);
  });

  // 如果发现了 EIP-6963 钱包，优先使用它们
  if (list.length > 0) return list;

  // 回退方案：尝试传统的 window.ethereum 方式
  // 如果 EIP-6963 没发现任何钱包，尝试老式的 window.ethereum
  const injected = getInjectedEthereum();
  // 如果找到了老式钱包
  if (injected) {
    // 把它包装成 WalletCandidate 格式返回
    return [
      {
        id: 'window-ethereum',
        name: '浏览器默认钱包 (window.ethereum)',
        provider: injected,
      },
    ];
  }

  // 完全没有可用钱包的情况
  return [];
}

/**
 * 轻量级的 EIP-6963 发现函数（内部使用）
 * 为什么要这个函数？
 * - 有时候我们不需要完整的 WalletCandidate 信息
 * - 只需要 provider 和 rdns 这两个字段就够了
 * - 这个函数减少了不必要的数据，更轻量
 *
 *  * 使用场景：
 *  * - resolveEthereumProvider 函数内部使用
 *  * - 不需要显示钱包名称，只需要连接钱包
 *
 * 为什么需要这个简化版本？
 * - 减少重复代码
 * - 专注于获取 provider 和 rdns 这两个最关键的信息
 * - 适用于不需要完整 WalletCandidate 结构的场景
 */
async function discoverEip6963WithRdns(
  timeoutMs: number
): Promise<{ provider: Eip1193Provider; rdns?: string }[]> {
  const rows = await discoverEip6963Candidates(timeoutMs);
  // 提取关键信息，简化数据结构
  // 提取每个钱包的 provider 和 rdns，丢弃其他字段
  // .map() 把数组里的每个元素转换成新格式
  return rows.map((r) => ({ provider: r.provider, rdns: r.rdns }));
}

/**
 * 查询当前 provider 所连接的网络链ID
 * 为什么要查链ID？
 * - 我们的应用可能只在特定的网络上运行（比如 Sepolia 测试网）
 * - 需要确认用户是否连接到了正确的网络
 * - 如果不对，可以提示用户切换网络
 *
 *  * 链ID是什么？
 *  * - 每个区块链网络都有一个唯一的 ID
 *  * - 常见网络的链ID：
 *  *   - Ethereum 主网: 1
 *  *   - Sepolia 测试网: 11155111
 *  *   - BSC 主网: 56
 *  *   - Polygon: 137
 *
 * 为什么需要这个功能？
 * - 确认用户是否连接到了正确的网络（如 Sepolia 测试网）
 * - 在网络不匹配时提示用户切换
 * - 链ID以十六进制格式返回，需要转换为十进制便于比较
 *
 *  @param rpc - 只需要 provider 的 request 方法
 *  Pick<Eip1193Provider, 'request'> 表示"只要 request 这一个方法"
 *  这样做的好处是方便测试，可以传一个模拟的对象
 * @returns 返回十进制的链ID数字
 */
export async function readWalletChainId(
  rpc: Pick<Eip1193Provider, 'request'> // 只需要 request 方法，便于测试模拟
): Promise<number> {
  // 调用标准的 eth_chainId RPC 方法
  // 返回值格式为十六进制字符串，如 "0xaa36a7" 代表 Sepolia
  // 调用 eth_chainId RPC 方法查询链ID
  // method: 'eth_chainId' 是标准的 JSON-RPC 方法名
  // params: [] 表示这个方法不需要参数

  // 返回值是十六进制字符串，比如：
  // - '0x1' 表示主网（十进制的 1）
  // - '0xaa36a7' 表示 Sepolia（十进制的 11155111）
  const hex = (await rpc.request({ method: 'eth_chainId', params: [] })) as string;

  // 将十六进制字符串转换为十进制数字
  // Number.parseInt(hex, 16) 第二个参数 16 表示按十六进制解析
  // 例如：Number.parseInt('0xaa36a7', 16) = 11155111
  return Number.parseInt(hex, 16);
}

/**
 * 智能解析钱包 provider
 *
 * 这个函数做了什么？
 * - 尝试多种方法找到一个可用的钱包
 * - 优先选择 MetaMask
 * - 按速度从快到慢尝试，避免不必要的等待
 *
 * 适用场景：
 * - 页面加载时自动恢复连接
 *  - 切换网络时需要重新获取 provider
 *  - 不需要显示钱包列表，只需要快速连接
 *
 * 解析优先级策略：
 * 1. 快速路径：已有的 MetaMask 单注入
 * 2. EIP-6963 发现的 MetaMask
 * 3. 传统方式的 MetaMask
 * 4. 任意可用的单注入
 * 5. EIP-6963 发现的其他钱包
 *
 * 为什么不直接用 getConnectWalletCandidates？
 * - 那个函数要做两轮发现，耗时 750ms，太慢了
 * - 这个函数只做一轮甚至不做，更快
 * - 适合静默操作的场景
 */
export async function resolveEthereumProvider(): Promise<Eip1193Provider | null> {
  // SSR 保护
  if (typeof window === 'undefined') return null;

  // 快速路径：检查是否已有明确的 MetaMask 注入
  const quick = getInjectedEthereum();
  // 如果 quick 存在，而且是 MetaMask，立即返回
  // 这几乎是零延迟，因为不需要等待任何异步操作
  if (quick?.isMetaMask === true) return quick; // 零等待，立即返回

  // 【次快路径】单轮 EIP-6963 发现（等待 350ms）
  // 只等一轮，比两轮快
  const announced = await discoverEip6963WithRdns(350);

  // 在 EIP-6963 结果中寻找 MetaMask
  // 在发现的结果中找 MetaMask
  const mmAnnounced = announced.find(
    (a) => a.rdns === METAMASK_RDNS || a.provider.isMetaMask === true
  );
  // 如果找到了 EIP-6963 版本的 MetaMask，返回它
  if (mmAnnounced) return mmAnnounced.provider; // 找到 EIP-6963 版本的 MetaMask

  // 再次尝试传统方式（可能不是 MetaMask）
  const injected = getInjectedEthereum();
  // 如果是 MetaMask，返回
  if (injected?.isMetaMask) return injected; // 传统方式的 MetaMask
  // 如果不是 MetaMask，但也算可用，返回
  if (injected) return injected; // 任意传统注入的钱包

  // 最后选择：EIP-6963 发现的第一个钱包
  if (announced[0]) return announced[0].provider;

  // 彻底没有找到任何可用钱包
  return null;
}
