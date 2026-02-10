/**
 * Buy/Sell Bottom Sheet
 * Bottom sheet modal for Buy/Sell transactions
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { buildPublicClient } from "@/lib/viemClient";
import { useSofDecimals } from "@/hooks/useSofDecimals";
import { useSOFToken } from "@/hooks/useSOFToken";
import { useAccount } from "wagmi";
import {
  useFormatSOF,
  usePriceEstimation,
  useTradingLockStatus,
  useBalanceValidation,
  useBuySellTransactions,
  useSeasonValidation,
  useTransactionHandlers,
} from "@/hooks/buysell";
import {
  BuyForm,
  SellForm,
  SlippageSettings,
  TradingStatusOverlay,
} from "@/components/buysell";
import { Button } from "@/components/ui/button";

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

  const [activeTab, setActiveTab] = useState(() => {
    if (mode === "buy" || mode === "sell") {
      return mode;
    }
    return "buy";
  });

  const [quantityInput, setQuantityInput] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [slippagePct, setSlippagePct] = useState("1");
  const [showSettings, setShowSettings] = useState(false);

  // Sync activeTab with mode prop when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(mode);
    }
  }, [open, mode]);

  const parsedQuantity = useMemo(() => {
    const n = Number(quantityInput);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  }, [quantityInput]);

  const isQuantityValid = parsedQuantity !== null && parsedQuantity >= 1;

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const client = useMemo(() => {
    if (!net?.rpcUrl) return null;
    return buildPublicClient(net.rpcUrl, net.chainId ?? net.id);
  }, [net]);

  // Shared hooks
  const { tradingLocked, buyFeeBps, sellFeeBps } = useTradingLockStatus(
    client,
    bondingCurveAddress
  );

  const { maxBuyable, seasonTimeNotActive } = useSeasonValidation(
    client,
    bondingCurveAddress,
    seasonStatus,
    seasonEndTime,
    open
  );

  const { buyEstBase, sellEstBase, estBuyWithFees, estSellAfterFees } =
    usePriceEstimation(
      client,
      bondingCurveAddress,
      isQuantityValid ? String(parsedQuantity) : "0",
      isQuantityValid ? String(parsedQuantity) : "0",
      buyFeeBps,
      sellFeeBps
    );

  const { hasInsufficientBalance, hasZeroBalance } = useBalanceValidation(
    sofBalance,
    sofDecimals,
    estBuyWithFees,
    isBalanceLoading
  );

  const txSuccessCallback = useCallback(() => {
    onSuccess?.({ mode: activeTab, quantity: parsedQuantity, seasonId });
    onOpenChange(false);
  }, [activeTab, parsedQuantity, seasonId, onSuccess, onOpenChange]);

  const { executeBuy, executeSell } = useBuySellTransactions(
    bondingCurveAddress,
    client,
    onNotify,
    txSuccessCallback
  );

  const { handleBuy, handleSell, fetchMaxSellable } = useTransactionHandlers({
    client,
    bondingCurveAddress,
    connectedAddress,
    tradingLocked,
    seasonTimeNotActive,
    hasZeroBalance,
    hasInsufficientBalance,
    formatSOF,
    onNotify,
    executeBuy,
    executeSell,
    estBuyWithFees,
    estSellAfterFees,
    slippagePct,
  });

  const exceedsRemainingSupply =
    maxBuyable !== null && isQuantityValid ? parsedQuantity > maxBuyable : false;

  const onBuy = async (e) => {
    e.preventDefault();
    if (!isQuantityValid) return;

    setIsLoading(true);
    try {
      await handleBuy(BigInt(parsedQuantity), () => setQuantityInput("1"));
    } finally {
      setIsLoading(false);
    }
  };

  const onSell = async (e) => {
    e.preventDefault();
    if (!isQuantityValid) return;

    setIsLoading(true);
    try {
      await handleSell(BigInt(parsedQuantity), () => setQuantityInput("1"));
    } finally {
      setIsLoading(false);
    }
  };

  // MAX helper - reads user's position from bonding curve
  const onMaxSell = useCallback(async () => {
    const balance = await fetchMaxSellable();
    setQuantityInput(`${Number(balance)}`);
  }, [fetchMaxSellable]);

  const rpcMissing = !net?.rpcUrl;
  const disabledTip = rpcMissing
    ? "Testnet RPC not configured. Set VITE_RPC_URL_TESTNET in .env and restart dev servers."
    : undefined;
  const walletNotConnected = !connectedAddress;

  // Buy button disabled logic
  const buyDisabled =
    rpcMissing ||
    !isQuantityValid ||
    maxBuyable === null ||
    maxBuyable < 1 ||
    exceedsRemainingSupply ||
    isLoading ||
    tradingLocked ||
    seasonTimeNotActive ||
    walletNotConnected ||
    hasZeroBalance ||
    hasInsufficientBalance;

  const buyDisabledReason = seasonTimeNotActive
    ? "Season is not active"
    : tradingLocked
      ? "Trading is locked"
      : walletNotConnected
        ? "Connect wallet first"
        : hasZeroBalance || hasInsufficientBalance
          ? t("transactions:insufficientSOFShort", {
              defaultValue: "Insufficient $SOF balance",
            })
          : disabledTip;

  // Sell button disabled logic
  const sellDisabled =
    rpcMissing ||
    !isQuantityValid ||
    isLoading ||
    tradingLocked ||
    seasonTimeNotActive ||
    walletNotConnected ||
    maxSellable === 0n;

  const sellDisabledReason = seasonTimeNotActive
    ? "Season is not active"
    : tradingLocked
      ? "Trading is locked"
      : walletNotConnected
        ? "Connect wallet first"
        : maxSellable === 0n
          ? "No tickets to sell"
          : disabledTip;

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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(!showSettings)}
                  className="hover:bg-foreground/10 p-2 h-8 w-8"
                  title="Slippage settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="hover:bg-foreground/10 p-2 h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <SheetDescription className="text-xs text-muted-foreground">
              {activeTab === "buy"
                ? "Purchase raffle tickets using SOF tokens"
                : "Sell your raffle tickets for SOF tokens"}
            </SheetDescription>
          </div>
        </SheetHeader>

        {showSettings && (
          <SlippageSettings
            slippagePct={slippagePct}
            onSlippageChange={setSlippagePct}
            onClose={() => setShowSettings(false)}
            variant="mobile"
          />
        )}

        <TradingStatusOverlay
          tradingLocked={tradingLocked}
          walletNotConnected={walletNotConnected}
          variant="mobile"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-primary/20 p-1.5">
            <TabsTrigger
              value="buy"
              className="data-[state=active]:text-primary data-[state=active]:underline data-[state=active]:underline-offset-8 text-foreground/60 font-semibold"
            >
              BUY
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className="data-[state=active]:text-primary data-[state=active]:underline data-[state=active]:underline-offset-8 text-foreground/60 font-semibold"
            >
              SELL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-6">
            <BuyForm
              quantityInput={quantityInput}
              onQuantityChange={setQuantityInput}
              maxBuyable={maxBuyable}
              estBuyWithFees={estBuyWithFees}
              buyFeeBps={buyFeeBps}
              formatSOF={formatSOF}
              onSubmit={onBuy}
              isLoading={isLoading}
              disabled={buyDisabled}
              disabledReason={buyDisabledReason}
            />
          </TabsContent>

          <TabsContent value="sell" className="space-y-6">
            <SellForm
              quantityInput={quantityInput}
              onQuantityChange={setQuantityInput}
              maxSellable={maxSellable}
              estSellAfterFees={estSellAfterFees}
              sellFeeBps={sellFeeBps}
              formatSOF={formatSOF}
              onSubmit={onSell}
              onMaxClick={onMaxSell}
              isLoading={isLoading}
              disabled={sellDisabled}
              disabledReason={sellDisabledReason}
              connectedAddress={connectedAddress}
            />
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
