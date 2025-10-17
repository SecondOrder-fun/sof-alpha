// src/utils/abis.js
// Centralized ABI exports with tree-shaking support
// Individual named exports allow bundlers to only include ABIs that are actually imported

// Core Raffle System
export { default as RaffleAbi } from '@/contracts/abis/Raffle.json';
export { default as RafflePositionTrackerAbi } from '@/contracts/abis/RafflePositionTracker.json';
export { default as RafflePrizeDistributorAbi } from '@/contracts/abis/RafflePrizeDistributor.json';
export { default as RaffleTokenAbi } from '@/contracts/abis/RaffleToken.json';

// InfoFi Prediction Markets
export { default as InfoFiMarketAbi } from '@/contracts/abis/InfoFiMarket.json';
export { default as InfoFiMarketFactoryAbi } from '@/contracts/abis/InfoFiMarketFactory.json';
export { default as InfoFiPriceOracleAbi } from '@/contracts/abis/InfoFiPriceOracle.json';
export { default as InfoFiSettlementAbi } from '@/contracts/abis/InfoFiSettlement.json';

// Bonding Curve & Tokens
export { default as SOFBondingCurveAbi } from '@/contracts/abis/SOFBondingCurve.json';
export { default as SOFTokenAbi } from '@/contracts/abis/SOFToken.json';
export { default as SOFFaucetAbi } from '@/contracts/abis/SOFFaucet.json';

// Season Management
export { default as SeasonCSMMAbi } from '@/contracts/abis/SeasonCSMM.json';
export { default as SeasonFactoryAbi } from '@/contracts/abis/SeasonFactory.json';

// Standard Interfaces
export { default as ERC20Abi } from '@/contracts/abis/ERC20.json';
export { default as AccessControlAbi } from '@/contracts/abis/AccessControl.json';
