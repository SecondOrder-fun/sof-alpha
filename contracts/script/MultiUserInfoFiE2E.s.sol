// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/core/Raffle.sol";
import "../src/curve/SOFBondingCurve.sol";
import "../src/token/SOFToken.sol";
import "../src/infofi/InfoFiMarket.sol";
import "../src/infofi/InfoFiMarketFactory.sol";
import "../src/infofi/InfoFiPriceOracle.sol";

/**
 * @title MultiUserInfoFiE2E
 * @notice End-to-end test with multiple users buying tickets and placing InfoFi bets
 * @dev Tests the complete flow including odds verification
 */
contract MultiUserInfoFiE2E is Script {
    // Anvil test accounts
    address constant ACCOUNT0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant ACCOUNT1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant ACCOUNT2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address constant ACCOUNT3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
    
    uint256 constant SEASON_ID = 1;
    
    function run() external {
        // Get contract addresses from environment
        address sofAddress = vm.envAddress("SOF_ADDRESS");
        address raffleAddress = vm.envAddress("RAFFLE_ADDRESS");
        address infoFiMarketAddress = vm.envAddress("INFOFI_MARKET_ADDRESS");
        address infoFiFactoryAddress = vm.envAddress("INFOFI_FACTORY_ADDRESS");
        address infoFiOracleAddress = vm.envAddress("INFOFI_ORACLE_ADDRESS");
        
        SOFToken sof = SOFToken(sofAddress);
        Raffle raffle = Raffle(raffleAddress);
        InfoFiMarket market = InfoFiMarket(infoFiMarketAddress);
        InfoFiMarketFactory factory = InfoFiMarketFactory(infoFiFactoryAddress);
        InfoFiPriceOracle oracle = InfoFiPriceOracle(infoFiOracleAddress);
        
        // Get bonding curve address from season
        (,,,,,, address curveAddress,,) = raffle.seasons(SEASON_ID);
        SOFBondingCurve curve = SOFBondingCurve(curveAddress);
        
        // Get raffle tracker to check total tickets
        address trackerAddress = vm.envAddress("RAFFLE_TRACKER_ADDRESS");
        
        console.log("\n=== Multi-User InfoFi E2E Test ===\n");
        console.log("SOF Token:", sofAddress);
        console.log("Raffle:", raffleAddress);
        console.log("Bonding Curve:", curveAddress);
        console.log("InfoFi Market:", infoFiMarketAddress);
        console.log("InfoFi Factory:", infoFiFactoryAddress);
        console.log("InfoFi Oracle:", infoFiOracleAddress);
        
        // Start season
        console.log("\n--- Starting Season ---");
        vm.broadcast(ACCOUNT0);
        raffle.startSeason(SEASON_ID);
        console.log("Season started");
        
        // Account 1: Buy 5000 tickets (should cross 1% threshold and create market)
        console.log("\n--- Account 1: Buying 5000 tickets ---");
        vm.startBroadcast(ACCOUNT1);
        sof.approve(curveAddress, type(uint256).max);
        curve.buyTokens(5000, 3000 ether);
        vm.stopBroadcast();
        
        (,, uint256 totalParticipants1, uint256 totalTickets1,) = raffle.getSeasonDetails(SEASON_ID);
        console.log("Total tickets after Account 1:", totalTickets1);
        console.log("Account 1 probability:", (5000 * 10000) / totalTickets1, "bps");
        
        // Check if market was created for Account 1
        uint256 marketCount = factory.getMarketCount(SEASON_ID);
        console.log("Markets created:", marketCount);
        
        if (marketCount > 0) {
            uint256 marketId1 = factory.winnerPredictionMarketIds(SEASON_ID, ACCOUNT1);
            console.log("Market ID for Account 1:", marketId1);
            
            // Check oracle price
            InfoFiPriceOracle.PriceData memory priceData1 = oracle.getPrice(marketId1);
            console.log("Oracle raffle probability:", priceData1.raffleProbabilityBps, "bps");
            console.log("Oracle hybrid price:", priceData1.hybridPriceBps, "bps");
            console.log("Oracle active:", priceData1.active);
        }
        
        // Account 2: Buy 3000 tickets
        console.log("\n--- Account 2: Buying 3000 tickets ---");
        vm.startBroadcast(ACCOUNT2);
        sof.approve(curveAddress, type(uint256).max);
        curve.buyTokens(3000, 2000 ether);
        vm.stopBroadcast();
        
        (,,, uint256 totalTickets2,) = raffle.getSeasonDetails(SEASON_ID);
        console.log("Total tickets after Account 2:", totalTickets2);
        console.log("Account 1 probability:", (5000 * 10000) / totalTickets2, "bps");
        console.log("Account 2 probability:", (3000 * 10000) / totalTickets2, "bps");
        
        // Check if market was created for Account 2
        marketCount = factory.getMarketCount(SEASON_ID);
        console.log("Markets created:", marketCount);
        
        if (marketCount > 1) {
            uint256 marketId2 = factory.winnerPredictionMarketIds(SEASON_ID, ACCOUNT2);
            console.log("Market ID for Account 2:", marketId2);
            
            // Check oracle price for Account 2
            InfoFiPriceOracle.PriceData memory priceData2 = oracle.getPrice(marketId2);
            console.log("Oracle raffle probability:", priceData2.raffleProbabilityBps, "bps");
            console.log("Oracle hybrid price:", priceData2.hybridPriceBps, "bps");
        }
        
        // Account 3: Buy 2000 tickets
        console.log("\n--- Account 3: Buying 2000 tickets ---");
        vm.startBroadcast(ACCOUNT3);
        sof.approve(curveAddress, type(uint256).max);
        curve.buyTokens(2000, 1500 ether);
        vm.stopBroadcast();
        
        (,,, uint256 totalTickets3,) = raffle.getSeasonDetails(SEASON_ID);
        console.log("Total tickets after Account 3:", totalTickets3);
        console.log("Account 1 probability:", (5000 * 10000) / totalTickets3, "bps");
        console.log("Account 2 probability:", (3000 * 10000) / totalTickets3, "bps");
        console.log("Account 3 probability:", (2000 * 10000) / totalTickets3, "bps");
        
        // Check all markets
        marketCount = factory.getMarketCount(SEASON_ID);
        console.log("\n--- Final Market State ---");
        console.log("Total markets created:", marketCount);
        
        // Verify odds for all markets
        console.log("\n--- Verifying Oracle Odds ---");
        for (uint256 i = 0; i < marketCount; i++) {
            (address player, , ) = factory.getMarketInfo(SEASON_ID, i);
            uint256 marketId = factory.winnerPredictionMarketIds(SEASON_ID, player);
            
            InfoFiPriceOracle.PriceData memory priceData = oracle.getPrice(marketId);
            console.log("\nPlayer:", player);
            console.log("  Market ID:", marketId);
            console.log("  Raffle Probability:", priceData.raffleProbabilityBps, "bps");
            console.log("  Market Sentiment:", priceData.marketSentimentBps, "bps");
            console.log("  Hybrid Price:", priceData.hybridPriceBps, "bps");
            console.log("  Active:", priceData.active);
        }
        
        // Place bets on Account 1's market
        if (marketCount > 0) {
            uint256 marketId1 = factory.winnerPredictionMarketIds(SEASON_ID, ACCOUNT1);
            
            console.log("\n--- Placing Bets on Account 1's Market ---");
            
            // Account 2 bets YES on Account 1 winning
            console.log("Account 2 betting 10 SOF YES on Account 1");
            vm.startBroadcast(ACCOUNT2);
            sof.approve(infoFiMarketAddress, type(uint256).max);
            market.placeBet(marketId1, true, 10 ether);
            vm.stopBroadcast();
            
            // Account 3 bets NO on Account 1 winning
            console.log("Account 3 betting 5 SOF NO on Account 1");
            vm.startBroadcast(ACCOUNT3);
            sof.approve(infoFiMarketAddress, type(uint256).max);
            market.placeBet(marketId1, false, 5 ether);
            vm.stopBroadcast();
            
            // Check updated market sentiment
            InfoFiPriceOracle.PriceData memory updatedPrice = oracle.getPrice(marketId1);
            console.log("\n--- After Betting ---");
            console.log("Updated Market Sentiment:", updatedPrice.marketSentimentBps, "bps");
            console.log("Updated Hybrid Price:", updatedPrice.hybridPriceBps, "bps");
            
            // Get market info
            InfoFiMarket.MarketInfo memory marketInfo = market.getMarket(marketId1);
            console.log("Total YES pool:", marketInfo.totalYesPool);
            console.log("Total NO pool:", marketInfo.totalNoPool);
            console.log("Total pool:", marketInfo.totalPool);
        }
        
        console.log("\n=== E2E Test Complete ===\n");
    }
}
