#!/usr/bin/env node

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Configuration
const CONFIG_FILE = path.join(__dirname, "../deployments/localhost/Procurement.json");
const RPC_URL = "http://localhost:8545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default #0

class ProcurementCLI {
  constructor() {
    this.contract = null;
    this.wallet = null;
    this.provider = null;
    this.tenderId = null;
    this.bidders = [];
  }

  async init() {
    try {
      // Charger la configuration du déploiement
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

      // Initialiser le provider et le wallet
      this.provider = new ethers.providers.JsonRpcProvider(RPC_URL);
      this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);

      // Initialiser le contrat
      this.contract = new ethers.Contract(
        config.address,
        config.abi,
        this.wallet
      );

      console.log(" Connecté au contrat Procurement à:", config.address);
      console.log(" Compte:", this.wallet.address);
      console.log(" Réseau:", config.network);
      console.log("=".repeat(50));

      return true;
    } catch (error) {
      console.error(" Erreur d'initialisation:", error.message);
      return false;
    }
  }

  async createTender() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
      console.log("\n Création d'un nouvel appel d'offres");

      const description = await question("Description du projet : ");
      const maxBudget = await question("Budget maximum (en ETH) : ");
      const bidDuration = await question("Durée de soumission (en jours) : ");
      const revealDuration = await question("Durée de révélation (en jours) : ");
      const milestoneCount = await question("Nombre de jalons : ");

      // Convertir les valeurs
      const descriptionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description));
      const maxBudgetWei = ethers.utils.parseEther(maxBudget);
      const bidDurationSec = parseInt(bidDuration) * 24 * 60 * 60;
      const revealDurationSec = parseInt(revealDuration) * 24 * 60 * 60;

      // Demander les montants des jalons
      const milestoneAmounts = [];
      for (let i = 0; i < parseInt(milestoneCount); i++) {
        const amount = await question(`Montant du jalon ${i + 1} (en ETH): `);
        milestoneAmounts.push(ethers.utils.parseEther(amount));
      }

      console.log("\n Création en cours...");

      const tx = await this.contract.createTender(
        descriptionHash,
        maxBudgetWei,
        bidDurationSec,
        revealDurationSec,
        milestoneAmounts
      );

      await tx.wait();

      // Récupérer l'ID du tender créé
      const filter = this.contract.filters.TenderCreated();
      const events = await this.contract.queryFilter(filter, "latest");
      const latestEvent = events[events.length - 1];

      this.tenderId = latestEvent.args.tenderId.toString();

      console.log(" Appel d'offres créé avec succès!");
      console.log(" ID du tender:", this.tenderId);
      console.log(" Hash description:", descriptionHash);
      console.log(" Budget maximum:", maxBudget, "ETH");
      console.log(" Deadline soumission:", new Date(Date.now() + bidDurationSec * 1000).toLocaleString());
      console.log("Jalons:", milestoneCount);

    } catch (error) {
      console.error(" Erreur:", error.message);
    } finally {
      rl.close();
    }
  }

  async submitBid() {
    if (!this.tenderId) {
      console.log(" Veuillez d'abord créer ou sélectionner un tender");
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
      console.log("\n Soumission d'une offre");

      const bidderAddress = await question("Adresse du soumissionnaire: ");
      const amount = await question("Montant de l'offre (en ETH): ");
      const nonce = ethers.utils.randomBytes(32);
      const nonceHex = ethers.utils.hexlify(nonce);

      // Créer le hash (doit correspondre à keccak256(abi.encodePacked(amount, nonce)) du contrat)
      const amountWei = ethers.utils.parseEther(amount);
      const hash = ethers.utils.solidityKeccak256(
        ["uint256", "bytes32"],
        [amountWei, nonceHex]
      );

      console.log("\n Hash généré :", hash);
      console.log(" Nonce (à conserver précieusement) :", nonceHex);
      console.log(" Montant :", amount, "ETH");

      const confirm = await question("\nConfirmer la soumission ? (o/n) : ");

      if (confirm.toLowerCase() === 'o') {
        // Changer de wallet pour simuler un autre soumissionnaire
        const bidderWallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
        const contractWithBidder = this.contract.connect(bidderWallet);

        const tx = await contractWithBidder.submitBid(this.tenderId, hash);
        await tx.wait();

        this.bidders.push({
          address: bidderAddress,
          amount: amountWei,
          nonce: nonceHex,
          hash: hash
        });

        console.log(" Offre soumise avec succès!");
        console.log(" Transaction:", tx.hash);
      } else {
        console.log(" Soumission annulée");
      }

    } catch (error) {
      console.error(" Erreur:", error.message);
    } finally {
      rl.close();
    }
  }

  async revealBid() {
    if (!this.tenderId || this.bidders.length === 0) {
      console.log(" Aucune offre à révéler");
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
      console.log("\n Révélation d'une offre");

      console.log("\n Offres disponibles :");
      this.bidders.forEach((bidder, index) => {
        console.log(`${index + 1}. ${bidder.address} - Hash : ${bidder.hash.substring(0, 20)}...`);
      });

      const choice = await question("\nChoisir une offre à révéler (numéro) : ");
      const index = parseInt(choice) - 1;

      if (index < 0 || index >= this.bidders.length) {
        console.log(" Choix invalide");
        return;
      }

      const bidder = this.bidders[index];

      // Changer de wallet pour révéler
      const bidderWallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
      const contractWithBidder = this.contract.connect(bidderWallet);

      console.log("\n Révélation en cours...");

      const tx = await contractWithBidder.revealBid(
        this.tenderId,
        bidder.amount,
        bidder.nonce
      );

      await tx.wait();

      console.log(" Offre révélée avec succès!");
      console.log(" Transaction:", tx.hash);
      console.log(" Montant révélé:", ethers.utils.formatEther(bidder.amount), "ETH");

    } catch (error) {
      console.error(" Erreur:", error.message);
    } finally {
      rl.close();
    }
  }

  async selectWinner() {
    if (!this.tenderId) {
      console.log(" Veuillez d'abord créer un tender");
      return;
    }

    try {
      console.log("\n Sélection du gagnant...");

      const tx = await this.contract.selectWinner(this.tenderId);
      await tx.wait();

      // Récupérer l'événement WinnerSelected
      const filter = this.contract.filters.WinnerSelected(this.tenderId);
      const events = await this.contract.queryFilter(filter, "latest");

      if (events.length > 0) {
        const event = events[0];
        console.log(" Gagnant sélectionné !");
        console.log(" Gagnant :", event.args.winner);
        console.log(" Montant gagnant :", ethers.utils.formatEther(event.args.winningAmount), "ETH");
        console.log(" Transaction :", tx.hash);
      }

    } catch (error) {
      console.error(" Erreur:", error.message);
    }
  }

  async approveMilestone() {
    if (!this.tenderId) {
      console.log(" Veuillez d'abord créer un tender");
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
      console.log("\n Approbation d'un jalon");

      const milestoneId = await question("ID du jalon (commençant par 0) : ");

      console.log("\n Approbation en cours...");

      const tx = await this.contract.approveMilestone(this.tenderId, milestoneId);
      await tx.wait();

      console.log(" Jalon approuvé avec succès!");
      console.log(" Transaction:", tx.hash);

    } catch (error) {
      console.error(" Erreur:", error.message);
    } finally {
      rl.close();
    }
  }

  async releasePayment() {
    if (!this.tenderId) {
      console.log(" Veuillez d'abord créer un tender");
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
      console.log("\n Paiement d'un jalon");

      const milestoneId = await question("ID du jalon (commençant par 0) : ");

      // Vérifier le solde du contrat
      const contractBalance = await this.provider.getBalance(this.contract.address);
      console.log(" Solde du contrat :", ethers.utils.formatEther(contractBalance), "ETH");

      const confirm = await question("\nConfirmer le paiement ? (o/n) : ");

      if (confirm.toLowerCase() === 'o') {
        console.log("\n Paiement en cours...");

        const tx = await this.contract.releasePayment(this.tenderId, milestoneId);
        await tx.wait();

        console.log(" Paiement effectué avec succès!");
        console.log(" Transaction:", tx.hash);
      } else {
        console.log(" Paiement annulé");
      }

    } catch (error) {
      console.error(" Erreur:", error.message);
    } finally {
      rl.close();
    }
  }

  async getTenderInfo() {
    if (!this.tenderId) {
      console.log(" Veuillez d'abord créer un tender");
      return;
    }

    try {
      console.log("\n Informations du tender", this.tenderId);

      const tenderInfo = await this.contract.getTender(this.tenderId);

      console.log(" Hash description :", tenderInfo[0]);
      console.log(" Budget maximum :", ethers.utils.formatEther(tenderInfo[1]), "ETH");
      console.log(" Deadline soumission :", new Date(tenderInfo[2] * 1000).toLocaleString());
      console.log(" Deadline révélation :", new Date(tenderInfo[3] * 1000).toLocaleString());
      console.log(" Gagnant :", tenderInfo[4]);
      console.log(" Actif :", tenderInfo[5]);

      // Afficher les jalons
      const milestones = tenderInfo[6];
      console.log("\n Jalons:");
      for (let i = 0; i < milestones.length; i++) {
        console.log(`  ${i}. ${ethers.utils.formatEther(milestones[i])} ETH`);
      }

    } catch (error) {
      console.error(" Erreur:", error.message);
    }
  }

  async displayMenu() {
    console.log("\n" + "=".repeat(50));
    console.log("  SYSTÈME DE SUIVI DES MARCHÉS PUBLICS - CLI");
    console.log("=".repeat(50));

    if (this.tenderId) {
      console.log(` Tender actif: #${this.tenderId}`);
    }

    console.log("\n  MENU PRINCIPAL:");
    console.log("1.  Créer un nouvel appel d'offres");
    console.log("2.  Soumettre une offre");
    console.log("3.  Révéler une offre");
    console.log("4.  Sélectionner le gagnant");
    console.log("5.  Approuver un jalon");
    console.log("6.  Payer un jalon");
    console.log("7.  Afficher les infos du tender");
    console.log("8.  Changer de tender");
    console.log("0.  Quitter");

    console.log("\n" + "-".repeat(50));
  }

  async run() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    // Initialiser la connexion
    const initialized = await this.init();
    if (!initialized) {
      console.log("Impossible d'initialiser la CLI");
      rl.close();
      return;
    }

    let running = true;

    while (running) {
      await this.displayMenu();

      try {
        const choice = await question("\n Votre choix : ");

        switch (choice) {
          case '1':
            await this.createTender();
            break;
          case '2':
            await this.submitBid();
            break;
          case '3':
            await this.revealBid();
            break;
          case '4':
            await this.selectWinner();
            break;
          case '5':
            await this.approveMilestone();
            break;
          case '6':
            await this.releasePayment();
            break;
          case '7':
            await this.getTenderInfo();
            break;
          case '8':
            this.tenderId = await question("Nouvel ID de l'appel d'offres : ");
            console.log(" Appel d'offres changé :", this.tenderId);
            break;
          case '0':
            running = false;
            console.log("\n Au revoir!");
            break;
          default:
            console.log(" Choix invalide");
        }
      } catch (error) {
        console.error(" Erreur:", error.message);
      }
    }

    rl.close();
  }
}

// Lancer la CLI
if (require.main === module) {
  const cli = new ProcurementCLI();
  cli.run().catch(console.error);
}

module.exports = ProcurementCLI;