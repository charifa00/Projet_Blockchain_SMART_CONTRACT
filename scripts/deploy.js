const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log(" Déploiement du contrat Procurement...");
  
  const Procurement = await hre.ethers.getContractFactory("Procurement");
  const procurement = await Procurement.deploy();
  
  await procurement.deployed();
  
  console.log("Contrat déployé à l'adresse:", procurement.address);
  
  // Sauvegarde de l'adresse et de l'ABI
  const contractData = {
    address: procurement.address,
    abi: JSON.parse(procurement.interface.format("json")),
    deployer: await procurement.signer.getAddress(),
    network: hre.network.name,
    timestamp: new Date().toISOString()
  };
  
  const deployDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  
  const networkDir = path.join(deployDir, hre.network.name);
  if (!fs.existsSync(networkDir)) {
    fs.mkdirSync(networkDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(networkDir, "Procurement.json"),
    JSON.stringify(contractData, null, 2)
  );
  
  console.log(" Données de déploiement sauvegardées dans:", path.join(networkDir, "Procurement.json"));
  
  return procurement.address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(" Erreur lors du déploiement:", error);
    process.exit(1);
  });