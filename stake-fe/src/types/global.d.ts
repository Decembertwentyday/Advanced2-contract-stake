/**
 * 扩展浏览器 Window，声明 window.ethereum（EIP-1193）。
 * export {} 使本文件成为模块，global 声明才合法。
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
