import EventEmitter from 'events';
import $ from 'jquery';

import { objType } from 'for-promise/utils/lib.mjs';

import favIconManager from '@src/util/libs/favicon';
import appDispatcher from '../dispatcher';
import cons from './cons';
import tinyAPI from '../../util/mods';
import urlParams from '../../util/libs/urlParams';
import {
  setSelectRoom,
  setSelectThread,
  setSelectSpace,
  getSelectThread,
  getSelectRoom,
} from '../../util/selectedRoom';
import { tinyCrypto } from '@mods/web3/ethers/base';

class Navigation extends EventEmitter {
  constructor() {
    super();
    // this will attached by initMatrix
    this.initMatrix = {};

    this.selectedTab = cons.tabs.DIRECTS;
    this.selectedSpaceId = null;
    this.selectedSpacePath = [cons.tabs.DIRECTS];

    this.selectedRoomId = null;
    this.selectedThreadId = null;
    this.isRoomSettings = false;
    this.recentRooms = [];

    this.spaceToRoom = new Map();

    this.rawModelStack = [];
  }

  _addToSpacePath(roomId, asRoot) {
    if (typeof roomId !== 'string') {
      this.selectedSpacePath = [cons.tabs.HOME];
      return;
    }

    if (asRoot) {
      this.selectedSpacePath = [roomId];
      return;
    }

    if (this.selectedSpacePath.includes(roomId)) {
      const spIndex = this.selectedSpacePath.indexOf(roomId);
      this.selectedSpacePath = this.selectedSpacePath.slice(0, spIndex + 1);
      return;
    }

    this.selectedSpacePath.push(roomId);
  }

  _mapRoomToSpace(roomId) {
    const { roomList, accountData } = this.initMatrix;

    if (
      this.selectedTab === cons.tabs.HOME &&
      roomList.rooms.has(roomId) &&
      !roomList.roomIdToParents.has(roomId)
    ) {
      this.spaceToRoom.set(cons.tabs.HOME, {
        roomId,
        timestamp: Date.now(),
      });

      return;
    }

    if (this.selectedTab === cons.tabs.DIRECTS && roomList.directs.has(roomId)) {
      this.spaceToRoom.set(cons.tabs.DIRECTS, {
        roomId,
        timestamp: Date.now(),
      });

      return;
    }

    const parents = roomList.roomIdToParents.get(roomId);

    if (!parents) return;
    if (parents.has(this.selectedSpaceId)) {
      if (!this.selectedSpaceId) {
        console.warn('Called _mapRoomToSpace but no selected space');
        return;
      }

      this.spaceToRoom.set(this.selectedSpaceId, {
        roomId,
        timestamp: Date.now(),
      });
    } else if (accountData.categorizedSpaces.has(this.selectedSpaceId)) {
      const categories = roomList.getCategorizedSpaces([this.selectedSpaceId]);
      const parent = [...parents].find((pId) => categories.has(pId));

      if (parent) {
        this.spaceToRoom.set(parent, {
          roomId,
          timestamp: Date.now(),
        });
      }
    }
  }

  _selectRoom(roomId, eventId, threadId, forceScroll) {
    const tinyThread =
      typeof threadId === 'string'
        ? threadId
        : objType(threadId, 'object')
          ? threadId.threadId
          : null;
    const prevSelectedRoomId = this.selectedRoomId;
    this.selectedRoomId = roomId;
    this.selectedThreadId = tinyThread ?? null;
    if (prevSelectedRoomId !== roomId) this._mapRoomToSpace(roomId);
    this.removeRecentRoom(prevSelectedRoomId);
    this.addRecentRoom(prevSelectedRoomId);
    this.removeRecentRoom(this.selectedRoomId);

    // close the room settings when we select a room
    if (this.isRoomSettings && typeof this.selectedRoomId === 'string') {
      this.isRoomSettings = !this.isRoomSettings;
      tinyAPI.emit('roomSettingsToggled', this.isRoomSettings, null, forceScroll);
      this.emit(
        cons.events.navigation.ROOM_SETTINGS_TOGGLED,
        this.isRoomSettings,
        null,
        forceScroll,
      );
    }

    tinyAPI.emit(
      'roomSelected',
      this.selectedRoomId,
      prevSelectedRoomId,
      eventId,
      tinyThread,
      this.selectedThreadId,
      forceScroll,
    );

    this.emit(
      cons.events.navigation.ROOM_SELECTED,
      this.selectedRoomId,
      prevSelectedRoomId,
      eventId,
      threadId,
      this.selectedThreadId,
      forceScroll,
    );

    // Room Id
    if (typeof roomId === 'string' && roomId.length > 0) urlParams.set('room_id', roomId, false);
    else urlParams.delete('room_id', undefined, false);

    // Event Id
    /* if (typeof eventId === 'string' && eventId.length > 0)
      urlParams.set('event_id', eventId, false);
    else urlParams.delete('event_id', undefined, false); */

    // Thread Id
    /* if (typeof threadId === 'string' && threadId.length > 0)
      urlParams.set('thread_id', threadId, false);
    else urlParams.delete('thread_id', undefined, false); */

    // Refresh Url Params
    urlParams.refreshState();
    favIconManager.checkerFavIcon();
  }

  _selectTabWithRoom(roomId) {
    const { roomList, accountData } = this.initMatrix;
    const { categorizedSpaces } = accountData;

    if (roomList.isOrphan(roomId)) {
      this._selectSpace(null, true, false);
      if (roomList.directs.has(roomId)) {
        this._selectTab(cons.tabs.DIRECTS, false);
      } else {
        this._selectTab(cons.tabs.HOME, false);
      }
      return;
    }

    const parents = roomList.roomIdToParents.get(roomId);

    if (parents.has(this.selectedSpaceId)) {
      return;
    }

    if (categorizedSpaces.has(this.selectedSpaceId)) {
      const categories = roomList.getCategorizedSpaces([this.selectedSpaceId]);
      if ([...parents].find((pId) => categories.has(pId))) {
        // No need to select tab
        // As one of parent is child of selected categorized space.
        return;
      }
    }

    const spaceInPath = [...this.selectedSpacePath].reverse().find((sId) => parents.has(sId));
    if (spaceInPath) {
      this._selectSpace(spaceInPath, false, false);
      return;
    }

    if (roomList.directs.has(roomId)) {
      this._selectSpace(null, true, false);
      this._selectTab(cons.tabs.DIRECTS, false);
      return;
    }

    if (parents.size > 0) {
      const sortedParents = [...parents].sort((p1, p2) => {
        const t1 = this.spaceToRoom.get(p1)?.timestamp ?? 0;
        const t2 = this.spaceToRoom.get(p2)?.timestamp ?? 0;
        return t2 - t1;
      });

      this._selectSpace(sortedParents[0], true, false);
      this._selectTab(sortedParents[0], false);
    }
  }

  _getLatestActiveRoomId(roomIds) {
    const mx = this.initMatrix.matrixClient;

    let ts = 0;
    let roomId = null;

    roomIds.forEach((childId) => {
      const room = mx.getRoom(childId);
      if (!room) return;
      const newTs = room.getLastActiveTimestamp();
      if (newTs > ts) {
        ts = newTs;
        roomId = childId;
      }
    });

    return roomId;
  }

  _getLatestSelectedRoomId(spaceIds) {
    let ts = 0;
    let roomId = null;

    spaceIds.forEach((sId) => {
      const data = this.spaceToRoom.get(sId);
      if (!data) return;
      const newTs = data.timestamp;
      if (newTs > ts) {
        ts = newTs;
        roomId = data.roomId;
      }
    });

    return roomId;
  }

  _selectTab(tabId, selectRoom = true) {
    this.selectedTab = tabId;
    if (selectRoom) this._selectRoomWithTab(this.selectedTab);

    tinyAPI.emit('tabSelected', this.selectedTab);
    this.emit(cons.events.navigation.TAB_SELECTED, this.selectedTab);
  }

  _selectSpace(roomId, asRoot, selectRoom = true) {
    this._addToSpacePath(roomId, asRoot);
    this.selectedSpaceId = roomId;

    if (!asRoot && selectRoom) this._selectRoomWithSpace(this.selectedSpaceId);

    tinyAPI.emit('spaceSelected', this.selectedSpaceId);
    this.emit(cons.events.navigation.SPACE_SELECTED, this.selectedSpaceId);

    if (typeof roomId === 'string' && roomId.length > 0) urlParams.set('space_id', roomId, false);
    else urlParams.delete('space_id', undefined, false);
  }

  _selectRoomWithSpace(spaceId) {
    if (!spaceId) return;
    const { roomList, accountData, matrixClient } = this.initMatrix;
    const { categorizedSpaces } = accountData;

    const data = this.spaceToRoom.get(spaceId);
    if (data && !categorizedSpaces.has(spaceId)) {
      this._selectRoom(data.roomId);
      return;
    }

    const children = [];

    if (categorizedSpaces.has(spaceId)) {
      const categories = roomList.getCategorizedSpaces([spaceId]);

      const latestSelectedRoom = this._getLatestSelectedRoomId([...categories.keys()]);

      if (latestSelectedRoom) {
        this._selectRoom(latestSelectedRoom);
        return;
      }

      categories?.forEach((categoryId) => {
        categoryId?.forEach((childId) => {
          children.push(childId);
        });
      });
    } else {
      const spaceChildren = roomList.getSpaceChildren(spaceId);
      if (spaceChildren) {
        spaceChildren.forEach((id) => {
          if (matrixClient.getRoom(id)?.isSpaceRoom() === false) {
            children.push(id);
          }
        });
      }
    }

    if (!children) {
      this._selectRoom(null);
      return;
    }

    this._selectRoom(this._getLatestActiveRoomId(children));
  }

  _selectRoomWithTab(tabId) {
    const { roomList } = this.initMatrix;
    if (tabId === cons.tabs.HOME || tabId === cons.tabs.DIRECTS) {
      const data = this.spaceToRoom.get(tabId);

      if (data) {
        this._selectRoom(data.roomId);
        return;
      }

      const children = tabId === cons.tabs.HOME ? roomList.getOrphanRooms() : [...roomList.directs];
      this._selectRoom(this._getLatestActiveRoomId(children));
      return;
    }

    this._selectRoomWithSpace(tabId);
  }

  removeRecentRoom(roomId) {
    if (typeof roomId !== 'string') return;
    const roomIdIndex = this.recentRooms.indexOf(roomId);
    if (roomIdIndex >= 0) {
      this.recentRooms.splice(roomIdIndex, 1);
    }
  }

  addRecentRoom(roomId) {
    if (typeof roomId !== 'string') return;

    this.recentRooms.push(roomId);
    if (this.recentRooms.length > 10) {
      this.recentRooms.splice(0, 1);
    }
  }

  get isRawModalVisible() {
    return this.rawModelStack.length > 0;
  }

  setIsRawModalVisible(visible) {
    if (visible) this.rawModelStack.push(true);
    else this.rawModelStack.pop();
  }

  navigate(action) {
    const actions = {
      [cons.actions.navigation.SELECT_TAB]: () => {
        $('.space-drawer-menu-item').removeClass('active');

        if (action.isSpace) {
          urlParams.set('is_space', 'true', false);
          setSelectSpace(action.tabId);
        } else {
          urlParams.delete('is_space', undefined, false);
          setSelectSpace(null);
        }

        const roomId =
          action.tabId !== cons.tabs.HOME && action.tabId !== cons.tabs.DIRECTS
            ? action.tabId
            : null;

        tinyAPI.emit('selectTab', { roomId, tabId: action.tabId });
        this._selectSpace(roomId, true);
        this._selectTab(action.tabId);
        setTimeout(() => tinyAPI.emit('selectTabAfter', { roomId, tabId: action.tabId }), 100);

        if (typeof action.tabId === 'string' && action.tabId.length > 0)
          urlParams.set('tab', action.tabId, false);
        else urlParams.delete('tab', undefined, false);

        urlParams.refreshState();
        favIconManager.checkerFavIcon();
      },

      [cons.actions.navigation.UPDATE_EMOJI_LIST]: () => {
        this.emit(cons.events.navigation.UPDATED_EMOJI_LIST, action.roomId);
      },

      [cons.actions.navigation.UPDATE_EMOJI_LIST_DATA]: () => {
        this.emit(cons.events.navigation.UPDATED_EMOJI_LIST_DATA, action.roomId);
      },

      [cons.actions.navigation.CONSOLE_REMOVE_DATA]: () => {
        this.emit(cons.events.navigation.CONSOLE_REMOVED_DATA, action.content);
      },

      [cons.actions.navigation.CONSOLE_NEW_DATA]: () => {
        this.emit(cons.events.navigation.CONSOLE_NEW_DATA_CREATED, action.content);
      },

      [cons.actions.navigation.CONSOLE_UPDATE]: () => {
        this.emit(cons.events.navigation.CONSOLE_UPDATED, action.content);
      },

      [cons.actions.navigation.SELECT_ROOM_MODE]: () => {
        if (typeof roomType === 'string' && action.roomType.length > 0)
          urlParams.set('room_mode', action.roomType, false);
        else urlParams.delete('room_mode', undefined, false);

        tinyAPI.emit('selectedRoomMode', action.roomType);
        this.emit(cons.events.navigation.SELECTED_ROOM_MODE, action.roomType);
        setTimeout(() => tinyAPI.emit('selectedRoomModeAfter', action.roomType), 100);
      },

      [cons.actions.navigation.SELECT_SPACE]: () => {
        $('.space-drawer-menu-item').removeClass('active');
        setSelectSpace(action.roomId);
        tinyAPI.emit('selectedSpace', action.roomId);
        this._selectSpace(action.roomId, false);
        setTimeout(() => tinyAPI.emit('selectedSpaceAfter', action.roomId), 100);
      },

      [cons.actions.navigation.SELECT_ROOM]: () => {
        this.emit(
          cons.events.navigation.SELECTED_ROOM_BEFORE,
          {
            roomId: getSelectRoom(),
            threadId: getSelectThread(),
          },
          {
            roomId: action.roomId,
            eventId: action.eventId,
            threadId: action.threadId,
          },
          action.forceScroll,
        );

        $('.space-drawer-menu-item').removeClass('active');
        setSelectRoom(action.roomId);
        setSelectThread(action.threadId);

        tinyAPI.emit('selectedRoom', action.roomId, action.forceScroll);
        if (action.roomId) this._selectTabWithRoom(action.roomId, action.forceScroll);
        const tinyThread =
          typeof action.threadId === 'string'
            ? action.threadId
            : objType(action.threadId, 'object')
              ? action.threadId.threadId
              : null;

        this._selectRoom(action.roomId, action.eventId, action.threadId, action.forceScroll);
        setTimeout(
          () => tinyAPI.emit('selectedRoomAfter', action.roomId, tinyThread, action.forceScroll),
          100,
        );
        this.emit(
          cons.events.navigation.SELECTED_ROOM,
          action.roomId,
          action.eventId,
          tinyThread,
          action.forceScroll,
        );
      },

      [cons.actions.navigation.OPEN_SPACE_SETTINGS]: () => {
        tinyAPI.emit('spaceSettingsOpened', action.roomId, action.tabText);
        this.emit(cons.events.navigation.SPACE_SETTINGS_OPENED, action.roomId, action.tabText);
      },

      [cons.actions.navigation.OPEN_SPACE_MANAGE]: () => {
        tinyAPI.emit('spaceManageOpened', action.roomId);
        this.emit(cons.events.navigation.SPACE_MANAGE_OPENED, action.roomId);
      },

      [cons.actions.navigation.OPEN_SPACE_ADDEXISTING]: () => {
        tinyAPI.emit('spaceAddExistingOpened', action.roomId);
        this.emit(cons.events.navigation.SPACE_ADDEXISTING_OPENED, action.roomId);
      },

      [cons.actions.navigation.TOGGLE_ROOM_SETTINGS]: () => {
        this.isRoomSettings = !this.isRoomSettings;

        tinyAPI.emit('roomSettingsToggled', this.isRoomSettings, action.tabText);

        this.emit(
          cons.events.navigation.ROOM_SETTINGS_TOGGLED,
          this.isRoomSettings,
          action.tabText,
        );
      },

      [cons.actions.navigation.ROOM_INFO_UPDATE]: () => {
        tinyAPI.emit('RoomInfoUpdated', action.info);

        this.emit(cons.events.navigation.ROOM_INFO_UPDATED, action.info);
      },

      [cons.actions.navigation.OPEN_SHORTCUT_SPACES]: () => {
        tinyAPI.emit('shortcutSpacesOpened');
        this.emit(cons.events.navigation.SHORTCUT_SPACES_OPENED);
      },

      [cons.actions.navigation.OPEN_INVITE_LIST]: () => {
        tinyAPI.emit('inviteListOpened');
        this.emit(cons.events.navigation.INVITE_LIST_OPENED);
      },

      [cons.actions.navigation.OPEN_PUBLIC_ROOMS]: () => {
        tinyAPI.emit('publicRoomsOpened', action.searchTerm);
        this.emit(cons.events.navigation.PUBLIC_ROOMS_OPENED, action.searchTerm);
      },

      [cons.actions.navigation.OPEN_CREATE_ROOM]: () => {
        tinyAPI.emit('createRoomOpened', action.isSpace, action.parentId);

        this.emit(cons.events.navigation.CREATE_ROOM_OPENED, action.isSpace, action.parentId);
      },

      [cons.actions.navigation.OPEN_JOIN_ALIAS]: () => {
        tinyAPI.emit('joinAliasOpened', action.term);

        this.emit(cons.events.navigation.JOIN_ALIAS_OPENED, action.term);
      },

      [cons.actions.navigation.OPEN_INVITE_USER]: () => {
        tinyAPI.emit('inviteUserOpened', action.roomId, action.searchTerm);
        this.emit(cons.events.navigation.INVITE_USER_OPENED, action.roomId, action.searchTerm);
      },

      [cons.actions.navigation.OPEN_PROFILE_VIEWER]: () => {
        tinyAPI.emit('profileViewerOpened', action.userId, action.roomId);
        this.emit(cons.events.navigation.PROFILE_VIEWER_OPENED, action.userId, action.roomId);
      },

      [cons.actions.navigation.OPEN_ROOM_VIEWER]: () => {
        tinyAPI.emit('roomViewerOpened', action.roomId, action.oId, action.isId);
        this.emit(
          cons.events.navigation.ROOM_VIEWER_OPENED,
          action.roomId,
          action.oId,
          action.isId,
        );
      },

      [cons.actions.navigation.OPEN_CHANGELOG]: () => {
        tinyAPI.emit('changelogOpened', action.version);
        this.emit(cons.events.navigation.CHANGELOG_OPENED, action.version);
      },

      [cons.actions.navigation.OPEN_PROXY_MODAL]: () => {
        this.emit(cons.events.navigation.PROXY_MODAL_OPENED);
      },

      [cons.actions.navigation.OPEN_SETTINGS]: () => {
        if (
          tinyCrypto &&
          typeof tinyCrypto.checkConnection === 'function' &&
          tinyCrypto.isUnlocked()
        )
          tinyCrypto.checkConnection();

        tinyAPI.emit('settingsOpened', action.tabText);
        this.emit(cons.events.navigation.SETTINGS_OPENED, action.tabText);
      },

      [cons.actions.navigation.OPEN_NAVIGATION]: () => {
        tinyAPI.emit('navigationOpened');
        this.emit(cons.events.navigation.NAVIGATION_OPENED);
      },

      [cons.actions.navigation.ETHEREUM_UPDATE]: () => {
        tinyAPI.emit('ethereumUpdated', action.address);
        this.emit(cons.events.navigation.ETHEREUM_UPDATED, action.address);
      },

      [cons.actions.navigation.OPEN_EMOJIBOARD]: () => {
        tinyAPI.emit(
          'emojiboardOpened',
          action.roomId,
          action.cords,
          action.requestEmojiCallback,
          action.dom,
        );

        this.emit(
          cons.events.navigation.EMOJIBOARD_OPENED,
          action.roomId,
          action.cords,
          action.requestEmojiCallback,
          action.dom,
        );
      },

      [cons.actions.navigation.OPEN_READRECEIPTS]: () => {
        tinyAPI.emit('readReceiptsOpened', action.roomId, action.userIds);

        this.emit(cons.events.navigation.READRECEIPTS_OPENED, action.roomId, action.userIds);
      },

      [cons.actions.navigation.OPEN_VIEWSOURCE]: () => {
        tinyAPI.emit('viewSourceOpened', action.event);

        this.emit(cons.events.navigation.VIEWSOURCE_OPENED, action.event);
      },

      [cons.actions.navigation.CLICK_REPLY_TO]: () => {
        tinyAPI.emit(
          'replyToClicked',
          action.userId,
          action.eventId,
          action.body,
          action.formattedBody,
        );

        this.emit(
          cons.events.navigation.REPLY_TO_CLICKED,
          action.userId,
          action.eventId,
          action.body,
          action.formattedBody,
        );
      },

      [cons.actions.navigation.OPEN_SEARCH]: () => {
        tinyAPI.emit('searchOpened', action.term);

        this.emit(cons.events.navigation.SEARCH_OPENED, action.term);
      },

      [cons.actions.navigation.OPEN_REUSABLE_CONTEXT_MENU]: () => {
        tinyAPI.emit(
          'reusableContextMenuOpened',
          action.placement,
          action.cords,
          action.render,
          action.afterClose,
        );

        this.emit(
          cons.events.navigation.REUSABLE_CONTEXT_MENU_OPENED,
          action.placement,
          action.cords,
          action.render,
          action.afterClose,
        );
      },

      [cons.actions.navigation.OPEN_REUSABLE_DIALOG]: () => {
        tinyAPI.emit('reusableDialogOpened', action.title, action.render, action.afterClose);

        this.emit(
          cons.events.navigation.REUSABLE_DIALOG_OPENED,
          action.title,
          action.render,
          action.afterClose,
        );
      },

      [cons.actions.navigation.OPEN_EMOJI_VERIFICATION]: () => {
        tinyAPI.emit('emojiVerificationOpened', action.request, action.targetDevice);

        this.emit(
          cons.events.navigation.EMOJI_VERIFICATION_OPENED,
          action.request,
          action.targetDevice,
        );
      },

      [cons.actions.navigation.PROFILE_UPDATE]: () => {
        tinyAPI.emit('profileUpdated', action.content);
        this.emit(cons.events.navigation.PROFILE_UPDATED, action.content);
      },
    };

    actions[action.type]?.();
  }
}

const navigation = new Navigation();
navigation.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
appDispatcher.register(navigation.navigate.bind(navigation));

export default navigation;
