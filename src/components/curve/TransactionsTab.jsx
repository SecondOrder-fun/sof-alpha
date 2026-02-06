// src/components/curve/TransactionsTab.jsx
import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Copy } from 'lucide-react';
import PlayerLabel from '@/components/common/PlayerLabel';
import ExplorerLink from '@/components/common/ExplorerLink';
import { Badge } from '@/components/ui/badge';
import { useRaffleTransactions } from '@/hooks/useRaffleTransactions';
import { useCurveEvents } from '@/hooks/useCurveEvents';
import { DataTable, DataTableColumnHeader, DataTablePagination, DataTableToolbar } from '@/components/common/DataTable';
import { getNetworkByKey } from '@/config/networks';
import { getStoredNetworkKey } from '@/lib/wagmi';

/**
 * TransactionsTab - Display raffle transactions with sorting, filtering, and pagination
 * @param {string} bondingCurveAddress - Bonding curve contract address
 * @param {number|string} seasonId - Season ID
 * @param {number} startTime - Season start timestamp (Unix seconds) for efficient block queries
 */
const TransactionsTab = ({ bondingCurveAddress, seasonId, startTime }) => {
  const { t } = useTranslation('raffle');
  const queryClient = useQueryClient();
  const { transactions, isLoading, error } = useRaffleTransactions(bondingCurveAddress, seasonId, { startTime });
  
  // Real-time updates: invalidate query when new PositionUpdate events occur
  useCurveEvents(bondingCurveAddress, {
    onPositionUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['raffleTransactions', bondingCurveAddress, seasonId] });
    },
  });
  
  const [sorting, setSorting] = useState([{ id: 'timestamp', desc: true }]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const explorerUrl = net?.explorer || '';

  // Copy to clipboard helper
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format relative time
  const formatTime = (timestamp) => {
    if (!timestamp) return '—';
    try {
      return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
    } catch {
      return '—';
    }
  };

  // Define table columns
  const columns = useMemo(
    () => [
      {
        accessorKey: 'type',
        header: ({ column }) => (
          <DataTableColumnHeader column={column}>
            {t('transactionType')}
          </DataTableColumnHeader>
        ),
        cell: ({ row }) => {
          const type = row.getValue('type');
          return (
            <Badge variant={type === 'buy' ? 'default' : 'destructive'}>
              {type === 'buy' ? t('buy') : t('sell')}
            </Badge>
          );
        },
        size: 80,
      },
      {
        accessorKey: 'player',
        header: ({ column }) => (
          <DataTableColumnHeader column={column}>
            {t('player')}
          </DataTableColumnHeader>
        ),
        cell: ({ row }) => {
          const player = row.getValue('player');
          const original = row.original || {};
          const username = original.playerUsername || original.username;
          return <PlayerLabel address={player} name={username} />;
        },
        size: 120,
      },
      {
        accessorKey: 'ticketsDelta',
        header: ({ column }) => (
          <DataTableColumnHeader column={column}>
            {t('ticketsChanged')}
          </DataTableColumnHeader>
        ),
        cell: ({ row }) => {
          const delta = row.getValue('ticketsDelta');
          const deltaNum = Number(delta);
          return (
            <span className={`font-mono ${deltaNum > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {deltaNum > 0 ? '+' : ''}{deltaNum.toLocaleString()}
            </span>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'newTickets',
        header: ({ column }) => (
          <DataTableColumnHeader column={column}>
            {t('newTotal')}
          </DataTableColumnHeader>
        ),
        cell: ({ row }) => {
          const tickets = row.getValue('newTickets');
          return <span className="font-mono">{Number(tickets).toLocaleString()}</span>;
        },
        size: 100,
      },
      {
        accessorKey: 'timestamp',
        header: ({ column }) => (
          <DataTableColumnHeader column={column}>
            {t('time')}
          </DataTableColumnHeader>
        ),
        cell: ({ row }) => {
          const timestamp = row.getValue('timestamp');
          return <span className="text-xs text-muted-foreground">{formatTime(timestamp)}</span>;
        },
        size: 120,
      },
      {
        accessorKey: 'txHash',
        header: () => <span className="text-white">{t('transaction')}</span>,
        cell: ({ row }) => {
          const txHash = row.getValue('txHash');
          if (!txHash) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <ExplorerLink
              value={txHash}
              type="tx"
              text="View txn on explorer."
              className="text-xs font-mono"
              showCopy={false}
            />
          );
        },
        size: 120,
        enableSorting: false,
      },
    ],
    [t, explorerUrl]
  );

  // Filter options for transaction type
  const filterOptions = [
    { column: 'type', value: 'buy', label: t('buy') },
    { column: 'type', value: 'sell', label: t('sell') },
  ];

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t('loadingTransactions')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-600">
        {t('errorLoadingTransactions')}: {error.message}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t('noTransactions')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={{
          getState: () => ({ columnFilters }),
          getColumn: (id) => ({
            getFilterValue: () => columnFilters.find(f => f.id === id)?.value,
            setFilterValue: (value) => {
              setColumnFilters(prev => {
                const filtered = prev.filter(f => f.id !== id);
                return value !== undefined ? [...filtered, { id, value }] : filtered;
              });
            },
          }),
          resetColumnFilters: () => setColumnFilters([]),
        }}
        searchColumn="player"
        searchPlaceholder={t('searchAddress')}
        filterOptions={filterOptions}
      />
      <DataTable
        columns={columns}
        data={transactions}
        sorting={sorting}
        setSorting={setSorting}
        columnFilters={columnFilters}
        setColumnFilters={setColumnFilters}
        pagination={pagination}
        setPagination={setPagination}
      />
      <DataTablePagination
        table={{
          getState: () => ({ pagination }),
          setPageSize: (size) => setPagination(prev => ({ ...prev, pageSize: size })),
          previousPage: () => setPagination(prev => ({ ...prev, pageIndex: Math.max(0, prev.pageIndex - 1) })),
          nextPage: () => setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex + 1 })),
          getCanPreviousPage: () => pagination.pageIndex > 0,
          getCanNextPage: () => (pagination.pageIndex + 1) * pagination.pageSize < transactions.length,
          getPageCount: () => Math.ceil(transactions.length / pagination.pageSize),
        }}
      />
    </div>
  );
};

TransactionsTab.propTypes = {
  bondingCurveAddress: PropTypes.string,
  seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  startTime: PropTypes.number,
};

export default TransactionsTab;
