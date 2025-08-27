// src/components/infofi/InfoFiPricingTicker.jsx
import PropTypes from 'prop-types';
import { useOraclePriceLive } from '@/hooks/useOraclePriceLive';
import { Card } from '@/components/ui/card';

/**
 * InfoFiPricingTicker
 * Lightweight live ticker for hybrid pricing (bps).
 * Renders current hybrid price, raffle probability, and market sentiment
 * for a given marketId using Server-Sent Events.
 *
 * @param {object} props
 * @param {string|number} props.marketId - The InfoFi market identifier
 */
const InfoFiPricingTicker = ({ marketId }) => {
  const { data, isLive } = useOraclePriceLive(marketId);

  const formatBpsPct = (bps) => {
    if (bps === null || bps === undefined) return '—';
    try {
      return `${(Number(bps) / 100).toFixed(2)}%`;
    } catch {
      return '—';
    }
  };

  return (
    <Card className="mb-3 p-3 border rounded-md bg-muted/30">
      <div className="text-sm text-muted-foreground mb-1">Live Hybrid Price (bps model)</div>
      <div className="flex gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Hybrid:</span>
          <span className="ml-2 font-mono">{formatBpsPct(data.hybridPriceBps)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Raffle Prob:</span>
          <span className="ml-2 font-mono">{formatBpsPct(data.raffleProbabilityBps)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Market Sent.:</span>
          <span className="ml-2 font-mono">{formatBpsPct(data.marketSentimentBps)}</span>
        </div>
        <div className="text-muted-foreground">{isLive ? 'live' : 'offline'}</div>
      </div>
    </Card>
  );
};

InfoFiPricingTicker.propTypes = {
  marketId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

export default InfoFiPricingTicker;
