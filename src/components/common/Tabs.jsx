// src/components/common/Tabs.jsx
import PropTypes from 'prop-types';
import { useId } from 'react';

export const Tabs = ({ children }) => (
  <div data-tabs-root="" className="w-full">
    {children}
  </div>
);
Tabs.propTypes = {
  children: PropTypes.node,
};

export const TabsList = ({ children }) => (
  <div className="inline-flex items-center gap-1 rounded-md border p-1 bg-muted/50 mb-3">
    {children}
  </div>
);
TabsList.propTypes = {
  children: PropTypes.node,
};

export const TabsTrigger = ({ value, children, onClick }) => {
  const id = useId();
  return (
    <button
      id={`tab-${id}`}
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded text-sm hover:bg-muted aria-selected:bg-background aria-selected:border aria-selected:shadow"
      aria-selected={undefined}
      data-value={value}
    >
      {children}
    </button>
  );
};
TabsTrigger.propTypes = {
  value: PropTypes.string,
  children: PropTypes.node,
  onClick: PropTypes.func,
};

export const TabsContent = ({ value, children }) => (
  <div data-value={value} className="mt-2">
    {children}
  </div>
);
TabsContent.propTypes = {
  value: PropTypes.string,
  children: PropTypes.node,
};

export default { Tabs, TabsList, TabsTrigger, TabsContent };
