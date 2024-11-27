import React from 'react';
import PropTypes from 'prop-types';
import Spinner from '@src/app/atoms/spinner/Spinner';

function SettingLoading({ title }) {
  return (
    <div className="card noselect">
      <ul className="list-group list-group-flush">
        <li className="list-group-item small pt-3 text-center">
          <Spinner className="small" />
        </li>
        <li className="list-group-item small pb-3 text-center">{title}</li>
      </ul>
    </div>
  );
}

SettingLoading.propTypes = {
  title: PropTypes.node.isRequired,
};

export default SettingLoading;
