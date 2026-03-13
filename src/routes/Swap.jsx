import { useTranslation } from 'react-i18next';
import SwapWidget from '@/components/swap/SwapWidget';

/**
 * Swap page — centered layout wrapping the SwapWidget.
 */
const Swap = () => {
  const { t } = useTranslation('swap');

  return (
    <div className="flex flex-col items-center py-8 px-4">
      <h1 className="text-3xl font-bold text-foreground mb-8">{t('title')}</h1>
      <SwapWidget />
    </div>
  );
};

export default Swap;
