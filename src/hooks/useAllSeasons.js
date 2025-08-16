// src/hooks/useAllSeasons.js
import { useQuery } from '@tanstack/react-query';
import { useRaffleRead } from './useRaffleRead';
import { usePublicClient } from 'wagmi';
import { getContractAddresses, RAFFLE_ABI } from '@/config/contracts';

export function useAllSeasons() {
  const { currentSeasonQuery } = useRaffleRead();
  const client = usePublicClient();
  const addr = getContractAddresses();

  const fetchAllSeasons = async () => {
    const currentSeasonId = currentSeasonQuery.data;
    if (!addr.RAFFLE || currentSeasonId == null) return [];

    const seasonPromises = [];
    for (let i = 0; i <= currentSeasonId; i++) {
      seasonPromises.push(
        client.readContract({
          address: addr.RAFFLE,
          abi: RAFFLE_ABI,
          functionName: 'getSeasonDetails',
          args: [i],
        })
      );
    }

    const seasonsData = await Promise.all(seasonPromises);

    return seasonsData.map((season, index) => ({
      id: index,
      config: season[0],
      status: season[1],
      totalParticipants: season[2],
      totalTickets: season[3],
      totalPrizePool: season[4],
    }));
  };

  return useQuery({
    queryKey: ['allSeasons', currentSeasonQuery.data],
    queryFn: fetchAllSeasons,
    enabled: currentSeasonQuery.isSuccess && currentSeasonQuery.data != null,
  });
}
