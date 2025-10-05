// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/access/AccessControl.sol";

/**
 * @title InfoFiPriceOracle
 * @notice Minimal MVP oracle storing hybrid pricing data per marketId
 * @dev Exposes roles for admin and price updater. Does not integrate Chainlink in MVP.
 */
contract InfoFiPriceOracle is AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    struct PriceData {
        uint256 raffleProbabilityBps; // 0-10000
        uint256 marketSentimentBps;   // 0-10000
        uint256 hybridPriceBps;       // 0-10000
        uint256 lastUpdate;
        bool active;
    }

    struct Weights {
        uint256 raffleWeightBps; // must sum to 10000 with marketWeightBps
        uint256 marketWeightBps;
    }

    // marketId => price data (using uint256 to match InfoFiMarket)
    mapping(uint256 => PriceData) public prices;

    Weights public weights;

    event PriceUpdated(uint256 indexed marketId, uint256 raffleBps, uint256 marketBps, uint256 hybridBps, uint256 timestamp);
    event WeightsUpdated(uint256 raffleWeightBps, uint256 marketWeightBps);

    constructor(address _admin, uint256 raffleWeightBps, uint256 marketWeightBps) {
        _grantRole(ADMIN_ROLE, _admin == address(0) ? msg.sender : _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin == address(0) ? msg.sender : _admin);
        _setWeights(raffleWeightBps, marketWeightBps);
    }

    function setWeights(uint256 raffleWeightBps, uint256 marketWeightBps) external onlyRole(ADMIN_ROLE) {
        _setWeights(raffleWeightBps, marketWeightBps);
    }

    function _setWeights(uint256 raffleWeightBps, uint256 marketWeightBps) internal {
        require(raffleWeightBps + marketWeightBps == 10000, "Oracle: weights must sum 10000");
        weights = Weights({raffleWeightBps: raffleWeightBps, marketWeightBps: marketWeightBps});
        emit WeightsUpdated(raffleWeightBps, marketWeightBps);
    }

    function updateRaffleProbability(uint256 marketId, uint256 raffleProbabilityBps) external onlyRole(PRICE_UPDATER_ROLE) {
        PriceData storage p = prices[marketId];
        p.raffleProbabilityBps = raffleProbabilityBps;
        p.hybridPriceBps = _hybrid(p.raffleProbabilityBps, p.marketSentimentBps);
        p.lastUpdate = block.timestamp;
        p.active = true;
        emit PriceUpdated(marketId, p.raffleProbabilityBps, p.marketSentimentBps, p.hybridPriceBps, p.lastUpdate);
    }

    function updateMarketSentiment(uint256 marketId, uint256 marketSentimentBps) external onlyRole(PRICE_UPDATER_ROLE) {
        PriceData storage p = prices[marketId];
        p.marketSentimentBps = marketSentimentBps;
        p.hybridPriceBps = _hybrid(p.raffleProbabilityBps, p.marketSentimentBps);
        p.lastUpdate = block.timestamp;
        p.active = true;
        emit PriceUpdated(marketId, p.raffleProbabilityBps, p.marketSentimentBps, p.hybridPriceBps, p.lastUpdate);
    }

    function _hybrid(uint256 raffleBps, uint256 marketBps) internal view returns (uint256) {
        return (weights.raffleWeightBps * raffleBps + weights.marketWeightBps * marketBps) / 10000;
    }

    function getPrice(uint256 marketId) external view returns (PriceData memory) {
        return prices[marketId];
    }
}
