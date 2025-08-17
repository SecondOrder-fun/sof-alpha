// src/hooks/useAllSeasons.js
import { useQuery } from '@tanstack/react-query';
import { useRaffleRead } from './useRaffleRead';
import { usePublicClient } from 'wagmi';
import { getContractAddresses, RAFFLE_ABI } from '@/config/contracts';
import { getStoredNetworkKey } from '@/lib/wagmi';

export function useAllSeasons() {
  const { currentSeasonQuery } = useRaffleRead();
  const client = usePublicClient();
  // Ensure we resolve addresses for the same selected network as other hooks
  const netKey = getStoredNetworkKey();
  const addr = getContractAddresses(netKey);

  const fetchAllSeasons = async () => {
    try {
      const currentSeasonId = currentSeasonQuery.data;
      if (!addr.RAFFLE || currentSeasonId == null) return [];

      const seasonPromises = [];
      for (let i = 0; i <= Number(currentSeasonId); i++) {
        seasonPromises.push(
          client.readContract({
            address: addr.RAFFLE,
            abi: RAFFLE_ABI,
            functionName: 'getSeasonDetails',
            args: [BigInt(i)],
          })
        );
      }

      const seasonsData = await Promise.all(seasonPromises);

      // Normalize and filter out zero/default structs that render as 1970 dates
      const normalized = seasonsData.map((season, index) => ({
        id: index,
        config: season?.[0],
        status: season?.[1],
        totalParticipants: season?.[2],
        totalTickets: season?.[3],
        totalPrizePool: season?.[4],
      }));

      return normalized.filter((s) => {
        const start = Number(s?.config?.startTime || 0);
        const end = Number(s?.config?.endTime || 0);
        const bc = s?.config?.bondingCurve;
        const isZeroAddr = typeof bc === 'string' && /^0x0{40}$/i.test(bc);
        return start > 0 && end > 0 && bc && !isZeroAddr;
      });
    } catch (e) {
      // In tests or edge cases, gracefully degrade to empty
      return [];
    }
  };

  const enabled = currentSeasonQuery.isSuccess && currentSeasonQuery.data != null;

  return useQuery({
    queryKey: ['allSeasons', currentSeasonQuery.data, addr.RAFFLE],
    queryFn: fetchAllSeasons,
    enabled,
    // Coalesce undefined to [] for consumers while avoiding initial success state
    select: (data) => data ?? [],
    initialData: undefined,
    retry: false,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
