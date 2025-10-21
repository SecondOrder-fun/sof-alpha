import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSeasonCSMM } from '@/hooks/useSeasonCSMM';
import { useSOFToken } from '@/hooks/useSOFToken';

/**
 * Trading panel for InfoFi prediction markets
 * @param {string} csmmAddress - SeasonCSMM contract address
 * @param {string} playerAddress - Player address to trade on
 * @param {string} playerName - Display name for the player
 * @param {number} seasonId - Current season ID
 */
export function InfoFiTradingPanel({ csmmAddress, playerAddress, playerName, seasonId }) {
  const { address: userAddress } = useAccount();
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [slippageTolerance, setSlippageTolerance] = useState('1'); // 1% default
  
  const {
    useMarketState,
    useUserPosition,
    usePrice,
    useCalcBuyCost,
    useCalcSellRevenue,
    buyShares,
    sellShares,
    claimPayout,
    isBuyingShares,
    buySharesSuccess,
    isSellingShares,
    sellSharesSuccess,
    isClaimingPayout,
    claimPayoutSuccess,
    formatPrice,
    formatAmount
  } = useSeasonCSMM(csmmAddress, userAddress);
  
  const { approve, isApproving, approveSuccess } = useSOFToken(userAddress);
  
  // Get market state
  const { data: marketState } = useMarketState(playerAddress);
  const [yesReserve, noReserve, isActive, isResolved, outcome] = marketState || [];
  
  // Get user position
  const { data: userPosition } = useUserPosition(playerAddress);
  const [userYesShares, userNoShares] = userPosition || [0n, 0n];
  
  // Get current prices
  const { data: yesPrice } = usePrice(playerAddress, true);
  const { data: noPrice } = usePrice(playerAddress, false);
  
  // Calculate costs/revenues
  const { data: buyCost } = useCalcBuyCost(playerAddress, true, buyAmount);
  const { data: sellRevenue } = useCalcSellRevenue(playerAddress, true, sellAmount);
  
  // Reset forms on success
  useEffect(() => {
    if (buySharesSuccess) {
      setBuyAmount('');
    }
  }, [buySharesSuccess]);
  
  useEffect(() => {
    if (sellSharesSuccess) {
      setSellAmount('');
    }
  }, [sellSharesSuccess]);
  
  const handleBuyYes = async () => {
    if (!buyAmount || !buyCost) return;
    
    const maxCost = (Number(formatAmount(buyCost)) * (1 + Number(slippageTolerance) / 100)).toFixed(18);
    
    // First approve if needed
    if (!approveSuccess) {
      await approve(csmmAddress, maxCost);
    }
    
    // Then buy
    await buyShares(playerAddress, true, buyAmount, maxCost);
  };
  
  const handleBuyNo = async () => {
    if (!buyAmount || !buyCost) return;
    
    const maxCost = (Number(formatAmount(buyCost)) * (1 + Number(slippageTolerance) / 100)).toFixed(18);
    
    // First approve if needed
    if (!approveSuccess) {
      await approve(csmmAddress, maxCost);
    }
    
    // Then buy
    await buyShares(playerAddress, false, buyAmount, maxCost);
  };
  
  const handleSellYes = async () => {
    if (!sellAmount || !sellRevenue) return;
    
    const minRevenue = (Number(formatAmount(sellRevenue)) * (1 - Number(slippageTolerance) / 100)).toFixed(18);
    await sellShares(playerAddress, true, sellAmount, minRevenue);
  };
  
  const handleSellNo = async () => {
    if (!sellAmount || !sellRevenue) return;
    
    const minRevenue = (Number(formatAmount(sellRevenue)) * (1 - Number(slippageTolerance) / 100)).toFixed(18);
    await sellShares(playerAddress, false, sellAmount, minRevenue);
  };
  
  const handleClaimPayout = async () => {
    await claimPayout(playerAddress);
  };
  
  if (!isActive && !isResolved) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This market has not been created yet. Markets are created when a player crosses the 1% threshold.
        </AlertDescription>
      </Alert>
    );
  }
  
  if (isResolved) {
    const hasWinningShares = outcome ? userYesShares > 0n : userNoShares > 0n;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Market Resolved
          </CardTitle>
          <CardDescription>
            {outcome ? 'YES' : 'NO'} outcome - {playerName} {outcome ? 'won' : 'lost'} the raffle
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasWinningShares ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-900">You have winning shares!</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {formatAmount(outcome ? userYesShares : userNoShares)} shares
                </p>
              </div>
              <Button
                onClick={handleClaimPayout}
                disabled={isClaimingPayout}
                className="w-full"
              >
                {isClaimingPayout ? 'Claiming...' : 'Claim Payout (2% fee)'}
              </Button>
              {claimPayoutSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>Payout claimed successfully!</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                You don&apos;t have any winning shares in this market.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade: Will {playerName} win?</CardTitle>
        <CardDescription>
          Season {seasonId} Prediction Market
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Current Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-900">YES</span>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-600 mt-2">
                {formatPrice(yesPrice)}
              </p>
              <p className="text-xs text-green-700 mt-1">
                {formatAmount(yesReserve)} available
              </p>
            </div>
            
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-900">NO</span>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-600 mt-2">
                {formatPrice(noPrice)}
              </p>
              <p className="text-xs text-red-700 mt-1">
                {formatAmount(noReserve)} available
              </p>
            </div>
          </div>
          
          {/* Your Position */}
          {userAddress && (userYesShares > 0n || userNoShares > 0n) && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-2">Your Position</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-blue-700">YES Shares</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatAmount(userYesShares)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">NO Shares</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatAmount(userNoShares)}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Trading Interface */}
          <Tabs defaultValue="buy" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buy">Buy</TabsTrigger>
              <TabsTrigger value="sell">Sell</TabsTrigger>
            </TabsList>
            
            <TabsContent value="buy" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="buyAmount">Amount (SOF)</Label>
                <Input
                  id="buyAmount"
                  type="number"
                  placeholder="0.0"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  step="0.01"
                  min="0"
                />
                {buyCost && (
                  <p className="text-sm text-muted-foreground">
                    Cost: {formatAmount(buyCost)} SOF
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="slippage">Slippage Tolerance (%)</Label>
                <Input
                  id="slippage"
                  type="number"
                  value={slippageTolerance}
                  onChange={(e) => setSlippageTolerance(e.target.value)}
                  step="0.1"
                  min="0"
                  max="10"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={handleBuyYes}
                  disabled={!buyAmount || isBuyingShares || isApproving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isBuyingShares || isApproving ? 'Processing...' : 'Buy YES'}
                </Button>
                <Button
                  onClick={handleBuyNo}
                  disabled={!buyAmount || isBuyingShares || isApproving}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isBuyingShares || isApproving ? 'Processing...' : 'Buy NO'}
                </Button>
              </div>
              
              {buySharesSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>Shares purchased successfully!</AlertDescription>
                </Alert>
              )}
            </TabsContent>
            
            <TabsContent value="sell" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sellAmount">Amount (SOF)</Label>
                <Input
                  id="sellAmount"
                  type="number"
                  placeholder="0.0"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  step="0.01"
                  min="0"
                />
                {sellRevenue && (
                  <p className="text-sm text-muted-foreground">
                    Revenue: {formatAmount(sellRevenue)} SOF
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={handleSellYes}
                  disabled={!sellAmount || isSellingShares || userYesShares === 0n}
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50"
                >
                  {isSellingShares ? 'Processing...' : 'Sell YES'}
                </Button>
                <Button
                  onClick={handleSellNo}
                  disabled={!sellAmount || isSellingShares || userNoShares === 0n}
                  variant="outline"
                  className="border-red-600 text-red-600 hover:bg-red-50"
                >
                  {isSellingShares ? 'Processing...' : 'Sell NO'}
                </Button>
              </div>
              
              {sellSharesSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>Shares sold successfully!</AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
          
          {/* Market Info */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Linear pricing: Cost = Amount (1:1 ratio)</p>
            <p>• YES + NO reserves always = 10 SOF</p>
            <p>• 2% fee on winnings after resolution</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
