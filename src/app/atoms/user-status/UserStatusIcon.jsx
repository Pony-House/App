import React from 'react';
import PropTypes from 'prop-types';

import { getUserStatus } from '../../../util/onlineStatus';
import userPresenceEffect from '@src/util/libs/userPresenceEffect';

const UserStatusIcon = React.forwardRef(
  ({ user = null, className = null, classBase = 'user-status' }, ref) => {
    const { accountContent } = userPresenceEffect(user);
    if (user) {
      return (
        <i
          ref={ref}
          className={`${classBase ? `${classBase} ` : ''}user-status-icon${className ? ` ${className}` : ''} ${getUserStatus(user, accountContent)}`}
        />
      );
    }
  },
);

UserStatusIcon.propTypes = {
  className: PropTypes.string,
  classBase: PropTypes.string,
  user: PropTypes.object,
};

export default UserStatusIcon;
