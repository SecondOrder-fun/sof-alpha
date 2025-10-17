// src/components/admin/CreateSeasonForm.jsx
import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AUTO_START_BUFFER_SECONDS } from "@/lib/seasonTime";
import { getContractAddresses } from "@/config/contracts";
import { getStoredNetworkKey } from '@/lib/wagmi';
import { getNetworkByKey } from '@/config/networks';
import { ERC20Abi } from '@/utils/abis';
import { MetaMaskCircuitBreakerAlert } from "@/components/common/MetaMaskCircuitBreakerAlert";

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

const CreateSeasonForm = ({ createSeason, chainTimeQuery }) => {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [bondStepsText, setBondStepsText] = useState("");
  const [maxTickets, setMaxTickets] = useState("100000");
  const [numSteps, setNumSteps] = useState("10");
  const [basePrice, setBasePrice] = useState("10"); // $SOF starting price
  const [priceDelta, setPriceDelta] = useState("1"); // $SOF increase per step
  const [sofDecimals, setSofDecimals] = useState(18);
  const [grandPct, setGrandPct] = useState("65");
  const [formError, setFormError] = useState("");
  const [lastAttempt, setLastAttempt] = useState(null);
  const [nameError, setNameError] = useState("");
  
  const publicClient = usePublicClient();
  const addresses = getContractAddresses(getStoredNetworkKey());

  // Calculate step size
  const stepSize = useMemo(() => {
    const max = Number(maxTickets);
    const steps = Number(numSteps);
    if (!max || !steps || steps <= 0) return 0;
    return Math.ceil(max / steps);
  }, [maxTickets, numSteps]);

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

  // Set initial start time if not set
  useEffect(() => {
    if (startTime) return;
    const nowSec =
      typeof chainTimeQuery.data === "number"
        ? chainTimeQuery.data
        : Math.floor(Date.now() / 1000);
    const minStartSec = nowSec + 60; // 1 minute buffer for block time
    setStartTime(fmtLocalDatetime(minStartSec));
  }, [startTime, chainTimeQuery.data]);

  // Auto-generate linear bond steps JSON when inputs change
  useEffect(() => {
    const max = Number(maxTickets);
    const steps = Number(numSteps);
    const b = Number(basePrice);
    const d = Number(priceDelta);
    if (!max || !steps || steps <= 0 || isNaN(b) || isNaN(d)) return;
    const size = Math.ceil(max / steps);
    const arr = Array.from({ length: steps }, (_, i) => {
      const idx = i + 1;
      const rangeTo = Math.min(size * idx, max);
      const priceScaledBig =
        parseUnits(b.toString(), sofDecimals) +
        BigInt(i) * parseUnits(d.toString(), sofDecimals);
      const priceHuman = Number(
        Number(formatUnits(priceScaledBig, sofDecimals)).toFixed(6)
      );
      return {
        rangeTo,
        price: priceHuman,
        priceScaled: priceScaledBig.toString(),
      };
    });
    setBondStepsText(safeStringify(arr));
  }, [maxTickets, numSteps, basePrice, priceDelta, sofDecimals]);

  // Handle form errors from mutation
  useEffect(() => {
    if (createSeason?.isError && createSeason?.error) {
      setFormError(createSeason.error.message);
    }
  }, [createSeason?.isError, createSeason?.error]);

  // Reset form on successful creation
  useEffect(() => {
    if (createSeason?.isConfirmed) {
      setStartTime("");
      setEndTime("");
    }
  }, [createSeason?.isConfirmed]);

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    setFormError("");
    setNameError("");

    // Validate name is not empty
    if (!name || name.trim().length === 0) {
      setNameError("Season name is required");
      setFormError("Season name is required");
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
      setFormError("Start time is required");
      return;
    }
    const parsed = Math.floor(new Date(startTime).getTime() / 1000);
    if (!Number.isFinite(parsed)) {
      setFormError("Invalid start time");
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
        `Start time must be at least ${AUTO_START_BUFFER_SECONDS}s ahead of chain time. Adjusted to ${adjusted}. Please review and submit again.`
      );
      return;
    }

    if (!endTime) {
      setFormError("End time is required");
      return;
    }

    const end = Math.floor(new Date(endTime).getTime() / 1000);
    if (!Number.isFinite(end)) {
      setFormError("Invalid end time");
      return;
    }
    if (end <= start) {
      setFormError("End time must be after the start time");
      return;
    }
    // Validate grand prize percentage (UI only constraints 55% - 75%)
    const grandParsedPct = Number(grandPct);
    if (
      Number.isNaN(grandParsedPct) ||
      grandParsedPct < 55 ||
      grandParsedPct > 75
    ) {
      setFormError("Grand Prize must be between 55% and 75%");
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
      raffleToken: "0x0000000000000000000000000000000000000000",
      bondingCurve: "0x0000000000000000000000000000000000000000",
      isActive: false,
      isCompleted: false,
    };

    // Parse and validate bond steps
    let bondSteps = [];
    try {
      const parsed = JSON.parse(bondStepsText || "[]");
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setFormError(
          "Bond steps required: provide a non-empty JSON array of { rangeTo, priceScaled }"
        );
        return;
      }
      // Basic shape validation
      for (const s of parsed) {
        if (
          typeof s !== "object" ||
          s === null ||
          (typeof s.rangeTo !== "number" && typeof s.rangeTo !== "string") ||
          (typeof s.priceScaled !== "number" &&
            typeof s.priceScaled !== "string")
        ) {
          setFormError(
            "Each bond step must have numeric rangeTo and priceScaled (smallest units of $SOF, 10^decimals)"
          );
          return;
        }
      }
      // Convert to on-chain friendly types (uint128). priceScaled may be string; convert via BigInt.
      bondSteps = parsed.map((s) => ({
        rangeTo: BigInt(s.rangeTo),
        price: BigInt(s.priceScaled),
      }));

      // Ensure strictly increasing rangeTo values
      for (let i = 1; i < bondSteps.length; i += 1) {
        if (bondSteps[i].rangeTo <= bondSteps[i - 1].rangeTo) {
          setFormError(
            "Each bond step must have a strictly increasing rangeTo value"
          );
          return;
        }
      }

      if (bondSteps[bondSteps.length - 1].rangeTo !== BigInt(maxTickets || 0)) {
        setFormError(
          "Final bond step range must match the maximum ticket supply"
        );
        return;
      }

      setFormError("");
    } catch (err) {
      setFormError("Invalid JSON for bond steps");
      return;
    }
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
      
      <div className="space-y-1">
        <Input
          placeholder="Season Name"
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
      <div className="space-y-1">
        <Input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Start time must be at least {AUTO_START_BUFFER_SECONDS}{" "}
          seconds ahead of the current chain time.
        </p>
      </div>
      <Input
        type="datetime-local"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
      />
      <div>
        <label className="text-sm">Grand Prize Split (%)</label>
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
          Allowed range: 55%–75%. You can adjust per season.
        </p>
      </div>
      <div>
        <label className="text-sm">Bond Steps</label>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Max Tickets</label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 1000000"
                value={maxTickets}
                onChange={(e) => setMaxTickets(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm"># of Bond Steps</label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 500"
                value={numSteps}
                onChange={(e) => setNumSteps(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Initial Price ($SOF)</label>
              <Input
                type="number"
                step="0.0001"
                placeholder="e.g. 10"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm">
                Price Increase per Step ($SOF)
              </label>
              <Input
                type="number"
                step="0.0001"
                placeholder="e.g. 1"
                value={priceDelta}
                onChange={(e) => setPriceDelta(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Step size: {stepSize || "-"} tickets/step • Price:{" "}
            {basePrice || "-"} →{" "}
            {numSteps && basePrice
              ? (
                  Number(basePrice) +
                  (Number(numSteps) - 1) * Number(priceDelta)
                ).toString()
              : "-"}{" "}
            $SOF
          </p>
          <label className="text-sm">Bond Steps (JSON)</label>
          <textarea
            className="mt-1 w-full border rounded p-2 text-sm"
            rows={4}
            placeholder='e.g. [{"rangeTo": 10000, "price": 10, "priceScaled": "10000000000000000000"}] // priceScaled is in smallest units of $SOF (10^decimals)'
            value={bondStepsText}
            onChange={(e) => setBondStepsText(e.target.value)}
          />
          {formError && (
            <p className="text-xs text-red-500 mt-1">{formError}</p>
          )}
        </div>
      </div>
      {startTooSoonUi && (
        <p className="text-xs text-amber-600 mb-1">
          Start time must be at least {AUTO_START_BUFFER_SECONDS}s ahead
          of chain time.
        </p>
      )}
      <Button
        type="submit"
        disabled={createSeason?.isPending || startTooSoonUi || !name || name.trim().length === 0}
      >
        {createSeason?.isPending ? "Creating..." : "Create Season"}
      </Button>
      <TransactionStatus mutation={createSeason} />
      {lastAttempt && (
        <div className="mt-3 text-xs border rounded p-2 bg-muted/30">
          <p>
            <strong>Last Attempt</strong>
          </p>
          <p>autoStart: {String(lastAttempt.autoStart)}</p>
          <p>start: {lastAttempt.start}</p>
          <p>end: {lastAttempt.end}</p>
          <p>chainNowSec: {lastAttempt.chainNowSec ?? "n/a"}</p>
          <p>manualStartSec: {lastAttempt.manualStartSec ?? "n/a"}</p>
          <p>secondsAhead: {lastAttempt.secondsAhead}</p>
        </div>
      )}
    </form>
  );
};

CreateSeasonForm.propTypes = {
  createSeason: PropTypes.object.isRequired,
  chainTimeQuery: PropTypes.object.isRequired,
};

export default CreateSeasonForm;
