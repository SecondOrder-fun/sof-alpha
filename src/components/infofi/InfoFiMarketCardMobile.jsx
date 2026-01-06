// src/components/infofi/InfoFiMarketCardMobile.jsx
import PropTypes from "prop-types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import BettingInterface from "./BettingInterface";
import UsernameDisplay from "@/components/user/UsernameDisplay";
import { useAccount } from "wagmi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { placeBetTx } from "@/services/onchainInfoFi";
import { useToast } from "@/hooks/useToast";

/**
 * InfoFiMarketCardMobile - Mobile-optimized single market card with betting interface
 * @param {Object} props
 * @param {Object} props.market - Market data
 */
const InfoFiMarketCardMobile = ({ market }) => {
  const { isConnected } = useAccount();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Place bet mutation
  const placeBetMutation = useMutation({
    mutationFn: async ({ marketId, side, amount }) => {
      if (!market.contract_address) {
        throw new Error("Market contract address not found");
      }

      return placeBetTx({
        fpmmAddress: market.contract_address,
        marketId: marketId,
        prediction: side === "YES",
        amount: amount,
      });
    },
    onSuccess: () => {
      toast({
        title: "Bet Placed",
        description: "Your bet has been successfully placed!",
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["infofi"] });
      queryClient.invalidateQueries({ queryKey: ["infofiBet"] });
    },
    onError: (error) => {
      toast({
        title: "Bet Failed",
        description: error.message || "Failed to place bet. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBet = (betData) => {
    placeBetMutation.mutate(betData);
  };

  // Show skeleton if market data is loading
  if (!market) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Skeleton className="h-8 w-full mb-4" />
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-2 border-border bg-card">
      <CardContent className="p-6">
        {/* Player Info */}
        {market.player && (
          <div className="mb-4 text-center">
            <div className="text-sm text-muted-foreground mb-1">Player</div>
            <UsernameDisplay address={market.player} />
          </div>
        )}

        {/* Betting Interface */}
        <BettingInterface
          market={market}
          onBet={handleBet}
          isConnected={isConnected}
          isLoading={placeBetMutation.isPending}
        />

        {/* Market Metadata */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Market Type</div>
              <div className="font-medium">
                {market.market_type === "WINNER_PREDICTION"
                  ? "Winner Prediction"
                  : market.market_type}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="font-medium">
                {market.is_active ? (
                  <span className="text-green-500">Active</span>
                ) : (
                  <span className="text-muted-foreground">Settled</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

InfoFiMarketCardMobile.propTypes = {
  market: PropTypes.object,
};

export default InfoFiMarketCardMobile;
