// src/components/raffle/RaffleHoldingRow.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ExplorerLink from "@/components/common/ExplorerLink";

/**
 * RaffleHoldingRow - Displays a raffle ticket holding with expandable transaction history
 * Used in both AccountPage (Portfolio) and UserProfile pages
 */
const RaffleHoldingRow = ({ row, address, showViewLink = true }) => {
  const [open, setOpen] = useState(false);

  // Fetch transactions from database API instead of blockchain
  const transactionsQuery = useQuery({
    queryKey: ["raffleTransactions", address, row.seasonId],
    enabled: open && !!address && !!row?.seasonId,
    queryFn: async () => {
      const url = `${
        import.meta.env.VITE_API_BASE_URL
      }/raffle/transactions/${address}/${row.seasonId}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch transactions");
      }

      const data = await response.json();
      return data.transactions || [];
    },
    staleTime: 15000,
    refetchInterval: open ? 30000 : false,
  });

  const decimals = Number(row.decimals || 0);
  const base = 10n ** BigInt(decimals);
  const tickets = (row.balance ?? 0n) / base;

  const transactions = transactionsQuery.data || [];

  return (
    <div className="border rounded p-2">
      <button className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex justify-between items-center">
          <div>
            <span>
              Season #{row.seasonId}
              {row.name ? ` — ${row.name}` : ""}
            </span>
            <p className="text-xs text-muted-foreground break-all">
              Token: {row.token}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono">{tickets.toString()} Tickets</span>
            {showViewLink && (
              <Link
                to={`/raffles/${row.seasonId}`}
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View
              </Link>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="mt-2 border-t pt-2">
          <p className="font-semibold mb-2">Transactions</p>
          {transactionsQuery.isLoading && (
            <p className="text-muted-foreground">Loading...</p>
          )}
          {transactionsQuery.error && (
            <p className="text-red-500">Error loading transactions</p>
          )}
          {!transactionsQuery.isLoading && !transactionsQuery.error && (
            <div className="space-y-1">
              {transactions.length === 0 && (
                <p className="text-muted-foreground">No transactions found.</p>
              )}
              {transactions.map((t) => (
                <div
                  key={t.tx_hash + String(t.block_number)}
                  className="text-sm flex justify-between items-center gap-2"
                >
                  <span
                    className={
                      t.transaction_type === "BUY"
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {t.transaction_type === "BUY" ? "+" : "-"}
                    {t.ticket_amount} tickets
                  </span>
                  <div className="max-w-[60%] flex-1">
                    <ExplorerLink
                      value={t.tx_hash}
                      type="tx"
                      text="View on Explorer"
                      className="text-xs text-muted-foreground underline truncate"
                      copyLabelText="Copy transaction ID"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

RaffleHoldingRow.propTypes = {
  row: PropTypes.shape({
    token: PropTypes.string,
    decimals: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    balance: PropTypes.any,
    seasonId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string,
  }).isRequired,
  address: PropTypes.string,
  showViewLink: PropTypes.bool,
};

export default RaffleHoldingRow;
