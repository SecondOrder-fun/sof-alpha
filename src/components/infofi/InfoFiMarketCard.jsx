// src/components/infofi/InfoFiMarketCard.jsx
import PropTypes from 'prop-types';
import InfoFiPricingTicker from '@/components/infofi/InfoFiPricingTicker';
import ProbabilityChart from '@/components/infofi/ProbabilityChart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

/**
 * InfoFiMarketCard
 * Displays a single InfoFi market with live hybrid pricing and minimal metadata.
 */
const InfoFiMarketCard = ({ market }) => {
  if (!market) return null;
  const title = market.question || market.market_type || 'Market';
  const subtitle = `Market ID: ${market.id}`;

  return (
    <Card className="border rounded p-2">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </CardHeader>
      <CardContent>
        <InfoFiPricingTicker marketId={market.id} />
        <ProbabilityChart marketId={market.id} />
      </CardContent>
    </Card>
  );
};

InfoFiMarketCard.propTypes = {
  market: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    question: PropTypes.string,
    market_type: PropTypes.string,
    raffle_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
};

export default InfoFiMarketCard;
