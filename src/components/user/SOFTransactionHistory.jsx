// src/components/user/SOFTransactionHistory.jsx
import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowDownIcon, 
  ArrowUpIcon, 
  TrendingUpIcon, 
  TrendingDownIcon,
  TrophyIcon,
  CoinsIcon,
  FilterIcon,
  ExternalLinkIcon
} from 'lucide-react';
import { useSOFTransactions } from '@/hooks/useSOFTransactions';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';

/**
 * Component to display comprehensive $SOF transaction history
 * Shows: transfers, bonding curve trades, prize claims, fees collected
 */
export function SOFTransactionHistory({ address }) {
  const { t } = useTranslation('account');
  const [filter, setFilter] = useState('ALL'); // ALL, IN, OUT, TRADES, PRIZES
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const { data: transactions = [], isLoading, error } = useSOFTransactions(address);

  const netKey = getStoredNetworkKey();
  const network = getNetworkByKey(netKey);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    if (filter === 'ALL') return transactions;
    if (filter === 'IN') {
      return transactions.filter(tx => tx.direction === 'IN');
    }
    if (filter === 'OUT') {
      return transactions.filter(tx => tx.direction === 'OUT');
    }
    if (filter === 'TRADES') {
      return transactions.filter(tx => 
        tx.type === 'BONDING_CURVE_BUY' || tx.type === 'BONDING_CURVE_SELL'
      );
    }
    if (filter === 'PRIZES') {
      return transactions.filter(tx => 
        tx.type === 'PRIZE_CLAIM_GRAND' || tx.type === 'PRIZE_CLAIM_CONSOLATION'
      );
    }
    return transactions;
  }, [transactions, filter]);

  // Paginate
  const paginatedTransactions = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredTransactions.slice(start, end);
  }, [filteredTransactions, page]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalIn = transactions
      .filter(tx => tx.direction === 'IN')
      .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    
    const totalOut = transactions
      .filter(tx => tx.direction === 'OUT')
      .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

    const tradeCount = transactions.filter(tx => 
      tx.type === 'BONDING_CURVE_BUY' || tx.type === 'BONDING_CURVE_SELL'
    ).length;

    const prizeCount = transactions.filter(tx => 
      tx.type === 'PRIZE_CLAIM_GRAND' || tx.type === 'PRIZE_CLAIM_CONSOLATION'
    ).length;

    return {
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      netFlow: (totalIn - totalOut).toFixed(2),
      tradeCount,
      prizeCount,
      totalTransactions: transactions.length,
    };
  }, [transactions]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('sofTransactionHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('common:loading')}</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('sofTransactionHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{t('errorLoadingTransactions')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CoinsIcon className="h-5 w-5" />
          {t('sofTransactionHistory')}
        </CardTitle>
        <CardDescription>{t('sofTransactionHistoryDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{t('totalReceived')}</div>
            <div className="text-lg font-semibold text-green-600 flex items-center gap-1">
              <ArrowDownIcon className="h-4 w-4" />
              {stats.totalIn} SOF
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{t('totalSent')}</div>
            <div className="text-lg font-semibold text-red-600 flex items-center gap-1">
              <ArrowUpIcon className="h-4 w-4" />
              {stats.totalOut} SOF
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{t('netFlow')}</div>
            <div className={`text-lg font-semibold ${parseFloat(stats.netFlow) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.netFlow} SOF
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">{t('totalTransactions')}</div>
            <div className="text-lg font-semibold">{stats.totalTransactions}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            variant={filter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('ALL'); setPage(0); }}
          >
            <FilterIcon className="h-3 w-3 mr-1" />
            {t('all')} ({transactions.length})
          </Button>
          <Button
            variant={filter === 'IN' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('IN'); setPage(0); }}
          >
            <ArrowDownIcon className="h-3 w-3 mr-1" />
            {t('received')}
          </Button>
          <Button
            variant={filter === 'OUT' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('OUT'); setPage(0); }}
          >
            <ArrowUpIcon className="h-3 w-3 mr-1" />
            {t('sent')}
          </Button>
          <Button
            variant={filter === 'TRADES' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('TRADES'); setPage(0); }}
          >
            <TrendingUpIcon className="h-3 w-3 mr-1" />
            {t('trades')} ({stats.tradeCount})
          </Button>
          <Button
            variant={filter === 'PRIZES' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('PRIZES'); setPage(0); }}
          >
            <TrophyIcon className="h-3 w-3 mr-1" />
            {t('prizes')} ({stats.prizeCount})
          </Button>
        </div>

        {/* Transaction List */}
        {filteredTransactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t('noTransactionsFound')}</p>
        ) : (
          <>
            <div className="space-y-2">
              {paginatedTransactions.map((tx) => (
                <TransactionRow key={tx.hash + tx.blockNumber} tx={tx} network={network} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {t('showing')} {page * ITEMS_PER_PAGE + 1}-{Math.min((page + 1) * ITEMS_PER_PAGE, filteredTransactions.length)} {t('of')} {filteredTransactions.length}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    {t('previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    {t('next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

SOFTransactionHistory.propTypes = {
  address: PropTypes.string.isRequired,
};

// Individual transaction row component
function TransactionRow({ tx, network }) {
  const { t } = useTranslation('account');

  const getTypeIcon = () => {
    switch (tx.type) {
      case 'TRANSFER_IN':
        return <ArrowDownIcon className="h-4 w-4 text-green-600" />;
      case 'TRANSFER_OUT':
        return <ArrowUpIcon className="h-4 w-4 text-red-600" />;
      case 'BONDING_CURVE_PURCHASE':
        return <TrendingUpIcon className="h-4 w-4 text-blue-600" />;
      case 'BONDING_CURVE_BUY':
        return <TrendingUpIcon className="h-4 w-4 text-blue-600" />;
      case 'BONDING_CURVE_SELL':
        return <TrendingDownIcon className="h-4 w-4 text-orange-600" />;
      case 'PRIZE_CLAIM_GRAND':
      case 'PRIZE_CLAIM_CONSOLATION':
        return <TrophyIcon className="h-4 w-4 text-yellow-600" />;
      case 'FEE_COLLECTED':
        return <CoinsIcon className="h-4 w-4 text-purple-600" />;
      default:
        return <CoinsIcon className="h-4 w-4" />;
    }
  };

  const getTypeBadge = () => {
    const typeMap = {
      TRANSFER_IN: { label: t('received'), variant: 'default' },
      TRANSFER_OUT: { label: t('sent'), variant: 'secondary' },
      BONDING_CURVE_PURCHASE: { label: t('purchase'), variant: 'default' },
      BONDING_CURVE_BUY: { label: t('buy'), variant: 'default' },
      BONDING_CURVE_SELL: { label: t('sell'), variant: 'secondary' },
      PRIZE_CLAIM_GRAND: { label: t('grandPrize'), variant: 'default' },
      PRIZE_CLAIM_CONSOLATION: { label: t('consolation'), variant: 'secondary' },
      FEE_COLLECTED: { label: t('fees'), variant: 'outline' },
    };

    const config = typeMap[tx.type] || { label: tx.type, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const explorerUrl = network?.blockExplorer 
    ? `${network.blockExplorer}/tx/${tx.hash}`
    : null;

  return (
    <div className="border rounded-lg p-3 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-1">{getTypeIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getTypeBadge()}
              <span className="text-xs text-muted-foreground">
                {formatDate(tx.timestamp)}
              </span>
            </div>
            <p className="text-sm font-medium mb-1">{tx.description}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {tx.seasonId && (
                <span>Season #{tx.seasonId}</span>
              )}
              {tx.tokensReceived && (
                <span>+{parseFloat(tx.tokensReceived).toFixed(2)} tickets</span>
              )}
              {tx.tokensSold && (
                <span>-{parseFloat(tx.tokensSold).toFixed(2)} tickets</span>
              )}
              {tx.from && tx.type.includes('TRANSFER') && (
                <span className="font-mono truncate max-w-[120px]">
                  {tx.direction === 'IN' ? `From: ${tx.from}` : `To: ${tx.to}`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`text-sm font-semibold ${tx.direction === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
            {tx.direction === 'IN' ? '+' : '-'}{parseFloat(tx.amount).toFixed(4)} SOF
          </div>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {t('viewTx')}
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

TransactionRow.propTypes = {
  tx: PropTypes.shape({
    type: PropTypes.string.isRequired,
    hash: PropTypes.string.isRequired,
    blockNumber: PropTypes.any.isRequired,
    timestamp: PropTypes.number.isRequired,
    amount: PropTypes.string.isRequired,
    direction: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    seasonId: PropTypes.number,
    tokensReceived: PropTypes.string,
    tokensSold: PropTypes.string,
    from: PropTypes.string,
    to: PropTypes.string,
  }).isRequired,
  network: PropTypes.shape({
    blockExplorer: PropTypes.string,
  }),
};
