// src/components/infofi/InfoFiMarketCard.jsx
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import InfoFiPricingTicker from '@/components/infofi/InfoFiPricingTicker';
import ProbabilityChart from '@/components/infofi/ProbabilityChart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { buildMarketTitleParts } from '@/lib/marketTitle';

/**
 * InfoFiMarketCard
 * Displays a single InfoFi market with live hybrid pricing and minimal metadata.
 */
const InfoFiMarketCard = ({ market }) => {
  if (!market) return null;
  const seasonId = market?.raffle_id ?? market?.seasonId;
  const isWinnerPrediction = market.market_type === 'WINNER_PREDICTION' && market.player && seasonId != null;
  const parts = buildMarketTitleParts(market);
  const title = market.question || market.market_type || 'Market';
  const subtitle = `Market ID: ${market.id}`;

  return (
    <Card className="border rounded p-2">
      <CardHeader>
        <CardTitle className="text-base">
          {isWinnerPrediction ? (
            <span>
              {parts.prefix} {" "}
              <Link to={`/users/${market.player}`} className="text-primary hover:underline font-mono">
                {parts.userAddr}
              </Link>{" "}
              win {" "}
              <Link to={`/raffles/${seasonId}`} className="text-primary hover:underline">
                {parts.seasonLabel}
              </Link>
              ?
            </span>
          ) : (
            title
          )}
        </CardTitle>
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
    seasonId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    player: PropTypes.string,
  }).isRequired,
};

export default InfoFiMarketCard;
