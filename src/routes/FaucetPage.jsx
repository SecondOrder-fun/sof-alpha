import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// No need to import getStoredNetworkKey anymore
import FaucetWidget from '@/components/faucet/FaucetWidget';

/**
 * FaucetPage component
 * Provides access to SOF token faucet for beta testers
 * Also includes links to external Sepolia ETH faucets
 */
const FaucetPage = () => {
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Beta Tester Faucets</h1>
      
      <Tabs defaultValue="sof">
        <TabsList className="mb-4">
          <TabsTrigger value="sof">$SOF Faucet</TabsTrigger>
          <TabsTrigger value="eth">Sepolia ETH Faucet</TabsTrigger>
        </TabsList>
        
        <TabsContent value="sof">
          <FaucetWidget />
        </TabsContent>
        
        <TabsContent value="eth">
          <Card>
            <CardHeader>
              <CardTitle>Sepolia ETH Faucet</CardTitle>
              <CardDescription>
                Get Sepolia ETH for testing from external faucets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                You&apos;ll need Sepolia ETH to pay for gas fees when interacting with contracts on the Sepolia testnet.
                Use one of these external faucets to get Sepolia ETH:
              </p>
              
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium">Alchemy Sepolia Faucet</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Requires free Alchemy account
                  </p>
                  <Button asChild variant="outline">
                    <a href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noopener noreferrer">
                      Visit Alchemy Faucet
                    </a>
                  </Button>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium">Infura Sepolia Faucet</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Requires free Infura account
                  </p>
                  <Button asChild variant="outline">
                    <a href="https://www.infura.io/faucet/sepolia" target="_blank" rel="noopener noreferrer">
                      Visit Infura Faucet
                    </a>
                  </Button>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium">Sepolia PoW Faucet</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Uses proof-of-work mining to prevent spam
                  </p>
                  <Button asChild variant="outline">
                    <a href="https://sepolia-faucet.pk910.de/" target="_blank" rel="noopener noreferrer">
                      Visit PoW Faucet
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FaucetPage;
