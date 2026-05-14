/**
 * 与 MetaMask 的 **非 ethers** JSON-RPC 交互：`wallet_watchAsset`（EIP-747）。
 * 用途：把奖励 ERC20 加到钱包资产列表；不涉及质押合约读写。
 *
 * SSR：`window` 不存在时抛错提示，避免服务端误调。
 */
export async function addTokenToMetaMask(tokenData: {
  address: string; // 代币合约地址
  symbol: string; // 展示符号
  decimals: number; // 小数位
  image?: string; // 可选图标 URL
}) {
  try {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask未安装或未连接'); // 无注入无法 request
    }

    const wasAdded = await window.ethereum.request({
      method: 'wallet_watchAsset', // 钱包 UI：是否添加代币；用户可拒绝
      params: {
        type: 'ERC20', // 目前主要支持 ERC20
        options: {
          address: tokenData.address,
          symbol: tokenData.symbol,
          decimals: tokenData.decimals,
          image: tokenData.image || '', // 空字符串：无图标
        },
      },
    });

    if (wasAdded) {
      console.log(`${tokenData.symbol} 添加成功!`);
      return true;
    }
    console.log('用户取消了添加');
    return false;
  } catch (error) {
    console.error('添加token失败:', error);
    throw error; // 上层可捕获决定是否 toast
  }
}

/** 预置 MetaNode 奖励代币的 symbol / decimals，供 useRewards 扩展功能使用 */
export async function addMetaNodeToMetaMask(metaNodeAddress: string) {
  return addTokenToMetaMask({
    address: metaNodeAddress, // 从链上 stakeContract.MetaNode() 读到
    symbol: 'MetaNode',
    decimals: 18,
    image: '',
  });
}
