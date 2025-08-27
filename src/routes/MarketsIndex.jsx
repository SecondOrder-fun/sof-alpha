// src/routes/MarketsIndex.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import InfoFiMarketCard from '@/components/infofi/InfoFiMarketCard';
// Arbitrage UI removed for on-chain-only refactor
import { useOnchainInfoFiMarkets } from '@/hooks/useOnchainInfoFiMarkets';
import { getSeasonPlayersOnchain, createWinnerPredictionMarketTx } from '@/services/onchainInfoFi';

const MarketsIndex = () => {
  const [onchainForm, setOnchainForm] = useState({ seasonId: '0', network: 'LOCAL' });
  const { markets, isLoading, error } = useOnchainInfoFiMarkets(onchainForm.seasonId, onchainForm.network);
  // Removed backend-driven activity and sync state for on-chain-only refactor
  const [onchainPlayers, setOnchainPlayers] = useState([]);
  const [onchainLoading, setOnchainLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  // Markets loaded via React Query (useInfoFiMarkets)

  // Removed backend-driven activity feed for on-chain-only refactor

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Prediction Markets</h1>
      {/* Removed DB-backed sync form. We operate purely on-chain below. */}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>On-chain: List/Create Winner Markets</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              setOnchainPlayers([]);
              setOnchainLoading(true);
              try {
                const players = await getSeasonPlayersOnchain({
                  seasonId: Number(onchainForm.seasonId),
                  networkKey: onchainForm.network.toUpperCase(),
                });
                setOnchainPlayers(players || []);
              } catch (err) {
                setOnchainPlayers([]);
              } finally {
                setOnchainLoading(false);
              }
            }}
          >
            <div>
              <label className="block text-sm mb-1">Season ID</label>
              <input
                className="w-full border rounded px-2 py-1"
                type="number"
                value={onchainForm.seasonId}
                onChange={(e) => setOnchainForm({ ...onchainForm, seasonId: e.target.value })}
                placeholder="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Network</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={onchainForm.network}
                onChange={(e) => setOnchainForm({ ...onchainForm, network: e.target.value })}
              >
                <option value="LOCAL">LOCAL</option>
                <option value="TESTNET">TESTNET</option>
              </select>
            </div>
            <div>
              <button type="submit" className="px-3 py-2 rounded bg-primary text-primary-foreground w-full">
                Load Season Players (On-chain)
              </button>
            </div>
          </form>

          {onchainLoading && <p className="mt-3 text-muted-foreground">Loading on-chain players...</p>}
          {!onchainLoading && onchainPlayers.length > 0 && (
            <div className="mt-4 space-y-2">
              {onchainPlayers.map((addr) => (
                <div key={addr} className="border rounded p-2 flex items-center justify-between">
                  <div className="text-sm font-mono">{addr}</div>
                  <button
                    className="px-3 py-1 text-sm rounded bg-secondary text-secondary-foreground"
                    onClick={async () => {
                      setTxStatus({ addr, status: 'pending' });
                      try {
                        const hash = await createWinnerPredictionMarketTx({
                          seasonId: Number(onchainForm.seasonId),
                          player: addr,
                          networkKey: onchainForm.network.toUpperCase(),
                        });
                        setTxStatus({ addr, status: 'submitted', hash });
                      } catch (err) {
                        setTxStatus({ addr, status: 'error', error: err?.message });
                      }
                    }}
                  >
                    Create Winner Market
                  </button>
                </div>
              ))}
              {txStatus && (
                <div className="text-xs text-muted-foreground">
                  {txStatus.status === 'pending' && `Submitting tx for ${txStatus.addr}...`}
                  {txStatus.status === 'submitted' && (
                    <span>
                      Tx submitted: <span className="font-mono">{txStatus.hash}</span>
                    </span>
                  )}
                  {txStatus.status === 'error' && (
                    <span className="text-red-600">Error: {txStatus.error}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Active Markets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Loading markets from chain...</p>}
          {error && <p className="text-red-500">Failed to load markets</p>}
          {!isLoading && !error && (
            <div className="space-y-2">
              {markets.length === 0 && (
                <p className="text-muted-foreground">No on-chain markets found for this season.</p>
              )}
              {markets.map((m) => (
                <div key={m.id} className="relative">
                  <InfoFiMarketCard market={m} />
                  {m.raffle_id && (
                    <div className="absolute top-2 right-3 text-xs">
                      <Link to={`/raffles/${m.raffle_id}`} className="text-primary hover:underline">View Raffle</Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* On-chain-only: activity/arbitrage UI removed */}
    </div>
  );
};

export default MarketsIndex;
