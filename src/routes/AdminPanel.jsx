// src/routes/AdminPanel.jsx
import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { useAccount, usePublicClient, useChainId } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useRaffleWrite } from "@/hooks/useRaffleWrite";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import { Badge } from "@/components/ui/badge";
import { useAccessControl } from "@/hooks/useAccessControl";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Removed Dialog imports after early-end cleanup
import {
  keccak256,
  stringToHex,
  parseUnits,
  formatUnits,
  createWalletClient,
  custom,
} from "viem";
import { getContractAddresses } from "@/config/contracts";
import {
  computeSeasonStartTimestamp,
  AUTO_START_BUFFER_SECONDS,
} from "@/lib/seasonTime";
import { buildFriendlyContractError } from "@/lib/contractErrors";

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

// Minimal ERC20 ABI for decimals
const ERC20_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
];

const TransactionStatus = ({ mutation }) => {
  const m = mutation || {};
  // Explorer link
  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const explorerUrl = useMemo(() => {
    if (!net.explorer || !m.hash) return "";
    const base = net.explorer.endsWith("/")
      ? net.explorer.slice(0, -1)
      : net.explorer;
    return `${base}/tx/${m.hash}`;
  }, [net.explorer, m.hash]);

  // Pending warning if >60s
  const [pendingSince, setPendingSince] = useState(null);
  const [showPendingWarn, setShowPendingWarn] = useState(false);
  useEffect(() => {
    if (m.hash && !m.isConfirmed && !m.isError) {
      if (!pendingSince) setPendingSince(Date.now());
    } else {
      setPendingSince(null);
      setShowPendingWarn(false);
    }
  }, [m.hash, m.isConfirmed, m.isError, pendingSince]);

  useEffect(() => {
    if (!pendingSince) return;
    const t = setInterval(() => {
      if (Date.now() - pendingSince > 60000) setShowPendingWarn(true);
    }, 5000);
    return () => clearInterval(t);
  }, [pendingSince]);

  useEffect(() => {
    if (!pendingSince) return;
    const t = setInterval(() => {
      if (Date.now() - pendingSince > 60000) setShowPendingWarn(true);
    }, 5000);
    return () => clearInterval(t);
  }, [pendingSince]);

  // Decide rendering after hooks are set
  const shouldRender =
    !!m && (m.isPending || m.isError || m.isSuccess || m.hash);
  if (!shouldRender) return null;

  return (
    <div className="mt-2 text-sm">
      {m.isPending && !m.isConfirming && (
        <p>Please confirm in your wallet...</p>
      )}
      {(m.isConfirming || (m.hash && !m.isConfirmed && !m.isError)) && (
        <p>Transaction submitted. Waiting for confirmation...</p>
      )}
      {m.isConfirmed && m.receipt?.status === "success" && (
        <p className="text-green-500">Transaction confirmed!</p>
      )}
      {m.isConfirmed && m.receipt?.status === "reverted" && (
        <p className="text-red-500">Transaction reverted on-chain.</p>
      )}
      {m.hash && (
        <p className="text-xs text-muted-foreground break-all">
          Hash: {m.hash}
          {explorerUrl && (
            <>
              {" "}
              <a
                className="underline"
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                View on explorer
              </a>
            </>
          )}
        </p>
      )}
      {showPendingWarn && (
        <p className="text-xs text-amber-600">
          Pending for over 60s. Verify you are on {net.name} and the RAFFLE
          address matches this network. Check the explorer link above.
        </p>
      )}
      {m.isError && (
        <p className="text-red-500">
          Error: {m.error?.shortMessage || m.error?.message}
        </p>
      )}
    </div>
  );
};

TransactionStatus.propTypes = {
  mutation: PropTypes.shape({
    isPending: PropTypes.bool,
    isError: PropTypes.bool,
    isSuccess: PropTypes.bool,
    isConfirming: PropTypes.bool,
    isConfirmed: PropTypes.bool,
    hash: PropTypes.string,
    receipt: PropTypes.shape({
      status: PropTypes.string,
    }),
    error: PropTypes.shape({
      shortMessage: PropTypes.string,
      message: PropTypes.string,
    }),
  }),
  seasonId: PropTypes.number,
};

function AdminPanel() {
  const { createSeason, startSeason, requestSeasonEnd } = useRaffleWrite();
  const allSeasonsQuery = useAllSeasons();
  const { address } = useAccount();
  const { hasRole } = useAccessControl();
  const chainId = useChainId();
  const net = getNetworkByKey(getStoredNetworkKey());
  // use existing environment/config variables declared later to avoid redeclarations

  const DEFAULT_ADMIN_ROLE =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  const SEASON_CREATOR_ROLE = keccak256(stringToHex("SEASON_CREATOR_ROLE"));
  const EMERGENCY_ROLE = keccak256(stringToHex("EMERGENCY_ROLE"));

  const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
    queryKey: ["isAdmin", address],
    queryFn: () => hasRole(DEFAULT_ADMIN_ROLE, address),
    enabled: !!address,
  });

  // Guards relocated below after state/query initialization

  // Minimal ABIs used for local E2E resolution
  const RaffleMiniAbi = [
    {
      type: "function",
      name: "requestSeasonEnd",
      stateMutability: "nonpayable",
      inputs: [{ name: "seasonId", type: "uint256" }],
      outputs: [],
    },
    {
      type: "function",
      name: "requestSeasonEndEarly",
      stateMutability: "nonpayable",
      inputs: [{ name: "seasonId", type: "uint256" }],
      outputs: [],
    },

    {
      type: "function",
      name: "getSeasonDetails",
      stateMutability: "view",
      inputs: [{ name: "seasonId", type: "uint256" }],
      outputs: [
        {
          name: "config",
          type: "tuple",
          components: [
            { name: "name", type: "string" },
            { name: "startTime", type: "uint256" },
            { name: "endTime", type: "uint256" },
            { name: "winnerCount", type: "uint8" },
            { name: "prizePercentage", type: "uint8" },
            { name: "consolationPercentage", type: "uint8" },
            { name: "grandPrizeBps", type: "uint16" },
            { name: "raffleToken", type: "address" },
            { name: "bondingCurve", type: "address" },
            { name: "isActive", type: "bool" },
            { name: "isCompleted", type: "bool" },
          ],
        },
        { name: "status", type: "uint8" },
        { name: "totalTickets", type: "uint256" },
        { name: "winner", type: "address" },
        { name: "merkleRoot", type: "bytes32" },
      ],
    },
    {
      type: "function",
      name: "getVrfRequestForSeason",
      stateMutability: "view",
      inputs: [{ name: "seasonId", type: "uint256" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      type: "function",
      name: "fundPrizeDistributor",
      stateMutability: "nonpayable",
      inputs: [{ name: "seasonId", type: "uint256" }],
      outputs: [],
    },
  ];

  // Distributor ABI removed – no Merkle-based post-processing required in UI.

  // Merkle root computation removed – claim restriction does not require Merkle verification.

  // NOTE: Always use decodeErrorResult via buildFriendlyContractError to surface clear errors.

  const { data: hasCreatorRole, isLoading: isCreatorLoading } = useQuery({
    queryKey: ["hasSeasonCreatorRole", address],
    queryFn: () => hasRole(SEASON_CREATOR_ROLE, address),
    enabled: !!address,
  });

  const { data: hasEmergencyRole, isLoading: isEmergencyLoading } = useQuery({
    queryKey: ["hasEmergencyRole", address],
    queryFn: () => hasRole(EMERGENCY_ROLE, address),
    enabled: !!address,
  });

  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [bondStepsText, setBondStepsText] = useState("");
  const [maxTickets, setMaxTickets] = useState("100000");
  const [numSteps, setNumSteps] = useState("10");
  const [basePrice, setBasePrice] = useState("10"); // $SOF starting price
  const [priceDelta, setPriceDelta] = useState("1"); // $SOF increase per step
  const [sofDecimals, setSofDecimals] = useState(18);
  const [autoStart, setAutoStart] = useState(false);
  // Grand prize split as percentage for UI (we'll convert to BPS when building config)
  const [grandPct, setGrandPct] = useState("65");
  const [autoStartTriggered, setAutoStartTriggered] = useState(false);
  // Track which season row initiated actions to scope status/errors per row
  const [lastStartSeasonId, setLastStartSeasonId] = useState(null);
  const [lastEndSeasonId, setLastEndSeasonId] = useState(null);
  // Removed early-end flow states
  const [endingE2EId, setEndingE2EId] = useState(null);
  const [endStatus, setEndStatus] = useState("");
  // Post-action verification per seasonId
  const [verify, setVerify] = useState({}); // { [seasonId]: { funded, grandWinner, grandAmount, consolationAmount, requestId, error } }
  const [lastAttempt, setLastAttempt] = useState(null);

  // Manually fund distributor after VRF completion (Phase 3)
  async function fundDistributorManual(seasonId) {
    try {
      setEndingE2EId(seasonId);
      setEndStatus("Funding distributor...");
      const netKey = getStoredNetworkKey();
      const netCfg = getNetworkByKey(netKey);
      const raffleAddr = getContractAddresses(netKey).RAFFLE;
      const wallet = createWalletClient({
        chain: { id: chainId },
        transport: custom(window.ethereum),
      });
      // Use connected account from wagmi rather than getAddresses to avoid silent failures
      if (!address) {
        setEndStatus("Connect your wallet to fund the distributor.");
        return;
      }

      // Ensure correct chain; attempt to switch in MetaMask if needed
      if (chainId !== netCfg.id && window?.ethereum?.request) {
        try {
          setEndStatus(`Switching network to ${netCfg.name}...`);
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${netCfg.id.toString(16)}` }],
          });
        } catch (switchErr) {
          // If chain is not added, try to add
          if (switchErr?.code === 4902) {
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: `0x${netCfg.id.toString(16)}`,
                    chainName: netCfg.name,
                    nativeCurrency: {
                      name: "ETH",
                      symbol: "ETH",
                      decimals: 18,
                    },
                    rpcUrls: [netCfg.rpcUrl],
                    blockExplorerUrls: netCfg.explorer ? [netCfg.explorer] : [],
                  },
                ],
              });
            } catch (addErr) {
              setEndStatus(
                `Please switch your network to ${netCfg.name} and try again.`
              );
              return;
            }
          } else {
            setEndStatus(
              `Please switch your network to ${netCfg.name} and try again.`
            );
            return;
          }
        }
      }

      // Resolve distributor (best-effort; some builds may not expose this view)
      let distributor = undefined;
      try {
        distributor = await publicClient.readContract({
          address: raffleAddr,
          abi: [
            {
              type: "function",
              name: "prizeDistributor",
              stateMutability: "view",
              inputs: [],
              outputs: [{ type: "address" }],
            },
          ],
          functionName: "prizeDistributor",
        });
      } catch (_) {
        // proceed; post-verification may be skipped if distributor unknown
      }
      const DistAbi = [
        {
          type: "function",
          name: "getSeason",
          stateMutability: "view",
          inputs: [{ name: "seasonId", type: "uint256" }],
          outputs: [
            {
              name: "",
              type: "tuple",
              components: [
                { name: "token", type: "address" },
                { name: "grandWinner", type: "address" },
                { name: "grandAmount", type: "uint256" },
                { name: "consolationAmount", type: "uint256" },
                { name: "totalTicketsSnapshot", type: "uint256" },
                { name: "grandWinnerTickets", type: "uint256" },
                { name: "merkleRoot", type: "bytes32" },
                { name: "funded", type: "bool" },
                { name: "grandClaimed", type: "bool" },
              ],
            },
          ],
        },
      ];

      // Pre state
      let distSeason = null;
      if (
        distributor &&
        distributor !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          distSeason = await publicClient.readContract({
            address: distributor,
            abi: DistAbi,
            functionName: "getSeason",
            args: [BigInt(seasonId)],
          });
        } catch (_) {
          // ignore pre-read errors
        }
      }
      const preWinner =
        distSeason?.grandWinner ??
        distSeason?.[1] ??
        "0x0000000000000000000000000000000000000000";
      const preFunded = Boolean(distSeason?.funded ?? distSeason?.[7] ?? false);
      setVerify((prev) => ({
        ...prev,
        [seasonId]: {
          ...(prev[seasonId] || {}),
          distGrandWinner: preWinner,
          distFunded: preFunded,
        },
      }));

      // Guard rails: must have a nonzero winner and not already funded
      if (preWinner === "0x0000000000000000000000000000000000000000") {
        setEndStatus(
          "Cannot fund: winner not set yet. Ensure VRF has completed and winners selected."
        );
        return;
      }
      if (preFunded) {
        setEndStatus("Already funded. No action needed.");
        return;
      }

      try {
        await wallet.writeContract({
          address: raffleAddr,
          abi: RaffleMiniAbi,
          functionName: "fundPrizeDistributor",
          args: [BigInt(seasonId)],
          account: address,
        });
      } catch (err) {
        const msg = buildFriendlyContractError(
          RaffleMiniAbi,
          err,
          "Failed to fund distributor"
        );
        setEndStatus(`Error: ${msg}`);
        throw err;
      }

      if (
        distributor &&
        distributor !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          const after = await publicClient.readContract({
            address: distributor,
            abi: DistAbi,
            functionName: "getSeason",
            args: [BigInt(seasonId)],
          });
          const afterWinner =
            after?.grandWinner ??
            after?.[1] ??
            "0x0000000000000000000000000000000000000000";
          const afterFunded = Boolean(after?.funded ?? after?.[7] ?? false);
          setVerify((prev) => ({
            ...prev,
            [seasonId]: {
              ...(prev[seasonId] || {}),
              distGrandWinnerAfter: afterWinner,
              distFundedAfter: afterFunded,
            },
          }));
        } catch (_) {
          // skip post-read if unavailable
        }
      }
      setEndStatus("Done");
      allSeasonsQuery.refetch();
    } catch (e) {
      setEndStatus(`Error: ${e?.shortMessage || e?.message || String(e)}`);
    } finally {
      setEndingE2EId(null);
    }
  }

  const stepSize = useMemo(() => {
    const max = Number(maxTickets);
    const steps = Number(numSteps);
    if (!max || !steps || steps <= 0) return 0;
    return Math.ceil(max / steps);
  }, [maxTickets, numSteps]);

  // Fetch SOF decimals once
  const netKey = getStoredNetworkKey();
  const addresses = getContractAddresses(netKey);
  const publicClient = usePublicClient();

  // Contract code presence check for RAFFLE
  const [raffleCodeStatus, setRaffleCodeStatus] = useState({
    checked: false,
    hasCode: false,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    async function checkCode() {
      try {
        if (!publicClient || !addresses.RAFFLE) {
          if (!cancelled)
            setRaffleCodeStatus({ checked: true, hasCode: false, error: null });
          return;
        }
        const code = await publicClient.getCode({ address: addresses.RAFFLE });
        if (!cancelled)
          setRaffleCodeStatus({
            checked: true,
            hasCode: !!code && code !== "0x",
            error: null,
          });
      } catch (e) {
        if (!cancelled)
          setRaffleCodeStatus({
            checked: true,
            hasCode: false,
            error: e?.message || String(e),
          });
      }
    }
    checkCode();
    return () => {
      cancelled = true;
    };
  }, [publicClient, addresses.RAFFLE]);

  useEffect(() => {
    let cancelled = false;
    async function loadDecimals() {
      try {
        if (!addresses.SOF || !publicClient) return;
        const dec = await publicClient.readContract({
          address: addresses.SOF,
          abi: ERC20_DECIMALS_ABI,
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

  const chainTimeQuery = useQuery({
    queryKey: ["chainTime", netKey],
    queryFn: async () => {
      if (!publicClient) return null;
      const block = await publicClient.getBlock();
      return Number(block.timestamp);
    },
    enabled: !!publicClient,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Prefill manual start when manual mode is selected and no value provided
  useEffect(() => {
    if (autoStart) return; // only for manual mode
    const nowSec =
      typeof chainTimeQuery.data === "number"
        ? chainTimeQuery.data
        : Math.floor(Date.now() / 1000);
    const minStartSec = nowSec + AUTO_START_BUFFER_SECONDS + 5; // cushion
    // If no start time yet, or it's earlier than the minimum buffer, normalize it
    let currentStartSec = null;
    if (startTime) {
      const parsed = Math.floor(new Date(startTime).getTime() / 1000);
      if (Number.isFinite(parsed)) currentStartSec = parsed;
    }
    if (
      !currentStartSec ||
      currentStartSec - nowSec < AUTO_START_BUFFER_SECONDS
    ) {
      setStartTime(fmtLocalDatetime(minStartSec));
    }
  }, [autoStart, startTime, chainTimeQuery.data]);

  // When toggling from autoStart -> manual, prefill start time immediately if empty
  useEffect(() => {
    if (autoStart) return;
    if (startTime) return;
    const nowSec =
      typeof chainTimeQuery.data === "number"
        ? chainTimeQuery.data
        : Math.floor(Date.now() / 1000);
    const minStartSec = nowSec + AUTO_START_BUFFER_SECONDS + 5;
    setStartTime(fmtLocalDatetime(minStartSec));
  }, [autoStart, startTime, chainTimeQuery.data]);

  // UI guard: detect too-soon manual start and disable submit pre-emptively
  const nowSecUi = useMemo(() => {
    return typeof chainTimeQuery.data === "number"
      ? chainTimeQuery.data
      : Math.floor(Date.now() / 1000);
  }, [chainTimeQuery.data]);

  const manualStartSecUi = useMemo(() => {
    if (!startTime || autoStart) return null;
    const parsed = Math.floor(new Date(startTime).getTime() / 1000);
    return Number.isFinite(parsed) ? parsed : null;
  }, [startTime, autoStart]);

  const startTooSoonUi = useMemo(() => {
    if (autoStart) return false;
    if (!manualStartSecUi) return false;
    return manualStartSecUi - nowSecUi <= AUTO_START_BUFFER_SECONDS;
  }, [autoStart, manualStartSecUi, nowSecUi]);

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
    setBondStepsText(JSON.stringify(arr));
  }, [maxTickets, numSteps, basePrice, priceDelta, sofDecimals]);
  const [formError, setFormError] = useState("");

  const handleCreateSeason = async (e) => {
    e.preventDefault();
    setFormError("");

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
    if (!autoStart) {
      if (!startTime) {
        setFormError("Start time is required when auto-start is off");
        return;
      }
      const parsed = Math.floor(new Date(startTime).getTime() / 1000);
      if (!Number.isFinite(parsed)) {
        setFormError("Invalid start time");
        return;
      }
      manualStartSec = parsed;
    }

    let start;
    try {
      start = computeSeasonStartTimestamp({
        autoStart,
        chainTimeSec: chainNowSec,
        manualStartSec,
      });
    } catch (err) {
      setFormError(err?.message || "Unable to determine season start time");
      return;
    }

    const effectiveChainTime =
      typeof chainNowSec === "number" && Number.isFinite(chainNowSec)
        ? chainNowSec
        : Math.floor(Date.now() / 1000);
    const secondsAhead = Number(start) - effectiveChainTime;
    // Only enforce the buffer window for manual starts; auto-start already applies the buffer internally
    if (!autoStart && secondsAhead <= AUTO_START_BUFFER_SECONDS) {
      // Guard: auto-adjust too-early manual start to now+buffer (plus small cushion) and ask user to resubmit
      const minStartSec = effectiveChainTime + AUTO_START_BUFFER_SECONDS + 5; // cushion 5s
      const adjusted = new Date(minStartSec * 1000).toISOString().slice(0, 16);
      setStartTime(adjusted);
      setFormError(
        `Start time was adjusted to be at least ${AUTO_START_BUFFER_SECONDS}s ahead of chain time. Please review and submit again.`
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
      autoStart,
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
      prizePercentage: 80,
      consolationPercentage: 10,
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

  useEffect(() => {
    if (createSeason?.isError && createSeason?.error) {
      setFormError(createSeason.error.message);
    }
  }, [createSeason?.isError, createSeason?.error]);

  useEffect(() => {
    if (createSeason?.isConfirmed) {
      setAutoStart(false);
      setStartTime("");
      setEndTime("");
    }
  }, [createSeason?.isConfirmed]);

  // Auto-start newly created season after confirmation
  useEffect(() => {
    if (!autoStart || autoStartTriggered) return;
    if (!createSeason?.isConfirmed) return;
    const seasons = allSeasonsQuery.data || [];
    if (!seasons.length) return;
    // Pick the highest id NotStarted season
    const candidate = seasons
      .filter((s) => s.status === 0)
      .sort((a, b) => Number(b.id) - Number(a.id))[0];
    if (candidate) {
      setLastStartSeasonId(candidate.id);
      startSeason?.mutate && startSeason.mutate({ seasonId: candidate.id });
      setAutoStartTriggered(true);
    }
  }, [
    autoStart,
    autoStartTriggered,
    createSeason?.isConfirmed,
    allSeasonsQuery.data,
    startSeason,
  ]);

  // Early-end flow removed; no chained start->end effect

  if (isAdminLoading || isCreatorLoading || isEmergencyLoading) {
    return <p>Checking authorization...</p>;
  }

  if (!isAdmin) {
    return <p>You are not authorized to view this page.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      {/* Environment banner */}
      <div className="mb-4 p-3 rounded border bg-muted/40 text-xs">
        <div className="flex flex-col gap-1">
          <div>
            <span className="font-semibold">Network Key:</span> {netKey}
          </div>
          <div>
            <span className="font-semibold">chainId:</span> {chainId}
          </div>
          <div className="break-all">
            <span className="font-semibold">RAFFLE:</span>{" "}
            {addresses.RAFFLE || "n/a"}
          </div>
          <div>
            <span className="font-semibold">Contract Code:</span>{" "}
            {!raffleCodeStatus.checked
              ? "checking…"
              : raffleCodeStatus.hasCode
              ? "present"
              : "absent"}
            {raffleCodeStatus.error ? (
              <span className="text-red-600"> — {raffleCodeStatus.error}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Create New Season</CardTitle>
            <CardDescription>Set up a new raffle season.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSeason} className="space-y-4">
              <Input
                placeholder="Season Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <input
                  id="auto-start-toggle"
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                />
                <label htmlFor="auto-start-toggle" className="text-sm">
                  Auto-start this season
                </label>
              </div>
              {!autoStart && (
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
              )}
              {autoStart && (
                <p className="text-xs text-muted-foreground">
                  Start time will be set to current chain time when creating.
                </p>
              )}
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
                disabled={createSeason?.isPending || startTooSoonUi}
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
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Manage Seasons</CardTitle>
            <CardDescription>
              Start or end existing raffle seasons.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(createSeason?.isPending ||
              (createSeason?.hash && !createSeason?.isConfirmed)) && (
              <div className="flex items-center justify-between rounded border bg-muted/40 p-2">
                <div>
                  <p className="font-bold">
                    Season (pending) - {name || "New Season"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Start:{" "}
                    {startTime ? new Date(startTime).toLocaleString() : "-"} |
                    End: {endTime ? new Date(endTime).toLocaleString() : "-"}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="outline">Pending</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button disabled variant="secondary">
                    Start
                  </Button>
                  <Button disabled variant="destructive">
                    End
                  </Button>
                  <TransactionStatus mutation={createSeason} />
                </div>
              </div>
            )}

            {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
            {allSeasonsQuery.error && (
              <p>Error loading seasons: {allSeasonsQuery.error.message}</p>
            )}

            {allSeasonsQuery.data
              ?.filter((season) => Number(season.id) > 0)
              .map((season) => {
                const nowSec =
                  typeof chainTimeQuery.data === "number"
                    ? chainTimeQuery.data
                    : Math.floor(Date.now() / 1000);
                const startSec = Number(season.config.startTime);
                const endSec = Number(season.config.endTime);
                const isWindowOpen = nowSec >= startSec && nowSec < endSec;
                const isPastEnd = nowSec >= endSec;
                const isNotStarted = season.status === 0;
                const isActive = season.status === 1;
                const isCreator = !!hasCreatorRole;
                const isEmergency = !!hasEmergencyRole;
                const chainMatch = chainId === net.id;
                const canStart = isNotStarted && isWindowOpen;
                const canEnd =
                  (isActive && isPastEnd) || (isNotStarted && isPastEnd);
                const startDate = new Date(
                  Number(season.config.startTime) * 1000
                ).toLocaleString();
                const endDate = new Date(
                  Number(season.config.endTime) * 1000
                ).toLocaleString();
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
                          variant={
                            season.config.isActive ? "secondary" : "outline"
                          }
                        >
                          {season.config.isActive ? "Ongoing" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">
                          {season.status === 0
                            ? "NotStarted"
                            : season.status === 1
                            ? "Active"
                            : "Completed"}
                        </Badge>
                        <Badge
                          variant={isCreator ? "secondary" : "destructive"}
                        >
                          {isCreator ? "Role OK" : "Missing Role"}
                        </Badge>
                        <Badge
                          variant={isWindowOpen ? "secondary" : "destructive"}
                        >
                          {isWindowOpen ? "Chain Time OK" : "Chain Time Closed"}
                        </Badge>
                        <Badge
                          variant={isEmergency ? "secondary" : "destructive"}
                        >
                          {isEmergency ? "Emergency OK" : "No Emergency Role"}
                        </Badge>
                        <Badge
                          variant={isNotStarted ? "secondary" : "destructive"}
                        >
                          {isNotStarted
                            ? "Ready to Start"
                            : isActive
                            ? "Already Active"
                            : "Completed"}
                        </Badge>
                        <Badge
                          variant={chainMatch ? "secondary" : "destructive"}
                        >
                          {chainMatch
                            ? `Chain OK (${chainId})`
                            : `Wrong Chain (${chainId})`}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {!hasCreatorRole && (
                        <p className="text-xs text-amber-600">
                          Missing SEASON_CREATOR_ROLE
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
                        Start
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
                            ? "Requesting End…"
                            : "Request End"}
                        </Button>

                        <Button
                          onClick={() => fundDistributorManual(season.id)}
                          disabled={
                            endingE2EId === season.id ||
                            !hasCreatorRole ||
                            !chainMatch ||
                            season.status !== 3
                          }
                          variant="outline"
                        >
                          {endingE2EId === season.id
                            ? endStatus || "Working…"
                            : "Fund Distributor"}
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
                            <p className="text-red-600">
                              {verify[season.id]?.error}
                            </p>
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
                                return (
                                  <>
                                    <p>
                                      Winner:{" "}
                                      <span className="font-mono">
                                        {winner}
                                      </span>
                                    </p>
                                    <p>Funded: {funded}</p>
                                  </>
                                );
                              })()}
                              <p>
                                Grand:{" "}
                                <span className="font-mono">
                                  {verify[season.id]?.grandAmount}
                                </span>{" "}
                                SOF • Consolation:{" "}
                                <span className="font-mono">
                                  {verify[season.id]?.consolationAmount}
                                </span>{" "}
                                SOF
                              </p>
                              {verify[season.id]?.requestId != null && (
                                <p>
                                  VRF reqId:{" "}
                                  {String(verify[season.id]?.requestId)}
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
          </CardContent>
        </Card>
      </div>

      {/* Early end modal removed for MVP cleanup */}
    </div>
  );
}

export default AdminPanel;
