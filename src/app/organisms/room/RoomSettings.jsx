import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import mobileEvents from '@src/util/libs/mobile';

import { blurOnBubbling } from '@src/app/atoms/button/script';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import { openInviteUser, toggleRoomSettings } from '../../../client/action/navigation';
import * as roomActions from '../../../client/action/room';

import RawIcon from '@src/app/atoms/system-icons/RawIcon';
import { Header } from '@src/app/atoms/header/Header';
import ScrollView from '@src/app/atoms/scroll/ScrollView';
import Tabs from '@src/app/atoms/tabs/Tabs';
import { MenuItem } from '@src/app/atoms/context-menu/ContextMenu';
import Tooltip from '@src/app/atoms/tooltip/Tooltip';
import Spinner from '@src/app/atoms/spinner/Spinner';

import RoomProfile from '../../molecules/room-profile/RoomProfile';
import RoomSearch from '../../molecules/room-search/RoomSearch';
import RoomNotification from '../../molecules/room-notification/RoomNotification';
import RoomVisibility from '../../molecules/room-visibility/RoomVisibility';
import RoomAliases from '../../molecules/room-aliases/RoomAliases';
import RoomHistoryVisibility from '../../molecules/room-history-visibility/RoomHistoryVisibility';
import RoomEncryption from '../../molecules/room-encryption/RoomEncryption';
import RoomPermissions from '../../molecules/room-permissions/RoomPermissions';
import RoomMembers from '../../molecules/room-members/RoomMembers';
import RoomEmojis from '../../molecules/room-emojis/RoomEmojis';

import { useForceUpdate } from '../../hooks/useForceUpdate';
import { confirmDialog } from '../../molecules/confirm-dialog/ConfirmDialog';
import storageManager from '@src/util/libs/Localstorage';

const tabText = {
  GENERAL: 'General',
  SEARCH: 'Search',
  MEMBERS: 'Members',
  EMOJIS: 'Emojis',
  PERMISSIONS: 'Permissions',
  SECURITY: 'Security',
};

const tabItems = [
  {
    faSrc: 'fa-solid fa-gear',
    text: tabText.GENERAL,
    key: 'general',
    disabled: false,
  },
  {
    faSrc: 'fa-solid fa-magnifying-glass',
    text: tabText.SEARCH,
    key: 'search',
    disabled: false,
  },
  {
    faSrc: 'fa-solid fa-users',
    text: tabText.MEMBERS,
    key: 'members',
    disabled: false,
  },
  {
    faSrc: 'fa-solid fa-face-smile',
    text: tabText.EMOJIS,
    key: 'emojis',
    disabled: false,
  },
  {
    faSrc: 'fa-solid fa-shield',
    text: tabText.PERMISSIONS,
    key: 'permissions',
    disabled: false,
  },
  {
    faSrc: 'fa-solid fa-lock',
    text: tabText.SECURITY,
    key: 'security',
    disabled: false,
  },
];

function GeneralSettings({ roomId }) {
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId);
  const canInvite = room.canInvite(mx.getUserId());

  return (
    <>
      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Options</li>
          <MenuItem
            className="text-start"
            disabled={!canInvite}
            onClick={() => openInviteUser(roomId)}
            faSrc="fa-solid fa-user-plus"
          >
            Invite
          </MenuItem>

          <MenuItem
            className="text-start btn-text-danger"
            onClick={async () => {
              const isConfirmed = await confirmDialog(
                'Leave room',
                `Are you sure that you want to leave "${room.name}" room?`,
                'Leave',
                'danger',
              );
              if (!isConfirmed) return;
              roomActions.leave(roomId).catch((err) => alert(err.message, 'Leave room error'));
            }}
            faSrc="fa-solid fa-arrow-right-from-bracket"
          >
            Leave
          </MenuItem>
        </ul>
      </div>

      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">
            Notification (Changing this will only affect you)
          </li>
          <RoomNotification roomId={roomId} />
        </ul>
      </div>

      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Room visibility (who can join)</li>
          <RoomVisibility roomId={roomId} />
        </ul>
      </div>

      <div className="card">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray noselect">Room addresses</li>
          <RoomAliases roomId={roomId} />
        </ul>
      </div>
    </>
  );
}

GeneralSettings.propTypes = {
  roomId: PropTypes.string.isRequired,
};

function SecuritySettings({ roomId }) {
  return (
    <>
      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Encryption</li>
          <RoomEncryption roomId={roomId} />
        </ul>
      </div>
      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Message history visibility</li>
          <RoomHistoryVisibility roomId={roomId} />
        </ul>
      </div>
    </>
  );
}
SecuritySettings.propTypes = {
  roomId: PropTypes.string.isRequired,
};

function RoomSettings({ roomTimeline = {} }) {
  const [, forceUpdate] = useForceUpdate();
  const [selectedTab, setSelectedTab] = useState(tabItems[0]);
  const { roomId, room, threadId } = roomTimeline;

  const handleTabChange = (tabItem) => {
    setSelectedTab(tabItem);
  };

  useEffect(() => {
    let mounted = true;
    const settingsToggle = (isVisible, tab) => {
      if (!mounted) return;
      if (isVisible) {
        const tabItem = tabItems.find((item) => item.text === tab);
        if (tabItem) setSelectedTab(tabItem);
        forceUpdate();
      } else setTimeout(() => forceUpdate(), 200);
    };

    navigation.on(cons.events.navigation.ROOM_SETTINGS_TOGGLED, settingsToggle);
    return () => {
      mounted = false;
      navigation.removeListener(cons.events.navigation.ROOM_SETTINGS_TOGGLED, settingsToggle);
    };
  }, []);

  useEffect(() => {
    const closeByMobile = () => navigation.isRoomSettings && toggleRoomSettings();

    mobileEvents.on('backButton', closeByMobile);
    return () => {
      mobileEvents.off('backButton', closeByMobile);
    };
  });

  useEffect(() => {
    const handleRoomSyncUpdate = (roomId, threadId) => {
      if (
        roomId === 'ALL' ||
        (syncTimelineCache.roomId !== roomId &&
          (!syncTimelineCache.threadId || syncTimelineCache.threadId !== threadId))
      )
        return;
      forceUpdate();
    };

    storageManager.on('timelineSyncStatus', handleRoomSyncUpdate);
    return () => {
      storageManager.off('timelineSyncStatus', handleRoomSyncUpdate);
    };
  });

  if (!navigation.isRoomSettings) return null;

  return (
    <ScrollView autoHide>
      <Header>
        <ul className="room-settings-navbar navbar-nav mr-auto mt-0">
          <button
            className="nav-link btn btn-bg border-0 p-1"
            onClick={() => toggleRoomSettings()}
            type="button"
            onMouseUp={(e) => blurOnBubbling(e, '.room-settings__header-btn')}
          >
            <strong className="me-2">
              {`${room.name}`}
              <span className="text-bg-low"> — room settings</span>
              {roomTimeline.isRoomSyncing() && (
                <Tooltip placement="bottom" content="Room being synced...">
                  <Spinner className="ms-1" size="sm" />
                </Tooltip>
              )}
            </strong>
            <RawIcon size="small" fa="fa-solid fa-chevron-up" />
          </button>
        </ul>
      </Header>

      <RoomProfile roomId={roomId} />
      <Tabs
        className="px-3"
        items={tabItems}
        defaultSelected={tabItems.findIndex((tab) => tab.text === selectedTab.text)}
        onSelect={handleTabChange}
      />
      <div className="border-top border-bg p-3 pb-5 mb-4">
        {selectedTab.text === tabText.GENERAL && <GeneralSettings roomId={roomId} />}
        {selectedTab.text === tabText.SEARCH && <RoomSearch roomId={roomId} />}
        {selectedTab.text === tabText.MEMBERS && <RoomMembers roomId={roomId} />}
        {selectedTab.text === tabText.EMOJIS && <RoomEmojis roomId={roomId} />}
        {selectedTab.text === tabText.PERMISSIONS && <RoomPermissions roomId={roomId} />}
        {selectedTab.text === tabText.SECURITY && <SecuritySettings roomId={roomId} />}
      </div>
    </ScrollView>
  );
}

RoomSettings.propTypes = {
  roomTimeline: PropTypes.object.isRequired,
};

export default RoomSettings;
export { tabText };
