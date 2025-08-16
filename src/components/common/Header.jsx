// src/components/common/Header.jsx
import { Link } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const Header = () => {
  return (
    <header className="bg-gray-800 text-white p-4">
      <nav className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold">
          SecondOrder.fun
        </Link>
        <div className="flex items-center space-x-4">
          <Link to="/raffles" className="hover:text-gray-300">Raffles</Link>
          <Link to="/admin" className="hover:text-gray-300">Admin</Link>
          <Link to="/account" className="hover:text-gray-300">My Account</Link>
          <ConnectButton />
        </div>
      </nav>
    </header>
  );
};

export default Header;
