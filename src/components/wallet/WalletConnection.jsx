import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';

const WalletConnection = () => {
  const { t } = useTranslation('common');
  const { address, isConnected } = useAccount();
  const { connect, connectors, isLoading, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { toast } = useToast();

  // Handle connection errors
  if (error) {
    toast({
      title: t('connectionError'),
      description: error.message,
      variant: 'destructive',
    });
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <Button onClick={() => disconnect()} variant="outline">
          {t('disconnect')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {connectors.map((connector) => (
          <Button
            key={connector.id}
            onClick={() => connect({ connector })}
            disabled={isLoading}
            variant="default"
          >
            {t('connectWith', { name: connector.name })}
          </Button>
        ))}
      </div>
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('connecting')}</p>
      )}
    </div>
  );
};

export default WalletConnection;
