import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { UserEvent } from 'matrix-js-sdk';

import { objType } from 'for-promise/utils/lib.mjs';

import cons from '@src/client/state/cons';
import { abbreviateNumber } from '@src/util/common';
import UserStatusIcon from '@src/app/atoms/user-status/UserStatusIcon';

import { twemojifyReact } from '../../../util/twemojify';
import { colorMXID } from '../../../util/colorMXID';

import Text from '../../atoms/text/Text';
import Avatar from '../../atoms/avatar/Avatar';
import NotificationBadge from '../../atoms/badge/NotificationBadge';
import { blurOnBubbling } from '../../atoms/button/script';
import { canUsePresence, getPresence } from '../../../util/onlineStatus';
import initMatrix from '../../../client/initMatrix';
import favIconManager from '../../../util/libs/favicon';
import { selectRoom, selectRoomMode } from '../../../client/action/navigation';
import UserCustomStatus, { existsUserStatus } from '../people-selector/UserCustomStatus';
import userPresenceEffect from '@src/util/libs/userPresenceEffect';

function RoomSelectorWrapper({
  isSelected,
  isMuted = false,
  isUnread,
  onClick,
  content,
  options = null,
  onContextMenu = null,
  className,
}) {
  const classes = ['room-selector', 'd-flex'];
  if (isMuted) classes.push('room-selector--muted');
  if (isUnread) classes.push('room-selector--unread');
  if (isSelected) classes.push('room-selector--selected');

  return (
    <div className={classes.join(' ')}>
      <button
        className={`room-selector__content emoji-size-fix w-100 d-block${className ? ` ${className}` : ''}`}
        type="button"
        onClick={onClick}
        onMouseUp={(e) => blurOnBubbling(e, '.room-selector__content')}
        onContextMenu={onContextMenu}
      >
        {content}
      </button>
      <div className="room-selector__options">{options}</div>
    </div>
  );
}
RoomSelectorWrapper.propTypes = {
  isSelected: PropTypes.bool.isRequired,
  isMuted: PropTypes.bool,
  isUnread: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  content: PropTypes.node.isRequired,
  options: PropTypes.node,
  onContextMenu: PropTypes.func,
};

function RoomSelector({
  name,
  parentName = null,
  roomId,
  room,
  imageSrc = null,
  imageAnimSrc = null,
  animParentsCount = 4,
  iconSrc = null,
  isSelected = false,
  isMuted = false,
  isUnread,
  notificationCount,
  isAlert,
  options = null,
  onClick,
  onContextMenu = null,
  isProfile = false,
  notSpace = false,
  user,
  allowCustomUsername = false,
}) {
  const { accountContent } = userPresenceEffect(user);
  favIconManager.checkerFavIcon();
  const isDefault = !iconSrc || notSpace;

  return (
    <RoomSelectorWrapper
      className="text-truncate"
      isSelected={isSelected}
      isMuted={isMuted}
      isUnread={isUnread}
      content={
        <div
          className={`text-truncate content${user ? ' content-dm' : ''}${existsUserStatus(accountContent) ? ' content-with-custom-status' : ''}`}
        >
          <div
            className={`float-start me-2 h-100 avatar avatar-type--${imageSrc || isDefault ? 'img' : 'icon'}`}
          >
            <Avatar
              imgClass="profile-image-container"
              className="profile-image-container"
              text={name}
              bgColor={colorMXID(roomId)}
              imageSrc={imageSrc}
              animParentsCount={animParentsCount}
              imageAnimSrc={imageAnimSrc}
              iconColor="var(--ic-surface-low)"
              iconSrc={!isProfile ? iconSrc : null}
              faSrc={isProfile ? 'bi bi-person-badge-fill profile-icon-fa' : null}
              size="extra-small"
              isDefaultImage={isDefault}
            />

            {canUsePresence() ? <UserStatusIcon user={user} /> : null}
          </div>

          <Text
            className={`text-truncate w-100 username-base${isUnread ? ' username-unread' : ''}`}
            variant="b1"
            weight={isUnread ? 'medium' : 'normal'}
          >
            {twemojifyReact(name)}
            {parentName && (
              <span className="very-small text-gray">
                {' — '}
                {twemojifyReact(parentName)}
              </span>
            )}
            {user ? (
              <UserCustomStatus
                emojiFix=""
                className={`very-small text-gray text-truncate emoji-size-fix-2 ${isUnread ? ' custom-status-unread' : ''}`}
                user={user}
                presenceData={accountContent}
                animParentsCount={3}
                useHoverAnim
              />
            ) : null}
          </Text>

          {isUnread && (
            <NotificationBadge
              className="float-end"
              alert={isAlert}
              content={notificationCount !== 0 ? notificationCount : null}
            />
          )}
        </div>
      }
      options={options}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
}

RoomSelector.propTypes = {
  allowCustomUsername: PropTypes.bool,
  animParentsCount: PropTypes.number,
  notSpace: PropTypes.bool,
  isProfile: PropTypes.bool,
  name: PropTypes.string.isRequired,
  parentName: PropTypes.string,
  roomId: PropTypes.string.isRequired,
  imageSrc: PropTypes.string,
  imageAnimSrc: PropTypes.string,
  iconSrc: PropTypes.string,
  isSelected: PropTypes.bool,
  isMuted: PropTypes.bool,
  isUnread: PropTypes.bool.isRequired,
  notificationCount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  isAlert: PropTypes.bool.isRequired,
  options: PropTypes.node,
  onClick: PropTypes.func.isRequired,
  onContextMenu: PropTypes.func,
};

export default RoomSelector;
export function ThreadSelector({ room, thread, isSelected, isMuted, options, onContextMenu }) {
  const { rootEvent } = thread;
  const { notifications } = initMatrix;

  const [notificationCount, setNotiCount] = useState(
    notifications.getTotalNoti(room.roomId, thread.id),
  );

  const [highlightNotificationCount, setHighNotiCount] = useState(
    notifications.getHighlightNoti(room.roomId, thread.id),
  );

  const isUnread = !isMuted && notificationCount > 0;
  const isAlert = highlightNotificationCount > 0;

  const name = rootEvent?.getContent()?.body ?? 'Unknown thread';

  const onClick = () => {
    selectRoomMode('room');
    selectRoom(thread.roomId, undefined, thread.id);
  };

  useEffect(() => {
    const threadUpdate = (tth) => {
      if (tth.id === thread.id) {
        setNotiCount(notifications.getTotalNoti(room.roomId, thread.id));

        setHighNotiCount(notifications.getHighlightNoti(room.roomId, thread.id));
      }
    };

    notifications.on(cons.events.notifications.THREAD_NOTIFICATION, threadUpdate);
    return () => {
      notifications.off(cons.events.notifications.THREAD_NOTIFICATION, threadUpdate);
    };
  });

  return (
    <RoomSelectorWrapper
      isSelected={isSelected}
      isMuted={isMuted}
      isUnread={!isMuted && notificationCount > 0}
      className="text-truncate"
      content={
        <div className="text-truncate content">
          <p
            className={`my-0 ms-1 small ${isSelected ? 'text-bg-force' : 'text-bg-low-force'} text-truncate w-100 username-base${isUnread ? ' username-unread' : ''}`}
          >
            <i className="bi bi-arrow-return-right me-2 thread-selector__icon" />{' '}
            {twemojifyReact(name)}
          </p>
          {isUnread && (
            <NotificationBadge
              className="float-end"
              alert={isAlert}
              content={notificationCount > 0 ? abbreviateNumber(notificationCount) : null}
            />
          )}
        </div>
      }
      options={options}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
}

ThreadSelector.propTypes = {
  isSelected: PropTypes.bool,
  isMuted: PropTypes.bool,
  options: PropTypes.node,
  onContextMenu: PropTypes.func,
};
