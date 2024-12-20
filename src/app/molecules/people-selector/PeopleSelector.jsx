import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { UserEvent } from 'matrix-js-sdk';
import { dfAvatarSize } from '@src/util/matrixUtil';
import UserStatusIcon from '@src/app/atoms/user-status/UserStatusIcon';

import { twemojifyReact } from '../../../util/twemojify';

import { blurOnBubbling } from '../../atoms/button/script';

import Text from '../../atoms/text/Text';
import Avatar from '../../atoms/avatar/Avatar';
import { canUsePresence } from '../../../util/onlineStatus';
import initMatrix from '../../../client/initMatrix';
import UserCustomStatus from './UserCustomStatus';

function PeopleSelector({
  avatarSrc = null,
  avatarAnimSrc = null,
  animParentsCount = 3,
  name,
  color,
  peopleRole = null,
  onClick,
  user = null,
  disableStatus = false,
  avatarSize = dfAvatarSize,
  contextMenu,
}) {
  const [imageAnimSrc, setImageAnimSrc] = useState(avatarAnimSrc);
  const [imageSrc, setImageSrc] = useState(avatarSrc);

  useEffect(() => {
    if (user) {
      const mxcUrl = initMatrix.mxcUrl;

      // Update Status Profile
      const updateProfileStatus = (mEvent, tinyData, isFirstTime = false) => {
        // Image
        const newImageSrc =
          tinyData && tinyData.avatarUrl
            ? mxcUrl.toHttp(tinyData.avatarUrl, avatarSize, avatarSize)
            : null;
        setImageSrc(newImageSrc);

        const newImageAnimSrc =
          tinyData && tinyData.avatarUrl ? mxcUrl.toHttp(tinyData.avatarUrl) : null;
        setImageAnimSrc(newImageAnimSrc);
      };

      // Read Events
      user.on(UserEvent.DisplayName, updateProfileStatus);
      user.on(UserEvent.AvatarUrl, updateProfileStatus);
      return () => {
        if (user) user.removeListener(UserEvent.AvatarUrl, updateProfileStatus);
        if (user) user.removeListener(UserEvent.DisplayName, updateProfileStatus);
      };
    }
  }, [user]);

  return (
    <button
      className="people-selector"
      onMouseUp={(e) => blurOnBubbling(e, '.people-selector')}
      onClick={onClick}
      onContextMenu={contextMenu}
      type="button"
    >
      <Avatar
        animParentsCount={animParentsCount}
        imgClass="profile-image-container"
        className="profile-image-container"
        imageAnimSrc={imageAnimSrc}
        imageSrc={imageSrc}
        text={name}
        bgColor={color}
        size="small"
        isDefaultImage
      />
      {canUsePresence() && !disableStatus ? <UserStatusIcon classbase="" user={user} /> : null}

      <div className="small people-selector__name text-start">
        <span className="emoji-size-fix">{twemojifyReact(name)}</span>
        {!disableStatus && user ? (
          <UserCustomStatus
            emojiFix=""
            className={`very-small text-gray text-truncate emoji-size-fix-2`}
            user={user}
            animParentsCount={3}
            useHoverAnim
          />
        ) : null}
      </div>

      {peopleRole !== null && (
        <Text className="people-selector__role" variant="b3">
          {peopleRole}
        </Text>
      )}
    </button>
  );
}

PeopleSelector.propTypes = {
  animParentsCount: PropTypes.number,
  avatarSize: PropTypes.number,
  disableStatus: PropTypes.bool,
  user: PropTypes.object,
  avatarAnimSrc: PropTypes.string,
  avatarSrc: PropTypes.string,
  name: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  peopleRole: PropTypes.string,
  onClick: PropTypes.func.isRequired,
};

export default PeopleSelector;
