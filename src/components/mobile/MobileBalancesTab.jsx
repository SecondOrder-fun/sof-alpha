// src/components/mobile/MobileBalancesTab.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import RaffleBalanceItem from "./RaffleBalanceItem";
import InfoFiPositionsTab from "@/components/account/InfoFiPositionsTab";

/**
 * MobileBalancesTab - Mobile-optimized balances display with Raffles/InfoFi toggle
 */
const MobileBalancesTab = ({
  address,
  sofBalance,
  rafflePositions,
  isLoadingRafflePositions = false,
}) => {
  const [activeView, setActiveView] = useState("raffles");
  const { t } = useTranslation(["account", "market", "common"]);

  const sortedRafflePositions = (rafflePositions || [])
    .slice()
    .sort((a, b) => Number(b.seasonId) - Number(a.seasonId));

  return (
    <div className="space-y-3 mt-3">
      {/* SOF Balance Display */}
      <Card className="border-[#353e34] bg-[#130013]">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">
            {t("account:sofBalance")}
          </div>
          <div className="text-2xl font-bold text-white">{sofBalance}</div>
        </CardContent>
      </Card>

      {/* Toggle between Raffles and InfoFi */}
      <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-[#353e34]">
        <Button
          variant={activeView === "raffles" ? "default" : "ghost"}
          onClick={() => setActiveView("raffles")}
          className="flex-1"
          size="sm"
        >
          {t("account:raffleHoldings")}
        </Button>
        <Button
          variant={activeView === "infofi" ? "default" : "ghost"}
          onClick={() => setActiveView("infofi")}
          className="flex-1"
          size="sm"
        >
          {t("market:yourPositions")}
        </Button>
      </div>

      {/* List of positions */}
      <div className="space-y-3">
        {activeView === "raffles" && (
          <>
            {isLoadingRafflePositions ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {t("common:loading", { defaultValue: "Loading..." })}
                </span>
              </div>
            ) : rafflePositions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {t("account:noTicketBalances")}
              </p>
            ) : (
              sortedRafflePositions.map((position) => (
                <RaffleBalanceItem
                  key={position.seasonId}
                  seasonId={position.seasonId}
                  name={position.name}
                  contractAddress={position.token}
                  ticketCount={position.ticketCount}
                />
              ))
            )}
          </>
        )}
        {activeView === "infofi" && <InfoFiPositionsTab address={address} />}
      </div>
    </div>
  );
};

MobileBalancesTab.propTypes = {
  address: PropTypes.string,
  sofBalance: PropTypes.string.isRequired,
  isLoadingRafflePositions: PropTypes.bool,
  rafflePositions: PropTypes.arrayOf(
    PropTypes.shape({
      seasonId: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
        .isRequired,
      name: PropTypes.string.isRequired,
      token: PropTypes.string.isRequired,
      ticketCount: PropTypes.string.isRequired,
    }),
  ).isRequired,
};

export default MobileBalancesTab;
