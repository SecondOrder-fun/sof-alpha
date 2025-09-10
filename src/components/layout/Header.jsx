// React import not needed with Vite JSX transform
import { Link } from 'react-router-dom';
import { useMemo } from "react";
import { getStoredNetworkKey } from "@/lib/wagmi";
import { getNetworkByKey } from "@/config/networks";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import NetworkToggle from '@/components/common/NetworkToggle';
import { useAccessControl } from '@/hooks/useAccessControl';

const Header = () => {
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
            SecondOrder.fun
          </Link>
          <nav className="hidden md:flex space-x-6">
            <Link to="/raffles" className="hover:text-primary transition-colors">
              Raffles
            </Link>
            <Link to="/markets" className="hover:text-primary transition-colors">
              Prediction Markets
            </Link>
            <Link to="/users" className="hover:text-primary transition-colors">
              Users
            </Link>
            {isAdmin && (
              <Link to="/admin" className="hover:text-primary transition-colors">
                Admin
              </Link>
            )}
            <Link to={isConnected && address ? `/users/${address}` : "/account"} className="hover:text-primary transition-colors">
              My Account
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