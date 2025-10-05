// backend/src/abis/InfoFiPriceOracleAbi.js
// Minimal ABI for InfoFiPriceOracle used by backend listeners
export default [
  {
    "type": "function",
    "stateMutability": "view",
    "name": "getPrice",
    "inputs": [{ "name": "marketId", "type": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          { "name": "raffleProbabilityBps", "type": "uint256" },
          { "name": "marketSentimentBps", "type": "uint256" },
          { "name": "hybridPriceBps", "type": "uint256" },
          { "name": "lastUpdate", "type": "uint256" },
          { "name": "active", "type": "bool" }
        ]
      }
    ]
  },
  {
    "type": "event",
    "name": "PriceUpdated",
    "inputs": [
      { "name": "marketId", "type": "uint256", "indexed": true },
      { "name": "raffleBps", "type": "uint256", "indexed": false },
      { "name": "marketBps", "type": "uint256", "indexed": false },
      { "name": "hybridBps", "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "function",
    "stateMutability": "view",
    "name": "weights",
    "inputs": [],
    "outputs": [
      { "name": "raffleWeightBps", "type": "uint256" },
      { "name": "marketWeightBps", "type": "uint256" }
    ]
  }
];
