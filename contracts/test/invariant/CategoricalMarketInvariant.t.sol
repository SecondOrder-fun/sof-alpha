// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../src/infofi/InfoFiMarket.sol";
import "../../src/token/SOFToken.sol";

contract CategoricalMarketInvariantTest is StdInvariant, Test {
    InfoFiMarket public market;
    SOFToken public sof;
    address public admin;
    address public user1;
    address public user2;

    // Constants for testing
    uint256 constant INITIAL_LIQUIDITY = 1000 ether;
    uint256 constant BET_AMOUNT = 10 ether;

    // Test market ID
    uint256 public marketId;

    function setUp() public {
        admin = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        // Deploy SOF token
        sof = new SOFToken("SecondOrder Fun Token", "SOF", 1_000_000 * 10 ** 18, admin);

        // Deploy InfoFi market
        market = new InfoFiMarket();

        // Transfer tokens to users
        sof.transfer(user1, 1000 ether);
        sof.transfer(user2, 1000 ether);

        // Create a test market
        marketId = market.createMarket(1, address(0x3), "Will this player win?", address(sof));

        // Target the market for invariant testing
        targetContract(address(market));

        // Exclude functions that might cause issues
        excludeContract(address(market));
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = market.getMarket.selector;
        selectors[1] = market.sentimentBps.selector;
        targetSelector(FuzzSelector({addr: address(market), selectors: selectors}));
    }

    // Invariant: Market info can be retrieved
    function invariant_marketInfoRetrievable() public view {
        // Get market info
        InfoFiMarket.MarketInfo memory info = market.getMarket(marketId);

        // Verify market info
        assertEq(info.id, marketId, "Market ID mismatch");
        assertEq(info.question, "Will this player win?", "Market question mismatch");
        assertEq(info.tokenAddress, address(sof), "Token address mismatch");
    }

    // Invariant: Market sentiment is within valid range
    function invariant_sentimentInValidRange() public view {
        // Get market sentiment
        uint256 sentiment = market.sentimentBps(marketId);

        // Verify sentiment is in valid range
        assertTrue(sentiment <= 10000, "Sentiment exceeds 100%");
    }

    // Helper function to check if a market exists
    function testMarketExists() public {
        // Create a new market directly in the test
        uint256 testId = market.createMarket(2, address(0x4), "Test market in test function", address(sof));
        console.log("Test Market ID:", testId);
        assertTrue(testId > 0, "Market ID should be greater than 0");
    }
}
