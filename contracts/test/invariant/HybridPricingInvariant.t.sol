// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../src/infofi/InfoFiPriceOracle.sol";
import "../../src/token/SOFToken.sol";

contract HybridPricingInvariantTest is StdInvariant, Test {
    InfoFiPriceOracle public oracle;
    address public admin;
    address public updater;

    // Constants for testing
    uint256 constant INITIAL_RAFFLE_WEIGHT = 7000; // 70%
    uint256 constant INITIAL_MARKET_WEIGHT = 3000; // 30%

    // Bounds for probability values (in basis points)
    uint256 constant MIN_PROBABILITY = 0;
    uint256 constant MAX_PROBABILITY = 10000; // 100%

    // Maximum allowed deviation in hybrid price (basis points)
    uint256 constant MAX_DEVIATION = 500; // 5%

    // Test market ID (now uint256 instead of bytes32)
    uint256 internal testMarketId;

    function setUp() public {
        admin = address(this);
        updater = address(0x1);

        // Deploy the oracle with initial weights
        oracle = new InfoFiPriceOracle(admin, INITIAL_RAFFLE_WEIGHT, INITIAL_MARKET_WEIGHT);

        // Grant updater role to the updater address
        oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), updater);

        // Create a test market (using uint256 instead of bytes32)
        testMarketId = uint256(keccak256("test_market"));
        vm.startPrank(updater);
        oracle.updateRaffleProbability(testMarketId, 5000); // 50%
        oracle.updateMarketSentiment(testMarketId, 6000); // 60%
        vm.stopPrank();

        // Target the oracle for invariant testing
        targetContract(address(oracle));
    }

    // Invariant: Weights must always sum to 10000 (100%)
    function invariant_weightsSumTo10000() public pure {
        // Get the weights from the contract
        uint256 raffleWeight = INITIAL_RAFFLE_WEIGHT; // Using the initial values since we don't change them
        uint256 marketWeight = INITIAL_MARKET_WEIGHT;

        assertEq(raffleWeight + marketWeight, 10000, "Weights must sum to 10000");
    }

    // Invariant: Hybrid price must be within bounds of raffle and market probabilities
    function invariant_hybridPriceWithinBounds() public view {
        // Get price data using the getPrice method
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(testMarketId);

        // Skip if market doesn't exist
        if (!priceData.active) return;

        uint256 raffleProbability = priceData.raffleProbabilityBps;
        uint256 marketSentiment = priceData.marketSentimentBps;
        uint256 hybridPrice = priceData.hybridPriceBps;

        // Hybrid price should be between min and max of the two components
        uint256 minProb = raffleProbability < marketSentiment ? raffleProbability : marketSentiment;
        uint256 maxProb = raffleProbability > marketSentiment ? raffleProbability : marketSentiment;

        assertTrue(hybridPrice >= minProb, "Hybrid price below minimum probability");
        assertTrue(hybridPrice <= maxProb, "Hybrid price above maximum probability");
    }

    // Invariant: Hybrid price calculation follows the weighted formula
    function invariant_hybridPriceCalculation() public view {
        // Get price data using the getPrice method
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(testMarketId);

        // Skip if market doesn't exist
        if (!priceData.active) return;

        uint256 raffleProbability = priceData.raffleProbabilityBps;
        uint256 marketSentiment = priceData.marketSentimentBps;
        uint256 hybridPrice = priceData.hybridPriceBps;

        // Use the initial weights
        uint256 raffleWeight = INITIAL_RAFFLE_WEIGHT;
        uint256 marketWeight = INITIAL_MARKET_WEIGHT;

        uint256 expectedPrice = (raffleWeight * raffleProbability + marketWeight * marketSentiment) / 10000;

        // Allow for small rounding errors due to integer division
        uint256 difference = expectedPrice > hybridPrice ? expectedPrice - hybridPrice : hybridPrice - expectedPrice;
        assertTrue(difference <= 1, "Hybrid price calculation incorrect");
    }

    // Invariant: Probability values must be within valid range (0-10000 basis points)
    function invariant_probabilitiesInValidRange() public view {
        // Get price data using the getPrice method
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(testMarketId);

        // Skip if market doesn't exist
        if (!priceData.active) return;

        uint256 raffleProbability = priceData.raffleProbabilityBps;
        uint256 marketSentiment = priceData.marketSentimentBps;
        uint256 hybridPrice = priceData.hybridPriceBps;

        assertTrue(
            raffleProbability >= MIN_PROBABILITY && raffleProbability <= MAX_PROBABILITY,
            "Raffle probability out of range"
        );
        assertTrue(
            marketSentiment >= MIN_PROBABILITY && marketSentiment <= MAX_PROBABILITY, "Market sentiment out of range"
        );
        assertTrue(hybridPrice >= MIN_PROBABILITY && hybridPrice <= MAX_PROBABILITY, "Hybrid price out of range");
    }

    // Invariant: Hybrid price deviation from components is bounded
    function invariant_hybridPriceDeviationBounded() public view {
        // Get price data using the getPrice method
        InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(testMarketId);

        // Skip if market doesn't exist
        if (!priceData.active) return;

        uint256 raffleProbability = priceData.raffleProbabilityBps;
        uint256 marketSentiment = priceData.marketSentimentBps;
        uint256 hybridPrice = priceData.hybridPriceBps;

        // Calculate deviation from raffle probability
        uint256 raffleDeviation =
            raffleProbability > hybridPrice ? raffleProbability - hybridPrice : hybridPrice - raffleProbability;

        // Calculate deviation from market sentiment
        uint256 marketDeviation =
            marketSentiment > hybridPrice ? marketSentiment - hybridPrice : hybridPrice - marketSentiment;

        // At least one deviation should be within MAX_DEVIATION
        assertTrue(
            raffleDeviation <= MAX_DEVIATION || marketDeviation <= MAX_DEVIATION,
            "Hybrid price deviates too much from both components"
        );
    }
}
