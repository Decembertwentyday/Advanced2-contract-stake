/**
 * 异步函数重试：缓解 RPC 偶发失败、HTTP 429 限流。
 *
 * useRewards 里每次 read 都包一层 retryWithDelay，避免公网节点抖动导致页面空白。
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>, // 要执行的异步逻辑（通常是一次 contract.pool()）
  maxRetries: number = 3, // 最多尝试次数（含首次）
  delay: number = 1000, // 普通失败时的固定等待毫秒数
): Promise<T> {
  let lastError: Error; // 记录最后一次错误，全部失败后抛出

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(); // 成功则直接返回，不再重试
    } catch (error) {
      lastError = error as Error;

      // 429 Too Many Requests：指数退避，避免连续打满 RPC
      if (error instanceof Error && error.message.includes('429')) {
        const backoffDelay = delay * Math.pow(2, i); // 1s, 2s, 4s...
        console.log(`请求被限流，等待 ${backoffDelay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      } else if (i < maxRetries - 1) {
        // 非最后一次：固定 delay 后重试
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      // 最后一次失败则循环结束，下面 throw
    }
  }

  throw lastError!; // 耗尽重试，把错误抛给调用方（useRewards 会 catch 并打日志）
}
