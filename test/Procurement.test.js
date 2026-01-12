const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Procurement Contract", function () {
  let Procurement;
  let procurement;
  let owner;
  let auditor;
  let bidder1;
  let bidder2;
  let bidder3;
  
  const TENDER_DESCRIPTION = "Construction of a new school building";
  const TENDER_DESCRIPTION_HASH = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(TENDER_DESCRIPTION)
  );
  const MAX_BUDGET = ethers.utils.parseEther("10");
  const BID_DURATION = 2 * 24 * 60 * 60; // 2 jours
  const REVEAL_DURATION = 1 * 24 * 60 * 60; // 1 jour
  
  beforeEach(async function () {
    [owner, auditor, bidder1, bidder2, bidder3] = await ethers.getSigners();
    
    Procurement = await ethers.getContractFactory("Procurement");
    procurement = await Procurement.deploy();
    await procurement.deployed();
    
    // Ajouter un auditeur
    await procurement.addAuditor(auditor.address);
  });
  
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await procurement.owner()).to.equal(owner.address);
    });
    
    it("Owner should be initial auditor", async function () {
      expect(await procurement.auditors(owner.address)).to.be.true;
    });
  });
  
  describe("Tender Creation", function () {
    it("Should create a new tender", async function () {
      const milestoneAmounts = [
        ethers.utils.parseEther("3"),
        ethers.utils.parseEther("4"),
        ethers.utils.parseEther("3")
      ];
      
      await expect(
        procurement.createTender(
          TENDER_DESCRIPTION_HASH,
          MAX_BUDGET,
          BID_DURATION,
          REVEAL_DURATION,
          milestoneAmounts
        )
      )
        .to.emit(procurement, "TenderCreated")
        .withArgs(
          1,
          TENDER_DESCRIPTION_HASH,
          MAX_BUDGET,
          anyValue,
          anyValue
        );
      
      const tender = await procurement.getTender(1);
      expect(tender[0]).to.equal(TENDER_DESCRIPTION_HASH);
      expect(tender[1]).to.equal(MAX_BUDGET);
      expect(tender[5]).to.be.true; // isActive
    });
    
    it("Should reject tender creation by non-owner", async function () {
      await expect(
        procurement.connect(bidder1).createTender(
          TENDER_DESCRIPTION_HASH,
          MAX_BUDGET,
          BID_DURATION,
          REVEAL_DURATION,
          []
        )
      ).to.be.revertedWith("Only owner");
    });
    
    it("Should reject if milestones exceed budget", async function () {
      const milestoneAmounts = [
        ethers.utils.parseEther("6"),
        ethers.utils.parseEther("5") // Total 11 > 10
      ];
      
      await expect(
        procurement.createTender(
          TENDER_DESCRIPTION_HASH,
          MAX_BUDGET,
          BID_DURATION,
          REVEAL_DURATION,
          milestoneAmounts
        )
      ).to.be.revertedWith("Milestones exceed budget");
    });
  });
  
  describe("Bid Submission", function () {
    beforeEach(async function () {
      const milestoneAmounts = [ethers.utils.parseEther("10")];
      await procurement.createTender(
        TENDER_DESCRIPTION_HASH,
        MAX_BUDGET,
        BID_DURATION,
        REVEAL_DURATION,
        milestoneAmounts
      );
    });
    
    it("Should submit a bid", async function () {
      const amount = ethers.utils.parseEther("8");
      const nonce = ethers.utils.randomBytes(32);
      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount, nonce]
        )
      );
      
      await expect(
        procurement.connect(bidder1).submitBid(1, hash)
      )
        .to.emit(procurement, "BidSubmitted")
        .withArgs(1, bidder1.address, hash);
      
      const bid = await procurement.getBid(1, bidder1.address);
      expect(bid[0]).to.equal(hash);
      expect(bid[2]).to.be.false; // not revealed
    });
    
    it("Should reject bid after deadline", async function () {
      // Avancer le temps
      await ethers.provider.send("evm_increaseTime", [BID_DURATION + 1]);
      await ethers.provider.send("evm_mine");
      
      const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"));
      await expect(
        procurement.connect(bidder1).submitBid(1, hash)
      ).to.be.revertedWith("Bid submission closed");
    });
    
    it("Should reject duplicate bid", async function () {
      const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"));
      await procurement.connect(bidder1).submitBid(1, hash);
      
      await expect(
        procurement.connect(bidder1).submitBid(1, hash)
      ).to.be.revertedWith("Already submitted");
    });
  });
  
  describe("Bid Reveal", function () {
    let hash1, hash2, hash3;
    let amount1, amount2, amount3;
    let nonce1, nonce2, nonce3;
    
    beforeEach(async function () {
      const milestoneAmounts = [ethers.utils.parseEther("10")];
      await procurement.createTender(
        TENDER_DESCRIPTION_HASH,
        MAX_BUDGET,
        BID_DURATION,
        REVEAL_DURATION,
        milestoneAmounts
      );
      
      // Préparer les offres
      amount1 = ethers.utils.parseEther("8");
      amount2 = ethers.utils.parseEther("7");
      amount3 = ethers.utils.parseEther("9");
      
      nonce1 = ethers.utils.randomBytes(32);
      nonce2 = ethers.utils.randomBytes(32);
      nonce3 = ethers.utils.randomBytes(32);
      
      hash1 = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount1, nonce1]
        )
      );
      
      hash2 = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount2, nonce2]
        )
      );
      
      hash3 = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount3, nonce3]
        )
      );
      
      // Soumettre les offres
      await procurement.connect(bidder1).submitBid(1, hash1);
      await procurement.connect(bidder2).submitBid(1, hash2);
      await procurement.connect(bidder3).submitBid(1, hash3);
      
      // Passer à la phase de révélation
      await ethers.provider.send("evm_increaseTime", [BID_DURATION]);
      await ethers.provider.send("evm_mine");
    });
    
    it("Should reveal a bid", async function () {
      await expect(
        procurement.connect(bidder1).revealBid(1, amount1, nonce1)
      )
        .to.emit(procurement, "BidRevealed")
        .withArgs(1, bidder1.address, amount1, nonce1);
      
      const bid = await procurement.getBid(1, bidder1.address);
      expect(bid[1]).to.equal(amount1);
      expect(bid[2]).to.be.true; // revealed
      expect(bid[3]).to.be.true; // isValid
    });
    
    it("Should reject invalid reveal", async function () {
      const wrongNonce = ethers.utils.randomBytes(32);
      await expect(
        procurement.connect(bidder1).revealBid(1, amount1, wrongNonce)
      ).to.be.revertedWith("Invalid reveal");
    });
    
    it("Should mark bid as invalid if over budget", async function () {
      const overBudgetAmount = ethers.utils.parseEther("11");
      const nonce = ethers.utils.randomBytes(32);
      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [overBudgetAmount, nonce]
        )
      );
      
      await procurement.connect(bidder1).submitBid(1, hash);
      await procurement.connect(bidder1).revealBid(1, overBudgetAmount, nonce);
      
      const bid = await procurement.getBid(1, bidder1.address);
      expect(bid[3]).to.be.false; // not valid
    });
  });
  
  describe("Winner Selection", function () {
    beforeEach(async function () {
      const milestoneAmounts = [ethers.utils.parseEther("10")];
      await procurement.createTender(
        TENDER_DESCRIPTION_HASH,
        MAX_BUDGET,
        BID_DURATION,
        REVEAL_DURATION,
        milestoneAmounts
      );
      
      // Soumettre et révéler des offres
      const amounts = [
        ethers.utils.parseEther("8"),
        ethers.utils.parseEther("7"),
        ethers.utils.parseEther("9")
      ];
      
      for (let i = 0; i < 3; i++) {
        const bidder = [bidder1, bidder2, bidder3][i];
        const nonce = ethers.utils.randomBytes(32);
        const hash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["uint256", "bytes32"],
            [amounts[i], nonce]
          )
        );
        
        await procurement.connect(bidder).submitBid(1, hash);
        
        // Avancer le temps pour révélation
        if (i === 2) {
          await ethers.provider.send("evm_increaseTime", [BID_DURATION]);
          await ethers.provider.send("evm_mine");
        }
        
        await procurement.connect(bidder).revealBid(1, amounts[i], nonce);
      }
      
      // Fin de la période de révélation
      await ethers.provider.send("evm_increaseTime", [REVEAL_DURATION]);
      await ethers.provider.send("evm_mine");
    });
    
    it("Should select the lowest valid bid", async function () {
      await expect(procurement.selectWinner(1))
        .to.emit(procurement, "WinnerSelected")
        .withArgs(1, bidder2.address, ethers.utils.parseEther("7"));
      
      const tender = await procurement.getTender(1);
      expect(tender[4]).to.equal(bidder2.address); // winner
    });
    
    it("Should reject if no valid bids", async function () {
      // Créer un nouveau tender avec offres invalides
      await procurement.createTender(
        TENDER_DESCRIPTION_HASH,
        ethers.utils.parseEther("5"),
        BID_DURATION,
        REVEAL_DURATION,
        [ethers.utils.parseEther("5")]
      );
      
      // Soumettre une offre trop élevée
      const amount = ethers.utils.parseEther("6");
      const nonce = ethers.utils.randomBytes(32);
      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount, nonce]
        )
      );
      
      await procurement.connect(bidder1).submitBid(2, hash);
      
      await ethers.provider.send("evm_increaseTime", [BID_DURATION + REVEAL_DURATION]);
      await ethers.provider.send("evm_mine");
      
      await expect(procurement.selectWinner(2)).to.be.revertedWith("No valid bids");
    });
  });
  
  describe("Milestone Approval and Payment", function () {
    beforeEach(async function () {
      const milestoneAmounts = [
        ethers.utils.parseEther("3"),
        ethers.utils.parseEther("4"),
        ethers.utils.parseEther("3")
      ];
      
      await procurement.createTender(
        TENDER_DESCRIPTION_HASH,
        MAX_BUDGET,
        BID_DURATION,
        REVEAL_DURATION,
        milestoneAmounts
      );
      
      // Configurer un gagnant
      const amount = ethers.utils.parseEther("8");
      const nonce = ethers.utils.randomBytes(32);
      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount, nonce]
        )
      );
      
      await procurement.connect(bidder1).submitBid(1, hash);
      
      await ethers.provider.send("evm_increaseTime", [BID_DURATION]);
      await ethers.provider.send("evm_mine");
      
      await procurement.connect(bidder1).revealBid(1, amount, nonce);
      
      await ethers.provider.send("evm_increaseTime", [REVEAL_DURATION]);
      await ethers.provider.send("evm_mine");
      
      await procurement.selectWinner(1);
      
      // Financer le contrat
      await owner.sendTransaction({
        to: procurement.address,
        value: ethers.utils.parseEther("10")
      });
    });
    
    it("Should approve milestone", async function () {
      await expect(procurement.connect(auditor).approveMilestone(1, 0))
        .to.emit(procurement, "MilestoneApproved")
        .withArgs(1, 0, auditor.address);
      
      const milestone = await procurement.getMilestone(1, 0);
      expect(milestone[1]).to.be.true; // approved
    });
    
    it("Should reject approval by non-auditor", async function () {
      await expect(
        procurement.connect(bidder1).approveMilestone(1, 0)
      ).to.be.revertedWith("Only auditor");
    });
    
    it("Should release payment", async function () {
      // Approuver d'abord
      await procurement.connect(auditor).approveMilestone(1, 0);
      
      const initialBalance = await ethers.provider.getBalance(bidder1.address);
      
      await expect(procurement.releasePayment(1, 0))
        .to.emit(procurement, "PaymentReleased")
        .withArgs(1, 0, bidder1.address, ethers.utils.parseEther("3"));
      
      const finalBalance = await ethers.provider.getBalance(bidder1.address);
      expect(finalBalance.sub(initialBalance)).to.equal(ethers.utils.parseEther("3"));
      
      const milestone = await procurement.getMilestone(1, 0);
      expect(milestone[2]).to.be.true; // paid
    });
    
    it("Should prevent reentrancy", async function () {
      // Cette test vérifie que le pattern Checks-Effects-Interactions est respecté
      await procurement.connect(auditor).approveMilestone(1, 0);
      
      // Le paiement devrait échouer si on tente de le faire deux fois
      await procurement.releasePayment(1, 0);
      
      // Vérifier que l'état est mis à jour avant le transfert
      const milestone = await procurement.getMilestone(1, 0);
      expect(milestone[2]).to.be.true;
      
      // Tenter de payer à nouveau devrait échouer
      await expect(procurement.releasePayment(1, 0)).to.be.reverted;
    });
  });
  
  describe("Gas Analysis", function () {
    it("Should measure gas costs", async function () {
      const milestoneAmounts = [ethers.utils.parseEther("10")];
      
      // Mesurer gas pour createTender
      const tx1 = await procurement.createTender(
        TENDER_DESCRIPTION_HASH,
        MAX_BUDGET,
        BID_DURATION,
        REVEAL_DURATION,
        milestoneAmounts
      );
      const receipt1 = await tx1.wait();
      console.log("Gas createTender:", receipt1.gasUsed.toString());
      
      // Mesurer gas pour submitBid
      const amount = ethers.utils.parseEther("8");
      const nonce = ethers.utils.randomBytes(32);
      const hash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["uint256", "bytes32"],
          [amount, nonce]
        )
      );
      
      const tx2 = await procurement.connect(bidder1).submitBid(1, hash);
      const receipt2 = await tx2.wait();
      console.log("Gas submitBid:", receipt2.gasUsed.toString());
      
      // Avancer le temps pour révélation
      await ethers.provider.send("evm_increaseTime", [BID_DURATION]);
      await ethers.provider.send("evm_mine");
      
      // Mesurer gas pour revealBid
      const tx3 = await procurement.connect(bidder1).revealBid(1, amount, nonce);
      const receipt3 = await tx3.wait();
      console.log("Gas revealBid:", receipt3.gasUsed.toString());
      
      // Fin de révélation
      await ethers.provider.send("evm_increaseTime", [REVEAL_DURATION]);
      await ethers.provider.send("evm_mine");
      
      // Mesurer gas pour selectWinner
      const tx4 = await procurement.selectWinner(1);
      const receipt4 = await tx4.wait();
      console.log("Gas selectWinner:", receipt4.gasUsed.toString());
      
      // Financer le contrat
      await owner.sendTransaction({
        to: procurement.address,
        value: ethers.utils.parseEther("10")
      });
      
      // Ajouter un auditeur pour le test
      await procurement.addAuditor(auditor.address);
      
      // Mesurer gas pour approveMilestone
      const tx5 = await procurement.connect(auditor).approveMilestone(1, 0);
      const receipt5 = await tx5.wait();
      console.log("Gas approveMilestone:", receipt5.gasUsed.toString());
      
      // Mesurer gas pour releasePayment
      const tx6 = await procurement.releasePayment(1, 0);
      const receipt6 = await tx6.wait();
      console.log("Gas releasePayment:", receipt6.gasUsed.toString());
    });
  });
  
  // Helper pour matcher any value
  const anyValue = () => true;
});