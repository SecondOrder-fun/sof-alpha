import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredNetworkKey } from "@/lib/wagmi";
import {
  claimSponsoredERC20,
  claimSponsoredERC721,
} from "@/services/onchainRaffleDistributor";
import { useToast } from "@/hooks/useToast";

/**
 * Hook for claiming sponsored prizes (ERC-20 and ERC-721).
 */
export function useSponsorPrizeClaim(seasonId) {
  const netKey = getStoredNetworkKey();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const claimERC20Mutation = useMutation({
    mutationFn: () => claimSponsoredERC20({ seasonId, networkKey: netKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sponsoredERC20"] });
      toast({ title: "Sponsored ERC-20 prizes claimed!", variant: "success" });
    },
    onError: (error) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim sponsored tokens",
        variant: "destructive",
      });
    },
  });

  const claimERC721Mutation = useMutation({
    mutationFn: () => claimSponsoredERC721({ seasonId, networkKey: netKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sponsoredERC721"] });
      toast({ title: "Sponsored NFT prizes claimed!", variant: "success" });
    },
    onError: (error) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim sponsored NFTs",
        variant: "destructive",
      });
    },
  });

  const claimAll = async () => {
    await claimERC20Mutation.mutateAsync();
    await claimERC721Mutation.mutateAsync();
  };

  return {
    claimERC20: claimERC20Mutation.mutate,
    claimERC721: claimERC721Mutation.mutate,
    claimAll,
    isClaimingERC20: claimERC20Mutation.isPending,
    isClaimingERC721: claimERC721Mutation.isPending,
    isClaiming: claimERC20Mutation.isPending || claimERC721Mutation.isPending,
  };
}
