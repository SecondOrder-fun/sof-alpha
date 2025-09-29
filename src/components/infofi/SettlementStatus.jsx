// src/components/infofi/SettlementStatus.jsx
import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useSettlement } from '@/hooks/useSettlement';
import AddressLink from '@/components/common/AddressLink';
import { shortAddress } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';

/**
 * SettlementStatus component
 * Displays the settlement status of an InfoFi market
 * @param {Object} props - Component props
 * @param {string|number} props.marketId - The ID of the market to check settlement status for
 * @param {string} props.marketType - The type of market (e.g., "WINNER_PREDICTION")
 * @param {string} props.question - The market question
 * @param {boolean} props.compact - Whether to show a compact version of the component
 */
const SettlementStatus = ({ marketId, marketType, question, compact = false }) => {
  const { outcome, settlementStatus, isLoading, error } = useSettlement(marketId);
  
  const statusDisplay = useMemo(() => {
    switch (settlementStatus) {
      case 'settled':
        return {
          label: 'Settled',
          color: 'success',
          icon: CheckCircle,
        };
      case 'settling':
        return {
          label: 'Settling',
          color: 'warning',
          icon: Loader2,
        };
      case 'pending':
        return {
          label: 'Pending',
          color: 'default',
          icon: Clock,
        };
      default:
        return {
          label: 'Unknown',
          color: 'secondary',
          icon: AlertCircle,
        };
    }
  }, [settlementStatus]);
  
  const StatusIcon = statusDisplay.icon;
  
  // Format the settlement time if available
  const formattedSettlementTime = useMemo(() => {
    if (!outcome?.settledAt || outcome.settledAt === 0) return null;
    
    const date = new Date(outcome.settledAt * 1000);
    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      absolute: date.toLocaleString(),
    };
  }, [outcome?.settledAt]);
  
  // Compact view for embedding in other components
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <StatusIcon className={`h-4 w-4 ${statusDisplay.color === 'success' ? 'text-green-500' : 
          statusDisplay.color === 'warning' ? 'text-amber-500' : 
          statusDisplay.color === 'default' ? 'text-blue-500' : 'text-gray-500'}`} />
        <span className="text-sm">{statusDisplay.label}</span>
        {formattedSettlementTime && (
          <span className="text-xs text-muted-foreground">
            {formattedSettlementTime.relative}
          </span>
        )}
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StatusIcon className={`h-5 w-5 ${statusDisplay.color === 'success' ? 'text-green-500' : 
            statusDisplay.color === 'warning' ? 'text-amber-500' : 
            statusDisplay.color === 'default' ? 'text-blue-500' : 'text-gray-500'}`} />
          Market Settlement Status
        </CardTitle>
        <CardDescription>
          {marketType === 'WINNER_PREDICTION' ? 'Winner Prediction' : marketType}
          {question && `: ${question}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading settlement information...</span>
          </div>
        ) : error ? (
          <div className="text-red-500">
            Error loading settlement status: {error.message || String(error)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={
                statusDisplay.color === 'success' ? 'success' : 
                statusDisplay.color === 'warning' ? 'warning' : 
                statusDisplay.color === 'default' ? 'default' : 'secondary'
              }>
                {statusDisplay.label}
              </Badge>
              {formattedSettlementTime && (
                <span className="text-sm text-muted-foreground" title={formattedSettlementTime.absolute}>
                  Settled {formattedSettlementTime.relative}
                </span>
              )}
            </div>
            
            {outcome && (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Market ID:</span>{' '}
                  <span className="font-mono text-xs">{marketId}</span>
                </div>
                
                {outcome.winner && outcome.winner !== '0x0000000000000000000000000000000000000000' && (
                  <div className="text-sm">
                    <span className="font-medium">Winner:</span>{' '}
                    <AddressLink address={outcome.winner} />
                    {' '}({shortAddress(outcome.winner)})
                  </div>
                )}
                
                {settlementStatus === 'settled' && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-green-800 text-sm">
                      This market has been settled. If you have winning positions, you can claim your rewards.
                    </p>
                  </div>
                )}
                
                {settlementStatus === 'settling' && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                    <p className="text-amber-800 text-sm">
                      Settlement in progress. Please wait while the market is being settled.
                    </p>
                  </div>
                )}
                
                {settlementStatus === 'pending' && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-blue-800 text-sm">
                      This market is waiting for settlement. Settlement will occur after the raffle winner is determined.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

SettlementStatus.propTypes = {
  marketId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  marketType: PropTypes.string,
  question: PropTypes.string,
  compact: PropTypes.bool,
};

export default SettlementStatus;
