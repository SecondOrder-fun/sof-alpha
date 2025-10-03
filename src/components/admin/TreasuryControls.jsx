import { useState } from 'react';
import { useTreasury } from '@/hooks/useTreasury';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle2, Wallet, TrendingUp, DollarSign } from 'lucide-react';
import PropTypes from 'prop-types';
import { parseEther } from 'viem';

export function TreasuryControls({ seasonId }) {
  const {
    accumulatedFees,
    accumulatedFeesRaw,
    sofReserves,
    treasuryBalance,
    treasuryBalanceRaw,
    totalFeesCollected,
    treasuryAddress,
    hasManagerRole,
    hasTreasuryRole,
    canExtractFees,
    canTransferToTreasury,
    extractFees,
    transferToTreasury,
    isExtracting,
    isExtractConfirmed,
    extractError,
    isTransferring,
    isTransferConfirmed,
    transferError,
  } = useTreasury(seasonId);

  const [transferAmount, setTransferAmount] = useState('');

  const handleExtract = async () => {
    await extractFees();
  };

  const handleTransfer = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) return;
    
    try {
      const amount = parseEther(transferAmount);
      await transferToTreasury(amount);
      setTransferAmount('');
    } catch (error) {
      // Error is handled by wagmi
      return;
    }
  };

  const handleTransferAll = async () => {
    if (!treasuryBalanceRaw) return;
    await transferToTreasury(treasuryBalanceRaw);
  };

  if (!hasManagerRole && !hasTreasuryRole) {
    return null; // Don't show treasury controls if user doesn't have permissions
  }

  return (
    <Card className="mt-4 border-amber-500" data-testid="treasury-controls">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Treasury Management
        </CardTitle>
        <CardDescription>
          Manage platform fee collection and treasury distribution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Fee Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              Accumulated Fees
            </p>
            <p className="text-2xl font-bold">{parseFloat(accumulatedFees).toFixed(4)} SOF</p>
            <p className="text-xs text-muted-foreground">In bonding curve</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Treasury Balance
            </p>
            <p className="text-2xl font-bold">{parseFloat(treasuryBalance).toFixed(4)} SOF</p>
            <p className="text-xs text-muted-foreground">In SOF token contract</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Total Collected
            </p>
            <p className="text-2xl font-bold">{parseFloat(totalFeesCollected).toFixed(4)} SOF</p>
            <p className="text-xs text-muted-foreground">All-time platform revenue</p>
          </div>
        </div>

        <Separator />

        {/* Fee Extraction Section */}
        {hasManagerRole && (
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold mb-1">Step 1: Extract Fees</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Transfer accumulated fees from bonding curve to SOF token contract
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleExtract}
                disabled={!canExtractFees || isExtracting}
                variant="default"
                data-testid="extract-fees-button"
              >
                {isExtracting ? 'Extracting...' : `Extract ${parseFloat(accumulatedFees).toFixed(2)} SOF`}
              </Button>
              
              {isExtractConfirmed && (
                <Alert className="flex-1 py-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Fees extracted successfully!
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {extractError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {extractError.message || 'Failed to extract fees'}
                </AlertDescription>
              </Alert>
            )}

            {!canExtractFees && accumulatedFeesRaw === 0n && (
              <p className="text-sm text-muted-foreground">
                No fees to extract. Fees accumulate as users buy/sell tickets.
              </p>
            )}
          </div>
        )}

        {hasManagerRole && hasTreasuryRole && <Separator />}

        {/* Treasury Distribution Section */}
        {hasTreasuryRole && (
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold mb-1">Step 2: Distribute to Treasury</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Transfer fees from SOF token contract to treasury address
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="transfer-amount">Amount (SOF)</Label>
                <div className="flex gap-2">
                  <Input
                    id="transfer-amount"
                    type="number"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    disabled={isTransferring}
                    step="0.01"
                    min="0"
                    max={treasuryBalance}
                  />
                  <Button
                    onClick={() => setTransferAmount(treasuryBalance)}
                    variant="outline"
                    disabled={isTransferring}
                  >
                    Max
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleTransfer}
                  disabled={!canTransferToTreasury || !transferAmount || isTransferring}
                  variant="default"
                  data-testid="transfer-to-treasury-button"
                >
                  {isTransferring ? 'Transferring...' : 'Transfer to Treasury'}
                </Button>
                
                <Button
                  onClick={handleTransferAll}
                  disabled={!canTransferToTreasury || isTransferring}
                  variant="outline"
                  data-testid="transfer-all-button"
                >
                  Transfer All
                </Button>
              </div>

              {isTransferConfirmed && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Transferred successfully to treasury!
                  </AlertDescription>
                </Alert>
              )}

              {transferError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {transferError.message || 'Failed to transfer to treasury'}
                  </AlertDescription>
                </Alert>
              )}

              {treasuryAddress && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium">Treasury Address:</p>
                  <p className="font-mono text-xs break-all">{treasuryAddress}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Additional Info */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium">How it works:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Fees accumulate in bonding curve as users trade (0.1% buy, 0.7% sell)</li>
            <li>Admin extracts fees to SOF token contract (Step 1)</li>
            <li>Treasury manager distributes fees to treasury address (Step 2)</li>
          </ol>
          
          <p className="text-xs mt-3">
            <strong>Note:</strong> For production, treasury address should be a multisig wallet.
          </p>
        </div>

        {/* Reserves Info */}
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-1">Bonding Curve Reserves</p>
          <p className="text-lg font-bold">{parseFloat(sofReserves).toFixed(4)} SOF</p>
          <p className="text-xs text-muted-foreground">
            Reserves backing raffle tokens (not extractable)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

TreasuryControls.propTypes = {
  seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};
