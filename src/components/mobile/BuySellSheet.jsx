/**
 * Buy/Sell Bottom Sheet
 * Bottom sheet modal for Buy/Sell transactions
 */

import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import QuantityStepper from "@/components/mobile/QuantityStepper";
import { useReadContract } from "wagmi";
import SOFBondingCurveAbi from "@/contracts/abis/SOFBondingCurve.json";

export const BuySellSheet = ({
  open,
  onOpenChange,
  mode = "buy",
  seasonId,
  bondingCurveAddress,
  maxSellable = 0n,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState(mode);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0n);
  const [estimatedProceeds, setEstimatedProceeds] = useState(0n);

  // Calculate buy price
  const { data: buyPrice } = useReadContract({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    functionName: "calculateBuyPrice",
    args: [BigInt(quantity)],
    query: {
      enabled: activeTab === "buy" && !!bondingCurveAddress && quantity > 0,
    },
  });

  // Calculate sell price
  const { data: sellPrice } = useReadContract({
    address: bondingCurveAddress,
    abi: SOFBondingCurveAbi,
    functionName: "calculateSellPrice",
    args: [BigInt(quantity)],
    query: {
      enabled: activeTab === "sell" && !!bondingCurveAddress && quantity > 0,
    },
  });

  const formatSOF = (weiAmount) => {
    return Number(formatUnits(weiAmount ?? 0n, 18)).toFixed(4);
  };

  // Update estimates when prices change
  useEffect(() => {
    if (activeTab === "buy" && buyPrice) {
      setEstimatedCost(buyPrice);
    } else if (activeTab === "sell" && sellPrice) {
      setEstimatedProceeds(sellPrice);
    }
  }, [buyPrice, sellPrice, activeTab]);

  const handleTransaction = async () => {
    setIsLoading(true);
    try {
      // Transaction logic will be implemented by parent component
      // This is just the UI wrapper
      await onSuccess?.({ mode: activeTab, quantity, seasonId });
      onOpenChange(false);
    } catch (error) {
      // Error will be handled by parent component
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  const maxBuyable = 1000; // This should come from contract/props

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#6b6b6b] border-t-2 border-[#c82a54] rounded-t-2xl"
      >
        <SheetHeader className="mb-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white text-xl font-bold">
              {activeTab === "buy" ? "Buy Tickets" : "Sell Tickets"}
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-white hover:bg-[#130013]/20"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-[#130013]/30">
            <TabsTrigger
              value="buy"
              className="data-[state=active]:bg-[#c82a54] data-[state=active]:text-white"
            >
              BUY
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className="data-[state=active]:bg-[#c82a54] data-[state=active]:text-white"
            >
              SELL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-6">
            <div>
              <label className="text-white text-sm font-medium mb-3 block">
                Tickets to Buy
              </label>
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                min={1}
                max={maxBuyable}
                step={1}
              />
            </div>

            <div className="bg-[#130013]/30 rounded-lg p-4">
              <div className="text-[#a89e99] text-sm mb-1">Cost</div>
              <div className="text-white text-2xl font-bold">
                {formatSOF(estimatedCost)} $SOF
              </div>
            </div>

            <Button
              onClick={handleTransaction}
              disabled={isLoading || quantity < 1}
              className="w-full h-14 bg-[#c82a54] hover:bg-[#c82a54]/90 text-white text-lg font-semibold"
            >
              {isLoading ? "Processing..." : "BUY NOW"}
            </Button>
          </TabsContent>

          <TabsContent value="sell" className="space-y-6">
            <div>
              <label className="text-white text-sm font-medium mb-3 block">
                Tickets to Sell
              </label>
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                min={1}
                max={Number(maxSellable)}
                step={1}
              />
            </div>

            <div className="bg-[#130013]/30 rounded-lg p-4">
              <div className="text-[#a89e99] text-sm mb-1">Proceeds</div>
              <div className="text-white text-2xl font-bold">
                {formatSOF(estimatedProceeds)} $SOF
              </div>
            </div>

            <Button
              onClick={handleTransaction}
              disabled={isLoading || quantity < 1 || maxSellable === 0n}
              className="w-full h-14 bg-[#c82a54] hover:bg-[#c82a54]/90 text-white text-lg font-semibold"
            >
              {isLoading ? "Processing..." : "SELL NOW"}
            </Button>
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
  bondingCurveAddress: PropTypes.string,
  maxSellable: PropTypes.bigint,
  onSuccess: PropTypes.func,
};

export default BuySellSheet;
