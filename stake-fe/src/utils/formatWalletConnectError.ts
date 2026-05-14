/**
 * 格式化 **连接钱包阶段**（EIP-1193 request）的错误文案；与 ethers HTTP 读链错误不同源。
 *
 * ethers 抛出的错误里常嵌套 `code` / `message`；本文件扁平提取后映射成中文短句。
 */
/** EIP-1193：用户拒绝请求（点「取消」或关闭弹窗） */
const USER_REJECTED = 4001;

/**
 * 深度遍历 err：收集所有数字 code 与字符串 message/reason，拼成 text 做小写关键词匹配。
 * depth 限制：防循环引用栈溢出。
 */
function collectCodesAndMessages(err: unknown): { codes: number[]; text: string } {
  const codes: number[] = []; // 收集到的 EIP 错误码列表（可能多层重复）
  const parts: string[] = []; // 收集到的可读片段

  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return; // 终止：过深或空
    if (typeof v === 'string') {
      parts.push(v); // 纯字符串也作为匹配文本
      return;
    }
    if (typeof v !== 'object') return; // number/boolean 等不再下钻
    const o = v as Record<string, unknown>;
    if (typeof o.code === 'number') codes.push(o.code); // 典型：4001, 4902
    if (typeof o.message === 'string') parts.push(o.message); // 钱包返回的英文描述
    if (typeof o.reason === 'string') parts.push(o.reason); // 部分钱包用 reason
    if (o.info !== undefined) walk(o.info, depth + 1); // ethers 常包一层 info
    if (o.error !== undefined) walk(o.error, depth + 1); // 嵌套 error 对象
  };

  walk(err, 0); // 从顶层开始
  if (err instanceof Error && err.message) parts.push(err.message); // 最外层 Error.message

  return { codes, text: parts.join(' ').toLowerCase() }; // 转小写：匹配时忽略大小写差异
}

/**
 * 对外导出：把任意 unknown 错误变成适合 setError 展示的一句中文。
 */
export function formatWalletConnectError(err: unknown): string {
  const { codes, text } = collectCodesAndMessages(err); // 先结构化提取

  const rejected =
    codes.includes(USER_REJECTED) || // 标准码
    text.includes('4001') || // 部分实现只把码写进字符串
    text.includes('action_rejected') || // MetaMask 等常用短语
    text.includes('user rejected') ||
    text.includes('user denied');

  if (rejected) {
    if (
      text.includes('at least one account') ||
      text.includes('must has at least') ||
      text.includes('must have at least')
    ) {
      // 与「无账户 / 多扩展抢注」等场景文案接近：给用户可操作的排查建议
      return '无法连接：钱包里没有可用账户，或您在弹窗中点了「拒绝」。若 MetaMask 里已有账户，多半是多个钱包扩展冲突，请只启用一个扩展或关闭其它钱包后刷新页面再试。仍无法连接时，请在 MetaMask 中确认已解锁并在弹窗中授权。';
    }
    return '已取消连接：请在钱包弹窗中点击确认授权；若未看到弹窗，请检查浏览器是否拦截了扩展弹窗。';
  }

  if (codes.includes(4902) || text.includes('4902')) {
    // 4902：链未添加；ensureSepolia 会尝试 addChain，此处给兜底说明
    return '当前网络未添加 Sepolia，请按提示添加或手动在钱包中添加 Sepolia 测试网。';
  }

  const raw = err instanceof Error ? err.message : String(err); // 非拒绝类：尽量保留原始信息
  return raw.length > 220 ? '连接失败，请检查钱包是否已解锁、扩展是否正常后重试。' : raw; // 过长则截断式兜底，避免撑爆 UI
}
