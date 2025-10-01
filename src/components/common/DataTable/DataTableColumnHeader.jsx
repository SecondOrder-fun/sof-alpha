// src/components/common/DataTable/DataTableColumnHeader.jsx
import PropTypes from 'prop-types';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Sortable column header component
 */
const DataTableColumnHeader = ({ column, children, className = '' }) => {
  if (!column.getCanSort()) {
    return <div className={className}>{children}</div>;
  }

  const sorted = column.getIsSorted();

  return (
    <button
      type="button"
      className={`flex items-center gap-2 hover:text-foreground transition-colors ${className}`}
      onClick={() => column.toggleSorting()}
    >
      {children}
      {sorted === 'asc' && <ArrowUp className="h-4 w-4" />}
      {sorted === 'desc' && <ArrowDown className="h-4 w-4" />}
      {!sorted && <ArrowUpDown className="h-4 w-4 opacity-50" />}
    </button>
  );
};

DataTableColumnHeader.propTypes = {
  column: PropTypes.object.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default DataTableColumnHeader;
