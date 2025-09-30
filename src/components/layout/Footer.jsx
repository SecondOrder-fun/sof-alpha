// React import not needed with Vite JSX transform
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const { t } = useTranslation('navigation');
  
  return (
    <footer className="border-t bg-card text-card-foreground mt-12">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('brandName')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('tagline')}
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('platform')}</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-sm hover:text-primary transition-colors">{t('raffles')}</Link></li>
              <li><Link to="/infofi" className="text-sm hover:text-primary transition-colors">{t('predictionMarkets')}</Link></li>
              <li><Link to="/portfolio" className="text-sm hover:text-primary transition-colors">{t('portfolio')}</Link></li>
              <li><Link to="/leaderboard" className="text-sm hover:text-primary transition-colors">{t('leaderboard')}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('resources')}</h3>
            <ul className="space-y-2">
              <li><Link to="/docs" className="text-sm hover:text-primary transition-colors">{t('documentation')}</Link></li>
              <li><Link to="/api" className="text-sm hover:text-primary transition-colors">{t('api')}</Link></li>
              <li><Link to="/guides" className="text-sm hover:text-primary transition-colors">{t('guides')}</Link></li>
              <li><Link to="/faq" className="text-sm hover:text-primary transition-colors">{t('faq')}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('legal')}</h3>
            <ul className="space-y-2">
              <li><Link to="/terms" className="text-sm hover:text-primary transition-colors">{t('termsOfService')}</Link></li>
              <li><Link to="/privacy" className="text-sm hover:text-primary transition-colors">{t('privacyPolicy')}</Link></li>
              <li><Link to="/disclaimer" className="text-sm hover:text-primary transition-colors">{t('disclaimer')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;