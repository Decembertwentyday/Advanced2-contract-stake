  /**
   * Sepolia **只读** HTTP 入口：不经过浏览器钱包，与「连接 MetaMask」无关。
   *
   * FallbackProvider：多个 JsonRpcProvider 并联，单点故障/限流时换节点再问。
   * staticNetwork：告诉 ethers「链 ID 已知」，跳过反复 eth_chainId 探测（避免控制台刷屏）。
   */
  import { FallbackProvider, JsonRpcProvider, Network } from 'ethers'; // JsonRpcProvider：单 URL HTTP；FallbackProvider：聚合多个
  import { SEPOLIA_CHAIN_ID } from '../config/chain'; // 十进制 11155111，与链上 chainId 一致

  // Network.from：构造 ethers 的链描述对象；与子 JsonRpcProvider 的 staticNetwork 用同一对象引用更稳
  const SEPOLIA_NETWORK = Network.from(SEPOLIA_CHAIN_ID);

  /**
   * 按优先级返回 RPC URL 列表：有私钥 Infura 时优先自己的节点，否则全用公共节点。
   */
  function sepoliaRpcUrls(): string[] {
    // process 在 Next 服务端/客户端构建时均可能存在；无 env 时用 undefined
    const infuraKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_INFURA_API_KEY : undefined;
    const publicRpcs = [
      'https://ethereum-sepolia-rpc.publicnode.com', // 公共节点 1
      'https://1rpc.io/sepolia', // 公共节点 2
      'https://sepolia.drpc.org', // 公共节点 3
    ];
    if (infuraKey) {
      // 自己的 Infura key 放最前：配额可控、延迟通常更好；后面公共 URL 作后备
      return [`https://sepolia.infura.io/v3/${infuraKey}`, ...publicRpcs];
    }
    return publicRpcs; // 无 key：避免写死无效 key 导致第一个子 Provider 永远失败
  }

  /**
   * 创建全站共享的只读 Provider（在 Web3Provider 里 useMemo 一次）。
   * quorum: 1 表示读操作只要有一个子节点返回即可（不必多节点交叉验证）。
   *
   * JsonRpcProvider 是 ethers.js 提供的一个类，用于与以太坊节点进行通信。创建一个可读的只读 Provider，
   *  每个 JsonRpcProvider 实例代表一个具体的 RPC 节点连接，可以执行以下操作：
   * 读取链上数据：如查询余额、合约状态、交易信息等
   * 发送交易：提交交易到网络
   * 监听事件：监听区块或合约事件
   * 在这段代码中，创建了多个 JsonRpcProvider 实例，每个都连接到不同的 RPC URL（从 urls 数组中获取），这样可以有多个节点作为备选。
   */
  export function createSepoliaReadProvider(): FallbackProvider {
    const urls = sepoliaRpcUrls(); // 字符串 URL 列表
    // 每个 URL 对应一个子 JsonRpcProvider；FallbackProvider 会按 weight/超时调度
    const configs = urls.map((url) => ({
      provider: new JsonRpcProvider(url, SEPOLIA_NETWORK, {
        staticNetwork: SEPOLIA_NETWORK, // 固定链：跳过 provider._network 自举循环
      }),
      weight: 1, // 权重相同：轮流/择优由 FallbackProvider 内部策略决定
      stallTimeout: 1500, // 子请求 stall 判定：毫秒，过短易误判，过长拖慢回退
    }));
    // 第二参传 chainId：帮助 Fallback 做网络匹配；quorum 1 适合读 dApp
    // 返回是一个可读的Provider, 可以进行读取余额，查询合约状态
    // quorum: 1 表示只需要 1 个节点成功响应即可，这非常适合只读场景（不需要共识验证）
    //   这个 provider 可以用于查询余额、合约状态等只读操作
    // 由于使用了 fallback 机制，即使某些 RPC 节点不可用，应用仍然能正常工作
    return new FallbackProvider(configs, SEPOLIA_CHAIN_ID, { quorum: 1 });
  }
