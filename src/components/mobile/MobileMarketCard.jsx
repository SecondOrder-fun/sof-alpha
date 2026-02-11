// src/components/mobile/MobileMarketCard.jsx
import PropTypes from "prop-types";
import { ContentBox } from "@/components/ui/content-box";
import { Separator } from "@/components/ui/separator";
import UsernameDisplay from "@/components/user/UsernameDisplay";
import OddsChart from "@/components/infofi/OddsChart";

/**
 * MobileMarketCard - Compact market card for carousel list view.
 * Tap navigates to detail page. No betting UI.
 *
 * Uses div[role=button] instead of <button> to avoid the global
 * button CSS that overrides backgrounds with hsl(var(--primary)).
 */
const MobileMarketCard = ({ market, onClick }) => {
  const isWinnerPrediction =
    (market.market_type || market.type) === "WINNER_PREDICTION" &&
    market.player;
  const seasonId = market.raffle_id ?? market.seasonId;

  // Current YES probability
  const yesPct = market.current_probability_bps
    ? (market.current_probability_bps / 100).toFixed(1)
    : "50.0";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="w-full text-left p-4 cursor-pointer h-full"
    >
      <div className="flex flex-col gap-3 h-full">
        {/* Question + active indicator */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-foreground leading-tight flex-1 min-w-0">
            {isWinnerPrediction ? (
              <span>
                Will{" "}
                <UsernameDisplay
                  address={market.player}
                  className="font-bold"
                />{" "}
                win Season {seasonId}?
              </span>
            ) : (
              market.question || market.market_type || "Market"
            )}
          </h3>
          {market.is_active && (
            <span className="shrink-0 mt-1.5 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>

        <Separator />

        {/* Stats row */}
        <ContentBox className="flex items-center justify-between py-2 px-3">
          <span className="font-bold text-green-500 text-sm">
            {yesPct}% Yes
          </span>
          {market.volume != null && (
            <span className="text-muted-foreground text-xs">
              ${Number(market.volume).toLocaleString()} vol
            </span>
          )}
        </ContentBox>

        {/* Mini Odds Chart — bare line, no chrome, fixed height */}
        <div className="flex-1 min-h-[96px]">
          <OddsChart marketId={market.id} mini />
        </div>
      </div>
    </div>
  );
};

MobileMarketCard.propTypes = {
  market: PropTypes.object.isRequired,
  onClick: PropTypes.func.isRequired,
};

export default MobileMarketCard;
