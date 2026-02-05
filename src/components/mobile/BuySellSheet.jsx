/**
 * Buy/Sell Bottom Sheet
 * Bottom sheet modal for Buy/Sell transactions
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useTranslation } from "react-i18next";
import { X, Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import QuantityStepper from "@/components/mobile/QuantityStepper";
import { useCurve } from "@/hooks/useCurve";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { buildPublicClient } from "@/lib/viemClient";
import { useSofDecimals } from "@/hooks/useSofDecimals";
import { useSOFToken } from "@/hooks/useSOFToken";
import { useAccount } from "wagmi";
import { buildFriendlyContractError } from "@/lib/contractErrors";
import SOFBondingCurveJson from "@/contracts/abis/SOFBondingCurve.json";

function useFormatSOF(decimals) {
  return useCallback(
    (amountWei) => {
      try {
        return Number(formatUnits(amountWei ?? 0n, decimals)).toFixed(4);
      } catch {
        return "0.0000";
      }
    },
    [decimals],
  );
}

export const BuySellSheet = ({
  open,
  onOpenChange,
  mode = "buy",
  seasonId,
  seasonStatus,
  seasonEndTime,
  bondingCurveAddress,
  maxSellable = 0n,
  onSuccess,
  onNotify,
}) => {
  const { t } = useTranslation(["common", "transactions"]);
  const { buyTokens, sellTokens, approve } = useCurve(bondingCurveAddress);
  const sofDecimalsState = useSofDecimals();
  const decimalsReady =
    typeof sofDecimalsState === "number" && !Number.isNaN(sofDecimalsState);
  const sofDecimals = decimalsReady ? sofDecimalsState : 18;
  const formatSOF = useFormatSOF(sofDecimals);
  const { address: connectedAddress } = useAccount();
  const {
    balance: sofBalance = "0",
    isLoading: isBalanceLoading,
    refetchBalance,
  } = useSOFToken();

  const [activeTab, setActiveTab] = useState(() => {
    // Prefer explicit mode from caller when provided
    if (mode === "buy" || mode === "sell") {
      return mode;
    }
    return "buy";
  });

  // Sync activeTab with mode prop when modal opens or mode changes
  useEffect(() => {
    if (open) {
      setActiveTab(mode);
    }
  }, [open, mode]);

  const [quantityInput, setQuantityInput] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [buyEstBase, setBuyEstBase] = useState(0n);
  const [sellEstBase, setSellEstBase] = useState(0n);
  const [buyFeeBps, setBuyFeeBps] = useState(0);
  const [sellFeeBps, setSellFeeBps] = useState(0);
  const [slippagePct, setSlippagePct] = useState("1"); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [tradingLocked, setTradingLocked] = useState(false);

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const seasonEndTimeSec = useMemo(() => {
    if (seasonEndTime == null) return null;
    const asNumber = Number(seasonEndTime);
    if (!Number.isFinite(asNumber)) return null;
    return asNumber;
  }, [seasonEndTime]);

  useEffect(() => {
    if (!open) return;
    if (seasonEndTimeSec == null) return;

    setNowSec(Math.floor(Date.now() / 1000));
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [open, seasonEndTimeSec]);

  const parsedQuantity = useMemo(() => {
    const n = Number(quantityInput);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  }, [quantityInput]);

  const isQuantityValid = parsedQuantity !== null && parsedQuantity >= 1;

  const [maxBuyable, setMaxBuyable] = useState(null);
  const maxBuyableNumber = useMemo(() => {
    if (typeof maxBuyable === "number") return maxBuyable;
    return null;
  }, [maxBuyable]);

  const seasonStatusNumber = useMemo(() => {
    if (typeof seasonStatus === "number") return seasonStatus;
    const asNumber = Number(seasonStatus);
    if (!Number.isFinite(asNumber)) return null;
    return asNumber;
  }, [seasonStatus]);

  const seasonNotActive =
    seasonStatusNumber !== null && Number(seasonStatusNumber) !== 1;

  const seasonEndedByTime =
    seasonEndTimeSec !== null && Number.isFinite(nowSec)
      ? nowSec >= seasonEndTimeSec
      : false;

  const seasonTimeNotActive = seasonNotActive || seasonEndedByTime;

  const exceedsRemainingSupply =
    maxBuyableNumber !== null && isQuantityValid
      ? parsedQuantity > maxBuyableNumber
      : false;

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const curveAbi = useMemo(
    () => SOFBondingCurveJson?.abi ?? SOFBondingCurveJson,
    [],
  );

  const client = useMemo(() => {
    if (!net?.rpcUrl) return null; // Guard: TESTNET not configured
    return buildPublicClient(net.rpcUrl, net.chainId ?? net.id);
  }, [net]);

  useEffect(() => {
    let cancelled = false;

    const loadRemainingSupply = async () => {
      try {
        if (!open) return;
        if (!client || !bondingCurveAddress) return;

        const cfg = await client.readContract({
          address: bondingCurveAddress,
          abi: curveAbi,
          functionName: "curveConfig",
          args: [],
        });

        const totalSupply = cfg?.[0] ?? 0n;

        const steps = await client.readContract({
          address: bondingCurveAddress,
          abi: curveAbi,
          functionName: "getBondSteps",
          args: [],
        });

        const lastRangeTo = Array.isArray(steps)
          ? (steps[steps.length - 1]?.rangeTo ?? 0n)
          : 0n;

        const remaining =
          lastRangeTo > totalSupply ? lastRangeTo - totalSupply : 0n;

        const remainingAsNumber = Number(remaining);
        if (!Number.isFinite(remainingAsNumber) || remainingAsNumber < 0) {
          if (!cancelled) setMaxBuyable(0);
          return;
        }

        if (!cancelled) setMaxBuyable(Math.floor(remainingAsNumber));
      } catch {
        if (!cancelled) setMaxBuyable(0);
      }
    };

    void loadRemainingSupply();

    return () => {
      cancelled = true;
    };
  }, [open, client, bondingCurveAddress, curveAbi]);

  // Check if trading is locked
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!client || !bondingCurveAddress) return;
      try {
        const config = await client.readContract({
          address: bondingCurveAddress,
          abi: curveAbi,
          functionName: "curveConfig",
          args: [],
        });
        // curveConfig returns: [totalSupply, sofReserves, currentStep, buyFee, sellFee, tradingLocked, initialized]
        const isLocked = config[5]; // tradingLocked is at index 5
        if (!cancelled) {
          setTradingLocked(isLocked);
          setBuyFeeBps(Number(config[3] ?? 0));
          setSellFeeBps(Number(config[4] ?? 0));
        }
      } catch {
        /* no-op */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, bondingCurveAddress, curveAbi]);

  const loadEstimate = useCallback(
    async (fnName, amount) => {
      try {
        if (!client) return 0n;
        return await client.readContract({
          address: bondingCurveAddress,
          abi: curveAbi,
          functionName: fnName,
          args: [BigInt(amount || "0")],
        });
      } catch {
        return 0n;
      }
    },
    [client, bondingCurveAddress, curveAbi],
  );

  // Update estimates when quantity changes
  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      if (!isQuantityValid) {
        if (!stop) setBuyEstBase(0n);
        return;
      }
      const est = await loadEstimate("calculateBuyPrice", parsedQuantity);
      if (!stop) setBuyEstBase(est);
    })();
    return () => {
      stop = true;
    };
  }, [bondingCurveAddress, parsedQuantity, isQuantityValid, loadEstimate]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      if (!isQuantityValid) {
        if (!stop) setSellEstBase(0n);
        return;
      }
      const est = await loadEstimate("calculateSellPrice", parsedQuantity);
      if (!stop) setSellEstBase(est);
    })();
    return () => {
      stop = true;
    };
  }, [bondingCurveAddress, parsedQuantity, isQuantityValid, loadEstimate]);

  const estBuyWithFees = useMemo(() => {
    if (!buyEstBase) return 0n;
    return buyEstBase + (buyEstBase * BigInt(buyFeeBps)) / 10000n;
  }, [buyEstBase, buyFeeBps]);

  const estSellAfterFees = useMemo(() => {
    if (!sellEstBase) return 0n;
    const fee = (sellEstBase * BigInt(sellFeeBps)) / 10000n;
    if (fee > sellEstBase) return 0n;
    return sellEstBase - fee;
  }, [sellEstBase, sellFeeBps]);

  const applyMaxSlippage = (amountWei) => {
    try {
      const pct = Number(slippagePct || "0");
      const bps = Math.max(0, Math.min(10000, Math.floor(pct * 100)));
      return amountWei + (amountWei * BigInt(bps)) / 10000n;
    } catch {
      return amountWei;
    }
  };

  const applyMinSlippage = (amountWei) => {
    try {
      const pct = Number(slippagePct || "0");
      const bps = Math.max(0, Math.min(10000, Math.floor(pct * 100)));
      return amountWei - (amountWei * BigInt(bps)) / 10000n;
    } catch {
      return amountWei;
    }
  };

  const sofBalanceBigInt = useMemo(() => {
    try {
      return parseUnits(sofBalance ?? "0", sofDecimals);
    } catch {
      return 0n;
    }
  }, [sofBalance, sofDecimals]);

  const requiresBalance = estBuyWithFees > 0n;
  const hasInsufficientBalance =
    !isBalanceLoading && requiresBalance && sofBalanceBigInt < estBuyWithFees;
  const hasZeroBalance =
    !isBalanceLoading && requiresBalance && sofBalanceBigInt === 0n;

  const getReadableError = (err) => {
    // Try to extract revert reason from error message
    if (err?.message) {
      // Custom error mapping - matches new custom error names
      const errorMap = {
        CurveNotInitialized: "Bonding curve not initialized",
        CurveAlreadyInitialized: "Bonding curve already initialized",
        TradingLocked: "Trading is locked - Season has ended",
        TradingNotLocked: "Trading is not locked",
        AmountZero: "Amount must be greater than 0",
        AmountTooLarge: "Amount is too large",
        SlippageExceeded:
          "Price slippage exceeded - try increasing slippage tolerance",
        ExceedsMaxSupply: "Purchase would exceed maximum supply",
        InsufficientReserves: "Insufficient reserves in bonding curve",
        InsufficientSupply: "Insufficient supply to sell",
        InsufficientBalance: "Insufficient balance",
        InvalidAddress: "Invalid address provided",
        InvalidBondSteps: "Invalid bond steps configuration",
        InvalidBondStepRange: "Invalid bond step range",
        InvalidBondStepPrice: "Invalid bond step price",
        InvalidBondStepOrder: "Bond steps must be in ascending order",
        BondStepOverflow: "Bond step value overflow",
        RaffleAlreadySet: "Raffle contract already set",
        RaffleNotSet: "Raffle contract not set",
        FeeTooHigh: "Fee is too high",
        SeasonNotFound: "Season not found",
        SeasonNotActive: "Season is not active",
        SeasonNotEnded: "Season has not ended",
        SeasonAlreadyStarted: "Season already started",
        SeasonAlreadyEnded: "Season already ended",
        InvalidSeasonStatus: "Invalid season status",
        FactoryNotSet: "Season factory not set",
        DistributorNotSet: "Prize distributor not set",
        InvalidBasisPoints: "Invalid basis points value",
        InvalidSeasonName: "Season name cannot be empty",
        InvalidStartTime: "Start time must be in the future",
        InvalidEndTime: "End time must be after start time",
      };

      // Check for custom error names in the message
      for (const [errorName, readableMsg] of Object.entries(errorMap)) {
        if (err.message.includes(errorName)) {
          return readableMsg;
        }
      }

      // Match common revert patterns
      const revertMatch = err.message.match(/revert (.*?)(?:\n|$)/);
      if (revertMatch && revertMatch[1]) {
        return revertMatch[1];
      }

      // If message contains "execution reverted" with no reason, it's likely a silent revert
      if (
        err.message.includes("execution reverted") &&
        !err.message.includes("reason")
      ) {
        return "Transaction failed - please check that the season is active and you have sufficient balance";
      }
    }

    // Fall back to friendly contract error decoder
    return buildFriendlyContractError(
      curveAbi,
      err,
      t("transactions:genericFailure", { defaultValue: "Transaction failed" }),
    );
  };

  const onBuy = async (e) => {
    e.preventDefault();
    if (!isQuantityValid || !bondingCurveAddress) return;

    if (seasonTimeNotActive) {
      onNotify &&
        onNotify({
          type: "error",
          message: "Season is not active",
          hash: "",
        });
      return;
    }
    if (tradingLocked) {
      onNotify &&
        onNotify({
          type: "error",
          message: "Trading is locked - Season has ended",
          hash: "",
        });
      return;
    }
    if (hasZeroBalance) {
      onNotify &&
        onNotify({
          type: "error",
          message: t("transactions:insufficientSOF", {
            defaultValue:
              "You need $SOF to buy tickets. Visit the faucet or acquire tokens first.",
          }),
          hash: "",
        });
      return;
    }
    if (hasInsufficientBalance) {
      const needed = formatSOF(estBuyWithFees);
      onNotify &&
        onNotify({
          type: "error",
          message: t("transactions:insufficientSOFWithAmount", {
            defaultValue:
              "You need at least {{amount}} $SOF to complete this purchase.",
            amount: needed,
          }),
          hash: "",
        });
      return;
    }

    setIsLoading(true);
    try {
      const maxUint = (1n << 255n) - 1n;
      const approvalTxHash = await approve.mutateAsync({ amount: maxUint });

      // Wait for approval transaction to be mined before proceeding
      if (client && approvalTxHash) {
        await client.waitForTransactionReceipt({
          hash: approvalTxHash,
          confirmations: 1,
        });
      }

      const cap = applyMaxSlippage(estBuyWithFees);
      const tx = await buyTokens.mutateAsync({
        tokenAmount: BigInt(parsedQuantity),
        maxSofAmount: cap,
      });
      const hash = tx?.hash ?? tx ?? "";

      // Wait for transaction to be mined before notifying
      if (client && hash) {
        try {
          const receipt = await client.waitForTransactionReceipt({
            hash,
            confirmations: 1,
          });

          if (receipt.status === "reverted") {
            onNotify &&
              onNotify({
                type: "error",
                message: "Transaction reverted",
                hash,
              });
          } else {
            // Only notify success if transaction actually succeeded
            onNotify &&
              onNotify({
                type: "success",
                message: t("transactions:bought"),
                hash,
              });
            onSuccess &&
              onSuccess({ mode: "buy", quantity: parsedQuantity, seasonId });
            onOpenChange(false);
          }
        } catch (waitErr) {
          const waitMsg =
            waitErr instanceof Error
              ? waitErr.message
              : "Failed waiting for transaction receipt";
          onNotify && onNotify({ type: "error", message: waitMsg, hash });
          // If waiting fails, still trigger refresh after delay
          setTimeout(() => {
            onSuccess &&
              onSuccess({ mode: "buy", quantity: parsedQuantity, seasonId });
            onOpenChange(false);
          }, 2000);
        }
      } else {
        // Fallback: notify immediately if no client
        try {
          onNotify &&
            onNotify({
              type: "success",
              message: t("transactions:bought"),
              hash,
            });
        } catch {
          /* no-op */
        }
        setTimeout(() => {
          onSuccess &&
            onSuccess({ mode: "buy", quantity: parsedQuantity, seasonId });
          onOpenChange(false);
        }, 2000);
      }

      setQuantityInput("1");
      void refetchBalance?.();
    } catch (err) {
      try {
        // Log full error for debugging
        const message = getReadableError(err);
        onNotify && onNotify({ type: "error", message, hash: "" });
      } catch (fallbackErr) {
        onNotify &&
          onNotify({
            type: "error",
            message: t("transactions:genericFailure", {
              defaultValue: "Transaction failed",
            }),
            hash: "",
          });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!isQuantityValid || !bondingCurveAddress) return;

    if (seasonTimeNotActive) {
      onNotify &&
        onNotify({
          type: "error",
          message: "Season is not active",
          hash: "",
        });
      return;
    }
    if (tradingLocked) {
      onNotify &&
        onNotify({
          type: "error",
          message: "Trading is locked - Season has ended",
          hash: "",
        });
      return;
    }

    setIsLoading(true);
    try {
      const tokenAmount = BigInt(parsedQuantity);
      const floor = applyMinSlippage(estSellAfterFees);

      // Check curve reserves before selling
      if (client) {
        try {
          const cfg = await client.readContract({
            address: bondingCurveAddress,
            abi: curveAbi,
            functionName: "curveConfig",
            args: [],
          });
          const reserves = cfg[1];

          if (reserves < sellEstBase) {
            onNotify &&
              onNotify({
                type: "error",
                message:
                  "Insufficient curve reserves - cannot sell this amount",
                hash: "",
              });
            return;
          }
        } catch (checkErr) {
          const message =
            checkErr instanceof Error
              ? checkErr.message
              : "Unable to verify curve reserves";
          onNotify && onNotify({ type: "error", message, hash: "" });
        }
      }

      const tx = await sellTokens.mutateAsync({
        tokenAmount,
        minSofAmount: floor,
      });
      const hash = tx?.hash ?? tx ?? "";

      // Notify immediately with transaction hash
      try {
        onNotify &&
          onNotify({ type: "success", message: t("transactions:sold"), hash });
      } catch {
        /* no-op */
      }

      // Wait for transaction to be mined before refreshing
      if (client && hash) {
        try {
          const receipt = await client.waitForTransactionReceipt({
            hash,
            confirmations: 1,
          });

          if (receipt.status === "reverted") {
            onNotify &&
              onNotify({
                type: "error",
                message: "Transaction reverted",
                hash,
              });
          } else {
            onSuccess &&
              onSuccess({ mode: "sell", quantity: parsedQuantity, seasonId });
            onOpenChange(false);
          }
        } catch (waitErr) {
          const waitMsg =
            waitErr instanceof Error
              ? waitErr.message
              : "Failed waiting for transaction receipt";
          onNotify && onNotify({ type: "error", message: waitMsg, hash });
          // If waiting fails, still trigger refresh after delay
          setTimeout(() => {
            onSuccess &&
              onSuccess({ mode: "sell", quantity: parsedQuantity, seasonId });
            onOpenChange(false);
          }, 2000);
        }
      } else {
        // Fallback: trigger refresh after delay if no client
        setTimeout(() => {
          onSuccess &&
            onSuccess({ mode: "sell", quantity: parsedQuantity, seasonId });
          onOpenChange(false);
        }, 2000);
      }

      setQuantityInput("1");
      void refetchBalance?.();
    } catch (err) {
      try {
        const message = getReadableError(err);
        onNotify && onNotify({ type: "error", message, hash: "" });
      } catch {
        onNotify &&
          onNotify({
            type: "error",
            message: t("transactions:sellFailed", {
              defaultValue: "Sell failed",
            }),
            hash: "",
          });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // MAX helper - reads user's position from bonding curve's playerTickets mapping
  const onMaxSell = async () => {
    try {
      if (!client || !connectedAddress) return;
      const bal = await client.readContract({
        address: bondingCurveAddress,
        abi: curveAbi,
        functionName: "playerTickets",
        args: [connectedAddress],
      });

      setQuantityInput(`${Number(bal ?? 0n)}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to fetch ticket balance";
      onNotify && onNotify({ type: "error", message, hash: "" });
    }
  };

  const rpcMissing = !net?.rpcUrl;
  const disabledTip = rpcMissing
    ? "Testnet RPC not configured. Set VITE_RPC_URL_TESTNET in .env and restart dev servers."
    : undefined;
  const walletNotConnected = !connectedAddress;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-t-2 border-primary rounded-t-2xl px-3 max-w-screen-sm mx-auto"
      >
        <SheetHeader className="mb-6">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-bold">
                {activeTab === "buy" ? "Buy Tickets" : "Sell Tickets"}
              </SheetTitle>
              <div className="flex items-center gap-2">
                {/* Settings Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(!showSettings)}
                  className="hover:bg-white/10 p-2 h-8 w-8"
                  title="Slippage settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="hover:bg-white/10 p-2 h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <SheetDescription className="text-xs text-gray-400">
              {activeTab === "buy"
                ? "Purchase raffle tickets using SOF tokens"
                : "Sell your raffle tickets for SOF tokens"}
            </SheetDescription>
          </div>
        </SheetHeader>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6 bg-black/40 border border-border rounded-lg p-4">
            <div className="text-sm font-medium mb-2 text-white">
              {t("common:slippage", { defaultValue: "Slippage tolerance" })}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {t("common:slippageDescription", {
                defaultValue:
                  "Maximum percentage you are willing to lose due to unfavorable price changes.",
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSlippagePct("0")}
                className="border-primary text-white hover:bg-primary"
              >
                0.0%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSlippagePct("1")}
                className="border-primary text-white hover:bg-primary"
              >
                1.0%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSlippagePct("2")}
                className="border-primary text-white hover:bg-primary"
              >
                2.0%
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={slippagePct}
                onChange={(e) => setSlippagePct(e.target.value)}
                className="bg-black/60 border-border text-white"
                placeholder="1.0"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="bg-primary hover:bg-primary/80 text-white"
              >
                {t("common:save", { defaultValue: "Save" })}
              </Button>
            </div>
          </div>
        )}

        {/* Trading Locked Overlay */}
        {tradingLocked && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-t-2xl backdrop-blur-sm">
            <div className="text-center p-6 bg-card border rounded-lg shadow-lg">
              <p className="text-lg font-semibold mb-2">
                {t("common:tradingLocked", {
                  defaultValue: "Trading is Locked",
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("common:seasonEnded", { defaultValue: "Season has ended" })}
              </p>
            </div>
          </div>
        )}

        {/* Wallet Not Connected Overlay */}
        {!tradingLocked && walletNotConnected && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-t-2xl backdrop-blur-sm">
            <div className="text-center p-6 rounded-lg bg-black/75 text-muted-foreground shadow-lg max-w-sm">
              <p className="text-lg font-semibold">
                {t("common:connectWalletToTrade", {
                  defaultValue: "Connect your wallet to trade",
                })}
              </p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-black/40 p-1.5">
            <TabsTrigger
              value="buy"
              className="data-[state=active]:text-primary data-[state=active]:underline data-[state=active]:underline-offset-8 text-white/60 font-semibold"
            >
              BUY
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className="data-[state=active]:text-primary data-[state=active]:underline data-[state=active]:underline-offset-8 text-white/60 font-semibold"
            >
              SELL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-6">
            <form onSubmit={onBuy}>
              <div>
                <label className="text-sm font-medium mb-3 block text-muted-foreground">
                  {t("common:amount", { defaultValue: "Tickets to Buy" })}
                </label>
                <QuantityStepper
                  value={quantityInput}
                  onChange={setQuantityInput}
                  min={1}
                  max={maxBuyableNumber ?? 0}
                  maxValidationMessage={
                    maxBuyableNumber !== null
                      ? t("transactions:maxValueMessage", {
                          defaultValue:
                            "Value must be less than or equal to {{max}}",
                          max: maxBuyableNumber,
                        })
                      : undefined
                  }
                  step={1}
                />
              </div>

              <div className="bg-black/40 border border-border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">
                  {t("common:estimatedCost", {
                    defaultValue: "Estimated cost",
                  })}
                </div>
                <div className="text-2xl font-bold">
                  {formatSOF(estBuyWithFees)} $SOF
                </div>
                {buyFeeBps > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Includes {buyFeeBps / 100}% fee
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={
                  rpcMissing ||
                  !isQuantityValid ||
                  maxBuyableNumber === null ||
                  maxBuyableNumber < 1 ||
                  exceedsRemainingSupply ||
                  isLoading ||
                  tradingLocked ||
                  seasonTimeNotActive ||
                  walletNotConnected ||
                  hasZeroBalance ||
                  hasInsufficientBalance
                }
                size="lg"
                className="w-full"
                title={
                  seasonTimeNotActive
                    ? "Season is not active"
                    : tradingLocked
                      ? "Trading is locked"
                      : walletNotConnected
                        ? "Connect wallet first"
                        : hasZeroBalance
                          ? t("transactions:insufficientSOFShort", {
                              defaultValue: "Insufficient $SOF balance",
                            })
                          : hasInsufficientBalance
                            ? t("transactions:insufficientSOFShort", {
                                defaultValue: "Insufficient $SOF balance",
                              })
                            : disabledTip
                }
              >
                {isLoading ? t("transactions:buying") : "BUY NOW"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="sell" className="space-y-6">
            <form onSubmit={onSell}>
              <div>
                <label className="text-sm font-medium mb-3 block text-muted-foreground">
                  {t("common:amount", { defaultValue: "Tickets to Sell" })}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <QuantityStepper
                      value={quantityInput}
                      onChange={setQuantityInput}
                      min={1}
                      max={Number(maxSellable)}
                      step={1}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onMaxSell}
                    disabled={!connectedAddress}
                    title={
                      connectedAddress
                        ? t("common:max", { defaultValue: "Max" })
                        : "Connect wallet"
                    }
                    className="border-primary text-white hover:bg-primary px-4"
                  >
                    MAX
                  </Button>
                </div>
              </div>

              <div className="bg-black/40 border border-border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">
                  {t("common:estimatedProceeds", {
                    defaultValue: "Estimated proceeds",
                  })}
                </div>
                <div className="text-2xl font-bold">
                  {formatSOF(estSellAfterFees)} $SOF
                </div>
                {sellFeeBps > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    After {sellFeeBps / 100}% fee
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={
                  rpcMissing ||
                  !isQuantityValid ||
                  isLoading ||
                  tradingLocked ||
                  seasonTimeNotActive ||
                  walletNotConnected ||
                  maxSellable === 0n
                }
                size="lg"
                className="w-full"
                title={
                  seasonTimeNotActive
                    ? "Season is not active"
                    : tradingLocked
                      ? "Trading is locked"
                      : walletNotConnected
                        ? "Connect wallet first"
                        : maxSellable === 0n
                          ? "No tickets to sell"
                          : disabledTip
                }
              >
                {isLoading ? t("transactions:selling") : "SELL NOW"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

BuySellSheet.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(["buy", "sell"]),
  seasonId: PropTypes.number,
  seasonStatus: PropTypes.any,
  seasonEndTime: PropTypes.any,
  bondingCurveAddress: PropTypes.string,
  maxSellable: PropTypes.bigint,
  onSuccess: PropTypes.func,
  onNotify: PropTypes.func,
};

export default BuySellSheet;
