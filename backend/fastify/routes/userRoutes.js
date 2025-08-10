import { fastifyPlugin } from 'fastify-plugin';

// Mock user data
const mockUsers = [
  {
    id: '0x1234567890123456789012345678901234567890',
    username: 'crypto_player_1',
    displayName: 'Crypto Player One',
    bio: 'Enthusiastic participant in DeFi and prediction markets',
    avatar: 'https://example.com/avatar1.png',
    joinDate: '2023-01-15',
    totalWinnings: '2.5',
    totalWinningsToken: 'ETH',
    totalParticipations: 15,
    winRate: '0.27'
  },
  {
    id: '0xABCDEF123456789012345678901234567890ABCD',
    username: 'defi_master',
    displayName: 'DeFi Master',
    bio: 'Experienced DeFi user and yield farmer',
    avatar: 'https://example.com/avatar2.png',
    joinDate: '2022-11-30',
    totalWinnings: '15.75',
    totalWinningsToken: 'ETH',
    totalParticipations: 42,
    winRate: '0.43'
  }
];

// Mock user raffle participation data
const mockUserRaffles = [
  {
    raffleId: 1,
    raffleName: 'Ethereum Merge Prediction',
    ticketsPurchased: 5,
    joinDate: '2023-06-01',
    status: 'active'
  },
  {
    raffleId: 2,
    raffleName: 'Bitcoin Halving Countdown',
    ticketsPurchased: 3,
    joinDate: '2023-06-05',
    status: 'active'
  },
  {
    raffleId: 3,
    raffleName: 'DeFi Summer Return',
    ticketsPurchased: 7,
    joinDate: '2023-06-10',
    status: 'completed',
    won: true,
    prize: '1.25',
    prizeToken: 'ETH'
  }
];

// Mock InfoFi positions data
const mockInfoFiPositions = [
  {
    marketId: 1,
    marketQuestion: 'Will ETH reach $3000 by June 2023?',
    prediction: true,
    amount: '0.5',
    token: 'ETH',
    entryPrice: '0.65',
    currentPrice: '0.72',
    potentialPayout: '0.55',
    status: 'active'
  },
  {
    marketId: 2,
    marketQuestion: 'Will BTC experience a 10% drop in July 2023?',
    prediction: false,
    amount: '1.0',
    token: 'ETH',
    entryPrice: '0.35',
    currentPrice: '0.28',
    potentialPayout: '1.12',
    status: 'active'
  }
];

// Mock portfolio data
const mockPortfolio = {
  totalValue: '25.75',
  totalValueToken: 'ETH',
  assets: [
    {
      token: 'ETH',
      balance: '12.5',
      value: '12.5',
      valueToken: 'ETH'
    },
    {
      token: 'USDC',
      balance: '15000',
      value: '13.25',
      valueToken: 'ETH'
    }
  ],
  performance: {
    dailyChange: '2.5',
    weeklyChange: '5.7',
    monthlyChange: '12.3'
  }
};

export async function userRoutes(fastify, options) {
  // options parameter required by Fastify plugin interface
  if (options) {
    // Intentionally empty - options parameter required by Fastify plugin interface
  }
  
  // Get user profile
  fastify.get('/profile/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Mock implementation: Find user by ID
      const user = mockUsers.find(u => u.id === id);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      
      reply.send({ user });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch user profile' });
    }
  });

  // Get user's raffle participation
  fastify.get('/:id/raffles', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Mock implementation: Validate user exists
      const user = mockUsers.find(u => u.id === id);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      
      // Return mock raffle participation data
      reply.send({ raffles: mockUserRaffles });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch user raffles' });
    }
  });

  // Get user's InfoFi market positions
  fastify.get('/:id/infofi-positions', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Mock implementation: Validate user exists
      const user = mockUsers.find(u => u.id === id);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      
      // Return mock InfoFi positions
      reply.send({ positions: mockInfoFiPositions });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch InfoFi positions' });
    }
  });

  // Get user's portfolio
  fastify.get('/:id/portfolio', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Mock implementation: Validate user exists
      const user = mockUsers.find(u => u.id === id);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      
      // Return mock portfolio
      reply.send({ portfolio: mockPortfolio });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch portfolio' });
    }
  });

  // Update user profile
  fastify.put('/profile/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const { username, displayName, bio } = request.body;
      
      // Mock implementation: Validate user exists
      const userIndex = mockUsers.findIndex(u => u.id === id);
      
      if (userIndex === -1) {
        return reply.status(404).send({ error: 'User not found' });
      }
      
      // Update user profile
      if (username) mockUsers[userIndex].username = username;
      if (displayName) mockUsers[userIndex].displayName = displayName;
      if (bio) mockUsers[userIndex].bio = bio;
      
      reply.send({ 
        success: true, 
        message: 'Profile updated successfully',
        user: mockUsers[userIndex]
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to update profile' });
    }
  });
}

export default fastifyPlugin(userRoutes);