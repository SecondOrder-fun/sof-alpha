// src/routes/AdminPanel.jsx
import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useChainId } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useRaffleWrite } from "@/hooks/useRaffleWrite";
import { useAllSeasons } from "@/hooks/useAllSeasons";
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
import { keccak256, stringToHex } from "viem";
import { getContractAddresses } from "@/config/contracts";

// Import refactored components
import TransactionStatus from "@/components/admin/TransactionStatus";
import CreateSeasonForm from "@/components/admin/CreateSeasonForm";
import SeasonList from "@/components/admin/SeasonList";
import useFundDistributor from "@/hooks/useFundDistributor";

// Minimal ABIs used for local E2E resolution
// IMPORTANT: This ABI must match the actual Raffle.sol contract interface
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
          { name: "winnerCount", type: "uint16" },
          { name: "grandPrizeBps", type: "uint16" },
          { name: "raffleToken", type: "address" },
          { name: "bondingCurve", type: "address" },
          { name: "isActive", type: "bool" },
          { name: "isCompleted", type: "bool" },
        ],
      },
      { name: "status", type: "uint8" },
      { name: "totalParticipants", type: "uint256" },
      { name: "totalTickets", type: "uint256" },
      { name: "totalPrizePool", type: "uint256" },
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
  {
    type: "function",
    name: "getWinners",
    stateMutability: "view",
    inputs: [{ name: "seasonId", type: "uint256" }],
    outputs: [{ name: "winners", type: "address[]" }],
  },
];

function AdminPanel() {
  const { createSeason, startSeason, requestSeasonEnd } = useRaffleWrite();
  const allSeasonsQuery = useAllSeasons();
  const { address } = useAccount();
  const { hasRole } = useAccessControl();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  // Network configuration
  const netKey = getStoredNetworkKey();
  const netCfg = getNetworkByKey(netKey);

  const DEFAULT_ADMIN_ROLE =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  const SEASON_CREATOR_ROLE = keccak256(stringToHex("SEASON_CREATOR_ROLE"));
  const EMERGENCY_ROLE = keccak256(stringToHex("EMERGENCY_ROLE"));

  // State for fund distributor functionality
  const [endingE2EId, setEndingE2EId] = useState(null);
  const [endStatus, setEndStatus] = useState("");
  const [verify, setVerify] = useState({});

  // Check if user has admin role
  const { data: isAdmin, isLoading: isAdminLoading } = useQuery({
    queryKey: ["isAdmin", address],
    queryFn: () => hasRole(DEFAULT_ADMIN_ROLE, address),
    enabled: !!address,
  });

  // Check if user has creator role
  const { data: hasCreatorRole, isLoading: isCreatorLoading } = useQuery({
    queryKey: ["hasSeasonCreatorRole", address],
    queryFn: () => hasRole(SEASON_CREATOR_ROLE, address),
    enabled: !!address,
  });

  // Check if user has emergency role
  const { data: hasEmergencyRole, isLoading: isEmergencyLoading } = useQuery({
    queryKey: ["hasEmergencyRole", address],
    queryFn: () => hasRole(EMERGENCY_ROLE, address),
    enabled: !!address,
  });

  // Get chain time for UI
  const chainTimeQuery = useQuery({
    queryKey: ["chainTime", netKey],
    queryFn: async () => {
      if (!publicClient) return null;
      const block = await publicClient.getBlock();
      return Number(block.timestamp);
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Contract code presence check for RAFFLE
  const [raffleCodeStatus, setRaffleCodeStatus] = useState({
    checked: false,
    hasCode: false,
    error: null,
  });

  // Check if RAFFLE contract has code deployed
  useEffect(() => {
    let cancelled = false;
    const addresses = getContractAddresses(getStoredNetworkKey());

    async function checkCode() {
      try {
        if (!publicClient || !addresses?.RAFFLE) {
          if (!cancelled) {
            setRaffleCodeStatus({ checked: true, hasCode: false, error: null });
          }
          return;
        }
        const code = await publicClient.getCode({ address: addresses.RAFFLE });
        if (!cancelled) {
          setRaffleCodeStatus({
            checked: true,
            hasCode: !!code && code !== "0x",
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setRaffleCodeStatus({
            checked: true,
            hasCode: false,
            error: error.message,
          });
        }
      }
    }

    checkCode();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  // Initialize the FundDistributor hook
  const { fundDistributorManual } = useFundDistributor({
    seasonId: null, // Set to null initially, will be provided when button is clicked
    setEndingE2EId,
    setEndStatus,
    setVerify,
    allSeasonsQuery,
    RaffleMiniAbi,
  });

  if (isAdminLoading || isCreatorLoading || isEmergencyLoading) {
    return <p>Checking authorization...</p>;
  }

  if (!isAdmin) {
    return <p>You are not authorized to view this page.</p>;
  }

  const addresses = getContractAddresses(netKey);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Admin Panel</h2>
        <p className="text-sm text-muted-foreground">
          Manage raffle seasons and contract settings
        </p>
        <div className="space-y-2">
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
            <CreateSeasonForm
              createSeason={createSeason}
              chainTimeQuery={chainTimeQuery}
            />
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
              <TransactionStatus mutation={createSeason} />
            )}

            {allSeasonsQuery.isLoading && <p>Loading seasons...</p>}
            {allSeasonsQuery.error && (
              <p>Error loading seasons: {allSeasonsQuery.error.message}</p>
            )}

            <SeasonList
              seasons={allSeasonsQuery.data || []}
              hasCreatorRole={hasCreatorRole}
              hasEmergencyRole={hasEmergencyRole}
              chainId={chainId}
              networkConfig={netCfg}
              startSeason={startSeason}
              requestSeasonEnd={requestSeasonEnd}
              fundDistributor={fundDistributorManual}
              verify={verify}
              endingE2EId={endingE2EId}
              endStatus={endStatus}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdminPanel;
