// src/components/raffle/RaffleDetailsCard.jsx
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import PropTypes from 'prop-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { useRaffle } from '@/hooks/useRaffle';
import { useSOFToken } from '@/hooks/useSOFToken';
import { formatAddress } from '@/lib/utils';

/**
 * RaffleDetailsCard component for displaying and interacting with a raffle
 */
const RaffleDetailsCard = ({ seasonId }) => {
  const { address, isConnected } = useAccount();
  const { 
    seasonDetails, 
    userPosition, 
    winners, 
    isLoading, 
    error, 
    buyTickets 
  } = useRaffle(seasonId);
  const { balance: sofBalance } = useSOFToken();
  
  const [ticketAmount, setTicketAmount] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [txHash, setTxHash] = useState('');
  
  // Handle buying tickets
  const handleBuyTickets = async () => {
    if (!ticketAmount || !maxCost) return;
    
    setTxHash('');
    try {
      const result = await buyTickets({ 
        amount: parseUnits(ticketAmount, 0), // Tickets are whole numbers
        maxCost: parseUnits(maxCost, 18) // SOF has 18 decimals
      });
      
      if (result?.hash) {
        setTxHash(result.hash);
        setTicketAmount('');
        setMaxCost('');
      }
    } catch (err) {
      // Error is handled by the hook
    }
  };
  
  // Calculate time remaining until end
  const getTimeRemaining = () => {
    if (!seasonDetails) return '';
    
    const now = Math.floor(Date.now() / 1000);
    const endTime = seasonDetails.endTime;
    const remaining = endTime - now;
    
    if (remaining <= 0) return 'Ended';
    
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  // Get explorer URL for transaction
  const getExplorerUrl = (hash) => {
    if (!hash) return '#';
    
    // This is a simplified version - in a real app, you'd use the network config
    const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? '#' // No explorer for local
      : 'https://sepolia.etherscan.io/tx/';
      
    return `${baseUrl}${hash}`;
  };
  
  // Render loading state
  if (isLoading && !seasonDetails) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-center items-center h-40">
            <p className="text-muted-foreground">Loading raffle details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Render not found state
  if (!seasonDetails) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Raffle Not Found</AlertTitle>
            <AlertDescription>
              The raffle season #{seasonId} could not be found or has not been created yet.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Raffle Season #{seasonId}</CardTitle>
        <CardDescription>
          {seasonDetails.isActive ? (
            <span className="text-green-600">Active - Ends in {getTimeRemaining()}</span>
          ) : seasonDetails.isEnded ? (
            <span className="text-amber-600">Ended</span>
          ) : (
            <span className="text-muted-foreground">Pending</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Your Position</h3>
            <p className="text-2xl font-bold">{userPosition.ticketCount} Tickets</p>
            <p className="text-sm text-muted-foreground">
              {userPosition.probability.toFixed(2)}% chance to win
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Total Tickets</h3>
            <p className="text-2xl font-bold">
              {seasonDetails.totalTickets ? seasonDetails.totalTickets.toLocaleString() : '0'}
            </p>
          </div>
        </div>
        
        {/* Winners section (if resolved) */}
        {seasonDetails.isResolved && winners.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Winners</h3>
            <div className="space-y-2">
              {winners.map((winner, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-muted rounded-md">
                  <span>#{index + 1}: {formatAddress(winner)}</span>
                  {winner.toLowerCase() === address?.toLowerCase() && (
                    <span className="text-green-600 font-semibold">You won!</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Buy tickets form (if active) */}
        {seasonDetails.isActive && isConnected && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Buy Tickets</h3>
            
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {txHash && (
              <Alert className="mb-4 bg-green-50 border-green-200">
                <AlertTitle>Success!</AlertTitle>
                <AlertDescription>
                  Transaction submitted: {' '}
                  <a 
                    href={getExplorerUrl(txHash)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Ticket Amount</label>
                <Input
                  type="number"
                  value={ticketAmount}
                  onChange={(e) => setTicketAmount(e.target.value)}
                  placeholder="Number of tickets"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Cost (SOF)</label>
                <Input
                  type="number"
                  value={maxCost}
                  onChange={(e) => setMaxCost(e.target.value)}
                  placeholder="Maximum SOF to spend"
                  min="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your balance: {parseFloat(sofBalance).toLocaleString()} SOF
                </p>
              </div>
            </div>
            
            <Button 
              onClick={handleBuyTickets} 
              disabled={isLoading || !ticketAmount || !maxCost}
              className="w-full"
            >
              {isLoading ? 'Processing...' : 'Buy Tickets'}
            </Button>
          </div>
        )}
        
        {/* Not connected message */}
        {!isConnected && (
          <Alert>
            <AlertTitle>Connect your wallet</AlertTitle>
            <AlertDescription>
              Please connect your wallet to participate in this raffle
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4 flex justify-between">
        <div className="text-sm text-muted-foreground">
          <span>Start: {new Date(seasonDetails.startTime * 1000).toLocaleString()}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          <span>End: {new Date(seasonDetails.endTime * 1000).toLocaleString()}</span>
        </div>
      </CardFooter>
    </Card>
  );
};

RaffleDetailsCard.propTypes = {
  seasonId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired
};

export default RaffleDetailsCard;
