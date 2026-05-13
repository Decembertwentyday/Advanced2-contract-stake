/**
 * 与 MetaMask 交互：把 ERC20 代币「添加到钱包资产列表」。
 *
 * EIP-747 / wallet_watchAsset
 * - 调用 window.ethereum.request({ method: 'wallet_watchAsset', params: {...} })。
 * 这是 MetaMask 提供的官方方法，用于让用户手动添加代币到钱包界面
 * - 用户可在弹窗里拒绝；不会自动转账，只是显示代币。
 *
 * * @param tokenData - 代币信息对象
 *  * @returns Promise<boolean> - 用户是否成功添加
 *   * 重要说明：
 *  * 1. ❌ 不会自动转账或改变余额
 *  * 2. ✅ 只是在钱包界面显示该代币（方便用户查看）
 *  * 3. ⚠️ 用户可以拒绝添加（弹窗中点击取消）
 *  * 4. 🌐 仅在浏览器环境有效（SSR 时会报错）
 * SSR
 * - 仅在浏览器存在 window.ethereum；服务端直接报错提示未安装。
 */
export async function addTokenToMetaMask(tokenData: {
  address: string;  // 📍 代币合约地址（如 "0x123..."）
  symbol: string;  // 🔤 代币符号（如 "USDT"、"MetaNode"）
  decimals: number;   // 🔢 小数位数（如 18、6）
  image?: string;  // 🖼️ 代币图标 URL（可选）
}) {
  try {

    // 🔒 环境检查：确保在浏览器环境且安装了 MetaMask
    // typeof window === 'undefined'：防止服务端渲染（SSR）时报错
    // !window.ethereum：检测是否安装了 MetaMask 或其他钱包插件
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask未安装或未连接');
    }

    // 📡 调用 MetaMask 的 wallet_watchAsset API
    // 这会弹出 MetaMask 确认窗口，询问用户是否添加该代币

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
    // ✅ 根据用户操作返回结果
    // wasAdded : 点击了"添加"
    if (wasAdded) {
      // 用户在弹窗中点击了"添加"
      console.log(`${tokenData.symbol} 添加成功!`);
      return true;
    }
    // ❌ 用户在弹窗中点击了"取消"或关闭了窗口
    console.log('用户取消了添加');
    return false;
  } catch (error) {
    // ⚠️ 捕获异常情况（如网络错误、MetaMask 锁定等）
    console.error('添加token失败:', error);
    throw error;
  }
}

/** 预置 MetaNode 奖励代币的 symbol / decimals，供 useRewards 扩展功能使用 */
/**
 * 快捷函数：将 MetaNode 奖励代币添加到 MetaMask
 *
 * @param metaNodeAddress - MetaNode 代币的合约地址
 * @returns Promise<boolean> - 是否成功添加
 *
 * 设计目的：
 * 1. 简化调用：无需每次都传入 symbol、decimals 等固定参数
 * 2. 统一管理：MetaNode 代币的配置集中维护
 * 3. 便于复用：多处需要添加 MetaNode 时直接调用此函数
 *
 * 使用场景：
 * - 用户领取奖励后，提示添加到钱包以便查看余额
 * - 首页或奖励页面提供"添加到钱包"按钮
 */
export async function addMetaNodeToMetaMask(metaNodeAddress: string) {
  // 调用通用函数，传入 MetaNode 的固定配置
  return addTokenToMetaMask({
    address: metaNodeAddress, // 📍 从参数传入合约地址
    symbol: 'MetaNode', //  🔤 固定符号：MetaNode
    decimals: 18,   // 🔢 固定小数位：18（以太坊标准）
    image: '' // 🖼️ 暂无图标（可后续添加 CDN 链接
  });
}

// 这是一个用户体验优化功能，让用户可以方便地在 MetaMask 钱包中看到项目代币
// 用户点击"添加到钱包"按钮
//          ↓
// 弹出 MetaMask 确认窗口
//          ↓
// ┌─────────────────────────────┐
// │  MetaMask                   │
// │                             │
// │  添加代币？                 │
// │  ┌───────────────────────┐  │
// │  │ Symbol: MetaNode      │  │
// │  │ Address: 0x123...     │  │
// │  │ Decimals: 18          │  │
// │  └───────────────────────┘  │
// │                             │
// │  [ 取消 ]    [ 添加 ]      │
// └─────────────────────────────┘
// ↓
// 用户点击"添加" → 代币出现在钱包资产列表
// 用户点击"取消" → 什么都不发生

// 用户领取了 MetaNode 奖励
//     ↓
// 点击"添加到钱包"按钮
//     ↓
// MetaMask 弹窗一键确认
//     ↓
// 代币立即显示在资产列表
//     ↓
// 体验流畅，用户满意
