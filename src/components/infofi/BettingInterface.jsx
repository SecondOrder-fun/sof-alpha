// src/components/infofi/BettingInterface.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, TrendingUp, TrendingDown, Check } from "lucide-react";

/**
 * BettingInterface - YES/NO toggle betting interface with amount controls
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
    : "0.0";
  const noProbability = market?.current_probability_bps
    ? ((10000 - market.current_probability_bps) / 100).toFixed(1)
    : "100.0";

  // Calculate odds (payout per 1 SOF bet)
  const yesOdds = market?.current_probability_bps
    ? (10000 / market.current_probability_bps).toFixed(2)
    : "0.00";
  const noOdds = market?.current_probability_bps
    ? (10000 / (10000 - market.current_probability_bps)).toFixed(2)
    : "0.00";

  const handleIncrement = () => {
    setBetAmount((prev) => prev + 1);
  };

  const handleDecrement = () => {
    setBetAmount((prev) => Math.max(1, prev - 1));
  };

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
      {/* Market Question */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-foreground">
          Will Player 1 Win Raffle Season 1?
        </h3>
      </div>

      {/* YES/NO Display - Clickable to toggle */}
      <div className="grid grid-cols-2 gap-3">
        {/* YES Column */}
        <button
          type="button"
          onClick={() => setBetSide("YES")}
          className={`relative p-4 rounded-lg border-2 transition-all ${
            betSide === "YES"
              ? "border-green-500 bg-green-500/10"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          {betSide === "YES" && (
            <Check className="absolute top-2 right-2 h-5 w-5 text-green-500" />
          )}
          <div className="text-3xl font-bold text-green-500">
            {yesProbability}%
          </div>
          <div className="text-sm font-medium text-foreground mt-1">Yes</div>
          <div className="text-xs text-muted-foreground mt-2">
            {yesOdds} SOF
          </div>
          <div className="text-xs text-muted-foreground">per 1 SOF bet</div>
        </button>

        {/* NO Column */}
        <button
          type="button"
          onClick={() => setBetSide("NO")}
          className={`relative p-4 rounded-lg border-2 transition-all ${
            betSide === "NO"
              ? "border-red-400 bg-red-400/10"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          {betSide === "NO" && (
            <Check className="absolute top-2 right-2 h-5 w-5 text-red-400" />
          )}
          <div className="text-3xl font-bold text-red-400">
            {noProbability}%
          </div>
          <div className="text-sm font-medium text-foreground mt-1">No</div>
          <div className="text-xs text-muted-foreground mt-2">{noOdds} SOF</div>
          <div className="text-xs text-muted-foreground">per 1 SOF bet</div>
        </button>
      </div>

      {/* Odds Indicators */}
      <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-1">
          <span>Odds:</span>
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="flex items-center justify-center gap-1">
          <span>Odds:</span>
          <TrendingDown className="h-4 w-4" />
        </div>
      </div>

      {/* Bet Amount Control */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">
          Bet {betSide === "YES" ? "Yes" : "No"}:
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={betAmount}
            onChange={handleAmountChange}
            min="1"
            className="flex-1 text-center text-lg font-bold"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleIncrement}
            className="h-10 w-10 bg-[#c82a54] hover:bg-[#e25167] text-white"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleDecrement}
            className="h-10 w-10 bg-[#c82a54] hover:bg-[#e25167] text-white"
          >
            <Minus className="h-5 w-5" />
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
