// src/components/account/InfoFiPositionsTab.jsx
import { useMemo } from "react";
import PropTypes from "prop-types";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getContractAddresses } from "@/config/contracts";
import { readBet } from "@/services/onchainInfoFi";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const InfoFiPositionsTab = ({ address }) => {
  const { t } = useTranslation(["account"]);
  const netKey = getStoredNetworkKey();
  const contracts = getContractAddresses(netKey);
  const seasonsQry = useAllSeasons();
  const seasons = seasonsQry.data || [];

  // Get current active season (highest season ID)
  const currentSeason = useMemo(() => {
    if (!seasons || seasons.length === 0) return null;
    return seasons.reduce((max, s) => (s.id > max.id ? s : max), seasons[0]);
  }, [seasons]);

  // Fetch trade history from database
  const tradesQuery = useQuery({
    queryKey: ["infofiTrades", address],
    enabled: !!address,
    queryFn: async () => {
      const url = `${
        import.meta.env.VITE_API_BASE_URL
      }/infofi/positions/${address}`;

      console.log("[InfoFi] Fetching trades from:", url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          "[InfoFi] Failed to fetch trades:",
          response.status,
          response.statusText
        );
        throw new Error("Failed to fetch trade history");
      }

      const data = await response.json();
      console.log("[InfoFi] Trades response:", data);
      return data.positions || [];
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const positionsQuery = useQuery({
    queryKey: [
      "infofiPositionsOnchainActive",
      address,
      currentSeason?.id,
      netKey,
    ],
    enabled: !!address && !!currentSeason,
    queryFn: async () => {
      const seasonId = currentSeason.id;

      // Fetch markets from Supabase (includes contract_address)
      const response = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL
        }/infofi/markets?seasonId=${seasonId}&isActive=true`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch markets");
      }

      const data = await response.json();
      const markets = data.markets?.[seasonId] || [];

      if (!markets || markets.length === 0) {
        return [];
      }

      const positions = [];

      for (const m of markets) {
        try {
          const fpmmAddress = m.contract_address;

          if (
            !fpmmAddress ||
            fpmmAddress === "0x0000000000000000000000000000000000000000"
          ) {
            continue; // Skip if no FPMM exists
          }

          // eslint-disable-next-line no-await-in-loop
          const yes = await readBet({
            marketId: m.id,
            account: address,
            prediction: true,
            networkKey: netKey,
            fpmmAddress,
          });
          // eslint-disable-next-line no-await-in-loop
          const no = await readBet({
            marketId: m.id,
            account: address,
            prediction: false,
            networkKey: netKey,
            fpmmAddress,
          });

          const yesAmt = yes?.amount ?? 0n;
          const noAmt = no?.amount ?? 0n;

          if (yesAmt > 0n || noAmt > 0n) {
            positions.push({
              marketId: m.id,
              marketName: m.question || m.market_type || "Market",
              player: m.player_address,
              fpmmAddress,
              yesAmount: yesAmt,
              noAmount: noAmt,
            });
          }
        } catch (error) {
          console.error(`Error reading position for market ${m.id}:`, error);
        }
      }

      console.log("[InfoFi] Positions found:", positions.length);
      return positions;
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  // Group trades by market
  const tradesByMarket = useMemo(() => {
    const trades = tradesQuery.data || [];
    const grouped = {};

    console.log("[InfoFi] Grouping trades:", trades.length, "trades");

    for (const trade of trades) {
      const marketId = trade.market_id;
      if (!grouped[marketId]) {
        grouped[marketId] = [];
      }
      grouped[marketId].push(trade);
    }

    console.log(
      "[InfoFi] Grouped by market:",
      Object.keys(grouped).length,
      "markets"
    );

    return grouped;
  }, [tradesQuery.data]);

  return (
    <div className="h-80 overflow-y-auto overflow-x-hidden pr-1">
      {!currentSeason && (
        <p className="text-muted-foreground">No active season found.</p>
      )}
      {currentSeason && (
        <>
          <div className="mb-3 text-sm text-muted-foreground">
            Season #{currentSeason.id}{" "}
            {currentSeason.name ? `— ${currentSeason.name}` : ""}
          </div>
          {(positionsQuery.isLoading || tradesQuery.isLoading) && (
            <p className="text-muted-foreground">Loading positions...</p>
          )}
          {(positionsQuery.error || tradesQuery.error) && (
            <p className="text-red-500">
              {positionsQuery.error?.message?.includes("does not exist") ||
              positionsQuery.error?.message?.includes("No prediction markets")
                ? "No prediction markets available yet."
                : `Error: ${String(
                    positionsQuery.error?.message ||
                      tradesQuery.error?.message ||
                      positionsQuery.error ||
                      tradesQuery.error
                  )}`}
            </p>
          )}
          {!positionsQuery.isLoading &&
            !tradesQuery.isLoading &&
            !positionsQuery.error &&
            !tradesQuery.error && (
              <>
                {(positionsQuery.data || []).length === 0 &&
                  Object.keys(tradesByMarket).length === 0 && (
                    <p className="text-muted-foreground">
                      No positions or trades found.
                    </p>
                  )}
                {Object.keys(tradesByMarket).length > 0 && (
                  <Accordion type="multiple" className="space-y-2">
                    {Object.entries(tradesByMarket).map(
                      ([marketId, marketTrades]) => {
                        const pos = (positionsQuery.data || []).find(
                          (p) => p.marketId === parseInt(marketId)
                        );

                        // Calculate Yes/No totals from trades when no on-chain position
                        const yesTotal = pos ? null : marketTrades.filter(t => t.outcome === "YES").reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
                        const noTotal = pos ? null : marketTrades.filter(t => t.outcome === "NO").reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

                        return (
                          <AccordionItem
                            key={`market-${marketId}`}
                            value={`market-${marketId}`}
                          >
                            <AccordionTrigger className="px-3 py-2 text-left">
                              <div className="flex items-center justify-between w-full">
                                <span className="font-medium text-foreground">
                                  #{marketId} - {pos?.marketName || "Market"}
                                </span>
                                <div className="text-right shrink-0 flex items-center gap-2">
                                  <span className="font-bold text-green-600">
                                    {pos ? Number(formatUnits(pos.yesAmount ?? 0n, 18)).toFixed(0) : (yesTotal ?? 0).toFixed(0)}
                                  </span>
                                  <span className="text-muted-foreground">/</span>
                                  <span className="font-bold text-red-600">
                                    {pos ? Number(formatUnits(pos.noAmount ?? 0n, 18)).toFixed(0) : (noTotal ?? 0).toFixed(0)}
                                  </span>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="mt-2 pt-1 space-y-3">
                                {pos?.fpmmAddress && (
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground font-mono truncate">
                                      {t("account:marketContract")}: {pos.fpmmAddress.slice(0, 6)}...{pos.fpmmAddress.slice(-4)}
                                    </span>
                                    <a
                                      href={`https://sepolia.basescan.org/address/${pos.fpmmAddress}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:text-primary/80 flex items-center shrink-0 ml-2"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                                {contracts.CONDITIONAL_TOKENS && (
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground font-mono truncate">
                                      {t("account:conditionalToken")}: {contracts.CONDITIONAL_TOKENS.slice(0, 6)}...{contracts.CONDITIONAL_TOKENS.slice(-4)}
                                    </span>
                                    <a
                                      href={`https://sepolia.basescan.org/address/${contracts.CONDITIONAL_TOKENS}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:text-primary/80 flex items-center shrink-0 ml-2"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                                <Link
                                  to={`/markets/${marketId}`}
                                  className="flex items-center justify-between p-3 bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                                >
                                  <span className="text-foreground font-medium">
                                    Go to Market
                                  </span>
                                  <ChevronRight className="h-4 w-4 text-primary" />
                                </Link>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      }
                    )}
                  </Accordion>
                )}
              </>
            )}
        </>
      )}
    </div>
  );
};

InfoFiPositionsTab.propTypes = {
  address: PropTypes.string,
};

export default InfoFiPositionsTab;
