// React import not needed with Vite JSX transform
import { Link } from 'react-router-dom';
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTranslation } from 'react-i18next';
import NetworkToggle from '@/components/common/NetworkToggle';
import LanguageToggle from '@/components/common/LanguageToggle';
import { useAccessControl } from '@/hooks/useAccessControl';
import { Globe } from 'lucide-react';

const Header = () => {
  const { t } = useTranslation('navigation');
  const { address, isConnected } = useAccount();
  const { hasRole } = useAccessControl();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // DEFAULT_ADMIN_ROLE in OZ is 0x00...00
      const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
      if (!isConnected || !address) { setIsAdmin(false); return; }
      try {
        const ok = await hasRole(DEFAULT_ADMIN_ROLE, address);
        if (!cancelled) setIsAdmin(Boolean(ok));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [address, isConnected, hasRole]);

  return (
    <header className="border-b bg-card text-card-foreground">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <Link to="/" className="text-2xl font-bold text-primary">
            {t('brandName')}
          </Link>
          <nav className="hidden md:flex space-x-6">
            <Link to="/raffles" className="hover:text-primary transition-colors">
              {t('raffles')}
            </Link>
            <Link to="/markets" className="hover:text-primary transition-colors">
              {t('predictionMarkets')}
            </Link>
            <Link to="/users" className="hover:text-primary transition-colors">
              {t('users')}
            </Link>
            {isAdmin && (
              <>
                <Link to="/admin" className="hover:text-primary transition-colors">
                  {t('admin')}
                </Link>
                <Link to="/admin/localization" className="hover:text-primary transition-colors">
                  <span className="flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    Localization
                  </span>
                </Link>
              </>
            )}
            <Link to="/account" className="hover:text-primary transition-colors">
              {t('myAccount')}
            </Link>
            <Link to="/faucet" className="hover:text-primary transition-colors">
              {t('betaFaucets')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
          {(() => {
            const netKey = getStoredNetworkKey();
            const net = getNetworkByKey(netKey);
            const show = String(netKey).toUpperCase() === 'TESTNET' && !net?.rpcUrl;
            if (!show) return null;
            return (
              <Badge variant="secondary" title="Set VITE_RPC_URL_TESTNET and related VITE_*_ADDRESS_TESTNET in .env, then restart dev servers">
                Testnet RPC not configured
              </Badge>
            );
          })()}
          <div className="flex items-center gap-2">
            {/* Wallet toolbar lives here (RainbowKit) */}
          </div>
          <LanguageToggle />
          <NetworkToggle />
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="avatar"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;