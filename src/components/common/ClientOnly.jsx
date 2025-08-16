// src/components/common/ClientOnly.jsx
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const ClientOnly = ({ children }) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return <>{children}</>;
};

ClientOnly.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ClientOnly;
