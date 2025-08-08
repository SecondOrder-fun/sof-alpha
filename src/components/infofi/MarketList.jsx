import { useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';

const MarketList = () => {
  const { isConnected } = useWallet();
  const { toast } = useToast();
  
  // State for creating a new market
  const [newMarket, setNewMarket] = useState({
    raffleId: '',
    question: '',
    tokenAddress: ''
  });
  
  // State for placing bets
  const [bet, setBet] = useState({
    marketId: '',
    prediction: true, // true for yes, false for no
    amount: ''
  });
  
  // Mock data for active markets
  const [markets] = useState([
    {
      id: 1,
      raffleId: 1,
      question: 'Will the price of ETH be above $3000 at the end of the month?',
      createdAt: Date.now() - 86400000, // 1 day ago
      totalYesPool: '500',
      totalNoPool: '300',
      totalPool: '800',
      resolved: false,
      tokenAddress: '0x...'
    },
    {
      id: 2,
      raffleId: 2,
      question: 'Will Bitcoin reach $70,000 by the end of Q3 2025?',
      createdAt: Date.now() - 172800000, // 2 days ago
      totalYesPool: '1200',
      totalNoPool: '800',
      totalPool: '2000',
      resolved: false,
      tokenAddress: '0x...'
    }
  ]);
  
  // Function to create a new market
  const handleCreateMarket = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to create a market.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      // TODO: Implement actual contract interaction
      // console.log('Creating market:', newMarket);
      
      // Reset form
      setNewMarket({
        raffleId: '',
        question: '',
        tokenAddress: ''
      });
      
      toast({
        title: 'Market Created',
        description: 'Your InfoFi market has been created successfully.'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create market',
        variant: 'destructive'
      });
    }
  };
  
  // Function to place a bet
  const handlePlaceBet = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet to place a bet.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      // TODO: Implement actual contract interaction
      // console.log('Placing bet:', bet);
      
      toast({
        title: 'Bet Placed',
        description: `Successfully placed ${bet.prediction ? 'YES' : 'NO'} bet of ${bet.amount} tokens.`
      });
      
      // Reset form
      setBet({
        marketId: '',
        prediction: true,
        amount: ''
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to place bet',
        variant: 'destructive'
      });
    }
  };
  
  // Calculate odds
  const calculateOdds = (yesPool, noPool) => {
    const total = parseFloat(yesPool) + parseFloat(noPool);
    if (total === 0) return { yes: '1.00', no: '1.00' };
    
    const yesOdds = (total / parseFloat(yesPool)).toFixed(2);
    const noOdds = (total / parseFloat(noPool)).toFixed(2);
    
    return { yes: yesOdds, no: noOdds };
  };
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">InfoFi Markets</h1>
        <p className="text-muted-foreground">Bet on outcomes and earn rewards!</p>
      </div>
      
      {/* Create Market Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Market</CardTitle>
          <CardDescription>Create a new prediction market</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateMarket} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="raffleId">Raffle ID</Label>
                <Input
                  id="raffleId"
                  type="number"
                  value={newMarket.raffleId}
                  onChange={(e) => setNewMarket({...newMarket, raffleId: e.target.value})}
                  placeholder="Enter raffle ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tokenAddress">Token Address</Label>
                <Input
                  id="tokenAddress"
                  value={newMarket.tokenAddress}
                  onChange={(e) => setNewMarket({...newMarket, tokenAddress: e.target.value})}
                  placeholder="Enter token contract address"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question">Question</Label>
              <Input
                id="question"
                value={newMarket.question}
                onChange={(e) => setNewMarket({...newMarket, question: e.target.value})}
                placeholder="Enter yes/no question"
                required
              />
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreateMarket}>Create Market</Button>
        </CardFooter>
      </Card>
      
      {/* Place Bet Form */}
      <Card>
        <CardHeader>
          <CardTitle>Place Bet</CardTitle>
          <CardDescription>Place a bet on an existing market</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePlaceBet} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marketId">Market ID</Label>
                <Input
                  id="marketId"
                  type="number"
                  value={bet.marketId}
                  onChange={(e) => setBet({...bet, marketId: e.target.value})}
                  placeholder="Enter market ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={bet.amount}
                  onChange={(e) => setBet({...bet, amount: e.target.value})}
                  placeholder="Enter bet amount"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prediction</Label>
              <div className="flex space-x-4">
                <Button
                  type="button"
                  variant={bet.prediction ? 'default' : 'outline'}
                  onClick={() => setBet({...bet, prediction: true})}
                >
                  YES
                </Button>
                <Button
                  type="button"
                  variant={!bet.prediction ? 'default' : 'outline'}
                  onClick={() => setBet({...bet, prediction: false})}
                >
                  NO
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button onClick={handlePlaceBet}>Place Bet</Button>
        </CardFooter>
      </Card>
      
      {/* Active Markets List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {markets.map((market) => {
          const odds = calculateOdds(market.totalYesPool, market.totalNoPool);
          
          return (
            <Card key={market.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Market #{market.id}</CardTitle>
                <CardDescription>Raffle #{market.raffleId}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="mb-4 font-medium">{market.question}</p>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Pool:</span>
                    <span className="font-medium">{market.totalPool} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">YES Pool:</span>
                    <span className="font-medium">{market.totalYesPool} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NO Pool:</span>
                    <span className="font-medium">{market.totalNoPool} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">YES Odds:</span>
                    <span className="font-medium">{odds.yes}:1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NO Odds:</span>
                    <span className="font-medium">{odds.no}:1</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full"
                  onClick={() => setBet({...bet, marketId: market.id.toString()})}
                >
                  Place Bet
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default MarketList;