// scripts/deploy.js
const hre = require("hardhat");
const { ethers, upgrades } = hre;

async function main() {
  const [signer] = await ethers.getSigners()

    const MetaNodeToken = await ethers.getContractFactory('MetaNodeToken')
    const metaNodeToken = await MetaNodeToken.deploy()

    await metaNodeToken.waitForDeployment();
    const metaNodeTokenAddress = await metaNodeToken.getAddress();
    

  // 1. 获取合约工厂
  const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");

  // 2. 设置初始化参数（根据你的initialize函数）
  // 例如:
  // IERC20 _MetaNode, uint256 _startBlock, uint256 _endBlock, uint256 _MetaNodePerBlock
  // 你需要替换下面的参数为实际的MetaNode代币地址和区块参数
  // const metaNodeTokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // 替换为实际MetaNode代币地址
  const startBlock = 1; // 替换为实际起始区块
  const endBlock = 999999999999; // 替换为实际结束区块
  const metaNodePerBlock = ethers.parseUnits("1", 18); // 每区块奖励1个MetaNode（18位精度）

  // 3. 部署可升级代理合约
  const stake = await upgrades.deployProxy(
    MetaNodeStake,
    [metaNodeTokenAddress, startBlock, endBlock, metaNodePerBlock],
    { initializer: "initialize", kind: "uups" }
  );

  await stake.waitForDeployment();

  const stakeAddress = await stake.getAddress();

  // 获取实现合约地址（ERC1967 标准）
  const implAddress = await upgrades.erc1967.getImplementationAddress(stakeAddress);
  console.log("MetaNodeToken deployed to:", metaNodeTokenAddress);
  console.log("MetaNodeStake (proxy) deployed to:", stakeAddress);
  console.log("MetaNodeStake (implementation) deployed to:", implAddress);

  // 将 MetaNode 代币转入质押合约
  const tokenAmount = await metaNodeToken.balanceOf(signer.address);
  let tx = await metaNodeToken.connect(signer).transfer(stakeAddress, tokenAmount);
  await tx.wait();
  console.log("Transferred", ethers.formatUnits(tokenAmount, 18), "MetaNode tokens to stake contract");

  // 验证实现合约
  console.log("\nVerifying implementation contract...");
  try {
    await hre.run("verify:verify", {
      address: implAddress,
      constructorArguments: [],
    });
    console.log("Implementation contract verified successfully!");
  } catch (e) {
    if (e.message.includes("Already Verified")) {
      console.log("Implementation contract already verified.");
    } else {
      console.error("Verification failed:", e.message);
    }
  }

  // 验证 MetaNodeToken 合约
  console.log("\nVerifying MetaNodeToken contract...");
  try {
    await hre.run("verify:verify", {
      address: metaNodeTokenAddress,
      constructorArguments: [],
    });
    console.log("MetaNodeToken contract verified successfully!");
  } catch (e) {
    if (e.message.includes("Already Verified")) {
      console.log("MetaNodeToken contract already verified.");
    } else {
      console.error("Verification failed:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });