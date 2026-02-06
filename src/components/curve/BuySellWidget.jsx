// src/components/curve/BuySellWidget.jsx
import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurve } from "@/hooks/useCurve";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { buildPublicClient } from "@/lib/viemClient";
import { useAccount } from "wagmi";
import { useSofDecimals } from "@/hooks/useSofDecimals";
import { useSOFToken } from "@/hooks/useSOFToken";
import { buildFriendlyContractError } from "@/lib/contractErrors";
import { SOFBondingCurveAbi } from "@/utils/abis";

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

const BuySellWidget = ({
  bondingCurveAddress,
  onTxSuccess,
  onNotify,
  initialTab,
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
    // Prefer explicit initial tab from caller when provided
    if (initialTab === "buy" || initialTab === "sell") {
      return initialTab;
    }
    // Fallback to last saved tab in localStorage
    try {
      const saved = localStorage.getItem("buySell.activeTab");
      if (saved === "buy" || saved === "sell") return saved;
    } catch {
      // no-op
    }
    return "buy";
  });
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [buyEstBase, setBuyEstBase] = useState(0n);
  const [sellEstBase, setSellEstBase] = useState(0n);
  const [buyFeeBps, setBuyFeeBps] = useState(0);
  const [sellFeeBps, setSellFeeBps] = useState(0);
  const [slippagePct, setSlippagePct] = useState("1"); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [tradingLocked, setTradingLocked] = useState(false);

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const curveAbi = SOFBondingCurveAbi;
  const client = useMemo(() => {
    if (!net?.rpcUrl) return null; // Guard: TESTNET not configured
    return buildPublicClient(netKey);
  }, [net?.rpcUrl, netKey]);

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

  // Persist active tab in localStorage. If an explicit initialTab was passed,
  // we respect it and do not override from storage on mount.
  useEffect(() => {
    if (initialTab === "buy" || initialTab === "sell") return;
    try {
      const saved = localStorage.getItem("buySell.activeTab");
      if (saved === "buy" || saved === "sell") setActiveTab(saved);
    } catch {
      /* no-op */
    }
  }, [initialTab]);
  useEffect(() => {
    try {
      localStorage.setItem("buySell.activeTab", activeTab);
    } catch {
      /* no-op */
    }
  }, [activeTab]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      const est = await loadEstimate("calculateBuyPrice", buyAmount);
      if (!stop) setBuyEstBase(est);
    })();
    return () => {
      stop = true;
    };
  }, [bondingCurveAddress, buyAmount, loadEstimate]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!bondingCurveAddress) return;
      const est = await loadEstimate("calculateSellPrice", sellAmount);
      if (!stop) setSellEstBase(est);
    })();
    return () => {
      stop = true;
    };
  }, [bondingCurveAddress, sellAmount, loadEstimate]);

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
    if (!buyAmount || !bondingCurveAddress) return;
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
        tokenAmount: BigInt(buyAmount),
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
            onTxSuccess && onTxSuccess();
          }
        } catch (waitErr) {
          const waitMsg =
            waitErr instanceof Error
              ? waitErr.message
              : "Failed waiting for transaction receipt";
          onNotify && onNotify({ type: "error", message: waitMsg, hash });
          // If waiting fails, still trigger refresh after delay
          setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
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
        setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
      }

      setBuyAmount("");
      void refetchBalance?.();
    } catch (err) {
      try {
        // Log full error for debugging
        console.error("Buy transaction error:", err);
        const message = getReadableError(err);
        onNotify && onNotify({ type: "error", message, hash: "" });
      } catch (fallbackErr) {
        console.error("Error in error handler:", fallbackErr);
        onNotify &&
          onNotify({
            type: "error",
            message: t("transactions:genericFailure", {
              defaultValue: "Transaction failed",
            }),
            hash: "",
          });
      }
    }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!sellAmount || !bondingCurveAddress) return;
    if (tradingLocked) {
      onNotify &&
        onNotify({
          type: "error",
          message: "Trading is locked - Season has ended",
          hash: "",
        });
      return;
    }
    try {
      const tokenAmount = BigInt(sellAmount);
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
          }

          onTxSuccess && onTxSuccess();
        } catch (waitErr) {
          const waitMsg =
            waitErr instanceof Error
              ? waitErr.message
              : "Failed waiting for transaction receipt";
          onNotify && onNotify({ type: "error", message: waitMsg, hash });
          // If waiting fails, still trigger refresh after delay
          setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
        }
      } else {
        // Fallback: trigger refresh after delay if no client
        setTimeout(() => onTxSuccess && onTxSuccess(), 2000);
      }

      setSellAmount("");
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
    }
  };

  // MAX helpers - reads user's position from bonding curve's playerTickets mapping
  const onMaxSell = async () => {
    try {
      if (!client || !connectedAddress) return;
      const bal = await client.readContract({
        address: bondingCurveAddress,
        abi: curveAbi,
        functionName: "playerTickets",
        args: [connectedAddress],
      });

      setSellAmount((bal ?? 0n).toString());
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
    <div className="space-y-4 relative">
      {/* Trading Locked Overlay */}
      {tradingLocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-lg backdrop-blur-sm">
          <div className="text-center p-6 bg-card border rounded-lg shadow-lg">
            <p className="text-lg font-semibold mb-2">
              {t("common:tradingLocked", { defaultValue: "Trading is Locked" })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("common:seasonEnded", { defaultValue: "Season has ended" })}
            </p>
          </div>
        </div>
      )}
      {/* Wallet Not Connected Overlay */}
      {!tradingLocked && walletNotConnected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-lg backdrop-blur-sm">
          {/* Sub-card: no border, black background with 75% alpha, Cement text */}
          <div className="text-center p-6 rounded-lg bg-black/75 text-[#a89e99] shadow-lg max-w-sm">
            <p className="text-lg font-semibold">
              {t("common:connectWalletToTrade", {
                defaultValue: "Connect your wallet to trade",
              })}
            </p>
          </div>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full mb-3 mt-2 grid grid-cols-[2fr,2fr,0.6fr] gap-2 items-center">
          {/* Centered Buy/Sell tabs spanning first two columns */}
          <div className="col-span-2 flex justify-center">
            <TabsList>
              <TabsTrigger value="buy" className="px-8 py-3 text-lg">
                {t("common:buy")}
              </TabsTrigger>
              <TabsTrigger value="sell" className="px-8 py-3 text-lg">
                {t("common:sell")}
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center text-xl rounded hover:bg-muted"
              onClick={() => setShowSettings((s) => !s)}
              title="Slippage settings"
            >
              ⚙︎
            </button>
          </div>
          {showSettings && (
            <div className="absolute right-0 top-8 z-10 w-64 border rounded-md bg-card p-3 shadow">
              <div className="text-sm font-medium mb-2">
                {t("common:slippage", { defaultValue: "Slippage tolerance" })}
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {t("common:slippageDescription", {
                  defaultValue:
                    "Maximum percentage you are willing to lose due to unfavorable price changes.",
                })}
              </div>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSlippagePct("0")}
                >
                  0.0%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSlippagePct("1")}
                >
                  1.0%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSlippagePct("2")}
                >
                  2.0%
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={slippagePct}
                  onChange={(e) => setSlippagePct(e.target.value)}
                  className="w-24"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                >
                  {t("common:save")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <TabsContent value="buy">
          <form className="space-y-2" onSubmit={onBuy}>
            <div className="font-medium">
              {t("common:amount", { defaultValue: "Amount" })}
            </div>
            <Input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder={t("common:amount", { defaultValue: "Amount" })}
            />
            <div className="text-xs text-muted-foreground">
              {t("common:estimatedCost", { defaultValue: "Estimated cost" })}:{" "}
              <span className="font-mono">{formatSOF(estBuyWithFees)}</span> SOF
            </div>
            <Button
              type="submit"
              disabled={
                rpcMissing ||
                !buyAmount ||
                buyTokens.isPending ||
                tradingLocked ||
                walletNotConnected ||
                hasZeroBalance ||
                hasInsufficientBalance
              }
              className="w-full"
              title={
                tradingLocked
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
              {buyTokens.isPending ? t("transactions:buying") : t("common:buy")}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="sell">
          <form className="space-y-2" onSubmit={onSell}>
            <div className="font-medium">
              {t("common:amount", { defaultValue: "Amount" })}
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder={t("common:amount", { defaultValue: "Amount" })}
              />
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
              >
                MAX
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("common:estimatedProceeds", {
                defaultValue: "Estimated proceeds",
              })}
              : <span className="font-mono">{formatSOF(estSellAfterFees)}</span>{" "}
              SOF
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={
                rpcMissing ||
                !sellAmount ||
                sellTokens.isPending ||
                tradingLocked ||
                walletNotConnected
              }
              className="w-full"
              title={
                tradingLocked
                  ? "Trading is locked"
                  : walletNotConnected
                    ? "Connect wallet first"
                    : disabledTip
              }
            >
              {sellTokens.isPending
                ? t("transactions:selling")
                : t("common:sell")}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
};

BuySellWidget.propTypes = {
  bondingCurveAddress: PropTypes.string,
  onTxSuccess: PropTypes.func,
  onNotify: PropTypes.func,
  initialTab: PropTypes.oneOf(["buy", "sell"]),
};

export default BuySellWidget;
