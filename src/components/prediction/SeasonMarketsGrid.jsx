import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TrendingUp, Users, DollarSign } from 'lucide-react';
import { useInfoFiFactory } from '@/hooks/useInfoFiFactory';
import { useSeasonCSMM } from '@/hooks/useSeasonCSMM';
import { InfoFiTradingPanel } from './InfoFiTradingPanel';

/**
 * Grid display of all prediction markets for a season
 * @param {number} seasonId - Season ID
 * @param {string} factoryAddress - InfoFiMarketFactory contract address
 */
export function SeasonMarketsGrid({ seasonId, factoryAddress }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const { useSeasonCSMM, useSeasonPlayers, useMarketCount } = useInfoFiFactory(factoryAddress);
  
  // Get CSMM address
  const { data: csmmAddress } = useSeasonCSMM(seasonId);
  
  // Get all players with markets
  const { data: players } = useSeasonPlayers(seasonId);
  
  // Get market count
  const { data: marketCount } = useMarketCount(seasonId);
  
  const { totalLiquidity, activeMarketCount } = useSeasonCSMM(csmmAddress);
  
  if (!csmmAddress || csmmAddress === '0x0000000000000000000000000000000000000000') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Prediction Markets</CardTitle>
          <CardDescription>
            No prediction markets created yet for Season {seasonId}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Markets will be created automatically when players cross the 1% threshold.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Season Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Season {seasonId} Prediction Markets
          </CardTitle>
          <CardDescription>
            Trade on who will win the raffle
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Active Markets</p>
                <p className="text-2xl font-bold">{activeMarketCount || marketCount || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Liquidity</p>
                <p className="text-2xl font-bold">{totalLiquidity} SOF</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Per Market</p>
                <p className="text-2xl font-bold">10 SOF</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Markets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {players && players.map((playerAddress, index) => (
          <PlayerMarketCard
            key={playerAddress}
            playerAddress={playerAddress}
            playerIndex={index + 1}
            csmmAddress={csmmAddress}
            seasonId={seasonId}
            onSelect={() => setSelectedPlayer(playerAddress)}
          />
        ))}
      </div>
      
      {/* Trading Dialog */}
      {selectedPlayer && (
        <Dialog open={!!selectedPlayer} onOpenChange={() => setSelectedPlayer(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Trade Prediction Market</DialogTitle>
            </DialogHeader>
            <InfoFiTradingPanel
              csmmAddress={csmmAddress}
              playerAddress={selectedPlayer}
              playerName={`Player ${selectedPlayer.slice(0, 6)}...${selectedPlayer.slice(-4)}`}
              seasonId={seasonId}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Individual player market card
 */
function PlayerMarketCard({ playerAddress, playerIndex, csmmAddress, seasonId, onSelect }) {
  const { useMarketState, usePrice, formatPrice } = useSeasonCSMM(csmmAddress);
  
  const { data: marketState } = useMarketState(playerAddress);
  const [, , isActive, isResolved, outcome] = marketState || [];
  
  const { data: yesPrice } = usePrice(playerAddress, true);
  const { data: noPrice } = usePrice(playerAddress, false);
  
  const displayName = `Player ${playerIndex}`;
  const shortAddress = `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`;
  
  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onSelect}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{displayName}</CardTitle>
          {isResolved ? (
            <Badge variant={outcome ? "default" : "secondary"}>
              {outcome ? 'WON' : 'LOST'}
            </Badge>
          ) : (
            <Badge variant="outline">Active</Badge>
          )}
        </div>
        <CardDescription className="font-mono text-xs">
          {shortAddress}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-xs text-green-700 font-medium">YES</p>
              <p className="text-lg font-bold text-green-600">
                {formatPrice(yesPrice)}
              </p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-xs text-red-700 font-medium">NO</p>
              <p className="text-lg font-bold text-red-600">
                {formatPrice(noPrice)}
              </p>
            </div>
          </div>
          
          <Button className="w-full" size="sm" onClick={onSelect}>
            {isResolved ? 'View Results' : 'Trade'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
