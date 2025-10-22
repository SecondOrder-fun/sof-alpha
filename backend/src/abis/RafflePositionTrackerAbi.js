// backend/src/abis/RafflePositionTrackerAbi.js
// Minimal ABI for listening to PositionSnapshot events
export default [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'ticketCount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'totalTickets', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'winProbabilityBps', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'seasonId', type: 'uint256' }
    ],
    name: 'PositionSnapshot',
    type: 'event'
  }
];
