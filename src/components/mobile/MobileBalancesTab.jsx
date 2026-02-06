// src/components/mobile/MobileBalancesTab.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, ChevronRight } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import InfoFiPositionsTab from "@/components/account/InfoFiPositionsTab";

/**
 * MobileBalancesTab - Mobile-optimized balances display with Raffles/InfoFi toggle
 * Uses consistent UI Gym accordion style for both sections
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
      <Card className="border-border bg-background">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">
            {t("account:sofBalance")}
          </div>
          <div className="text-2xl font-bold text-white">{sofBalance}</div>
        </CardContent>
      </Card>

      {/* Toggle between Raffles and InfoFi */}
      <div className="flex gap-2 bg-primary/20 p-1 rounded-lg border border-primary/30">
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
              <Accordion type="multiple" className="space-y-2">
                {sortedRafflePositions.map((position) => (
                  <AccordionItem
                    key={`raffle-${position.seasonId}`}
                    value={`raffle-${position.seasonId}`}
                  >
                    <AccordionTrigger className="px-3 py-2 text-left">
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">
                            #{position.seasonId} - {position.name}
                          </span>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-white">
                              {position.ticketCount}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              tickets
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate mt-1">
                          {position.token}
                        </p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="mt-2 border-t border-border pt-3 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">
                            Token Contract
                          </span>
                          <a
                            href={`https://sepolia.basescan.org/token/${position.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 flex items-center gap-1"
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <Link
                          to={`/raffles/${position.seasonId}`}
                          className="flex items-center justify-between p-3 bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                        >
                          <span className="text-white font-medium">
                            Go to Raffle
                          </span>
                          <ChevronRight className="h-4 w-4 text-primary" />
                        </Link>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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
