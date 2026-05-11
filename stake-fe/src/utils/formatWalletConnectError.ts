/**
 * 钱包连接阶段错误文案格式化（与「HTTP 读链 RPC」无关）。
 *
 * ## 背景：为什么需要这个文件？
 * - ethers v6 在 `eth_requestAccounts` 失败时，常抛出嵌套对象 + 长 `Error.message`，直接 `setError(e.message)` 会铺满 UI。
 * - 同一类失败（例如 EIP-1193 的 4001）在不同钱包/版本下字符串细节不同，需要归一化成用户可读的中文。
 *
 * ## 和 RPC（JsonRpcProvider）的区别
 * - **连接钱包**：走浏览器扩展注入的 `provider.request`（EIP-1193），失败由本文件处理。
 * - **读合约/余额**：走 `FallbackProvider` + HTTP RPC，失败表现为读不到数据或节点日志，**不应**与「点连接」的红字混为一谈。
 *
 * ## 常见错误码（EIP-1193）
 * - `4001`：用户拒绝请求（User Rejected Request），在 MetaMask 里也可能在「多扩展冲突 / 无可用账户」等场景下出现。
 * - `4902`：钱包里没有目标链，需 `wallet_addEthereumChain`（本应用在 ensureSepolia 里处理）。
 */

/** EIP-1193 标准：用户拒绝请求 */
const USER_REJECTED = 4001;

/**
 * 深度遍历未知结构的错误对象，收集所有 `code` 与文本字段，拼成一段小写文本便于匹配。
 *
 * 原因：ethers 会把钱包返回包进 `info.error` 等层级，`instanceof Error` 只能拿到最外层 message。
 *
 * @param depth - 防止循环引用导致栈溢出，超过 6 层停止下钻。
 */
function collectCodesAndMessages(err: unknown): { codes: number[]; text: string } {
  const codes: number[] = [];
  const parts: string[] = [];

  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') {
      parts.push(v);
      return;
    }
    if (typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.code === 'number') codes.push(o.code);
    if (typeof o.message === 'string') parts.push(o.message);
    if (typeof o.reason === 'string') parts.push(o.reason);
    if (o.info !== undefined) walk(o.info, depth + 1);
    if (o.error !== undefined) walk(o.error, depth + 1);
  };

  walk(err, 0);
  if (err instanceof Error && err.message) parts.push(err.message);

  return { codes, text: parts.join(' ').toLowerCase() };
}

/**
 * 将钱包 / ethers 抛出的错误转成简短可读中文。
 *
 * 匹配策略（按顺序）：
 * 1. 若判定为「用户拒绝 / 4001」且文案含「无账户 / must have at least one account」→ 合并**无账户、点拒绝、多扩展冲突**三类提示（实际场景中扩展冲突常被映射成类似文案）。
 * 2. 若仅为「拒绝」而无账户子串 → 引导检查弹窗与浏览器拦截。
 * 3. `4902` → Sepolia 未添加。
 * 4. 其它 → 短消息或截断后的兜底句。
 */
export function formatWalletConnectError(err: unknown): string {
  const { codes, text } = collectCodesAndMessages(err);

  const rejected =
    codes.includes(USER_REJECTED) ||
    text.includes('4001') ||
    text.includes('action_rejected') ||
    text.includes('user rejected') ||
    text.includes('user denied');

  if (rejected) {
    if (
      text.includes('at least one account') ||
      text.includes('must has at least') ||
      text.includes('must have at least')
    ) {
      return '无法连接：钱包里没有可用账户，或您在弹窗中点了「拒绝」。若 MetaMask 里已有账户，多半是多个钱包扩展冲突，请只启用一个扩展或关闭其它钱包后刷新页面再试。仍无法连接时，请在 MetaMask 中确认已解锁并在弹窗中授权。';
    }
    return '已取消连接：请在钱包弹窗中点击确认授权；若未看到弹窗，请检查浏览器是否拦截了扩展弹窗。';
  }

  if (codes.includes(4902) || text.includes('4902')) {
    return '当前网络未添加 Sepolia，请按提示添加或手动在钱包中添加 Sepolia 测试网。';
  }

  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > 220 ? '连接失败，请检查钱包是否已解锁、扩展是否正常后重试。' : raw;
}
