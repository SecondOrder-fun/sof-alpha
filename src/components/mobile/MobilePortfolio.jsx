// src/components/mobile/MobilePortfolio.jsx
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import { TabsContent, TabsList } from "@/components/ui/tabs";
import { SmartTabs, SmartTabsTrigger } from "./SmartTabs";
import BottomNav from "./BottomNav";
import MobileAccountTab from "./MobileAccountTab";
import MobileBalancesTab from "./MobileBalancesTab";
import MobileClaimsTab from "./MobileClaimsTab";
import { useUsername } from "@/hooks/useUsername";
import { useAllSeasons } from "@/hooks/useAllSeasons";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { getContractAddresses } from "@/config/contracts";
import ERC20Abi from "@/contracts/abis/ERC20.json";
import SOFBondingCurveAbi from "@/contracts/abis/SOFBondingCurve.json";

/**
 * MobilePortfolio - Mobile-optimized portfolio page with tab navigation
 */
const MobilePortfolio = () => {
  const { address, isConnected } = useAccount();
  const { data: username } = useUsername(address);
  const { t } = useTranslation(["account", "common"]);

  const netKey = getStoredNetworkKey();
  const net = getNetworkByKey(netKey);
  const contracts = getContractAddresses(netKey);

  // Create viem client
  const client = useMemo(() => {
    return createPublicClient({
      chain: {
        id: net.id,
        name: net.name,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [net.rpcUrl] } },
      },
      transport: http(net.rpcUrl),
    });
  }, [net.id, net.name, net.rpcUrl]);

  // Fetch all seasons
  const allSeasonsQuery = useAllSeasons();
  const seasons = allSeasonsQuery.data || [];

  // SOF balance query
  const sofBalanceQuery = useQuery({
    queryKey: ["sofBalance", netKey, contracts.SOF, address],
    enabled: isConnected && !!contracts.SOF && !!address,
    queryFn: async () => {
      const bal = await client.readContract({
        address: contracts.SOF,
        abi: ERC20Abi.abi,
        functionName: "balanceOf",
        args: [address],
      });
      return bal;
    },
    staleTime: 15_000,
  });

  // Season balances query
  const seasonBalancesQuery = useQuery({
    queryKey: [
      "raffleTokenBalances",
      netKey,
      address,
      seasons.map((s) => s.id).join(","),
    ],
    enabled: isConnected && !!address && seasons.length > 0,
    queryFn: async () => {
      const results = [];
      for (const s of seasons) {
        const curveAddr = s?.config?.bondingCurve;
        if (!curveAddr) continue;
        try {
          const raffleTokenAddr = await client.readContract({
            address: curveAddr,
            abi: SOFBondingCurveAbi,
            functionName: "raffleToken",
            args: [],
          });

          const [decimals, bal] = await Promise.all([
            client.readContract({
              address: raffleTokenAddr,
              abi: ERC20Abi.abi,
              functionName: "decimals",
              args: [],
            }),
            client.readContract({
              address: raffleTokenAddr,
              abi: ERC20Abi.abi,
              functionName: "balanceOf",
              args: [address],
            }),
          ]);

          if ((bal ?? 0n) > 0n) {
            const base = 10n ** BigInt(decimals);
            const tickets = (bal ?? 0n) / base;

            results.push({
              seasonId: s.id,
              name: s?.config?.name || `Season ${s.id}`,
              token: raffleTokenAddr,
              balance: bal,
              decimals,
              ticketCount: tickets.toString(),
            });
          }
        } catch (e) {
          // Skip problematic season gracefully
        }
      }
      return results;
    },
    staleTime: 15_000,
  });

  const sofBalance = useMemo(() => {
    try {
      const raw = formatUnits(sofBalanceQuery.data ?? 0n, 18);
      const num = parseFloat(raw);
      return isNaN(num) ? "0.0000" : num.toFixed(4);
    } catch {
      return "0.0000";
    }
  }, [sofBalanceQuery.data]);

  const rafflePositions = seasonBalancesQuery.data || [];

  if (!isConnected) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground text-center">
            {t("account:connectWalletToViewAccount")}
          </p>
        </div>
        <BottomNav activeTab="portfolio" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden flex flex-col px-3 pt-1 pb-20">
        <h1 className="text-lg font-semibold text-white mb-3">
          {t("account:myAccount")}
        </h1>

        <SmartTabs
          defaultValue="account"
          className="flex-1 flex flex-col overflow-hidden"
        >
          {(activeTab) => (
            <>
              <TabsList className="grid w-full grid-cols-3 bg-black/40 p-1.5">
                <SmartTabsTrigger
                  value="account"
                  activeTab={activeTab}
                  position={0}
                >
                  {t("account:profile")}
                </SmartTabsTrigger>
                <SmartTabsTrigger
                  value="balances"
                  activeTab={activeTab}
                  position={1}
                >
                  {t("account:balance")}
                </SmartTabsTrigger>
                <SmartTabsTrigger
                  value="claims"
                  activeTab={activeTab}
                  position={2}
                >
                  {t("account:claims")}
                </SmartTabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                <TabsContent value="account" className="mt-0">
                  <MobileAccountTab address={address} username={username} />
                </TabsContent>

                <TabsContent value="balances" className="mt-0">
                  <MobileBalancesTab
                    address={address}
                    sofBalance={sofBalance}
                    rafflePositions={rafflePositions}
                  />
                </TabsContent>

                <TabsContent value="claims" className="mt-0">
                  <MobileClaimsTab address={address} />
                </TabsContent>
              </div>
            </>
          )}
        </SmartTabs>
      </div>

      <BottomNav activeTab="portfolio" />
    </div>
  );
};

export default MobilePortfolio;
