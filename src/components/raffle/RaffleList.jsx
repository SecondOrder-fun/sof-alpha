import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/hooks/useWallet';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';

const RaffleList = () => {
  const { isConnected } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for creating a new raffle
  const [newRaffle, setNewRaffle] = useState({
    name: '',
    description: '',
    duration: 86400, // 1 day in seconds
    ticketPrice: '',
    winnerCount: 1,
    tokenAddress: ''
  });
  
  // State for buying tickets
  const [ticketPurchase, setTicketPurchase] = useState({
    raffleId: '',
    ticketCount: 1
  });
  
  // Mock data for active raffles
  const [raffles] = useState([
    {
      id: 1,
      name: 'Test Raffle 1',
      description: 'A test raffle for demonstration',
      startTime: Date.now() - 3600000, // 1 hour ago
      endTime: Date.now() + 82800000, // 23 hours from now
      ticketPrice: '100',
      totalPrize: '1000',
      totalTickets: 10,
      winnerCount: 1,
      status: 'Active',
      tokenAddress: '0x...'
    },
    {
      id: 2,
      name: 'Test Raffle 2',
      description: 'Another test raffle',
      startTime: Date.now() - 7200000, // 2 hours ago
      endTime: Date.now() + 169200000, // 47 hours from now
      ticketPrice: '50',
      totalPrize: '500',
      totalTickets: 5,
      winnerCount: 1,
      status: 'Active',
      tokenAddress: '0x...'
    }
  ]);
  
  // Function to create a new raffle
  const handleCreateRaffle = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to create a raffle.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      // TODO: Implement actual contract interaction
      // console.log('Creating raffle:', newRaffle);
      
      // Reset form
      setNewRaffle({
        name: '',
        description: '',
        duration: 86400,
        ticketPrice: '',
        winnerCount: 1,
        tokenAddress: ''
      });
      
      toast({
        title: 'Raffle Created',
        description: 'Your raffle has been created successfully.'
      });
      
      // Refresh raffles
      queryClient.invalidateQueries(['raffles']);
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create raffle',
        variant: 'destructive'
      });
    }
  };
  
  // Function to buy tickets
  const handleBuyTickets = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to buy tickets.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      // TODO: Implement actual contract interaction
      // console.log('Buying tickets:', ticketPurchase);
      
      toast({
        title: 'Tickets Purchased',
        description: `Successfully purchased ${ticketPurchase.ticketCount} tickets.`
      });
      
      // Reset form
      setTicketPurchase({
        raffleId: '',
        ticketCount: 1
      });
      
      // Refresh raffles
      queryClient.invalidateQueries(['raffles']);
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to purchase tickets',
        variant: 'destructive'
      });
    }
  };
  
  // Format time remaining
  const formatTimeRemaining = (endTime) => {
    const now = Date.now();
    const diff = endTime - now;
    
    if (diff <= 0) return 'Ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Active Raffles</h1>
        <p className="text-muted-foreground">Join raffles and win prizes!</p>
      </div>
      
      {/* Create Raffle Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Raffle</CardTitle>
          <CardDescription>Create a new raffle for players to join</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRaffle} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Raffle Name</Label>
                <Input
                  id="name"
                  value={newRaffle.name}
                  onChange={(e) => setNewRaffle({...newRaffle, name: e.target.value})}
                  placeholder="Enter raffle name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticketPrice">Ticket Price</Label>
                <Input
                  id="ticketPrice"
                  type="number"
                  value={newRaffle.ticketPrice}
                  onChange={(e) => setNewRaffle({...newRaffle, ticketPrice: e.target.value})}
                  placeholder="Enter ticket price"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (seconds)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={newRaffle.duration}
                  onChange={(e) => setNewRaffle({...newRaffle, duration: parseInt(e.target.value)})}
                  placeholder="Enter duration"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="winnerCount">Number of Winners</Label>
                <Input
                  id="winnerCount"
                  type="number"
                  min="1"
                  max="10"
                  value={newRaffle.winnerCount}
                  onChange={(e) => setNewRaffle({...newRaffle, winnerCount: parseInt(e.target.value)})}
                  placeholder="Enter winner count"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newRaffle.description}
                onChange={(e) => setNewRaffle({...newRaffle, description: e.target.value})}
                placeholder="Enter raffle description"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tokenAddress">Token Address</Label>
              <Input
                id="tokenAddress"
                value={newRaffle.tokenAddress}
                onChange={(e) => setNewRaffle({...newRaffle, tokenAddress: e.target.value})}
                placeholder="Enter token contract address"
                required
              />
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreateRaffle}>Create Raffle</Button>
        </CardFooter>
      </Card>
      
      {/* Buy Tickets Form */}
      <Card>
        <CardHeader>
          <CardTitle>Buy Tickets</CardTitle>
          <CardDescription>Purchase tickets for an existing raffle</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBuyTickets} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="raffleId">Raffle ID</Label>
                <Input
                  id="raffleId"
                  type="number"
                  value={ticketPurchase.raffleId}
                  onChange={(e) => setTicketPurchase({...ticketPurchase, raffleId: e.target.value})}
                  placeholder="Enter raffle ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticketCount">Number of Tickets</Label>
                <Input
                  id="ticketCount"
                  type="number"
                  min="1"
                  value={ticketPurchase.ticketCount}
                  onChange={(e) => setTicketPurchase({...ticketPurchase, ticketCount: parseInt(e.target.value)})}
                  placeholder="Enter ticket count"
                  required
                />
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button onClick={handleBuyTickets}>Buy Tickets</Button>
        </CardFooter>
      </Card>
      
      {/* Active Raffles List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {raffles.map((raffle) => (
          <Card key={raffle.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{raffle.name}</CardTitle>
              <CardDescription>{raffle.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prize Pool:</span>
                  <span className="font-medium">{raffle.totalPrize} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ticket Price:</span>
                  <span className="font-medium">{raffle.ticketPrice} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tickets Sold:</span>
                  <span className="font-medium">{raffle.totalTickets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Winners:</span>
                  <span className="font-medium">{raffle.winnerCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time Remaining:</span>
                  <span className="font-medium">{formatTimeRemaining(raffle.endTime)}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => setTicketPurchase({...ticketPurchase, raffleId: raffle.id.toString()})}>
                Buy Tickets
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RaffleList;