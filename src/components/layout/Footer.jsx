// React import not needed with Vite JSX transform
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="border-t bg-card text-card-foreground mt-12">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">SecondOrder.fun</h3>
            <p className="text-sm text-muted-foreground">
              InfoFi-powered raffle platform transforming crypto speculation into structured games.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Platform</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-sm hover:text-primary transition-colors">Raffles</Link></li>
              <li><Link to="/infofi" className="text-sm hover:text-primary transition-colors">InfoFi Markets</Link></li>
              <li><Link to="/portfolio" className="text-sm hover:text-primary transition-colors">Portfolio</Link></li>
              <li><Link to="/leaderboard" className="text-sm hover:text-primary transition-colors">Leaderboard</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Resources</h3>
            <ul className="space-y-2">
              <li><Link to="/docs" className="text-sm hover:text-primary transition-colors">Documentation</Link></li>
              <li><Link to="/api" className="text-sm hover:text-primary transition-colors">API</Link></li>
              <li><Link to="/guides" className="text-sm hover:text-primary transition-colors">Guides</Link></li>
              <li><Link to="/faq" className="text-sm hover:text-primary transition-colors">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              <li><Link to="/terms" className="text-sm hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link to="/privacy" className="text-sm hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/disclaimer" className="text-sm hover:text-primary transition-colors">Disclaimer</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} SecondOrder.fun. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;