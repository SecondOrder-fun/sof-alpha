// src/components/curve/BuySellWidget.jsx
import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { buildPublicClient } from "@/lib/viemClient";
import { useAccount } from "wagmi";
import { useSofDecimals } from "@/hooks/useSofDecimals";
import { useSOFToken } from "@/hooks/useSOFToken";
import { SOFBondingCurveAbi } from "@/utils/abis";
import {
  useFormatSOF,
  usePriceEstimation,
  useTradingLockStatus,
  useBalanceValidation,
  useBuySellTransactions,
} from "@/hooks/buysell";
import {
  SlippageSettings,
  TradingStatusOverlay,
} from "@/components/buysell";

const BuySellWidget = ({
  bondingCurveAddress,
  onTxSuccess,
  onNotify,
  initialTab,
  isGated = false,
  isVerified = null,
  onGatingRequired,
}) => {
  const { t } = useTranslation(["common", "transactions"]);
  const sofDecimalsState = useSofDecimals();
  const decimalsReady =
    typeof sofDecimalsState === "number" && !Number.isNaN(sofDecimalsState);
  const sofDecimals = decimalsReady ? sofDecimalsState : 18;
  const formatSOF = useFormatSOF(sofDecimals);
  const { address: connectedAddress } = useAccount();
  const {
    balance: sofBalance = "0",
    isLoading: isBalanceLoading,
  } = useSOFToken();

  // Tab state with localStorage persistence
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab === "buy" || initialTab === "sell") {
      return initialTab;
    }
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
  const [slippagePct, setSlippagePct] = useState("1"); // 1%
  const [showSettings, setShowSettings] = useState(false);

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const client = useMemo(() => {
    if (!net?.rpcUrl) return null;
    return buildPublicClient(netKey);
  }, [net?.rpcUrl, netKey]);

  // Shared hooks
  const { tradingLocked, buyFeeBps, sellFeeBps } = useTradingLockStatus(
    client,
    bondingCurveAddress
  );

  const { buyEstBase, sellEstBase, estBuyWithFees, estSellAfterFees } =
    usePriceEstimation(
      client,
      bondingCurveAddress,
      buyAmount,
      sellAmount,
      buyFeeBps,
      sellFeeBps
    );

  const { hasInsufficientBalance, hasZeroBalance } = useBalanceValidation(
    sofBalance,
    sofDecimals,
    estBuyWithFees,
    isBalanceLoading
  );

  const { executeBuy, executeSell, isPending } = useBuySellTransactions(
    bondingCurveAddress,
    client,
    onNotify,
    onTxSuccess
  );

  // Persist active tab in localStorage
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

  const onBuy = async (e) => {
    e.preventDefault();
    if (!buyAmount || !bondingCurveAddress) return;

    // Check gating before allowing transaction
    if (isGated && isVerified !== true) {
      if (onGatingRequired) {
        onGatingRequired("buy");
      }
      return;
    }

    if (tradingLocked) {
      onNotify?.({
        type: "error",
        message: "Trading is locked - Season has ended",
        hash: "",
      });
      return;
    }

    if (hasZeroBalance) {
      onNotify?.({
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
      onNotify?.({
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

    const result = await executeBuy({
      tokenAmount: BigInt(buyAmount),
      maxSofAmount: estBuyWithFees,
      slippagePct,
      onComplete: () => setBuyAmount(""),
    });

    if (result.success) {
      setBuyAmount("");
    }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!sellAmount || !bondingCurveAddress) return;

    // Check gating before allowing transaction
    if (isGated && isVerified !== true) {
      if (onGatingRequired) {
        onGatingRequired("sell");
      }
      return;
    }

    if (tradingLocked) {
      onNotify?.({
        type: "error",
        message: "Trading is locked - Season has ended",
        hash: "",
      });
      return;
    }

    const result = await executeSell({
      tokenAmount: BigInt(sellAmount),
      minSofAmount: estSellAfterFees,
      slippagePct,
      onComplete: () => setSellAmount(""),
    });

    if (result.success) {
      setSellAmount("");
    }
  };

  // MAX helper - reads user's position from bonding curve
  const onMaxSell = useCallback(async () => {
    try {
      if (!client || !connectedAddress) return;
      const bal = await client.readContract({
        address: bondingCurveAddress,
        abi: SOFBondingCurveAbi,
        functionName: "playerTickets",
        args: [connectedAddress],
      });
      setSellAmount((bal ?? 0n).toString());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to fetch ticket balance";
      onNotify?.({ type: "error", message, hash: "" });
    }
  }, [client, connectedAddress, bondingCurveAddress, onNotify]);

  const rpcMissing = !net?.rpcUrl;
  const disabledTip = rpcMissing
    ? "Testnet RPC not configured. Set VITE_RPC_URL_TESTNET in .env and restart dev servers."
    : undefined;
  const walletNotConnected = !connectedAddress;

  return (
    <div className="space-y-4 relative">
      <TradingStatusOverlay
        tradingLocked={tradingLocked}
        walletNotConnected={walletNotConnected}
        variant="desktop"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full mb-3 mt-2 grid grid-cols-[2fr,2fr,0.6fr] gap-2 items-center">
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
            <SlippageSettings
              slippagePct={slippagePct}
              onSlippageChange={setSlippagePct}
              onClose={() => setShowSettings(false)}
              variant="desktop"
            />
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
                isPending ||
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
                    : hasZeroBalance || hasInsufficientBalance
                      ? t("transactions:insufficientSOFShort", {
                          defaultValue: "Insufficient $SOF balance",
                        })
                      : disabledTip
              }
            >
              {isPending ? t("transactions:buying") : t("common:buy")}
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
                isPending ||
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
              {isPending ? t("transactions:selling") : t("common:sell")}
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
  isGated: PropTypes.bool,
  isVerified: PropTypes.bool,
  onGatingRequired: PropTypes.func,
};

export default BuySellWidget;
