// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Système Décentralisé de Suivi des Marchés Publics
 * @author Charifa Dreoui & Safae Karkach
 * @notice Gère le cycle de vie des appels d'offres, de la création au paiement, avec un système d'enchères sécurisé.
 */
contract Procurement {
    
    // ============ STRUCTS ============
    struct Tender {
        uint256 id;
        bytes32 descriptionHash;
        uint256 maxBudget;
        uint256 bidSubmissionDeadline;
        uint256 revealDeadline;
        address winner;
        bool isActive;
        uint256[] milestoneAmounts;
    }
    
    struct Bid {
        bytes32 hashedBid;
        uint256 revealedAmount;
        address bidder;
        bool revealed;
        bool isValid;
        bytes32 nonce;
    }
    
    struct Milestone {
        uint256 amount;
        bool approved;
        bool paid;
    }
    
    // ============ STATE VARIABLES ============
    address public owner;
    uint256 private tenderCounter;
    
    // Mappings
    mapping(uint256 => Tender) public tenders;
    mapping(uint256 => address[]) public tenderBidders;
    mapping(uint256 => mapping(address => Bid)) public bids;
    mapping(uint256 => Milestone[]) public milestones;
    mapping(address => bool) public auditors;
    
    // ============ EVENTS ============
    event TenderCreated(
        uint256 indexed tenderId,
        bytes32 descriptionHash,
        uint256 maxBudget,
        uint256 bidDeadline,
        uint256 revealDeadline
    );
    
    event BidSubmitted(
        uint256 indexed tenderId,
        address indexed bidder,
        bytes32 hashedBid
    );
    
    event BidRevealed(
        uint256 indexed tenderId,
        address indexed bidder,
        uint256 amount,
        bytes32 nonce
    );
    
    event WinnerSelected(
        uint256 indexed tenderId,
        address indexed winner,
        uint256 winningAmount
    );
    
    event MilestoneApproved(
        uint256 indexed tenderId,
        uint256 milestoneId,
        address approvedBy
    );
    
    event PaymentReleased(
        uint256 indexed tenderId,
        uint256 milestoneId,
        address recipient,
        uint256 amount
    );
    
    // ============ MODIFIERS ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Seul le proprietaire peut executer cette action");
        _;
    }
    
    modifier onlyAuditor() {
        require(auditors[msg.sender], "Seul un auditeur peut executer cette action");
        _;
    }
    
    modifier tenderExists(uint256 _tenderId) {
        require(tenders[_tenderId].id != 0, "L'appel d'offres n'existe pas");
        _;
    }
    
    modifier isActiveTender(uint256 _tenderId) {
        require(tenders[_tenderId].isActive, "L'appel d'offres n'est pas actif");
        _;
    }
    
    // ============ CONSTRUCTOR ============
    constructor() {
        owner = msg.sender;
        tenderCounter = 1;
        auditors[msg.sender] = true; // Owner is also initial auditor
    }
    
    // ============ FUNCTIONS ============
    
    /**
     * @notice Create a new tender
     * @param _descriptionHash Hash of tender description
     * @param _maxBudget Maximum budget in wei
     * @param _bidDuration Duration for bid submission in seconds
     * @param _revealDuration Duration for bid reveal in seconds
     * @param _milestoneAmounts Array of milestone amounts
     */
    function createTender(
        bytes32 _descriptionHash,
        uint256 _maxBudget,
        uint256 _bidDuration,
        uint256 _revealDuration,
        uint256[] memory _milestoneAmounts
    ) external onlyOwner returns (uint256) {
        uint256 tenderId = tenderCounter++;
        
        // Validate milestone amounts
        uint256 totalMilestones = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            totalMilestones += _milestoneAmounts[i];
        }
        require(totalMilestones <= _maxBudget, "Le total des jalons dépasse le budget maximum");
        
        tenders[tenderId] = Tender({
            id: tenderId,
            descriptionHash: _descriptionHash,
            maxBudget: _maxBudget,
            bidSubmissionDeadline: block.timestamp + _bidDuration,
            revealDeadline: block.timestamp + _bidDuration + _revealDuration,
            winner: address(0),
            isActive: true,
            milestoneAmounts: _milestoneAmounts
        });
        
        // Initialize milestones
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            milestones[tenderId].push(Milestone({
                amount: _milestoneAmounts[i],
                approved: false,
                paid: false
            }));
        }
        
        emit TenderCreated(
            tenderId,
            _descriptionHash,
            _maxBudget,
            block.timestamp + _bidDuration,
            block.timestamp + _bidDuration + _revealDuration
        );
        
        return tenderId;
    }
    
    /**
     * @notice Submit a bid (commit phase)
     * @param _tenderId ID of the tender
     * @param _hashedBid Keccak256 hash of (amount + nonce)
     */
    function submitBid(
        uint256 _tenderId,
        bytes32 _hashedBid
    ) external tenderExists(_tenderId) isActiveTender(_tenderId) {
        Tender storage tender = tenders[_tenderId];
        require(block.timestamp < tender.bidSubmissionDeadline, "La periode de soumission est terminee");
        require(bids[_tenderId][msg.sender].hashedBid == bytes32(0), "Offre deja soumise pour ce compte");
        
        bids[_tenderId][msg.sender] = Bid({
            hashedBid: _hashedBid,
            revealedAmount: 0,
            bidder: msg.sender,
            revealed: false,
            isValid: false,
            nonce: bytes32(0)
        });
        
        tenderBidders[_tenderId].push(msg.sender);
        
        emit BidSubmitted(_tenderId, msg.sender, _hashedBid);
    }
    
    /**
     * @notice Reveal a bid
     * @param _tenderId ID of the tender
     * @param _amount Actual bid amount
     * @param _nonce Secret nonce used in commit phase
     */
    function revealBid(
        uint256 _tenderId,
        uint256 _amount,
        bytes32 _nonce
    ) external tenderExists(_tenderId) isActiveTender(_tenderId) {
        Tender storage tender = tenders[_tenderId];
        require(block.timestamp >= tender.bidSubmissionDeadline, "La phase de revelation n'a pas encore commence");
        require(block.timestamp < tender.revealDeadline, "La periode de revelation est terminee");
        
        Bid storage bid = bids[_tenderId][msg.sender];
        require(bid.hashedBid != bytes32(0), "Aucune offre soumise");
        require(!bid.revealed, "Offre deja revelee");
        
        // Vérifier le hash
        bytes32 computedHash = keccak256(abi.encodePacked(_amount, _nonce));
        require(computedHash == bid.hashedBid, "Hash invalide : revelation rejetee");
        
        bid.revealedAmount = _amount;
        bid.revealed = true;
        bid.nonce = _nonce;
        
        // Validate bid
        if (_amount <= tender.maxBudget) {
            bid.isValid = true;
        }
        
        emit BidRevealed(_tenderId, msg.sender, _amount, _nonce);
    }
    
    /**
     * @notice Select winner (lowest valid bid)
     * @param _tenderId ID of the tender
     */
    function selectWinner(uint256 _tenderId) 
        external 
        tenderExists(_tenderId) 
        isActiveTender(_tenderId) 
    {
        Tender storage tender = tenders[_tenderId];
        require(block.timestamp >= tender.revealDeadline, "Reveal period not over");
        require(tender.winner == address(0), "Winner already selected");
        
        address[] memory bidders = tenderBidders[_tenderId];
        address lowestBidder = address(0);
        uint256 lowestAmount = tender.maxBudget;
        
        for (uint256 i = 0; i < bidders.length; i++) {
            Bid memory bid = bids[_tenderId][bidders[i]];
            if (bid.revealed && bid.isValid && bid.revealedAmount < lowestAmount) {
                lowestAmount = bid.revealedAmount;
                lowestBidder = bidders[i];
            }
        }
        
        require(lowestBidder != address(0), "Aucune offre valide n'a ete trouvee");
        
        tender.winner = lowestBidder;
        
        emit WinnerSelected(_tenderId, lowestBidder, lowestAmount);
    }
    
    /**
     * @notice Approve a milestone
     * @param _tenderId ID of the tender
     * @param _milestoneId Index of milestone (0-based)
     */
    function approveMilestone(
        uint256 _tenderId,
        uint256 _milestoneId
    ) external tenderExists(_tenderId) onlyAuditor {
        require(_milestoneId < milestones[_tenderId].length, "Jalon invalide");
        
        Milestone storage milestone = milestones[_tenderId][_milestoneId];
        require(!milestone.approved, "Jalon deja approuve");
        require(!milestone.paid, "Jalon deja paye");
        
        milestone.approved = true;
        
        emit MilestoneApproved(_tenderId, _milestoneId, msg.sender);
    }
    
    /**
     * @notice Release payment for approved milestone
     * @param _tenderId ID of the tender
     * @param _milestoneId Index of milestone (0-based)
     */
    function releasePayment(
        uint256 _tenderId,
        uint256 _milestoneId
    ) external tenderExists(_tenderId) onlyOwner {
        require(_milestoneId < milestones[_tenderId].length, "Jalon invalide");
        
        Milestone storage milestone = milestones[_tenderId][_milestoneId];
        require(milestone.approved, "Le jalon n'est pas approuve");
        require(!milestone.paid, "Paiement deja effectue");
        require(tenders[_tenderId].winner != address(0), "Aucun gagnant n'a ete selectionne");
        
        // Prevent reentrancy
        milestone.paid = true;
        
        payable(tenders[_tenderId].winner).transfer(milestone.amount);
        
        emit PaymentReleased(
            _tenderId,
            _milestoneId,
            tenders[_tenderId].winner,
            milestone.amount
        );
    }
    
    /**
     * @notice Add an auditor
     * @param _auditor Address to add as auditor
     */
    function addAuditor(address _auditor) external onlyOwner {
        auditors[_auditor] = true;
    }
    
    /**
     * @notice Remove an auditor
     * @param _auditor Address to remove from auditors
     */
    function removeAuditor(address _auditor) external onlyOwner {
        auditors[_auditor] = false;
    }
    
    /**
     * @notice Get tender details
     * @param _tenderId ID of the tender
     */
    function getTender(uint256 _tenderId) 
        external 
        view 
        returns (
            bytes32,
            uint256,
            uint256,
            uint256,
            address,
            bool,
            uint256[] memory
        ) 
    {
        Tender memory tender = tenders[_tenderId];
        return (
            tender.descriptionHash,
            tender.maxBudget,
            tender.bidSubmissionDeadline,
            tender.revealDeadline,
            tender.winner,
            tender.isActive,
            tender.milestoneAmounts
        );
    }
    
    /**
     * @notice Get bid details
     * @param _tenderId ID of the tender
     * @param _bidder Address of bidder
     */
    function getBid(uint256 _tenderId, address _bidder) 
        external 
        view 
        returns (
            bytes32,
            uint256,
            bool,
            bool,
            bytes32
        ) 
    {
        Bid memory bid = bids[_tenderId][_bidder];
        return (
            bid.hashedBid,
            bid.revealedAmount,
            bid.revealed,
            bid.isValid,
            bid.nonce
        );
    }
    
    /**
     * @notice Get milestone details
     * @param _tenderId ID of the tender
     * @param _milestoneId Index of milestone
     */
    function getMilestone(uint256 _tenderId, uint256 _milestoneId) 
        external 
        view 
        returns (
            uint256,
            bool,
            bool
        ) 
    {
        require(_milestoneId < milestones[_tenderId].length, "Invalid milestone");
        Milestone memory milestone = milestones[_tenderId][_milestoneId];
        return (
            milestone.amount,
            milestone.approved,
            milestone.paid
        );
    }
    
    /**
     * @notice Get all bidders for a tender
     * @param _tenderId ID of the tender
     */
    function getTenderBidders(uint256 _tenderId) 
        external 
        view 
        returns (address[] memory) 
    {
        return tenderBidders[_tenderId];
    }
    
    // Accept ETH payments to contract
    receive() external payable {}
}