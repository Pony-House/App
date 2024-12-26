import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import tinyConsole from '@src/util/libs/console';
import { openUrl } from '@src/util/message/urlProtection';
import mobileEvents, { isMobile } from '@src/util/libs/mobile';

import appLoadMsg from '@mods/appLoadMsg';
import {
  appearRoomProfile,
  appearUserProfile,
  canSupport,
  convertRoomIdReverse,
} from '@src/util/matrixUtil';

import settings from '@src/client/state/settings';
import matrixAppearance from '@src/util/libs/appearance';
import soundFiles from '@src/util/soundFiles';
import storageManager from '@src/util/libs/Localstorage';

import matrixProxy, { canProxy } from '@src/util/libs/proxy';
import ProxyModal from '@src/app/organisms/proxy-modal/ProxyModal';

import { initHotkeys } from '../../../client/event/hotkeys';
import { initRoomListListener } from '../../../client/event/roomList';

import Text from '../../atoms/text/Text';
import Spinner from '../../atoms/spinner/Spinner';
import Navigation from '../../organisms/navigation/Navigation';
import ContextMenu, { MenuItem } from '../../atoms/context-menu/ContextMenu';
import IconButton from '../../atoms/button/IconButton';
import ReusableContextMenu from '../../atoms/context-menu/ReusableContextMenu';
import Room from '../../organisms/room/Room';
import Windows from '../../organisms/pw/Windows';
import Dialogs from '../../organisms/pw/Dialogs';
import EmojiBoardOpener from '../../organisms/emoji-board/EmojiBoardOpener';

import initMatrix from '../../../client/initMatrix';
import navigation from '../../../client/state/navigation';
import cons from '../../../client/state/cons';
import DragDrop from './DragDrop';
import {
  btModal,
  checkVersions,
  dice,
  resizeWindowChecker,
  scrollFixer,
  tinyAppZoomValidator,
} from '../../../util/tools';
import Mods from './Mods';
import LoadingPage from './Loading';
import urlParams from '../../../util/libs/urlParams';
import {
  openChangelog,
  openProxyModal,
  openRoomViewer,
  selectRoom,
  selectRoomMode,
  selectSpace,
  selectTab,
} from '../../../client/action/navigation';
import ElectronSidebar from './ElectronSidebar';

let versionChecked = false;

if (__ENV_APP__.ELECTRON_MODE) {
  global.electronWindow.on('resize', () => resizeWindowChecker());
}

export const versionChecker = () =>
  new Promise((resolve, reject) => {
    checkVersions()
      .then((versionData) => {
        if (versionData && typeof versionData.value.name === 'string' && versionData.result === 1) {
          const tinyUrl = `https://github.com/Pony-House/Client/releases/tag/${versionData.value.name}`;
          const tinyModal = btModal({
            id: 'tiny-update-warn',
            title: `New version available!`,

            dialog: 'modal-dialog-centered modal-lg noselect',
            body: [
              $('<p>', { class: 'small' }).text(
                `Version ${versionData.value.name} of the app is now available for download! Click the button below to be sent to the update page.`,
              ),
              $('<center>').append(
                $('<a>', { href: tinyUrl, class: 'btn btn-primary text-bg-force' })
                  .on('click', () => {
                    openUrl(tinyUrl, '_target');
                    tinyModal.hide();
                    return false;
                  })
                  .text('Open download page'),
              ),
            ],
          });
        }
      })
      .catch((err) => {
        tinyConsole.error(err);
        alert(err.message, 'Check Versions Error');
      });
  });

global.versionChecker = versionChecker;

function Client({ isDevToolsOpen = false }) {
  const [startWorked, setStartWorked] = useState(true);
  const [errorMessage, setErrorMessage] = useState('Unknown');
  const [isLoading, changeLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(
    appLoadMsg.en.items[dice(appLoadMsg.en.items.length) - 1],
  );
  const [navigationSidebarHidden, setNavigationSidebarHidden] = useState(
    settings.getIsNavigationSidebarHidden(),
  );

  const [isHoverSidebar, setIsHoverSidebar] = useState(matrixAppearance.get('hoverSidebar'));
  const [sidebarTransition, setSidebarTransition] = useState(
    matrixAppearance.get('sidebarTransition'),
  );

  const navWrapperRef = useRef(null);

  function onRoomModeSelected(roomType) {
    const navWrapper = $(navWrapperRef.current);
    navWrapper.removeClass('room-mode').removeClass('navigation-mode');

    if (roomType === 'room') navWrapper.addClass('room-mode');
    if (roomType === 'navigation') navWrapper.addClass('navigation-mode');
    resizeWindowChecker();
  }

  // Prepare params data
  const tab = urlParams.get('tab');
  const spaceId = urlParams.get('space_id');
  const isSpace = urlParams.get('is_space');

  const roomType = urlParams.get('room_mode');

  const roomId = urlParams.get('room_id');
  const eventId = urlParams.get('event_id');
  const threadId = urlParams.get('thread_id');
  const userId = urlParams.get('user_id');
  const playFatalBeep = () => soundFiles.playNow('fatal_beep');

  useEffect(() => {
    navigation.on(cons.events.navigation.SELECTED_ROOM_MODE, onRoomModeSelected);
    const keypressDetector = (event) => {
      const e = event.originalEvent;

      const body = $('body');

      if (e.shiftKey) {
        body.addClass('shiftKey');
      } else {
        body.removeClass('shiftKey');
      }

      if (e.ctrlKey) {
        body.addClass('ctrlKey');
      } else {
        body.removeClass('ctrlKey');
      }
    };

    $(window)
      .on('resize', resizeWindowChecker)
      .on('mousewheel', scrollFixer)
      .on('keypress keyup keydown', keypressDetector);

    return () => {
      $(window)
        .off('resize', resizeWindowChecker)
        .on('mousewheel', scrollFixer)
        .off('keypress keyup keydown', keypressDetector);
      navigation.removeListener(cons.events.navigation.SELECTED_ROOM_MODE, onRoomModeSelected);
    };
  }, []);

  useEffect(() => {
    let counter = -1;
    let counter2 = -1;

    const iId = setInterval(() => {
      if (counter2 !== 2) {
        counter2 += 1;
        setLoadingMsg(appLoadMsg.en.items[dice(appLoadMsg.en.items.length) - 1]);
      } else {
        counter += 1;

        if (counter === 3) {
          setLoadingMsg(appLoadMsg.en.loading[appLoadMsg.en.loading.length - 1]);
          clearInterval(iId);
          return;
        }

        setLoadingMsg(appLoadMsg.en.loading[counter]);
      }
    }, 15000);

    // Loading finished
    initMatrix.once('init_loading_finished', () => {
      clearInterval(iId);
      initHotkeys();
      initRoomListListener(initMatrix.roomList);
      changeLoading(false);

      // Load Params
      if (typeof tab === 'string' && tab.length > 0) selectTab(tab, isSpace);
      if (typeof spaceId === 'string' && spaceId.length > 0) selectSpace(spaceId);
      if ((typeof roomType === 'string' && roomType === 'room') || roomType === 'navigation')
        selectRoomMode(roomType);

      // Read params
      setTimeout(() => {
        // Beep
        if (!startWorked) playFatalBeep();

        // Room Id
        if (typeof roomId === 'string' && roomId.length > 0) {
          // Exist room
          const room = initMatrix.matrixClient.getRoom(roomId);

          // Open room
          if (room) {
            if (typeof roomType !== 'string') selectRoomMode('room');
            selectRoom(
              roomId,
              typeof eventId === 'string' && eventId.length > 0 ? eventId : null,
              canSupport('Thread') && typeof threadId === 'string' && threadId.length > 0
                ? threadId
                : null,
            );
          }

          // Show room profile
          else {
            appearRoomProfile(roomId);
          }
        }

        // User Id
        else if (typeof userId === 'string' && userId.length > 0) {
          appearUserProfile(userId);
        }
      }, 100);

      if (!storageManager.getIsPersisted()) {
        alert(
          'Your client is not using Storage Persisted. You will have sync problems in your client while continuing to use without this option enabled.',
          'Storage Persisted Error',
        );
      }

      // Notifications Check
      if (!__ENV_APP__.ELECTRON_MODE && window.Notification?.permission === 'default') {
        const tinyModal = btModal({
          id: 'tiny-notifications-perm',
          title: `Permission to activate notifications`,

          dialog: 'modal-dialog-centered modal-lg noselect',
          body: [
            $('<p>', { class: 'small' }).text(
              `Before you continue, activate notifications, if you refuse, you can activate later in your account settings.`,
            ),
            $('<center>').append(
              $('<button>', { class: 'btn btn-primary text-bg-force' })
                .on('click', () => {
                  // Ask for permission by default after loading
                  if (isMobile(true)) {
                    mobileEvents
                      .checkNotificationPerm()
                      .then(() => {
                        try {
                          tinyModal.hide();
                        } catch (err) {
                          tinyConsole.error(err);
                        }
                      })
                      .catch((err) => {
                        tinyConsole.error(err);
                        alert(err.message, 'Enable notifications - error');
                        tinyModal.hide();
                      });
                  } else {
                    window.Notification?.requestPermission()
                      .then(() => {
                        try {
                          tinyModal.hide();
                        } catch (err) {
                          tinyConsole.error(err);
                        }
                      })
                      .catch((err) => {
                        tinyConsole.error(err);
                        alert(err.message, 'Enable notifications - error');
                        tinyModal.hide();
                      });
                  }
                })
                .text('Request permission')
                .prepend($('<i>', { class: 'fa-solid fa-bell me-2' })),
            ),
          ],
        });
      } else {
        window.Notification?.requestPermission();
      }

      // Changelog time
      const version = cons.version.split('.');
      const cacheVersion = storageManager.getJson('changelog-version', 'array');
      if (
        version[0] !== cacheVersion[0] ||
        version[1] !== cacheVersion[1] ||
        version[2] !== cacheVersion[2]
      ) {
        setTimeout(() => openChangelog(cons.version), 1000);
        storageManager.setJson('changelog-version', version);
      }
    });

    // Proxy
    matrixProxy.startProxy().then(() => {
      // Start Client
      initMatrix
        .init()
        .then((tinyResult) => {
          if (tinyResult.err && typeof tinyResult.err.message === 'string') {
            setErrorMessage(tinyResult.err.message);
            playFatalBeep();
          }
          setStartWorked(tinyResult.userId !== null);
        })
        .catch((err) => {
          tinyConsole.error(err);
          if (typeof err.message === 'string')
            setErrorMessage(`${err.message}${err.code ? ` CODE: ${err.code}` : ''}`);
          else setErrorMessage(`Unknown Error ${err.code ? err.code : '???'}`);
          playFatalBeep();
          setStartWorked(null);
        });
    });
  }, []);

  useEffect(() => {
    const handleDrawerToggling = (visiblity) => setNavigationSidebarHidden(visiblity);
    settings.on(cons.events.settings.NAVIGATION_SIDEBAR_HIDDEN_TOGGLED, handleDrawerToggling);
    const handleHoverSidebar = (visiblity) => setIsHoverSidebar(visiblity);
    const handleHoverSidebarEffect = (visiblity) => setSidebarTransition(visiblity);
    matrixAppearance.on('sidebarTransition', handleHoverSidebarEffect);
    matrixAppearance.on('hoverSidebar', handleHoverSidebar);
    return () => {
      matrixAppearance.off('sidebarTransition', handleHoverSidebarEffect);
      matrixAppearance.off('hoverSidebar', handleHoverSidebar);
      settings.removeListener(
        cons.events.settings.NAVIGATION_SIDEBAR_HIDDEN_TOGGLED,
        handleDrawerToggling,
      );
    };
  }, []);

  const acceptLocalStorage = storageManager.localStorageExist();
  if (acceptLocalStorage && startWorked) {
    if (isLoading) {
      return (
        <>
          <ElectronSidebar isDevToolsOpen={isDevToolsOpen} />
          <ProxyModal />
          <div
            className={`loading-display${__ENV_APP__.ELECTRON_MODE ? ' root-electron-style' : ''}${isDevToolsOpen ? ' devtools-open' : ''} noselect`}
          >
            <div className="loading__menu">
              <ContextMenu
                placement="bottom"
                content={
                  <>
                    <MenuItem onClick={() => initMatrix.clearCacheAndReload()}>
                      Clear cache & reload
                    </MenuItem>
                    {canProxy() ? (
                      <MenuItem onClick={() => openProxyModal()}>Proxy Settings</MenuItem>
                    ) : null}
                    <MenuItem onClick={() => initMatrix.logout()}>Logout</MenuItem>
                  </>
                }
                render={(toggle) => (
                  <IconButton size="extra-small" onClick={toggle} fa="bi bi-three-dots-vertical" />
                )}
              />
            </div>
            <Spinner />
            <div className="very-small fw-bold text-uppercase mt-3">Did you know</div>
            <p className="loading__message small">{loadingMsg}</p>

            <div className="loading__appname">
              <Text variant="h2" weight="medium">
                {__ENV_APP__.INFO.name}
              </Text>
            </div>
          </div>
        </>
      );
    }

    if (__ENV_APP__.ELECTRON_MODE && !versionChecked && global.checkVersions) {
      versionChecked = true;
      versionChecker();
    }

    $('body').css('zoom', `${tinyAppZoomValidator(storageManager.getNumber('pony-house-zoom'))}%`);
    const tinyMod = <Mods />;

    resizeWindowChecker();
    const classesDragDrop = ['navigation-tiny-base'];
    if (sidebarTransition) classesDragDrop.push('use-transition-sidebar');
    if (isHoverSidebar) classesDragDrop.push('use-hover-sidebar');

    if (!navigationSidebarHidden) {
      $('body').addClass('navigation-wrapper-auto-visible');
    } else {
      $('body').removeClass('navigation-wrapper-auto-visible');
    }

    return (
      <>
        <ElectronSidebar isDevToolsOpen={isDevToolsOpen} />
        <LoadingPage />
        {tinyMod}
        {!isMobile() ? <DragDrop /> : null}
        <div
          ref={navWrapperRef}
          className={`${__ENV_APP__.ELECTRON_MODE ? 'root-electron-style ' : ''}client-container ${classesDragDrop.join(' ')}${navigationSidebarHidden ? ' disable-navigation-wrapper' : ''}${isDevToolsOpen ? ' devtools-open' : ''}`}
        >
          <EmojiBoardOpener />
          <div
            className="navigation-wrapper"
            onMouseEnter={
              isHoverSidebar
                ? () => {
                    if (isHoverSidebar) $('body').addClass('navigation-wrapper-hover');
                  }
                : null
            }
            onMouseLeave={
              isHoverSidebar
                ? () => {
                    if (isHoverSidebar) $('body').removeClass('navigation-wrapper-hover');
                  }
                : null
            }
          >
            <Navigation />
          </div>
          <div className="room-wrapper">
            <Room />
          </div>
          <Windows />
          <Dialogs />
          <ReusableContextMenu />
        </div>
      </>
    );
  }

  return (
    <>
      <ElectronSidebar isDevToolsOpen={isDevToolsOpen} />
      <ProxyModal />
      <div
        className={`loading-display${__ENV_APP__.ELECTRON_MODE ? ' root-electron-style' : ''}${isDevToolsOpen ? ' devtools-open' : ''} noselect`}
      >
        <div className="loading__menu">
          <ContextMenu
            placement="bottom"
            content={
              <>
                <MenuItem onClick={() => initMatrix.clearCacheAndReload()}>
                  Clear cache & reload
                </MenuItem>
                {canProxy() ? (
                  <MenuItem onClick={() => openProxyModal()}>Proxy Settings</MenuItem>
                ) : null}
                <MenuItem onClick={() => initMatrix.logout()}>Logout</MenuItem>
              </>
            }
            render={(toggle) => (
              <IconButton size="extra-small" onClick={toggle} fa="bi bi-three-dots-vertical" />
            )}
          />
        </div>
        <p className="loading__message h2 text-danger">
          <i className="fa-solid fa-triangle-exclamation" />
        </p>
        <div className="small fw-bold text-uppercase mt-3 text-danger">CLIENT ERROR</div>
        <div className="very-small fw-bold text-uppercase mt-3">
          {errorMessage || !acceptLocalStorage ? 'Unsupported localstorage!' : 'Unknown error.'}
        </div>

        <div className="loading__appname">
          <Text variant="h2" weight="medium">
            {__ENV_APP__.INFO.name}
          </Text>
        </div>
      </div>
    </>
  );
}

Client.propTypes = {
  isDevToolsOpen: PropTypes.bool,
};

export default Client;
