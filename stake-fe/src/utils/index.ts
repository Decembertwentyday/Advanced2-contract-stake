/**
 * 业务常量：质押池 ID（Pool Id）。
 *
 * 合约里用 uint256 区分多个池（例如池 0 = ETH，池 1 = 某 ERC20）。
 * 前端写死 Pid = 0，表示所有 deposit / claim / unstake 都操作「第 0 号池」。
 * 若以后支持多池下拉框，应把本常量改成 useState 或路由参数。
 */
export const Pid = 0; // 与部署合约时创建的池索引一致
