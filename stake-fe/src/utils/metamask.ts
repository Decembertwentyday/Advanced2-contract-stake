/**
 * 调用 MetaMask 的 wallet_watchAsset，把 ERC20 加到钱包代币列表（不转账）。
 */
export async function addTokenToMetaMask(tokenData: {
  address: string;
  symbol: string;
  decimals: number;
  image?: string;
}) {
  try {
    // Next SSR：服务端没有 window，直接报错
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask未安装或未连接');
    }

    // EIP-747：用户可在弹窗确认或拒绝
    const wasAdded = await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: tokenData.address,
          symbol: tokenData.symbol,
          decimals: tokenData.decimals,
          image: tokenData.image || '',
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
    throw error;
  }
}

/** 封装 MetaNode 奖励币的 symbol/decimals，供 useRewards 扩展按钮使用 */
export async function addMetaNodeToMetaMask(metaNodeAddress: string) {
  return addTokenToMetaMask({
    address: metaNodeAddress,
    symbol: 'MetaNode',
    decimals: 18,
    image: '',
  });
}
