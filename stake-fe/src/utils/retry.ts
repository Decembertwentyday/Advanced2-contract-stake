/**
 * 异步重试：给 **HTTP RPC 读链**（eth_call 等）用，与钱包 EIP-1193 无关。
 *
 * 公链公共节点常短暂失败或返回 429；合约 view 连续失败时重试比白屏友好。
 * 429 时用指数退避，避免立刻重打加重限流。
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>, // 无参工厂：一般是 () => contract.pool()，延迟执行以便多次调用
  maxRetries: number = 3, // 默认最多试 3 次：平衡成功率与总等待时间
  delay: number = 1000 // 非 429 时线性等待基数：毫秒
): Promise<T> {
  let lastError: Error; // 循环结束后若仍失败，抛出最后一次错误

  for (let i = 0; i < maxRetries; i++) {
    // i 从 0 开始：第 1 次即首次执行 fn
    try {
      return await fn(); // 成功则立刻返回，不再重试
    } catch (error) {
      lastError = error as Error; // 记录，可能最后一轮仍失败

      if (error instanceof Error && error.message.includes('429')) {
        // Too Many Requests：等更久再试，且随 i 指数增长（1s, 2s, 4s…以 delay 为底）
        const backoffDelay = delay * Math.pow(2, i);
        console.log(`请求被限流，等待 ${backoffDelay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay)); // 让出事件循环，避免忙等
      } else if (i < maxRetries - 1) {
        // 非 429 且还有剩余次数：固定 delay 后重试（网络抖动、瞬时 JSON-RPC 错误）
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      // 最后一轮失败：不在此 throw，交给 for 外统一 throw lastError
    }
  }

  throw lastError!; // 断言非空：若从未进 catch 不会到此；实际至少 catch 过一次
}
