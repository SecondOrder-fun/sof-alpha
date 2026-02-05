// src/components/infofi/BettingInterface.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Check } from "lucide-react";
import UsernameDisplay from "@/components/user/UsernameDisplay";

/**
 * BettingInterface - Mobile-optimized YES/NO betting interface
 * @param {Object} props
 * @param {Object} props.market - Market data with probabilities
 * @param {function} props.onBet - Callback when bet is placed
 * @param {boolean} props.isConnected - Whether wallet is connected
 * @param {boolean} props.isLoading - Whether bet is being processed
 */
const BettingInterface = ({
  market,
  onBet,
  isConnected = false,
  isLoading = false,
}) => {
  const [betSide, setBetSide] = useState("YES");
  const [betAmount, setBetAmount] = useState(10);

  // Calculate probabilities (from basis points)
  const yesProbability = market?.current_probability_bps
    ? (market.current_probability_bps / 100).toFixed(1)
    : "50.0";
  const noProbability = market?.current_probability_bps
    ? ((10000 - market.current_probability_bps) / 100).toFixed(1)
    : "50.0";

  // Calculate payout per 1 SOF bet
  const yesPayout = market?.current_probability_bps
    ? (10000 / market.current_probability_bps).toFixed(2)
    : "2.00";
  const noPayout = market?.current_probability_bps
    ? (10000 / (10000 - market.current_probability_bps)).toFixed(2)
    : "2.00";

  // Build dynamic market question
  const marketQuestion = (() => {
    if (market?.question) return market.question;
    const seasonId = market?.raffle_id ?? market?.seasonId;
    if (market?.market_type === "WINNER_PREDICTION" && market?.player && seasonId != null) {
      return null; // Will render with UsernameDisplay below
    }
    return market?.market_type || "Market";
  })();

  const isWinnerPrediction =
    market?.market_type === "WINNER_PREDICTION" && market?.player;
  const seasonId = market?.raffle_id ?? market?.seasonId;

  const handleIncrement = () => setBetAmount((prev) => prev + 1);
  const handleDecrement = () => setBetAmount((prev) => Math.max(1, prev - 1));

  const handleAmountChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setBetAmount(value);
    }
  };

  const handleBet = () => {
    if (onBet && betAmount > 0) {
      onBet({
        marketId: market.id,
        side: betSide,
        amount: betAmount,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Market Question - Dynamic */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-foreground">
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
            marketQuestion
          )}
        </h3>
      </div>

      {/* YES/NO Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* YES */}
        <button
          type="button"
          onClick={() => setBetSide("YES")}
          className={`relative p-3 rounded-lg border-2 transition-all text-center ${
            betSide === "YES"
              ? "border-green-500 bg-green-500/10"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          {betSide === "YES" && (
            <Check className="absolute top-2 right-2 h-4 w-4 text-green-500" />
          )}
          <div className="text-3xl font-bold text-green-500">
            {yesProbability}%
          </div>
          <div className="text-sm font-medium text-foreground">Yes</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {yesPayout}× payout
          </div>
        </button>

        {/* NO */}
        <button
          type="button"
          onClick={() => setBetSide("NO")}
          className={`relative p-3 rounded-lg border-2 transition-all text-center ${
            betSide === "NO"
              ? "border-red-400 bg-red-400/10"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          {betSide === "NO" && (
            <Check className="absolute top-2 right-2 h-4 w-4 text-red-400" />
          )}
          <div className="text-3xl font-bold text-red-400">
            {noProbability}%
          </div>
          <div className="text-sm font-medium text-foreground">No</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {noPayout}× payout
          </div>
        </button>
      </div>

      {/* Bet Amount Control */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">
          Bet {betSide}:
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecrement}
            className="h-10 w-10 shrink-0 bg-[#c82a54] hover:bg-[#e25167] text-white p-2"
          >
            <Minus className="h-5 w-5" />
          </Button>
          <Input
            type="number"
            value={betAmount}
            onChange={handleAmountChange}
            min="1"
            className="flex-1 text-center text-lg font-bold"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleIncrement}
            className="h-10 w-10 shrink-0 bg-[#c82a54] hover:bg-[#e25167] text-white p-2"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Bet Now Button */}
      <Button
        onClick={handleBet}
        disabled={!isConnected || isLoading || betAmount <= 0}
        className="w-full h-12 text-lg font-bold bg-[#c82a54] hover:bg-[#e25167] text-white"
      >
        {isLoading ? "PLACING BET..." : "BET NOW"}
      </Button>

      {!isConnected && (
        <p className="text-center text-sm text-muted-foreground">
          Connect wallet to place bets
        </p>
      )}
    </div>
  );
};

BettingInterface.propTypes = {
  market: PropTypes.object.isRequired,
  onBet: PropTypes.func.isRequired,
  isConnected: PropTypes.bool,
  isLoading: PropTypes.bool,
};

export default BettingInterface;
