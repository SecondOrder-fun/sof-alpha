// backend/src/abis/RaffleAbi.js
// Exported as JS to avoid JSON import assertion issues in Node/ESM.
// Minimal subset required for backend reads
export default [
  {
    inputs: [],
    name: "currentSeasonId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "seasonId", type: "uint256" }
    ],
    name: "getSeasonDetails",
    outputs: [
      {
        components: [
          { internalType: "string", name: "name", type: "string" },
          { internalType: "uint256", name: "startTime", type: "uint256" },
          { internalType: "uint256", name: "endTime", type: "uint256" },
          { internalType: "uint16", name: "winnerCount", type: "uint16" },
          { internalType: "uint16", name: "prizePercentage", type: "uint16" },
          { internalType: "uint16", name: "consolationPercentage", type: "uint16" },
          { internalType: "address", name: "raffleToken", type: "address" },
          { internalType: "address", name: "bondingCurve", type: "address" },
          { internalType: "bool", name: "isActive", type: "bool" },
          { internalType: "bool", name: "isCompleted", type: "bool" }
        ],
        internalType: "struct RaffleTypes.SeasonConfig",
        name: "config",
        type: "tuple"
      },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "uint256", name: "totalParticipants", type: "uint256" },
      { internalType: "uint256", name: "totalTickets", type: "uint256" },
      { internalType: "uint256", name: "totalPrizePool", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "seasonId", type: "uint256" },
      { internalType: "address", name: "participant", type: "address" }
    ],
    name: "getParticipantPosition",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "ticketCount", type: "uint256" },
          { internalType: "uint256", name: "entryBlock", type: "uint256" },
          { internalType: "uint256", name: "lastUpdateBlock", type: "uint256" },
          { internalType: "bool", name: "isActive", type: "bool" }
        ],
        internalType: "struct RaffleTypes.ParticipantPosition",
        name: "position",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];
