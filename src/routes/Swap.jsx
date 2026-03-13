import { useTranslation } from 'react-i18next';
import SwapWidget from '@/components/swap/SwapWidget';
import AirdropBanner from '@/components/airdrop/AirdropBanner';

/**
 * Swap page — centered layout wrapping the SwapWidget.
 * AirdropBanner appears above the swap widget for first-time users.
 */
const Swap = () => {
  const { t } = useTranslation('swap');

  return (
    <div className="flex flex-col items-center py-8 px-4">
      <h1 className="text-3xl font-bold text-foreground mb-8">{t('title')}</h1>
      <div className="w-full max-w-md">
        <AirdropBanner />
        <SwapWidget />
      </div>
    </div>
  );
};

export default Swap;
