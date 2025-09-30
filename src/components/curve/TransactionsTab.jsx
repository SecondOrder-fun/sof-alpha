// src/components/curve/TransactionsTab.jsx
import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';

const MAX_ROWS = 25;

const TransactionsTab = ({ bondingCurveAddress }) => {
  const { t } = useTranslation('common');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const client = useMemo(() => createPublicClient({
    chain: {
      id: net.id,
      name: net.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [net.rpcUrl] } },
    },
    transport: http(net.rpcUrl),
  }), [net.id, net.name, net.rpcUrl]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      setLoading(true);
      setError('');
      try {
        // Attempt to read generic Transfer events as placeholder (if the curve is ERC20)
        const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
        const logs = await client.getLogs({
          address: bondingCurveAddress,
          event: transferEvent,
          fromBlock: 'latest',
          toBlock: 'latest',
        }).catch(() => []);
        const mapped = (logs || []).slice(-MAX_ROWS).map(l => ({
          tx: l.transactionHash,
          from: l.args?.from,
          to: l.args?.to,
          amount: l.args?.value,
          side: 'Transfer',
          time: null,
        }));
        if (!stop) setRows(mapped);
      } catch (e) {
        if (!stop) setError(String(e?.shortMessage || e?.message || e));
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [bondingCurveAddress, client]);

  return (
    <div>
      {loading && <div className="text-sm text-muted-foreground">{t('loadingTransactions')}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-muted-foreground">{t('noRecentActivity')}</div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">{t('side')}</th>
                <th className="py-2 pr-2">{t('amount')}</th>
                <th className="py-2 pr-2">{t('from')}</th>
                <th className="py-2 pr-2">{t('to')}</th>
                <th className="py-2 pr-2">{t('tx')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2 pr-2">{r.side}</td>
                  <td className="py-2 pr-2 font-mono">{r.amount?.toString?.() ?? ''}</td>
                  <td className="py-2 pr-2 font-mono">{r.from?.slice?.(0, 6)}…{r.from?.slice?.(-4)}</td>
                  <td className="py-2 pr-2 font-mono">{r.to?.slice?.(0, 6)}…{r.to?.slice?.(-4)}</td>
                  <td className="py-2 pr-2 font-mono"><a className="underline" href={`#/${r.tx}`} rel="noreferrer">{r.tx?.slice?.(0, 10)}…</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

TransactionsTab.propTypes = {
  bondingCurveAddress: PropTypes.string,
};

export default TransactionsTab;
