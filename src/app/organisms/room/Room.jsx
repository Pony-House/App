import React, { useState, useEffect } from 'react';
import $ from 'jquery';

import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';

import { isMobile } from '@src/util/libs/mobile';
import blobUrlManager from '@src/util/libs/blobUrlManager';
import matrixAppearance from '@src/util/libs/appearance';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import settings from '../../../client/state/settings';
import RoomTimeline from '../../../client/state/RoomTimeline';
import navigation from '../../../client/state/navigation';
import { openNavigation, selectRoomMode } from '../../../client/action/navigation';

import Welcome from '../welcome/Welcome';
import RoomView from './RoomView';
import RoomSettings from './RoomSettings';
import PeopleDrawer from './PeopleDrawer';
import tinyAPI from '../../../util/mods';

let resetRoomInfo;
global.resetRoomInfo = () => (typeof resetRoomInfo === 'function' ? resetRoomInfo() : null);
let tinyRoomInfo;

export function getRoomInfo() {
  return tinyRoomInfo;
}

if (__ENV_APP__.MODE === 'development') {
  global.getRoomInfo = getRoomInfo;
}

function Room() {
  const defaultRoomInfo = {
    roomTimeline: null,
    eventId: null,
    forceScroll: null,
  };

  const [isRoomMode, setIsRoomMode] = useState(false);
  const [roomInfo, setRoomInfo] = useState(defaultRoomInfo);
  tinyAPI.emit('setRoomInfo', defaultRoomInfo);

  const [isHoverSidebar, setIsHoverSidebar] = useState(matrixAppearance.get('hoverSidebar'));
  const [sidebarTransition, setSidebarTransition] = useState(
    matrixAppearance.get('sidebarTransition'),
  );

  const [isDrawer, setIsDrawer] = useState(settings.isPeopleDrawer);
  const [isUserList, setIsUserList] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const sendRoomInfo = (newData) => {
    setRoomInfo(newData);
    tinyRoomInfo = newData;
    tinyAPI.emit('setRoomInfo', newData);
  };

  const mx = initMatrix.matrixClient;
  resetRoomInfo = () => {
    $('#space-header .space-drawer-body .room-selector--selected').removeClass(
      'room-selector--selected',
    );
    selectRoomMode('navigation');

    sendRoomInfo({
      roomTimeline: null,
      eventId: null,
      forceScroll: null,
    });
  };

  useEffect(() => {
    const onRoomModeSelected = (roomType) => {
      setIsRoomMode(roomType === 'room' ? true : false);
    };
    const setRoomSelected = (roomId, threadId, eventId, forceScroll) => {
      const roomTimeline = new RoomTimeline(roomId, threadId);

      sendRoomInfo({
        roomTimeline,
        eventId: eventId ?? null,
        forceScroll,
      });
    };
    const handleRoomSelected = (
      roomId,
      prevRoomId,
      eventId,
      threadData,
      prevThreadId,
      forceScroll,
    ) => {
      blobUrlManager.deleteGroup(
        `roomMedia:${prevRoomId}`,
        // `roomMedia:${prevRoomId}${typeof prevThreadId === 'string' ? `:${prevThreadId}` : ''}`,
      );
      roomInfo.roomTimeline?.removeInternalListeners();
      $('.space-drawer-menu-item').removeClass('active');

      if (mx.getRoom(roomId)) {
        const threadId =
          typeof threadData === 'string'
            ? threadData
            : objType(threadData, 'object')
              ? threadData.threadId
              : null;
        setRoomSelected(roomId, threadId, eventId, forceScroll);
      } else {
        // TODO: add ability to join room if roomId is invalid
        sendRoomInfo({
          roomTimeline: null,
          eventId: null,
          forceScroll,
        });

        $('#space-drawer-home-button').addClass('active');
      }
    };

    navigation.on(cons.events.navigation.SELECTED_ROOM_MODE, onRoomModeSelected);
    navigation.on(cons.events.navigation.ROOM_SELECTED, handleRoomSelected);
    return () => {
      navigation.removeListener(cons.events.navigation.SELECTED_ROOM_MODE, onRoomModeSelected);
      navigation.removeListener(cons.events.navigation.ROOM_SELECTED, handleRoomSelected);
    };
  }, [mx, roomInfo]);

  useEffect(() => {
    const handleDrawerToggling = (visiblity) => setIsDrawer(visiblity);
    const handleHoverSidebar = (visiblity) => setIsHoverSidebar(visiblity);
    const handleHoverSidebarEffect = (visiblity) => setSidebarTransition(visiblity);
    matrixAppearance.on('sidebarTransition', handleHoverSidebarEffect);
    matrixAppearance.on('hoverSidebar', handleHoverSidebar);
    settings.on(cons.events.settings.PEOPLE_DRAWER_TOGGLED, handleDrawerToggling);
    return () => {
      matrixAppearance.off('hoverSidebar', handleHoverSidebar);
      matrixAppearance.off('sidebarTransition', handleHoverSidebarEffect);
      settings.removeListener(cons.events.settings.PEOPLE_DRAWER_TOGGLED, handleDrawerToggling);
    };
  }, []);

  // Welcome Page
  const { roomTimeline, eventId } = roomInfo;
  if (roomTimeline === null) {
    setTimeout(() => openNavigation());
    return <Welcome />;
  }

  if (isDrawer) {
    $('body').addClass('people-drawer-auto-visible');
  } else {
    $('body').removeClass('people-drawer-auto-visible');
  }

  // Checker is User List
  const cloneIsUserList = clone(isUserList);
  if (
    cloneIsUserList === isUserList &&
    (!isMobile() || window.matchMedia('screen and (min-width: 768px)').matches || isRoomMode)
  ) {
    // Complete
    return (
      <div className="room">
        <div className="room__content">
          <RoomSettings roomId={roomTimeline.roomId} />
          <RoomView
            isUserList={isUserList}
            roomTimeline={roomTimeline}
            eventId={eventId}
            isLoading={isLoading}
          />
        </div>
        {(isDrawer || isHoverSidebar || sidebarTransition) && (
          <PeopleDrawer
            isDrawer={isDrawer}
            sidebarTransition={sidebarTransition}
            isHoverSidebar={isHoverSidebar}
            isUserList={isUserList}
            setIsUserList={setIsUserList}
            roomId={roomTimeline.roomId}
          />
        )}
      </div>
    );
  }

  // Nope
  return null;
}

export default Room;
