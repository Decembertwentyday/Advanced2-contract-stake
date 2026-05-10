/**
 * 扩展 Window 类型：注入浏览器钱包（EIP-1193 Provider）。
 *
 * 为什么需要 declare global？
 * - TypeScript 默认不知道 window.ethereum；在 metamask.ts 里调用会报类型错误。
 *
 * export {}
 * - 让本文件成为「模块」而非「脚本」，从而是合法的 ambient 声明文件。
 */
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params: any }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}

export {};
