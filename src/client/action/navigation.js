import { tinyCrypto } from '../../util/web3';
import { setSelectRoom, setSelectSpace } from '../../util/selectedRoom';
import appDispatcher from '../dispatcher';
import cons from '../state/cons';
import urlParams from '../../util/libs/urlParams';

export function selectTab(tabId, isSpace) {

  if (typeof tabId === 'string' && tabId.length > 0) urlParams.set('tab', tabId);
  else urlParams.delete('tab');

  if (isSpace) {
    setSelectSpace(tabId);
  } else {
    setSelectSpace(null);
  }

  urlParams.delete('room_id');
  urlParams.delete('event_id');
  urlParams.delete('thread_id');

  $('.space-drawer-menu-item').removeClass('active');
  appDispatcher.dispatch({
    type: cons.actions.navigation.SELECT_TAB,
    tabId,
  });
}

export function selectRoomMode(roomType) {
  if (typeof roomType === 'string' && roomType.length > 0) urlParams.set('room_mode', roomType);
  else urlParams.delete('room_mode');
  appDispatcher.dispatch({
    type: cons.actions.navigation.SELECT_ROOM_MODE,
    roomType,
  });
}

export function selectSpace(roomId) {
  if (typeof roomId === 'string' && roomId.length > 0) urlParams.set('space_id', roomId);
  else urlParams.delete('space_id');
  urlParams.delete('room_id');
  urlParams.delete('event_id');
  urlParams.delete('thread_id');
  $('.space-drawer-menu-item').removeClass('active');
  setSelectSpace(roomId);
  appDispatcher.dispatch({
    type: cons.actions.navigation.SELECT_SPACE,
    roomId,
  });
}

export function selectRoom(roomId, eventId, threadId, forceScroll = false) {

  // Room Id
  if (typeof roomId === 'string' && roomId.length > 0) urlParams.set('room_id', roomId);
  else urlParams.delete('room_id');

  // Event Id
  if (typeof eventId === 'string' && eventId.length > 0) urlParams.set('event_id', eventId);
  else urlParams.delete('event_id');

  // Thread Id
  if (typeof threadId === 'string' && threadId.length > 0) urlParams.set('thread_id', threadId);
  else urlParams.delete('thread_id');

  $('.space-drawer-menu-item').removeClass('active');
  setSelectRoom(roomId);
  appDispatcher.dispatch({
    type: cons.actions.navigation.SELECT_ROOM,
    roomId,
    eventId,
    threadId,
    forceScroll,
  });

}

// Open navigation on compact screen sizes
export function openNavigation() {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_NAVIGATION,
  });
}

export function openSpaceSettings(roomId, tabText, isProfile = false) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_SPACE_SETTINGS,
    roomId,
    tabText,
    isProfile,
  });
}

export function openSpaceManage(roomId) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_SPACE_MANAGE,
    roomId,
  });
}

export function openSpaceAddExisting(roomId) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_SPACE_ADDEXISTING,
    roomId,
  });
}

export function toggleRoomSettings(tabText) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.TOGGLE_ROOM_SETTINGS,
    tabText,
  });
}

export function updateRoomInfo(info) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.ROOM_INFO_UPDATE,
    info,
  });
}

export function openShortcutSpaces() {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_SHORTCUT_SPACES,
  });
}

export function openInviteList() {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_INVITE_LIST,
  });
}

export function openPublicRooms(searchTerm) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_PUBLIC_ROOMS,
    searchTerm,
  });
}

export function openCreateRoom(isSpace = false, parentId = null) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_CREATE_ROOM,
    isSpace,
    parentId,
  });
}

export function openJoinAlias(term) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_JOIN_ALIAS,
    term,
  });
}

export function openInviteUser(roomId, searchTerm) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_INVITE_USER,
    roomId,
    searchTerm,
  });
}

export function openProfileViewer(userId, roomId) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_PROFILE_VIEWER,
    userId,
    roomId,
  });
}

export function openSettings(tabText) {
  if (
    tinyCrypto &&
    tinyCrypto.call &&
    typeof tinyCrypto.call.requestAccounts === 'function' &&
    tinyCrypto.isUnlocked()
  )
    tinyCrypto.call.requestAccounts();
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_SETTINGS,
    tabText,
  });
}

export function openEmojiBoard(roomId, cords, dom, requestEmojiCallback) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_EMOJIBOARD,
    roomId,
    cords,
    requestEmojiCallback,
    dom,
  });
}

export function ethereumUpdate(address) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.ETHEREUM_UPDATE,
    address,
  });
}

export function openReadReceipts(roomId, userIds) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_READRECEIPTS,
    roomId,
    userIds,
  });
}

export function openViewSource(event) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_VIEWSOURCE,
    event,
  });
}

export function replyTo(userId, eventId, body, formattedBody) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.CLICK_REPLY_TO,
    userId,
    eventId,
    body,
    formattedBody,
  });
}

export function openSearch(term) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_SEARCH,
    term,
  });
}

export function openReusableContextMenu(placement, cords, render, afterClose) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_REUSABLE_CONTEXT_MENU,
    placement,
    cords,
    render,
    afterClose,
  });
}

export function openReusableDialog(title, render, afterClose) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_REUSABLE_DIALOG,
    title,
    render,
    afterClose,
  });
}

export function openEmojiVerification(request, targetDevice) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.OPEN_EMOJI_VERIFICATION,
    request,
    targetDevice,
  });
}

export function emitUpdateProfile(content) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.PROFILE_UPDATE,
    content,
  });
}

export function consoleRemoveData(content) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.CONSOLE_REMOVE_DATA,
    content,
  });
}

export function updateEmojiList(roomId) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.UPDATE_EMOJI_LIST,
    roomId,
  });
}

export function updateEmojiListData(roomId) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.UPDATE_EMOJI_LIST_DATA,
    roomId,
  });
}

export function consoleNewData(content) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.CONSOLE_NEW_DATA,
    content,
  });
}

export function consoleUpdate(content) {
  appDispatcher.dispatch({
    type: cons.actions.navigation.CONSOLE_UPDATE,
    content,
  });
}
