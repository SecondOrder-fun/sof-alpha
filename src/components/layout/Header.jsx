// React import not needed with Vite JSX transform
import { Link } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import NetworkToggle from '@/components/common/NetworkToggle';

const Header = () => {
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
            <Link to="/admin" className="hover:text-primary transition-colors">
              Admin
            </Link>
            <Link to="/account" className="hover:text-primary transition-colors">
              My Account
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
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