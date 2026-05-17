/**
 * 与环境变量相关的运行时配置。
 *
 * ## NEXT_PUBLIC_STAKE_ADDRESS
 * - 质押合约部署地址；`NEXT_PUBLIC_` 前缀会在 Next.js 构建时注入**浏览器可见**的 bundle，勿放私钥。
 * - 未设置时回落为 `ZeroAddress`：`useContract` 会拒绝构造合约，避免向空地址乱发调用。
 */
/**
 * ZeroAddress: 0x0000000000000000000000000000000000000000
 * 这是以太坊的"空地址"，类似于编程中的 null 或 0
 * 为什么要导入它？ 作为默认值/兜底值，当环境变量未配置时，使用零地址可以：
 * 让代码不报错（有个合法的值）
 * 在运行时容易检测出问题（后续检查会发现是零地址并提示错误）
 */
import { ZeroAddress } from 'ethers';

// 定义一个类型，表示一个以太坊地址  必须以 0x 开头，提高代码的可读性、
// 如果随意定义一个， 可能会是hello xxxxxjfkh 这样地址就不对 会报错
export type EthAddress = `0x${string}`;

/**
 * process.env.NEXT_PUBLIC_STAKE_ADDRESS 获取环境变量中的质押合约地址
 * 为什么用 NEXT_PUBLIC_ 前缀？ Next.js 的规定：
 * NEXT_PUBLIC_ 开头的变量会打包到前端代码中，浏览器可以访问
 * 没有这个前缀的变量只在服务端可用
 * 因为这是前端项目，需要在浏览器中调用合约，所以必须用 NEXT_PUBLIC_。
 *
 * as ts 类型断言，将 process.env.NEXT_PUBLIC_STAKE_ADDRESS 转换为 EthAddress 类型。
 */
export const StakeContractAddress: EthAddress = (() => {
    const addr = process.env.NEXT_PUBLIC_STAKE_ADDRESS;

    // 验证格式 验证地址格式（40个十六进制字符）
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
        return addr as EthAddress;
    }

    // 开发环境可以警告
    if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ STAKE_ADDRESS 未配置或格式错误');
    }

    return ZeroAddress as EthAddress;
})();
