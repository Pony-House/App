/* eslint-disable camelcase */
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import * as sdk from 'matrix-js-sdk';
import { objType } from 'for-promise/utils/lib.mjs';

import Olm from '@matrix-org/olm';

import { isAuthenticated } from '../../client/state/auth';
import RoomTimeline from '../../client/state/RoomTimeline';
import initMatrix from '../../client/initMatrix';

import Spinner from '../atoms/spinner/Spinner';
import ProcessWrapper from '../templates/auth/modules/ProcessWrapper';
import { join } from '../../client/action/room';

import RoomViewContent from '../organisms/room/RoomViewContent';
import RoomViewHeader from '../organisms/room/RoomViewHeader';

import settings from '../../client/state/settings';
import cons from '../../client/state/cons';
import Iframe from '../atoms/iframe/Iframe';

global.Olm = Olm;

function ChatRoomFrame({
  roomId = null,
  refreshTime = null,
  className = null,
  style = null,
  hsUrl = null,
  joinGuest = false,
}) {
  // Theme
  const frameRef = useRef(null);
  const theme = settings.getTheme();

  // hsUrl: null (Custom homeserver url to use hs param)
  const baseUrl =
    typeof hsUrl === 'string'
      ? hsUrl
      : initMatrix && initMatrix.matrixClient && typeof initMatrix.matrixClient.baseUrl === 'string'
        ? initMatrix.matrixClient.baseUrl
        : null;

  // Effect
  useEffect(() => {
    const applyWelcomeTheme = (index, newTheme) => {
      if (frameRef.current) {
        frameRef.current.contentWindow.postMessage({
          theme:
            objType(newTheme, 'object') && typeof newTheme.id === 'string' ? newTheme.id : null,
          useSystemTheme: settings.getUseSystemTheme(),
        });
      }
    };

    settings.on(cons.events.settings.THEME_APPLIED, applyWelcomeTheme);
    return () => {
      settings.off(cons.events.settings.THEME_APPLIED, applyWelcomeTheme);
    };
  });

  // Frame
  return (
    <Iframe
      ref={frameRef}
      title={roomId}
      style={style}
      className={className}
      src={`/?type=chatroom&id=${encodeURIComponent(roomId)}&join_guest=${typeof joinGuest === 'boolean' && joinGuest ? 'true' : 'false'}${baseUrl !== null ? `&hs=${encodeURIComponent(new URL(baseUrl).hostname)}` : ''}${typeof refreshTime === 'number' && refreshTime > 0 ? `&refresh_time=${encodeURIComponent(refreshTime)}` : ''}${objType(theme, 'object') && typeof theme.id === 'string' && theme.id.length > 0 ? `&theme=${encodeURIComponent(theme.id)}` : ''}`}
    />
  );
}

function ChatRoomjFrame(roomId, data = {}) {
  // Theme
  const theme = settings.getTheme();

  // hsUrl: null (Custom homeserver url to use hs param)
  const baseUrl =
    typeof data.hsUrl === 'string'
      ? data.hsUrl
      : initMatrix && initMatrix.matrixClient && typeof initMatrix.matrixClient.baseUrl === 'string'
        ? initMatrix.matrixClient.baseUrl
        : null;
  const iframeData = { title: roomId };

  if (typeof data.className === 'string') {
    iframeData.className = data.className;
  }

  const iframe = $('<iframe>', iframeData);

  if (objType(data.style, 'object')) {
    iframe.css(data.style);
  }

  // Frame
  iframe.attr(
    'src',
    `/?type=chatroom&id=${encodeURIComponent(roomId)}&join_guest=${typeof data.joinGuest === 'boolean' && data.joinGuest ? 'true' : 'false'}${baseUrl !== null ? `&hs=${encodeURIComponent(new URL(baseUrl).hostname)}` : ''}${typeof data.refreshTime === 'number' && data.refreshTime > 0 ? `&refresh_time=${encodeURIComponent(data.refreshTime)}` : ''}${objType(theme, 'object') && typeof theme.id === 'string' && theme.id.length > 0 ? `&theme=${encodeURIComponent(theme.id)}` : ''}`,
  );
  return iframe;
}

ChatRoomFrame.propTypes = {
  hsUrl: PropTypes.string,
  roomId: PropTypes.string,
  className: PropTypes.string,
  refreshTime: PropTypes.number,
  style: PropTypes.object,
  joinGuest: PropTypes.bool,
};

export { ChatRoomFrame, ChatRoomjFrame };

/*

    id: #test-room:example.com
    hs: example.com
    join_guest: false

    theme: silver-theme

    usernameHover: null (on or off)
    refresh_time: null (In minutes)

    path: /?type=chatroom&id=%23test-room%3Aexample.com&hs=example.com&theme=silver-theme&username_hover=off

*/

function ChatRoom({ roomId, homeserver = null, joinGuest, refreshTime, theme, usernameHover }) {
  // States
  const [isLoading, setIsLoading] = useState(1);
  const [roomTimeline, setTimeline] = useState(null);
  const [selectedTheme, setTheme] = useState(theme);
  const [useSystemTheme, setUseSystemTheme] = useState(settings.getUseSystemTheme());

  const [errMessage, setErrorMessage] = useState(null);
  const [errCode, setErrorCode] = useState(null);

  // Theme
  if (typeof selectedTheme === 'string') {
    let themeIndex = settings.getThemeIndexById(selectedTheme);
    if (themeIndex === null) themeIndex = settings.getThemeIndexById('');
    if (themeIndex !== null)
      settings.applyTheme(themeIndex, typeof useSystemTheme === 'boolean' && useSystemTheme);
  }

  // Info
  const hsUrl = roomId.split(':')[1];
  const MATRIX_INSTANCE = `https://${homeserver || hsUrl}`;

  // Load Data
  useEffect(() => {
    // Loading Progress
    if (isLoading === 1) {
      // Set Loading
      setIsLoading(2);

      // Guest User Mode
      const startGuest = async () => {
        const tmpClient = await sdk.createClient({
          baseUrl: MATRIX_INSTANCE,
          timelineSupport: true,
        });
        const guestData = await tmpClient.registerGuest();

        const client = sdk.createClient({
          baseUrl: MATRIX_INSTANCE,
          accessToken: guestData.access_token,
          userId: guestData.user_id,
          deviceId: guestData.device_id,
          timelineSupport: true,

          verificationMethods: ['m.sas.v1'],
        });

        client.setGuest(true);
        initMatrix.setMatrixClient(client);
        return client;
      };

      // Get Room
      const getRoom = () =>
        new Promise((resolve, reject) => {
          const mx = initMatrix.matrixClient;
          mx.getRoomIdForAlias(roomId)
            .then((aliasData) => {
              if (objType(aliasData, 'object')) {
                if (mx.isGuest() && (joinGuest === 'true' || joinGuest === true)) {
                  const via = aliasData?.servers.slice(0, 3) || [];

                  join(roomId, false, via).then((tinyRoom) => {
                    const newTimeline = new RoomTimeline(tinyRoom);
                    setTimeline(newTimeline);
                    setIsLoading(0);
                  });
                } else {
                  const newTimeline = new RoomTimeline(
                    null,
                    aliasData.room_id,
                    roomId,
                    true,
                    mx.getUserId(),
                    (typeof refreshTime === 'string' && refreshTime.length > 0) ||
                    (typeof refreshTime === 'number' && refreshTime > 0)
                      ? Number(refreshTime)
                      : null,
                  );

                  setTimeline(newTimeline);
                  setIsLoading(0);
                }
              } else {
                setIsLoading(3);
                console.error('Invalid room alias data object!');
                console.log('Room alias data:', aliasData);
                setErrorMessage('Invalid room alias data object!');
                setErrorCode(500);
              }
            })
            .catch((err) => reject(err));
        });

      // Start user
      if (isAuthenticated()) {
        const iId = setInterval(() => {}, 15000);

        initMatrix.once('init_loading_finished', () => {
          clearInterval(iId);
          setIsLoading(0);
        });

        initMatrix
          .init(true)
          .then(() => getRoom())
          .catch((err) => {
            console.error(err);
            setIsLoading(3);
            setErrorMessage(err.message);
            setErrorCode(err.code);
          });
      }

      // Start Guest
      else {
        startGuest()
          .then(() => getRoom())
          .catch((err) => {
            console.error(err);
            setIsLoading(3);
            setErrorMessage(err.message);
            setErrorCode(err.code);
          });
      }
    }

    // Iframe Message
    const themeChangeIframe = (e) => {
      try {
        const data = objType(e.data, 'object') ? e.data : null;
        if (objType(data, 'object')) {
          // Theme Change
          setUseSystemTheme(data.useSystemTheme);
          if (typeof data.theme === 'string') {
            setTheme(data.theme);
          } else {
            setTheme('');
          }
        } else {
          setUseSystemTheme(true);
        }
      } catch (err) {
        console.error(err);
      }
    };

    window.addEventListener('message', themeChangeIframe);
    return () => {
      window.removeEventListener('message', themeChangeIframe);
    };
  }, []);

  // Loaded
  if (!isLoading && roomTimeline !== null) {
    return (
      <>
        <RoomViewHeader
          roomId={roomId}
          roomItem={roomTimeline.room}
          roomAlias={roomTimeline.roomAlias}
          disableActions
        />
        <RoomViewContent
          roomId={roomId}
          roomTimeline={roomTimeline}
          isGuest={!isAuthenticated()}
          usernameHover={usernameHover}
          disableActions
          isUserList
        />
      </>
    );
  }

  // Error
  if (isLoading === 3) {
    return (
      <ProcessWrapper>
        <h1 className="m-0 text-warning">
          <i className="fa-solid fa-triangle-exclamation" />
        </h1>
        <div style={{ marginTop: 'var(--sp-normal)' }} className="text-danger">
          {typeof errCode === 'number' || typeof errCode === 'string'
            ? `${String(errCode)} - `
            : ''}
          {errMessage || 'Unknown error!'}
        </div>
      </ProcessWrapper>
    );
  }

  // Loading
  return (
    <ProcessWrapper>
      <Spinner />
      <div style={{ marginTop: 'var(--sp-normal)' }}>{__ENV_APP__.INFO.name} - Room Embed</div>
    </ProcessWrapper>
  );
}

ChatRoom.propTypes = {
  roomId: PropTypes.string.isRequired,
  homeserver: PropTypes.string,
};

export default ChatRoom;
