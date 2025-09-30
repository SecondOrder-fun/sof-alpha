import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from '@/hooks/useWallet';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { formatMarketId, isValidMarketId } from '@/lib/marketId';

const MarketList = () => {
  const { t } = useTranslation('market');
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

  // Derive canonical marketIds for mock items (WINNER_PREDICTION, subject '-')
  const marketsWithCanonicalId = useMemo(() => {
    return markets.map((m) => ({
      ...m,
      canonicalId: formatMarketId({ seasonId: m.raffleId, marketType: 'WINNER_PREDICTION', subject: '-' }),
    }));
  }, [markets]);
  
  // Function to create a new market
  const handleCreateMarket = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast({
        title: t('walletNotConnected'),
        description: t('connectWalletToCreate'),
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
        title: t('marketCreated'),
        description: t('marketCreatedSuccess')
      });
    } catch (error) {
      toast({
        title: t('common:error'),
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
        title: t('walletNotConnected'),
        description: t('connectWalletToBet'),
        variant: 'destructive'
      });
      return;
    }
    
    try {
      // Validate canonical marketId
      if (!isValidMarketId(bet.marketId)) {
        toast({
          title: t('invalidMarketId'),
          description: t('invalidMarketIdDesc'),
          variant: 'destructive'
        });
        return;
      }
      // TODO: Implement actual contract interaction
      // console.log('Placing bet:', bet);
      
      toast({
        title: t('betPlaced'),
        description: t('betPlacedSuccess', { prediction: bet.prediction ? 'YES' : 'NO', amount: bet.amount })
      });
      
      // Reset form
      setBet({
        marketId: '',
        prediction: true,
        amount: ''
      });
    } catch (error) {
      toast({
        title: t('common:error'),
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
        <h1 className="text-3xl font-bold">{t('infoFiMarkets')}</h1>
        <p className="text-muted-foreground">{t('betOnOutcomes')}</p>
      </div>
      
      {/* Create Market Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('createNewMarket')}</CardTitle>
          <CardDescription>{t('createPredictionMarket')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateMarket} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="raffleId">{t('raffleId')}</Label>
                <Input
                  id="raffleId"
                  type="number"
                  value={newMarket.raffleId}
                  onChange={(e) => setNewMarket({...newMarket, raffleId: e.target.value})}
                  placeholder={t('enterRaffleId')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tokenAddress">{t('tokenAddress')}</Label>
                <Input
                  id="tokenAddress"
                  value={newMarket.tokenAddress}
                  onChange={(e) => setNewMarket({...newMarket, tokenAddress: e.target.value})}
                  placeholder={t('enterTokenAddress')}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question">{t('question')}</Label>
              <Input
                id="question"
                value={newMarket.question}
                onChange={(e) => setNewMarket({...newMarket, question: e.target.value})}
                placeholder={t('enterYesNoQuestion')}
                required
              />
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreateMarket}>{t('createMarket')}</Button>
        </CardFooter>
      </Card>
      
      {/* Place Bet Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('placeBet')}</CardTitle>
          <CardDescription>{t('placeABet')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePlaceBet} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marketId">{t('marketId', { id: '' }).replace(': ', '')}</Label>
                <Input
                  id="marketId"
                  value={bet.marketId}
                  onChange={(e) => setBet({ ...bet, marketId: e.target.value })}
                  placeholder={t('enterMarketId')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">{t('common:amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  value={bet.amount}
                  onChange={(e) => setBet({...bet, amount: e.target.value})}
                  placeholder={t('common:amount')}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('prediction')}</Label>
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
          <Button onClick={handlePlaceBet}>{t('placeBet')}</Button>
        </CardFooter>
      </Card>
      
      {/* Active Markets List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {marketsWithCanonicalId.map((market) => {
          const odds = calculateOdds(market.totalYesPool, market.totalNoPool);
          
          return (
            <Card key={market.canonicalId} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{t('market')} {market.canonicalId}</CardTitle>
                <CardDescription>{t('raffle:season')} #{market.raffleId}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="mb-4 font-medium">{market.question}</p>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('totalPool')}:</span>
                    <span className="font-medium">{market.totalPool} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('yesPool')}:</span>
                    <span className="font-medium">{market.totalYesPool} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('noPool')}:</span>
                    <span className="font-medium">{market.totalNoPool} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('yesOdds')}:</span>
                    <span className="font-medium">{odds.yes}:1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('noOdds')}:</span>
                    <span className="font-medium">{odds.no}:1</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full"
                  onClick={() => setBet({ ...bet, marketId: market.canonicalId })}
                >
                  {t('placeBet')}
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