// backend/src/abis/InfoFiMarketFactoryAbi.js
// Minimal ABI for listening to MarketCreated events and optional reads if needed
export default [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'seasonId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: true, internalType: 'bytes32', name: 'marketType', type: 'bytes32' },
      { indexed: false, internalType: 'uint256', name: 'probabilityBps', type: 'uint256' },
      { indexed: false, internalType: 'address', name: 'marketAddress', type: 'address' }
    ],
    name: 'MarketCreated',
    type: 'event'
  }
];
