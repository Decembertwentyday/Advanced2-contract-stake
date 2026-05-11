/**
 * 与「连接钱包」相关的**固定文案**（环境提示），与 RPC、合约无关。
 *
 * 从 `WalletConnectPrompt` / `Header` 引用，避免在多处硬编码相同段落。
 * 内容对应「多浏览器钱包扩展同时启用时抢占 window.ethereum」的用户侧处理方式。
 */
export const MULTI_WALLET_ENV_HINT =
  '若安装了多个钱包扩展（OKX、Coinbase 等），请只启用一个或暂时关闭其它扩展，然后刷新页面再点连接。';
