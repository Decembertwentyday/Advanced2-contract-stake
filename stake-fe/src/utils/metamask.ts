/**
 * 与 MetaMask 交互：把 ERC20 代币「添加到钱包资产列表」。
 *
 * EIP-747 / wallet_watchAsset
 * - 调用 window.ethereum.request({ method: 'wallet_watchAsset', params: {...} })。
 * - 用户可在弹窗里拒绝；不会自动转账，只是显示代币。
 *
 * SSR
 * - 仅在浏览器存在 window.ethereum；服务端直接报错提示未安装。
 */
export async function addTokenToMetaMask(tokenData: {
  address: string;
  symbol: string;
  decimals: number;
  image?: string;
}) {
  try {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask未安装或未连接');
    }

    const wasAdded = await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: tokenData.address,
          symbol: tokenData.symbol,
          decimals: tokenData.decimals,
          image: tokenData.image || ''
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

/** 预置 MetaNode 奖励代币的 symbol / decimals，供 useRewards 扩展功能使用 */
export async function addMetaNodeToMetaMask(metaNodeAddress: string) {
  return addTokenToMetaMask({
    address: metaNodeAddress,
    symbol: 'MetaNode',
    decimals: 18,
    image: ''
  });
}
