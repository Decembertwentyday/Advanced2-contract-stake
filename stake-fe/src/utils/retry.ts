/**
 * 异步重试工具：缓解 RPC 短暂失败、HTTP 429 限流。
 *
 * 使用场景：useRewards 里多次 read；公链节点不稳定时，连续试几次比直接报错体验更好。
 *
 * 指数退避（429）
 * - 服务端返回 Too Many Requests 时，等待时间随重试次数指数增长，避免雪崩式打满 RPC。
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error && error.message.includes('429')) {
        const backoffDelay = delay * Math.pow(2, i);
        console.log(`请求被限流，等待 ${backoffDelay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
