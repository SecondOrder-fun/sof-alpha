// src/components/admin/CreateSeasonForm.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, decodeEventLog } from "viem";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { CalendarIcon, Gift } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { AUTO_START_BUFFER_SECONDS } from "@/lib/seasonTime";
import { getContractAddresses, RAFFLE_ABI, SEASON_GATING_ABI } from "@/config/contracts";
import { getStoredNetworkKey } from '@/lib/wagmi';
import { ERC20Abi } from '@/utils/abis';
import { MetaMaskCircuitBreakerAlert } from "@/components/common/MetaMaskCircuitBreakerAlert";
import TransactionModal from "@/components/admin/TransactionModal";
import BondingCurveEditor from "@/components/admin/BondingCurveEditor";
import GatingConfig from "@/components/admin/GatingConfig";

// Helper: format epoch seconds to a local "YYYY-MM-DDTHH:mm" string for <input type="datetime-local">
const fmtLocalDatetime = (sec) => {
  const d = new Date(sec * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

// ERC20 ABI imported from centralized utility

// Constants for default times (outside component to avoid useEffect dependency warnings)
const DEFAULT_START_OFFSET_SECONDS = 5 * 60; // 5 minutes from now
const DEFAULT_DURATION_SECONDS = 7 * 24 * 60 * 60; // 1 week

const CreateSeasonForm = ({ createSeason, chainTimeQuery, activeSection = "all" }) => {
  const { t } = useTranslation("raffle");
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [sofDecimals, setSofDecimals] = useState(18);
  const [grandPct, setGrandPct] = useState("65");
  const [treasuryAddress, setTreasuryAddress] = useState("");
  const [formError, setFormError] = useState("");
  const [lastAttempt, setLastAttempt] = useState(null);
  const [nameError, setNameError] = useState("");
  const [treasuryError, setTreasuryError] = useState("");

  // Bonding curve data from editor
  const [curveData, setCurveData] = useState({
    steps: [],
    maxTickets: 100000,
    isValid: false,
  });

  // Gating configuration
  const [gated, setGated] = useState(false);
  const [gatingGates, setGatingGates] = useState([]);
  const [gatingStatus, setGatingStatus] = useState(""); // "", "pending", "success", "error"
  const pendingSeasonIdRef = useRef(null);

  const publicClient = usePublicClient();
  const netKey = getStoredNetworkKey();
  const addresses = getContractAddresses(netKey);
  
  // For configuring gates after season creation
  const { writeContractAsync: writeGatingContract } = useWriteContract();

  // Handle curve editor changes
  const handleCurveChange = useCallback((data) => {
    setCurveData(data);
  }, []);

  // Get current chain time for UI
  const nowSecUi = useMemo(() => {
    return typeof chainTimeQuery.data === "number"
      ? chainTimeQuery.data
      : Math.floor(Date.now() / 1000);
  }, [chainTimeQuery.data]);

  // Parse manual start time
  const manualStartSecUi = useMemo(() => {
    if (!startTime) return null;
    const parsed = Math.floor(new Date(startTime).getTime() / 1000);
    return Number.isFinite(parsed) ? parsed : null;
  }, [startTime]);

  // Check if start time is too soon
  const startTooSoonUi = useMemo(() => {
    if (!manualStartSecUi) return false;
    return manualStartSecUi - nowSecUi <= AUTO_START_BUFFER_SECONDS;
  }, [manualStartSecUi, nowSecUi]);

  // Load SOF decimals
  useEffect(() => {
    let cancelled = false;
    async function loadDecimals() {
      try {
        if (!addresses.SOF || !publicClient) return;
        const dec = await publicClient.readContract({
          address: addresses.SOF,
          abi: ERC20Abi,
          functionName: "decimals",
        });
        if (!cancelled && typeof dec === "number") setSofDecimals(dec);
      } catch (_) {
        // ignore; default 18
      }
    }
    loadDecimals();
    return () => {
      cancelled = true;
    };
  }, [addresses.SOF, publicClient]);

  // Set initial start time if not set (Now + 5 minutes)
  useEffect(() => {
    if (startTime) return;
    const nowSec =
      typeof chainTimeQuery.data === "number"
        ? chainTimeQuery.data
        : Math.floor(Date.now() / 1000);
    const minStartSec = nowSec + DEFAULT_START_OFFSET_SECONDS;
    setStartTime(fmtLocalDatetime(minStartSec));
  }, [startTime, chainTimeQuery.data]);

  // Auto-set end time when start time changes (Start + 1 week)
  useEffect(() => {
    if (!startTime || endTime) return;
    const startSec = Math.floor(new Date(startTime).getTime() / 1000);
    if (Number.isFinite(startSec)) {
      setEndTime(fmtLocalDatetime(startSec + DEFAULT_DURATION_SECONDS));
    }
  }, [startTime, endTime]);

  // Helper to reset dates to defaults
  const resetToDefaultDates = () => {
    const nowSec =
      typeof chainTimeQuery.data === "number"
        ? chainTimeQuery.data
        : Math.floor(Date.now() / 1000);
    const newStartSec = nowSec + DEFAULT_START_OFFSET_SECONDS;
    setStartTime(fmtLocalDatetime(newStartSec));
    setEndTime(fmtLocalDatetime(newStartSec + DEFAULT_DURATION_SECONDS));
  };

  // Handle form errors from mutation
  useEffect(() => {
    if (createSeason?.isError && createSeason?.error) {
      setFormError(createSeason.error.message);
    }
  }, [createSeason?.isError, createSeason?.error]);

  // Configure gates and reset form on successful season creation
  useEffect(() => {
    if (!createSeason?.isConfirmed || !createSeason?.receipt) return;
    
    // Parse seasonId from SeasonCreated event in receipt
    const seasonCreatedLog = createSeason.receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: RAFFLE_ABI,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === "SeasonCreated";
      } catch {
        return false;
      }
    });

    if (!seasonCreatedLog) {
      console.warn("[CreateSeasonForm] Could not find SeasonCreated event in receipt");
      setStartTime("");
      setEndTime("");
      return;
    }

    const decoded = decodeEventLog({
      abi: RAFFLE_ABI,
      data: seasonCreatedLog.data,
      topics: seasonCreatedLog.topics,
    });
    const seasonId = decoded.args.seasonId;
    console.log("[CreateSeasonForm] Season created with ID:", seasonId.toString());

    // If gated with gates configured, call configureGates
    console.log("[CreateSeasonForm] Post-create check - gated:", gated, "gatingGates:", gatingGates.length, "SEASON_GATING:", addresses.SEASON_GATING);
    if (gated && gatingGates.length > 0 && addresses.SEASON_GATING) {
      console.log("[CreateSeasonForm] Configuring gates for season", seasonId.toString());
      setGatingStatus("pending");
      
      // Format gates for contract: [{ gateType, enabled, configHash }]
      const formattedGates = gatingGates.map((g) => ({
        gateType: g.gateType,
        enabled: g.enabled,
        configHash: g.configHash,
      }));

      writeGatingContract({
        address: addresses.SEASON_GATING,
        abi: SEASON_GATING_ABI,
        functionName: "configureGates",
        args: [seasonId, formattedGates],
      })
        .then(async (hash) => {
          console.log("[CreateSeasonForm] configureGates tx:", hash);
          // Wait for confirmation
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
          }
          setGatingStatus("success");
          console.log("[CreateSeasonForm] Gates configured successfully");
        })
        .catch((err) => {
          console.error("[CreateSeasonForm] Failed to configure gates:", err);
          setGatingStatus("error");
          setFormError(`Season created but failed to configure gates: ${err.message}`);
        });
    }

    // Reset form
    setStartTime("");
    setEndTime("");
  }, [createSeason?.isConfirmed, createSeason?.receipt, gated, gatingGates, addresses.SEASON_GATING, writeGatingContract, publicClient]);

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    setFormError("");
    setNameError("");
    setTreasuryError("");
    setGatingStatus("");

    // Validate name is not empty
    if (!name || name.trim().length === 0) {
      setNameError(t("seasonNameRequired"));
      setFormError(t("seasonNameRequired"));
      return;
    }

    // Validate treasury address
    if (!treasuryAddress || treasuryAddress.trim().length === 0) {
      setTreasuryError(t("treasuryRequired"));
      setFormError(t("treasuryRequired"));
      return;
    }
    if (!isAddress(treasuryAddress.trim())) {
      setTreasuryError(t("invalidAddress"));
      setFormError(t("invalidTreasuryAddress"));
      return;
    }

    let latestChainSec = null;
    if (publicClient) {
      try {
        const block = await publicClient.getBlock();
        latestChainSec = Number(block?.timestamp ?? null);
      } catch (err) {
        // Reason: on intermittent RPC failures we fall back to cached timestamp without surfacing noisy logs.
        latestChainSec = null;
      }
    }

    const chainNowSec =
      typeof latestChainSec === "number" && Number.isFinite(latestChainSec)
        ? latestChainSec
        : typeof chainTimeQuery.data === "number"
        ? chainTimeQuery.data
        : null;
    let manualStartSec = null;
    if (!startTime) {
      setFormError(t("startTimeRequired"));
      return;
    }
    const parsed = Math.floor(new Date(startTime).getTime() / 1000);
    if (!Number.isFinite(parsed)) {
      setFormError(t("invalidStartTime"));
      return;
    }
    manualStartSec = parsed;

    const start = manualStartSec;

    const effectiveChainTime =
      typeof chainNowSec === "number" && Number.isFinite(chainNowSec)
        ? chainNowSec
        : Math.floor(Date.now() / 1000);
    const secondsAhead = Number(start) - effectiveChainTime;
    // Enforce buffer window for start time
    if (secondsAhead <= AUTO_START_BUFFER_SECONDS) {
      const minStartSec = effectiveChainTime + AUTO_START_BUFFER_SECONDS + 5; // cushion 5s
      const adjusted = new Date(minStartSec * 1000).toISOString().slice(0, 16);
      setStartTime(adjusted);
      setFormError(
        t("startTimeTooSoon", { seconds: AUTO_START_BUFFER_SECONDS, adjusted })
      );
      return;
    }

    if (!endTime) {
      setFormError(t("endTimeRequired"));
      return;
    }

    const end = Math.floor(new Date(endTime).getTime() / 1000);
    if (!Number.isFinite(end)) {
      setFormError(t("invalidEndTime"));
      return;
    }
    if (end <= start) {
      setFormError(t("endAfterStart"));
      return;
    }
    // Validate grand prize percentage (UI only constraints 55% - 75%)
    const grandParsedPct = Number(grandPct);
    if (
      Number.isNaN(grandParsedPct) ||
      grandParsedPct < 55 ||
      grandParsedPct > 75
    ) {
      setFormError(t("grandPrizeRange"));
      return;
    }
    const grandPrizeBps = Math.round(grandParsedPct * 100); // convert % -> BPS
    setLastAttempt({
      start: Number(start),
      end,
      chainNowSec,
      manualStartSec,
      secondsAhead,
    });
    const config = {
      name,
      startTime: BigInt(start),
      endTime: BigInt(end),
      winnerCount: 1,
      grandPrizeBps,
      treasuryAddress: treasuryAddress.trim(),
      raffleToken: "0x0000000000000000000000000000000000000000",
      bondingCurve: "0x0000000000000000000000000000000000000000",
      sponsor: "0x0000000000000000000000000000000000000000", // Contract sets this to msg.sender
      isActive: false,
      isCompleted: false,
      gated,
    };

    // Validate bond steps from curve editor
    if (!curveData.isValid) {
      setFormError(t("curveInvalid"));
      return;
    }
    if (!curveData.steps || curveData.steps.length === 0) {
      setFormError(t("bondStepsRequired"));
      return;
    }

    // Convert curve editor steps to on-chain format
    const bondSteps = curveData.steps.map((s) => ({
      rangeTo: BigInt(s.rangeTo),
      price: BigInt(s.priceScaled),
    }));

    setFormError("");
    const buyFeeBps = 10; // 0.10%
    const sellFeeBps = 70; // 0.70%
    createSeason.mutate({ config, bondSteps, buyFeeBps, sellFeeBps });
  };

  return (
    <form onSubmit={handleCreateSeason} className="space-y-4">
      {/* Show circuit breaker alert if error detected */}
      <MetaMaskCircuitBreakerAlert
        error={createSeason?.error}
        onDismiss={() => createSeason.reset()}
      />

      {/* ── Section 1: Main Details ───────────────────────────── */}
      {(activeSection === "all" || activeSection === "details") && (
        <div className="space-y-4">
          {/* Season Name */}
          <div className="space-y-1">
            <Input
              placeholder={t("seasonNamePlaceholder")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError("");
              }}
              required
              className={nameError ? "border-red-500" : ""}
              aria-invalid={nameError ? "true" : "false"}
              aria-describedby={nameError ? "name-error" : undefined}
            />
            {nameError && (
              <p id="name-error" className="text-xs text-red-500">
                {nameError}
              </p>
            )}
          </div>

          {/* Season Timing */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("seasonTiming")}</label>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("startTime")}</label>
                <DateTimePicker
                  value={startTime}
                  onChange={setStartTime}
                  label={t("startTime")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("endTime")}</label>
                <DateTimePicker
                  value={endTime}
                  onChange={setEndTime}
                  label={t("endTime")}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetToDefaultDates}
                className="flex items-center gap-1 h-9"
              >
                <CalendarIcon className="h-4 w-4" />
                {t("reset")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("timingHelp", { seconds: AUTO_START_BUFFER_SECONDS })}
            </p>
          </div>

          {/* Participation Requirements (Gating) */}
          <GatingConfig
            gated={gated}
            onGatedChange={setGated}
            onGatesChange={setGatingGates}
          />
        </div>
      )}

      {/* ── Section 2: Prize Settings ────────────────────────── */}
      {(activeSection === "all" || activeSection === "prizes") && (
        <div className="space-y-4">
          {/* Treasury Wallet */}
          <div className="space-y-1">
            <label className="text-sm">{t("treasuryWallet")}</label>
            <Input
              placeholder="0x..."
              value={treasuryAddress}
              onChange={(e) => {
                setTreasuryAddress(e.target.value);
                if (treasuryError) setTreasuryError("");
              }}
              required
              className={treasuryError ? "border-red-500" : ""}
              aria-invalid={treasuryError ? "true" : "false"}
              aria-describedby={treasuryError ? "treasury-error" : undefined}
            />
            {treasuryError && (
              <p id="treasury-error" className="text-xs text-red-500">
                {treasuryError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("treasuryHelp")}
            </p>
          </div>

          {/* Grand Prize Split */}
          <div>
            <label className="text-sm">{t("grandPrizeSplit")}</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={55}
                max={75}
                step={1}
                value={grandPct}
                onChange={(e) => setGrandPct(e.target.value)}
                className="w-full"
              />
              <span className="w-12 text-right text-sm font-mono">
                {grandPct}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("grandPrizeHelp")}
            </p>
          </div>

          {/* Sponsored Prize (placeholder) */}
          <div className="p-3 border border-dashed border-border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="h-4 w-4" />
              <span className="font-medium">{t("sponsoredPrizeLabel")}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("sponsoredPrizeHelp")}
            </p>
          </div>
        </div>
      )}

      {/* ── Section 3: Bonding Curve ─────────────────────────── */}
      {(activeSection === "all" || activeSection === "curve") && (
        <BondingCurveEditor
          onChange={handleCurveChange}
          sofDecimals={sofDecimals}
        />
      )}

      {/* Form-level errors & submit — only on curve step or "all" */}
      {(activeSection === "all" || activeSection === "curve") && (
        <>
          {formError && (
            <p className="text-xs text-red-500">{formError}</p>
          )}
          {startTooSoonUi && (
            <p className="text-xs text-amber-600 mb-1">
              {t("startTimeTooSoonWarning", { seconds: AUTO_START_BUFFER_SECONDS })}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={createSeason?.isPending || startTooSoonUi || !name || name.trim().length === 0 || !treasuryAddress || !isAddress(treasuryAddress.trim()) || !curveData.isValid}
          >
            {createSeason?.isPending ? t("creatingBtn") : t("createSeasonBtn")}
          </Button>
          <TransactionModal mutation={createSeason} title={t("creatingSeasonTitle")} />
          {gatingStatus === "pending" && (
            <p className="text-xs text-amber-600">{t("configuringGates")}</p>
          )}
          {gatingStatus === "success" && (
            <p className="text-xs text-green-600">{t("gatesConfigured")}</p>
          )}
          {gatingStatus === "error" && (
            <p className="text-xs text-red-500">{t("gatesConfigFailed")}</p>
          )}
        </>
      )}
    </form>
  );
};

CreateSeasonForm.propTypes = {
  createSeason: PropTypes.object.isRequired,
  chainTimeQuery: PropTypes.object.isRequired,
  activeSection: PropTypes.oneOf(["all", "details", "prizes", "curve"]),
};

export default CreateSeasonForm;
