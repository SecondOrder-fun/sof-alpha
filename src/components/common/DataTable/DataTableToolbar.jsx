// src/components/common/DataTable/DataTableToolbar.jsx
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Toolbar for DataTable with search and filter controls
 */
const DataTableToolbar = ({
  table,
  searchColumn,
  searchPlaceholder,
  filterOptions,
  onReset,
}) => {
  const { t } = useTranslation('raffle');
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex flex-1 items-center gap-2">
        {searchColumn && (
          <Input
            placeholder={searchPlaceholder || t('searchAddress')}
            value={(table.getColumn(searchColumn)?.getFilterValue()) ?? ''}
            onChange={(event) =>
              table.getColumn(searchColumn)?.setFilterValue(event.target.value)
            }
            className="h-8 w-[150px] lg:w-[250px]"
          />
        )}
        {filterOptions && filterOptions.length > 0 && (
          <div className="flex gap-2">
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={
                  table.getColumn(option.column)?.getFilterValue() === option.value
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={() => {
                  const currentValue = table.getColumn(option.column)?.getFilterValue();
                  table
                    .getColumn(option.column)
                    ?.setFilterValue(currentValue === option.value ? undefined : option.value);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              if (onReset) onReset();
            }}
            className="h-8 px-2 lg:px-3"
          >
            {t('reset')}
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

DataTableToolbar.propTypes = {
  table: PropTypes.object.isRequired,
  searchColumn: PropTypes.string,
  searchPlaceholder: PropTypes.string,
  filterOptions: PropTypes.arrayOf(
    PropTypes.shape({
      column: PropTypes.string.isRequired,
      value: PropTypes.any.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  onReset: PropTypes.func,
};

export default DataTableToolbar;
