import { SignInButton } from "@farcaster/auth-kit";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useToast } from "@/hooks/useToast";

const FarcasterAuth = () => {
  const { isAuthenticated, profile } = useFarcaster();
  const { toast } = useToast();

  const handleSuccess = ({ fid, username }) => {
    toast({
      title: "Authentication Successful",
      description: `Welcome, ${username}! Your FID: ${fid}`,
    });
  };

  const handleError = (error) => {
    toast({
      title: "Authentication Error",
      description: error.message,
      variant: "destructive",
    });
  };

  if (isAuthenticated && profile) {
    return (
      <div className="flex items-center gap-4">
        <img
          src={profile.pfpUrl}
          alt={profile.displayName || profile.username}
          className="w-8 h-8 rounded-full"
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {profile.displayName || profile.username}
          </span>
          <span className="text-xs text-muted-foreground">
            @{profile.username}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SignInButton
        onSuccess={handleSuccess}
        onError={handleError}
        timeout={300000}
        interval={1500}
      />
    </div>
  );
};

export default FarcasterAuth;
