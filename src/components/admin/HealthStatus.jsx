// src/components/admin/HealthStatus.jsx
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PropTypes from 'prop-types';

function StatusBadge({ ok }) {
  return (
    <Badge variant={ok ? 'secondary' : 'destructive'}>
      {ok ? 'OK' : 'DEGRADED'}
    </Badge>
  );
}

StatusBadge.propTypes = {
  ok: PropTypes.bool,
};

export default function HealthStatus() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Backend Health</CardTitle>
          <CardDescription>Supabase & RPC connectivity</CardDescription>
        </div>
        {isLoading ? (
          <Badge variant="outline">Loading...</Badge>
        ) : (
          <StatusBadge ok={data?.status === 'OK'} />
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <p className="text-sm text-red-600">{error.message}</p>
        )}
        {data && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Supabase:</span>
              <StatusBadge ok={data.checks?.supabase?.ok} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">RPC:</span>
              <StatusBadge ok={data.checks?.rpc?.ok} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Network:</span>
              <Badge variant="outline">{data.checks?.network}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">ChainId:</span>
              <Badge variant="outline">{data.checks?.rpc?.chainId || 'n/a'}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Env SUPABASE_URL:</span>
              <Badge variant={data.env?.SUPABASE_URL ? 'secondary' : 'destructive'}>
                {data.env?.SUPABASE_URL ? 'set' : 'missing'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Env RPC Local/Testnet:</span>
              <Badge variant={(data.env?.RPC_URL_LOCAL || data.env?.RPC_URL_TESTNET) ? 'secondary' : 'destructive'}>
                {(data.env?.RPC_URL_LOCAL || data.env?.RPC_URL_TESTNET) ? 'set' : 'missing'}
              </Badge>
            </div>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-2">
          {isFetching ? 'Refreshing...' : data?.timestamp ? `Updated: ${new Date(data.timestamp).toLocaleString()}` : ''}
        </div>
        <button
          type="button"
          className="mt-2 text-xs underline"
          onClick={() => refetch()}
        >
          Refresh now
        </button>
      </CardContent>
    </Card>
  );
}
