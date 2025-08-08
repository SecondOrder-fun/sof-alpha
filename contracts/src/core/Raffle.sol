// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "openzeppelin-contracts/contracts/access/AccessControl.sol";
import "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "openzeppelin-contracts/contracts/utils/Pausable.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "chainlink-brownie-contracts/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract Raffle is AccessControl, ReentrancyGuard, Pausable, VRFConsumerBaseV2Plus {
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // Events
    event RaffleCreated(uint256 indexed raffleId, string name, uint256 duration, uint256 ticketPrice);
    event TicketPurchased(address indexed player, uint256 indexed raffleId, uint256 amount, uint256 ticketCount);
    event RaffleEnded(uint256 indexed raffleId, uint256 winningTicket, address[] winners);
    event WinnerSelected(uint256 indexed raffleId, address indexed winner, uint256 prizeAmount);
    event PrizeClaimed(address indexed winner, uint256 amount);

    // Structs
    struct RaffleInfo {
        uint256 id;
        string name;
        string description;
        uint256 startTime;
        uint256 endTime;
        uint256 ticketPrice;
        uint256 totalPrize;
        uint256 totalTickets;
        uint256 winnerCount;
        RaffleStatus status;
        address tokenAddress;
        uint256 vrfRequestId;
        uint256 winningTicket;
        bool prizeDistributed;
    }

    struct PlayerInfo {
        uint256 ticketCount;
        uint256 firstTicketId;
        uint256 lastTicketId;
        bool hasWon;
        bool hasClaimed;
        uint256 prizeAmount;
    }

    enum RaffleStatus {
        Pending,
        Active,
        Ended,
        Cancelled
    }

    // State variables
    uint256 public nextRaffleId;
    uint256 public nextTicketId;
    mapping(uint256 => RaffleInfo) public raffles;
    mapping(uint256 => mapping(address => PlayerInfo)) public playerInfo;
    mapping(uint256 => address[]) public raffleParticipants;
    mapping(address => uint256[]) public playerRaffles;
    mapping(uint256 => address[]) public raffleWinners;

    // Chainlink VRF variables
    bytes32 public i_keyHash;
    uint256 public i_subscriptionId;
    uint32 public callbackGasLimit = 100000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords = 1;

    // Constants
    uint256 public constant MAX_TICKET_PRICE = 10000 * 10**18; // 10,000 tokens
    uint256 public constant MAX_DURATION = 14 days; // 2 weeks
    uint256 public constant MIN_DURATION = 1 hours; // 1 hour

    constructor(
        address vrfCoordinator,
        bytes32 keyHash,
        uint256 subscriptionId
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        i_keyHash = keyHash;
        i_subscriptionId = subscriptionId;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    /**
     * @dev Create a new raffle
     * @param name Name of the raffle
     * @param description Description of the raffle
     * @param duration Duration of the raffle in seconds
     * @param ticketPrice Price per ticket in token units
     * @param winnerCount Number of winners
     * @param tokenAddress Address of the ERC20 token used for tickets
     */
    function createRaffle(
        string memory name,
        string memory description,
        uint256 duration,
        uint256 ticketPrice,
        uint256 winnerCount,
        address tokenAddress
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(bytes(name).length > 0, "Raffle: name cannot be empty");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "Raffle: invalid duration");
        require(ticketPrice > 0 && ticketPrice <= MAX_TICKET_PRICE, "Raffle: invalid ticket price");
        require(winnerCount > 0 && winnerCount <= 10, "Raffle: invalid winner count");
        require(tokenAddress != address(0), "Raffle: invalid token address");

        uint256 raffleId = nextRaffleId++;
        
        raffles[raffleId] = RaffleInfo({
            id: raffleId,
            name: name,
            description: description,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            ticketPrice: ticketPrice,
            totalPrize: 0,
            totalTickets: 0,
            winnerCount: winnerCount,
            status: RaffleStatus.Active,
            tokenAddress: tokenAddress,
            vrfRequestId: 0,
            winningTicket: 0,
            prizeDistributed: false
        });

        emit RaffleCreated(raffleId, name, duration, ticketPrice);
    }

    /**
     * @dev Buy tickets for a raffle
     * @param raffleId ID of the raffle
     * @param ticketCount Number of tickets to buy
     */
    function buyTickets(uint256 raffleId, uint256 ticketCount) external nonReentrant whenNotPaused {
        RaffleInfo storage raffle = raffles[raffleId];
        require(raffle.status == RaffleStatus.Active, "Raffle: not active");
        require(block.timestamp < raffle.endTime, "Raffle: ended");
        require(ticketCount > 0, "Raffle: invalid ticket count");

        uint256 totalCost = raffle.ticketPrice * ticketCount;
        IERC20 token = IERC20(raffle.tokenAddress);
        
        // Transfer tokens from player to contract
        require(token.transferFrom(msg.sender, address(this), totalCost), "Raffle: token transfer failed");

        // Update player info
        PlayerInfo storage player = playerInfo[raffleId][msg.sender];
        if (player.ticketCount == 0) {
            // New player
            player.firstTicketId = nextTicketId;
            raffleParticipants[raffleId].push(msg.sender);
            playerRaffles[msg.sender].push(raffleId);
        }
        
        player.lastTicketId = nextTicketId + ticketCount - 1;
        player.ticketCount += ticketCount;

        // Update raffle info
        raffle.totalTickets += ticketCount;
        raffle.totalPrize += totalCost;
        nextTicketId += ticketCount;

        emit TicketPurchased(msg.sender, raffleId, totalCost, ticketCount);
    }

    /**
     * @dev End a raffle and request random number for winner selection
     * @param raffleId ID of the raffle
     */
    function endRaffle(uint256 raffleId) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        RaffleInfo storage raffle = raffles[raffleId];
        require(raffle.status == RaffleStatus.Active, "Raffle: not active");
        require(block.timestamp >= raffle.endTime, "Raffle: not yet ended");

        raffle.status = RaffleStatus.Ended;

        // Request random number from Chainlink VRF
        VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
            keyHash: i_keyHash,
            subId: i_subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: numWords,
            extraArgs: ""
        });

        uint256 requestId = s_vrfCoordinator.requestRandomWords(req);
        raffle.vrfRequestId = requestId;

        emit RaffleEnded(raffleId, 0, new address[](0));
    }

    /**
     * @dev Callback function for Chainlink VRF
     * @param requestId ID of the VRF request
     * @param randomWords Random words generated by VRF
     */
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        // Find the raffle associated with this request
        uint256 raffleId;
        bool found = false;
        
        for (uint256 i = 0; i < nextRaffleId; i++) {
            if (raffles[i].vrfRequestId == requestId) {
                raffleId = i;
                found = true;
                break;
            }
        }
        
        require(found, "Raffle: request not found");
        
        RaffleInfo storage raffle = raffles[raffleId];
        require(raffle.status == RaffleStatus.Ended, "Raffle: not ended");
        
        // Select winners
        uint256 winningTicket = (randomWords[0] % raffle.totalTickets) + 1;
        raffle.winningTicket = winningTicket;
        
        // Find winners (simplified for now - in practice, would need to map ticket IDs to players)
        address[] memory winners = new address[](raffle.winnerCount);
        // TODO: Implement proper winner selection algorithm
        
        raffleWinners[raffleId] = winners;
        
        emit RaffleEnded(raffleId, winningTicket, winners);
    }

    /**
     * @dev Claim prize for winning
     * @param raffleId ID of the raffle
     */
    function claimPrize(uint256 raffleId) external nonReentrant whenNotPaused {
        RaffleInfo storage raffle = raffles[raffleId];
        PlayerInfo storage player = playerInfo[raffleId][msg.sender];
        
        require(raffle.status == RaffleStatus.Ended, "Raffle: not ended");
        require(player.hasWon, "Raffle: not a winner");
        require(!player.hasClaimed, "Raffle: prize already claimed");
        
        player.hasClaimed = true;
        uint256 prizeAmount = player.prizeAmount;
        
        IERC20 token = IERC20(raffle.tokenAddress);
        require(token.transfer(msg.sender, prizeAmount), "Raffle: prize transfer failed");
        
        emit PrizeClaimed(msg.sender, prizeAmount);
    }

    /**
     * @dev Cancel a raffle (only before it ends)
     * @param raffleId ID of the raffle
     */
    function cancelRaffle(uint256 raffleId) external onlyRole(ADMIN_ROLE) whenNotPaused {
        RaffleInfo storage raffle = raffles[raffleId];
        require(raffle.status == RaffleStatus.Active, "Raffle: not active");
        require(block.timestamp < raffle.endTime, "Raffle: already ended");

        raffle.status = RaffleStatus.Cancelled;
        
        // TODO: Implement refund logic
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Get raffle information
     * @param raffleId ID of the raffle
     * @return RaffleInfo
     */
    function getRaffle(uint256 raffleId) external view returns (RaffleInfo memory) {
        return raffles[raffleId];
    }

    /**
     * @dev Get player information for a raffle
     * @param raffleId ID of the raffle
     * @param player Address of the player
     * @return PlayerInfo
     */
    function getPlayerInfo(uint256 raffleId, address player) external view returns (PlayerInfo memory) {
        return playerInfo[raffleId][player];
    }

    /**
     * @dev Get participants of a raffle
     * @param raffleId ID of the raffle
     * @return Array of participant addresses
     */
    function getParticipants(uint256 raffleId) external view returns (address[] memory) {
        return raffleParticipants[raffleId];
    }

    /**
     * @dev Get winners of a raffle
     * @param raffleId ID of the raffle
     * @return Array of winner addresses
     */
    function getWinners(uint256 raffleId) external view returns (address[] memory) {
        return raffleWinners[raffleId];
    }
}