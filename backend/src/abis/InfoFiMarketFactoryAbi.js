// backend/src/abis/InfoFiMarketFactoryAbi.js
// Minimal ABI for listening to MarketCreated and ProbabilityUpdated events
export default [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'seasonId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: true, internalType: 'bytes32', name: 'marketType', type: 'bytes32' },
      { indexed: false, internalType: 'bytes32', name: 'conditionId', type: 'bytes32' },
      { indexed: false, internalType: 'address', name: 'fpmmAddress', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'probabilityBps', type: 'uint256' }
    ],
    name: 'MarketCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'seasonId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'oldProbabilityBps', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'newProbabilityBps', type: 'uint256' }
    ],
    name: 'ProbabilityUpdated',
    type: 'event'
  }
];
