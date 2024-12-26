import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import threadsList from '@src/util/libs/thread';
import { RoomStateEvent, UserEvent } from 'matrix-js-sdk';

import muteUserManager from '@src/util/libs/muteUserManager';
import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import { openReusableContextMenu } from '../../../client/action/navigation';
import { getEventCords, abbreviateNumber } from '../../../util/common';
import {
  canSupport,
  dfAvatarSize,
  getCurrentState,
  joinRuleToIconSrc,
} from '../../../util/matrixUtil';
import { updateName } from '../../../util/roomName';

import IconButton from '../../atoms/button/IconButton';
import RoomSelector, { ThreadSelector } from '../../molecules/room-selector/RoomSelector';
import RoomOptions from '../../molecules/room-options/RoomOptions';
import SpaceOptions from '../../molecules/space-options/SpaceOptions';

import { useForceUpdate } from '../../hooks/useForceUpdate';
import { getDataList, getSelectSpace } from '../../../util/selectedRoom';
import PonyRoomEvent from '../space-settings/PonyRoomEvent';

// Selector Function
const Selector = React.forwardRef(
  (
    {
      roomId,
      threadId,
      isDM = true,
      drawerPostie,
      onClick,
      roomObject,
      isProfile = false,
      isSpaces = false,
    },
    ref,
  ) => {
    // Base Script
    const mx = initMatrix.matrixClient;
    const mxcUrl = initMatrix.mxcUrl;

    const noti = initMatrix.notifications;
    const [roomIconsActive, setRoomIconsActive] = useState(false);

    // Room Data
    let room;

    if (!roomObject) {
      room = mx.getRoom(roomId);
    } else {
      room = roomObject;
    }

    let notSpace = !getSelectSpace();
    if (room && !notSpace) {
      notSpace = roomIconsActive === true || isSpaces;
    }

    // Is Room
    if (!isDM && !room.nameCinny) {
      updateName(room);
    }

    // Get User room
    let allowCustomUsername = false;
    let user;
    let roomName = room.name;
    if (isDM) {
      const usersCount = room.getJoinedMemberCount();
      if (usersCount === 2) {
        const members = room.getMembersWithMembership('join');
        const member = members.find((m) => m.userId !== mx.getUserId());
        if (member) {
          user = mx.getUser(member.userId);
          roomName = muteUserManager.getSelectorName(user);
          allowCustomUsername = true;
        }
      }
    }

    // Image
    let imageSrc = null;
    let imageAnimSrc = null;
    if (isDM || notSpace) {
      // Normal Image
      if (!isSpaces) {
        imageSrc =
          user && user.avatarUrl && mxcUrl.toHttp(user.avatarUrl, dfAvatarSize, dfAvatarSize);
        if (!imageSrc)
          imageSrc = mxcUrl.getAvatarUrl(
            room.getAvatarFallbackMember(),
            dfAvatarSize,
            dfAvatarSize,
          );
      }
      if (!imageSrc) imageSrc = mxcUrl.getAvatarUrl(room, dfAvatarSize, dfAvatarSize);

      // Anim Image
      if (!isSpaces) {
        imageAnimSrc = user && user.avatarUrl && mxcUrl.toHttp(user.avatarUrl);
        if (!imageAnimSrc) imageAnimSrc = mxcUrl.getAvatarUrl(room.getAvatarFallbackMember());
      }
      if (!imageAnimSrc) imageAnimSrc = mxcUrl.getAvatarUrl(room);
    }

    // Is Muted
    const isMuted = noti.getNotiType(roomId) === cons.notifs.MUTE;

    // Force Update
    const [, forceUpdate] = useForceUpdate();
    const [lastThreads, setLastThreads] = useState(
      canSupport('Thread') ? threadsList.getActives() : null,
    );

    // Effects
    useEffect(() => {
      const threadsListUpdate = () => setLastThreads(threadsList.getActives());
      const unSub1 = drawerPostie.subscribe('selector-change', roomId, threadId, forceUpdate);
      const unSub2 = drawerPostie.subscribe('unread-change', roomId, threadId, forceUpdate);
      if (canSupport('Thread')) threadsList.on('updatedActiveThreads', threadsListUpdate);
      return () => {
        unSub1();
        unSub2();
        if (canSupport('Thread')) threadsList.off('updatedActiveThreads', threadsListUpdate);
      };
    }, []);

    // Options
    if (!room) {
      tinyConsole.warn(`Selector: Room ${roomId} not found`);
      return null;
    }

    const openOptions = (e, tId) => {
      // Get Cords
      const cords = getEventCords(e, '.room-selector');

      // Mobile Screen - Viewport
      if (window.matchMedia('screen and (max-width: 768px)').matches) {
        cords.x -= 290;
      }

      e.preventDefault();
      openReusableContextMenu(
        'right',
        cords,
        room.isSpaceRoom()
          ? (closeMenu) => <SpaceOptions roomId={roomId} afterOptionSelect={closeMenu} />
          : (closeMenu) => (
              <RoomOptions threadId={tId} roomId={roomId} afterOptionSelect={closeMenu} />
            ),
      );
    };

    const getThreads = room.getThreads();
    const openThreads = getThreads.filter(
      (thread) =>
        thread.id === navigation.selectedThreadId ||
        (objType(lastThreads, 'object') &&
          Array.isArray(lastThreads.actives) &&
          lastThreads.actives.find(
            (ac1) =>
              Array.isArray(ac1) &&
              ac1.find(
                (ac2) =>
                  objType(ac2, 'object') &&
                  typeof ac2.id === 'string' &&
                  ac2.id.replace(`${roomId}:`, '') === thread.id,
              ),
          )),
    );

    useEffect(() => {
      const spaceId = getSelectSpace();
      if (spaceId) {
        const space = mx.getRoom(spaceId);
        const roomIconCfg =
          getCurrentState(space)
            .getStateEvents(PonyRoomEvent.PhSettings, 'roomIcons')
            ?.getContent() ?? {};
        if (roomIconCfg.isActive !== roomIconsActive) setRoomIconsActive(roomIconCfg.isActive);

        const handleEvent = (event, state, prevEvent) => {
          if (event.getRoomId() !== spaceId) return;
          if (event.getType() !== PonyRoomEvent.PhSettings) return;
          if (event.getStateKey() !== 'roomIcons') return;

          const oldUrl = prevEvent?.getContent()?.isActive;
          const newUrl = event.getContent()?.isActive;

          if (newUrl !== oldUrl) {
            setRoomIconsActive(newUrl);
          }
        };

        mx.on(RoomStateEvent.Events, handleEvent);
        return () => {
          mx.removeListener(RoomStateEvent.Events, handleEvent);
        };
      }
    });

    useEffect(() => {
      if (user) {
        const updateRoomData = () => forceUpdate();
        user.on(UserEvent.AvatarUrl, updateRoomData);
        muteUserManager.on('friendNickname', updateRoomData);
        return () => {
          user.removeListener(UserEvent.AvatarUrl, updateRoomData);
          muteUserManager.off('friendNickname', updateRoomData);
        };
      }
    });

    return (
      <>
        <RoomSelector
          allowCustomUsername={allowCustomUsername}
          notSpace={notSpace}
          isProfile={isProfile}
          name={roomName}
          roomId={roomId}
          animParentsCount={2}
          user={user}
          room={room}
          imageAnimSrc={imageAnimSrc}
          imageSrc={imageSrc}
          iconSrc={isDM ? null : joinRuleToIconSrc(room.getJoinRule(), room.isSpaceRoom())}
          isSelected={navigation.selectedRoomId === roomId && navigation.selectedThreadId === null}
          isMuted={isMuted}
          isUnread={!isMuted && noti.hasNoti(roomId)}
          notificationCount={abbreviateNumber(noti.getTotalNoti(roomId))}
          isAlert={noti.getHighlightNoti(roomId) !== 0}
          onClick={onClick}
          onContextMenu={(evt) => openOptions(evt)}
          options={
            <IconButton
              size="extra-small"
              tooltip="Options"
              tooltipPlacement="left"
              fa="bi bi-three-dots-vertical"
              onClick={(evt) => openOptions(evt)}
            />
          }
        />
        {openThreads.map((thread) => (
          <ThreadSelector
            key={`Selector_ThreadSelector_${thread.id}`}
            room={room}
            thread={thread}
            isMuted={isMuted}
            isSelected={navigation.selectedThreadId === thread.id}
            onContextMenu={(evt) => openOptions(evt, thread.id)}
            options={
              <IconButton
                size="extra-small"
                tooltip="Options"
                tooltipPlacement="left"
                fa="bi bi-three-dots-vertical"
                onClick={(evt) => openOptions(evt, thread.id)}
              />
            }
          />
        ))}
      </>
    );
  },
);

// Default
Selector.propTypes = {
  isSpaces: PropTypes.bool,
  isProfile: PropTypes.bool,
  roomId: PropTypes.string.isRequired,
  threadId: PropTypes.string,
  isDM: PropTypes.bool,

  roomObject: PropTypes.object,

  drawerPostie: PropTypes.shape({}).isRequired,
  onClick: PropTypes.func.isRequired,
};

export default Selector;
