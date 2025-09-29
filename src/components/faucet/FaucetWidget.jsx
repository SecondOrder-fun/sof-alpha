// src/components/faucet/FaucetWidget.jsx
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFaucet } from '@/hooks/useFaucet';

/**
 * FaucetWidget component for claiming SOF tokens
 */
const FaucetWidget = () => {
  const { isConnected } = useAccount();
  const { 
    sofBalance, 
    faucetData, 
    isLoading, 
    error, 
    claim, 
    contributeKarma,
    getTimeRemaining,
    isClaimable 
  } = useFaucet();
  
  const [timeRemaining, setTimeRemaining] = useState('');
  const [txHash, setTxHash] = useState('');
  const [karmaAmount, setKarmaAmount] = useState('');
  const [activeTab, setActiveTab] = useState('claim');
  
  // Update time remaining every second
  useEffect(() => {
    if (!faucetData) return;
    
    const updateTime = () => {
      setTimeRemaining(getTimeRemaining());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [faucetData, getTimeRemaining]);
  
  // Handle claim
  const handleClaim = async () => {
    setTxHash('');
    try {
      const result = await claim();
      if (result?.hash) {
        setTxHash(result.hash);
      }
    } catch (err) {
      // Error is handled by the hook
    }
  };
  
  // Handle karma contribution
  const handleKarmaContribution = async () => {
    setTxHash('');
    try {
      if (!karmaAmount || parseFloat(karmaAmount) <= 0) {
        return;
      }
      
      const result = await contributeKarma(karmaAmount);
      if (result?.hash) {
        setTxHash(result.hash);
        setKarmaAmount(''); // Reset input after successful contribution
      }
    } catch (err) {
      // Error is handled by the hook
    }
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
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>$SOF Token Faucet</CardTitle>
        <CardDescription>
          Get $SOF tokens for testing or contribute back to the community
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <Alert>
            <AlertTitle>Connect your wallet</AlertTitle>
            <AlertDescription>
              Please connect your wallet to use the faucet
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Your $SOF Balance</h3>
                <p className="text-2xl font-bold">{parseFloat(sofBalance).toLocaleString()} SOF</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Claim Amount</h3>
                <p className="text-2xl font-bold">
                  {faucetData ? parseFloat(faucetData.amountPerRequest).toLocaleString() : '0'} SOF
                </p>
              </div>
            </div>
            
            {timeRemaining ? (
              <Alert className="mb-4">
                <AlertTitle>Cooldown Period</AlertTitle>
                <AlertDescription>
                  You can claim again in {timeRemaining}
                </AlertDescription>
              </Alert>
            ) : null}
            
            {error ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            
            {txHash ? (
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
            ) : null}
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="claim">Claim Tokens</TabsTrigger>
                <TabsTrigger value="karma">Contribute Karma</TabsTrigger>
              </TabsList>
              
              <TabsContent value="claim" className="mt-0">
                <Button 
                  onClick={handleClaim} 
                  disabled={!isClaimable || isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Processing...' : 'Claim $SOF Tokens'}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Claim {faucetData ? parseFloat(faucetData.amountPerRequest).toLocaleString() : '0'} SOF tokens every 6 hours
                </p>
              </TabsContent>
              
              <TabsContent value="karma" className="mt-0">
                <div className="flex flex-col space-y-4">
                  <div className="flex space-x-2">
                    <Input
                      type="number"
                      placeholder="Amount to contribute"
                      value={karmaAmount}
                      onChange={(e) => setKarmaAmount(e.target.value)}
                      min="0"
                      step="1"
                    />
                    <Button 
                      onClick={handleKarmaContribution}
                      disabled={!karmaAmount || parseFloat(karmaAmount) <= 0 || isLoading || parseFloat(karmaAmount) > parseFloat(sofBalance)}
                    >
                      Contribute
                    </Button>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Return SOF tokens to the faucet for others to use
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// No props required for this component

export default FaucetWidget;
