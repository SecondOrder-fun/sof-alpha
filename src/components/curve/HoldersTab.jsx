// src/components/curve/HoldersTab.jsx
import PropTypes from 'prop-types';

/**
 * HoldersTab
 * MVP placeholder: informs that a richer indexer-backed view is coming.
 * Optionally, future: reconstruct from Transfer logs to approximate holders.
 */
const HoldersTab = ({ bondingCurveAddress }) => {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        Token holders list will appear here. For MVP, this section is a placeholder.
      </div>
      <div className="text-xs text-muted-foreground">
        Contract: <span className="font-mono">{bondingCurveAddress || '—'}</span>
      </div>
    </div>
  );
};

HoldersTab.propTypes = {
  bondingCurveAddress: PropTypes.string,
};

export default HoldersTab;
