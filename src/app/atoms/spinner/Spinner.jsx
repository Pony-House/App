import React from 'react';
import PropTypes from 'prop-types';

function Spinner({ size = '', style = 'spinner-border', className = null }) {
  return (
    <div
      className={`${style} ${size ? `spinner-border-${size}` : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}

Spinner.propTypes = {
  className: PropTypes.string,
  style: PropTypes.string,
  size: PropTypes.string,
};

export default Spinner;
