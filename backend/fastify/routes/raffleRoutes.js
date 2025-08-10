import { fastifyPlugin } from 'fastify-plugin';

// Mock raffle data
const mockRaffles = [
  {
    id: 1,
    name: 'Ethereum Merge Prediction',
    description: 'Predict the exact timestamp of the Ethereum Merge event',
    startTime: Date.now() - 86400000, // 1 day ago
    endTime: Date.now() + 86400000 * 3, // 3 days from now
    ticketPrice: '0.1',
    ticketPriceToken: 'ETH',
    totalPrize: '10.5',
    totalPrizeToken: 'ETH',
    totalTickets: 105,
    winnerCount: 3,
    status: 'active',
    participants: 87
  },
  {
    id: 2,
    name: 'Bitcoin Halving Countdown',
    description: 'Guess the block height of the next Bitcoin halving',
    startTime: Date.now() - 172800000, // 2 days ago
    endTime: Date.now() + 86400000 * 7, // 1 week from now
    ticketPrice: '0.25',
    ticketPriceToken: 'ETH',
    totalPrize: '25.75',
    totalPrizeToken: 'ETH',
    totalTickets: 103,
    winnerCount: 5,
    status: 'active',
    participants: 92
  },
  {
    id: 3,
    name: 'DeFi Summer Return',
    description: 'Predict which DeFi protocol will have the highest TVL growth in Q4',
    startTime: Date.now() - 259200000, // 3 days ago
    endTime: Date.now() + 86400000 * 14, // 2 weeks from now
    ticketPrice: '50',
    ticketPriceToken: 'USDC',
    totalPrize: '5000',
    totalPrizeToken: 'USDC',
    totalTickets: 100,
    winnerCount: 10,
    status: 'active',
    participants: 75
  }
];

// Mock participants data
const mockParticipants = [
  {
    address: '0x1234567890123456789012345678901234567890',
    tickets: 5,
    joinTime: Date.now() - 43200000 // 12 hours ago
  },
  {
    address: '0xABCDEF123456789012345678901234567890ABCD',
    tickets: 3,
    joinTime: Date.now() - 86400000 // 1 day ago
  },
  {
    address: '0x7890123456789012345678901234567890123456',
    tickets: 7,
    joinTime: Date.now() - 129600000 // 36 hours ago
  }
];

export async function raffleRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }
  
  // Get all active raffles
  fastify.get('/', async (_request, reply) => {
    try {
      // Mock implementation: Return all active raffles
      reply.send({ raffles: mockRaffles });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch raffles' });
    }
  });

  // Get a specific raffle by ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const raffleId = parseInt(id);
      
      // Mock implementation: Find raffle by ID
      const raffle = mockRaffles.find(r => r.id === raffleId);
      
      if (!raffle) {
        return reply.status(404).send({ error: 'Raffle not found' });
      }
      
      reply.send({ raffle });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch raffle' });
    }
  });

  // Create a new raffle
  fastify.post('/', async (request, reply) => {
    try {
      const { name, description, duration, ticketPrice, ticketPriceToken, winnerCount } = request.body;
      
      // Validate required fields
      if (!name || !description || !duration || !ticketPrice || !ticketPriceToken || !winnerCount) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }
      
      // Mock implementation: Create new raffle
      const newRaffle = {
        id: mockRaffles.length + 1,
        name,
        description,
        startTime: Date.now(),
        endTime: Date.now() + (duration * 1000), // duration in seconds
        ticketPrice,
        ticketPriceToken,
        totalPrize: '0', // Will be calculated based on ticket sales
        totalPrizeToken: ticketPriceToken,
        totalTickets: 0,
        winnerCount,
        status: 'active',
        participants: 0
      };
      
      mockRaffles.push(newRaffle);
      
      reply.status(201).send({ raffle: newRaffle });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to create raffle' });
    }
  });

  // Join a raffle
  fastify.post('/:id/join', async (request, reply) => {
    try {
      const { id } = request.params;
      const { ticketCount, playerAddress } = request.body;
      const raffleId = parseInt(id);
      
      // Validate required fields
      if (!ticketCount || !playerAddress) {
        return reply.status(400).send({ error: 'Missing required fields: ticketCount and playerAddress' });
      }
      
      // Mock implementation: Find raffle by ID
      const raffle = mockRaffles.find(r => r.id === raffleId);
      
      if (!raffle) {
        return reply.status(404).send({ error: 'Raffle not found' });
      }
      
      if (raffle.status !== 'active') {
        return reply.status(400).send({ error: 'Raffle is not active' });
      }
      
      if (Date.now() > raffle.endTime) {
        return reply.status(400).send({ error: 'Raffle has ended' });
      }
      
      // Update raffle data
      raffle.totalTickets += parseInt(ticketCount);
      raffle.participants += 1;
      raffle.totalPrize = (parseFloat(raffle.totalPrize) + (parseFloat(raffle.ticketPrice) * parseInt(ticketCount))).toString();
      
      reply.send({ 
        success: true, 
        message: `Successfully joined raffle with ${ticketCount} tickets`,
        raffle
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to join raffle' });
    }
  });

  // Get raffle participants
  fastify.get('/:id/participants', async (request, reply) => {
    try {
      const { id } = request.params;
      const raffleId = parseInt(id);
      
      // Mock implementation: Find raffle by ID to validate existence
      const raffle = mockRaffles.find(r => r.id === raffleId);
      
      if (!raffle) {
        return reply.status(404).send({ error: 'Raffle not found' });
      }
      
      // Return mock participants
      reply.send({ participants: mockParticipants });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch participants' });
    }
  });
}

export default fastifyPlugin(raffleRoutes);