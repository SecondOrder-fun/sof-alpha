// src/components/curve/HoldersTab.jsx
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

/**
 * HoldersTab
 * MVP placeholder: informs that a richer indexer-backed view is coming.
 * Optionally, future: reconstruct from Transfer logs to approximate holders.
 */
const HoldersTab = ({ bondingCurveAddress }) => {
  const { t } = useTranslation('common');
  
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        {t('holdersListPlaceholder')}
      </div>
      <div className="text-xs text-muted-foreground">
        {t('contract')}: <span className="font-mono">{bondingCurveAddress || '—'}</span>
      </div>
    </div>
  );
};

HoldersTab.propTypes = {
  bondingCurveAddress: PropTypes.string,
};

export default HoldersTab;
