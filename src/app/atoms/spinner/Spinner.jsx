import React from 'react';
import PropTypes from 'prop-types';

export const Spinner = React.forwardRef(
  ({ size = '', style = 'spinner-border', className = null }, ref) => (
    <div
      ref={ref}
      className={`${style} ${size ? `spinner-border-${size}` : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      <span className="visually-hidden">Loading...</span>
    </div>
  ),
);

Spinner.propTypes = {
  className: PropTypes.string,
  style: PropTypes.string,
  size: PropTypes.string,
};

export default Spinner;
