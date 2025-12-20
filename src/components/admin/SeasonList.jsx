// src/components/admin/SeasonList.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TransactionStatus from "./TransactionStatus";
import { formatTimestamp } from "@/lib/utils";

const SeasonList = ({
  seasons,
  hasCreatorRole,
  hasEmergencyRole,
  chainId,
  networkConfig,
  startSeason,
  requestSeasonEnd,
  fundDistributor,
  verify,
  endingE2EId,
  endStatus,
}) => {
  const { t } = useTranslation("admin");
  const [lastStartSeasonId, setLastStartSeasonId] = useState(null);
  const [lastEndSeasonId, setLastEndSeasonId] = useState(null);

  if (!seasons || seasons.length === 0) {
    return <p>{t("noSeasonsFound")}</p>;
  }

  return (
    <div className="space-y-4">
      {seasons
        .filter((season) => Number(season.id) > 0)
        .map((season) => {
          const nowSec = Math.floor(Date.now() / 1000);
          const startSec = Number(season.config.startTime);
          const endSec = Number(season.config.endTime);
          const isWindowOpen = nowSec >= startSec && nowSec < endSec;
          const isPastEnd = nowSec >= endSec;
          const isNotStarted = season.status === 0;
          const isActive = season.status === 1;
          const isCreator = !!hasCreatorRole;
          const isEmergency = !!hasEmergencyRole;
          const chainMatch = chainId === networkConfig.id;
          const canStart = isNotStarted && isWindowOpen;
          const canEnd = (isActive && isPastEnd) || (isNotStarted && isPastEnd);
          const startDate = formatTimestamp(season.config.startTime);
          const endDate = formatTimestamp(season.config.endTime);
          const showStartStatus = lastStartSeasonId === season.id;

          return (
            <div
              key={season.id}
              className="flex items-start justify-between gap-4 rounded border p-2"
            >
              <div>
                <p className="font-bold">
                  Season #{season.id} - {season.config.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Start: {startDate} | End: {endDate}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge
                    variant={season.config.isActive ? "secondary" : "outline"}
                  >
                    {season.config.isActive ? t("ongoing") : t("inactive")}
                  </Badge>
                  <Badge variant="outline">
                    {season.status === 0
                      ? t("notStarted")
                      : season.status === 1
                      ? t("active")
                      : t("completed")}
                  </Badge>
                  <Badge variant={isCreator ? "secondary" : "destructive"}>
                    {isCreator ? t("roleOk") : t("missingRole")}
                  </Badge>
                  <Badge variant={isWindowOpen ? "secondary" : "destructive"}>
                    {isWindowOpen ? t("chainTimeOk") : t("chainTimeClosed")}
                  </Badge>
                  <Badge variant={isEmergency ? "secondary" : "destructive"}>
                    {isEmergency ? t("emergencyOk") : t("noEmergencyRole")}
                  </Badge>
                  <Badge variant={isNotStarted ? "secondary" : "destructive"}>
                    {isNotStarted
                      ? t("readyToStart")
                      : isActive
                      ? t("alreadyActive")
                      : t("completed")}
                  </Badge>
                  <Badge variant={chainMatch ? "secondary" : "destructive"}>
                    {chainMatch
                      ? t("chainOk", { chainId })
                      : t("wrongChain", { chainId })}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {!hasCreatorRole && (
                  <p className="text-xs text-amber-600">
                    {t("missingSeasonCreatorRole")}
                  </p>
                )}

                <Button
                  onClick={() => {
                    setLastStartSeasonId(season.id);
                    startSeason?.mutate?.({ seasonId: season.id });
                  }}
                  disabled={
                    startSeason?.isPending ||
                    !hasCreatorRole ||
                    !canStart ||
                    !chainMatch
                  }
                >
                  {t("start")}
                </Button>

                {showStartStatus && startSeason?.error && (
                  <p className="max-w-[260px] break-words text-xs text-red-600">
                    {startSeason.error.message}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      setLastEndSeasonId(season.id);
                      requestSeasonEnd?.mutate?.({ seasonId: season.id });
                    }}
                    disabled={
                      !hasCreatorRole ||
                      !chainMatch ||
                      !canEnd ||
                      requestSeasonEnd?.isPending
                    }
                    variant="destructive"
                  >
                    {requestSeasonEnd?.isPending &&
                    lastEndSeasonId === season.id
                      ? t("requestingEnd")
                      : t("requestEnd")}
                  </Button>

                  {lastEndSeasonId === season.id && requestSeasonEnd?.error && (
                    <div className="max-w-[260px] break-words text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      <p className="font-semibold mb-1">{t("errorLabel")}</p>
                      <p>{requestSeasonEnd.error.message}</p>
                      <p className="text-xs text-red-500 mt-1">
                        {t("checkConsoleForDetails")}
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={() => {
                      fundDistributor(season.id);
                    }}
                    disabled={
                      endingE2EId === season.id ||
                      !hasCreatorRole ||
                      !chainMatch
                    }
                    title={`Status: ${
                      season.status
                    }, Creator Role: ${hasCreatorRole}, Chain Match: ${chainMatch}, EndingE2EId: ${
                      endingE2EId === season.id ? "Active" : "Inactive"
                    }`}
                    variant="outline"
                  >
                    {endingE2EId === season.id
                      ? endStatus || t("working")
                      : t("fundDistributor")}
                  </Button>

                  {endingE2EId === season.id && endStatus && (
                    <p className="max-w-[280px] break-words text-xs text-muted-foreground">
                      {endStatus}
                    </p>
                  )}
                </div>

                {showStartStatus && (
                  <TransactionStatus mutation={startSeason} />
                )}

                {verify[season.id] && (
                  <div className="mt-2 rounded border p-2 text-xs">
                    {verify[season.id].error ? (
                      <p className="text-red-600">{verify[season.id]?.error}</p>
                    ) : (
                      <>
                        {(() => {
                          const v = verify[season.id] || {};
                          const winner =
                            v.distGrandWinnerAfter ||
                            v.distGrandWinner ||
                            v.grandWinner ||
                            "";
                          const funded =
                            v.distFundedAfter ?? v.distFunded ?? v.funded
                              ? "Yes"
                              : "No";
                          // Format token amounts with 4 decimal places
                          const formatToken = (amount) => {
                            if (amount === undefined || amount === null)
                              return "0";
                            const amountBigInt = BigInt(amount);
                            const decimals = 18; // Assuming 18 decimals for SOF token
                            const divisor = 10n ** BigInt(decimals - 4);
                            const formatted = amountBigInt / divisor / 10000n;
                            return formatted.toString();
                          };

                          const grandAmount = v.grandAmount ?? v[2] ?? 0n;
                          const consolationAmount =
                            v.consolationAmount ?? v[3] ?? 0n;

                          return (
                            <>
                              {v.prizeDistributor && (
                                <p>
                                  {t("prizeDistributor")}:{" "}
                                  <span className="font-mono">{`${v.prizeDistributor.slice(
                                    0,
                                    6
                                  )}...${v.prizeDistributor.slice(-4)}`}</span>
                                </p>
                              )}
                              {v.raffleRoleStatus && (
                                <p>
                                  {t("raffleRoleStatus")}: {v.raffleRoleStatus}
                                </p>
                              )}
                              <p>
                                {t("winner")}:{" "}
                                <span className="font-mono">
                                  {winner ===
                                  "0x0000000000000000000000000000000000000000"
                                    ? t("notSet")
                                    : `${winner.slice(0, 6)}...${winner.slice(
                                        -4
                                      )}`}
                                </span>
                              </p>
                              <p>
                                {t("funded")}: {funded}
                              </p>
                              <p>
                                {t("grand")}: {formatToken(grandAmount)} SOF •
                                {t("consolation")}:{" "}
                                {formatToken(consolationAmount)} SOF
                              </p>
                            </>
                          );
                        })()}
                        {verify[season.id]?.requestId != null && (
                          <p>
                            {t("vrfReqId")}:{" "}
                            {String(verify[season.id]?.requestId)}
                          </p>
                        )}
                        {verify[season.id]?.finalizeHash && (
                          <p>
                            {t("finalizeTx")}:{" "}
                            <a
                              className="text-blue-600 underline"
                              href={`${networkConfig.explorer}/tx/${
                                verify[season.id].finalizeHash
                              }`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {verify[season.id].finalizeHash.slice(0, 10)}...
                            </a>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
};

SeasonList.propTypes = {
  seasons: PropTypes.array.isRequired,
  hasCreatorRole: PropTypes.bool,
  hasEmergencyRole: PropTypes.bool,
  chainId: PropTypes.number.isRequired,
  networkConfig: PropTypes.object.isRequired,
  startSeason: PropTypes.object.isRequired,
  requestSeasonEnd: PropTypes.object.isRequired,
  fundDistributor: PropTypes.func.isRequired,
  verify: PropTypes.object.isRequired,
  endingE2EId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  endStatus: PropTypes.string,
};

export default SeasonList;
