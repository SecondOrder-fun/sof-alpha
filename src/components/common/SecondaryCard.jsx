// src/components/common/SecondaryCard.jsx
import React from 'react';

/**
 * SecondaryCard
 * Simple bordered sub-card used for inline status/summary panels.
 */
const SecondaryCard = ({ title, right, children }) => {
  return (
    <div className="mt-3 p-3 border rounded-md">
      <div className="flex items-center justify-between">
        <div className="font-medium text-[#c82a54]">{title}</div>
        {right}
      </div>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
};

export default SecondaryCard;
