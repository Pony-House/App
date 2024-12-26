import { EventTimeline } from 'matrix-js-sdk';
import tinyConsole from '@src/util/libs/console';

import { openProfileViewer, openRoomViewer } from '@src/client/action/navigation';
import initMatrix, { fetchFn } from '../client/initMatrix';
import matrixAppearance from './libs/appearance';

const HashIC = './img/ic/outlined/hash.svg';
const HashGlobeIC = './img/ic/outlined/hash-globe.svg';
const HashLockIC = './img/ic/outlined/hash-lock.svg';
const SpaceIC = './img/ic/outlined/space.svg';
const SpaceGlobeIC = './img/ic/outlined/space-globe.svg';
const SpaceLockIC = './img/ic/outlined/space-lock.svg';

const WELL_KNOWN_URI = '/.well-known/matrix/client';

export const canSupport = (where) => {
  const mx = initMatrix.matrixClient;
  const supportData = mx.canSupport ? mx.canSupport.get(where) : null;
  if (
    typeof supportData === 'number' &&
    !Number.isNaN(supportData) &&
    Number.isFinite(supportData) &&
    supportData < 2
  ) {
    return true;
  }
  return false;
};

export const canSupportUnstable = (where) => {
  const mx = initMatrix.matrixClient;
  const supportData = mx.canSupport.get(where);
  if (
    typeof supportData === 'number' &&
    !Number.isNaN(supportData) &&
    Number.isFinite(supportData) &&
    supportData === 1
  ) {
    return true;
  }
  return false;
};

export async function getBaseUrl(servername) {
  let protocol = 'https://';
  if (servername.match(/^https?:\/\//) !== null) protocol = '';
  const serverDiscoveryUrl = `${protocol}${servername}${WELL_KNOWN_URI}`;
  try {
    const result = await (await fetchFn(serverDiscoveryUrl, { method: 'GET' })).json();

    const baseUrl = result?.['m.homeserver']?.base_url;
    if (baseUrl === undefined) throw new Error();
    return baseUrl;
  } catch {
    return `${protocol}${servername}`;
  }
}

export function getUsername(userId) {
  const mx = initMatrix.matrixClient;
  const user = mx.getUser(userId);
  if (user === null) return userId;
  let username = user.displayName;
  if (typeof username === 'undefined') {
    username = userId;
  }
  return username;
}

export function getUsernameOfRoomMember(roomMember) {
  return roomMember.name || convertUserId(roomMember.userId);
}

export async function isRoomAliasAvailable(alias) {
  try {
    const result = await initMatrix.matrixClient.getRoomIdForAlias(alias);
    if (result.room_id) return false;
    return false;
  } catch (e) {
    if (e.errcode === 'M_NOT_FOUND') return true;
    return false;
  }
}

export function getPowerLabel(powerLevel) {
  if (powerLevel > 9000) return 'Goku';
  if (powerLevel > 100) return 'Founder';
  if (powerLevel === 100) return 'Admin';
  if (powerLevel >= 50) return 'Mod';
  return null;
}

export function parseReply(rawBody) {
  if (rawBody?.indexOf('>') !== 0) return null;
  let body = rawBody.slice(rawBody.indexOf('<') + 1);
  const user = body.slice(0, body.indexOf('>'));

  body = body.slice(body.indexOf('>') + 2);
  const replyBody = body.slice(0, body.indexOf('\n\n'));
  body = body.slice(body.indexOf('\n\n') + 2);

  if (user === '') return null;

  const isUserId = user.match(/^@.+:.+/);

  return {
    userId: isUserId ? user : null,
    displayName: isUserId ? null : user,
    replyBody,
    body,
  };
}

export function trimHTMLReply(html) {
  if (!html) return html;
  const suffix = '</mx-reply>';
  const i = html.indexOf(suffix);
  if (i < 0) {
    return html;
  }
  return html.slice(i + suffix.length);
}

export function hasDMWith(userId) {
  const mx = initMatrix.matrixClient;
  const directIds = [...initMatrix.roomList.directs];

  return directIds.find((roomId) => {
    const dRoom = mx.getRoom(roomId);
    const roomMembers = dRoom.getMembers();

    let members = 0;
    for (const item in roomMembers) {
      if (roomMembers[item].membership === 'join') {
        members++;
      }
    }

    if (members <= 2 && dRoom.getMember(userId)) {
      return true;
    }

    return false;
  });
}

export function getCurrentState(room) {
  return room?.getLiveTimeline()?.getState(EventTimeline.FORWARDS);
}

export function joinRuleToIconSrc(joinRule, isSpace) {
  return (
    {
      restricted: () => (isSpace ? SpaceIC : HashIC),
      knock: () => (isSpace ? SpaceLockIC : HashLockIC),
      invite: () => (isSpace ? SpaceLockIC : HashLockIC),
      public: () => (isSpace ? SpaceGlobeIC : HashGlobeIC),
    }[joinRule]?.() || null
  );
}

// NOTE: it gives userId with minimum power level 50;
function getHighestPowerUserId(room) {
  const userIdToPower = getCurrentState(room)
    .getStateEvents('m.room.power_levels', '')
    ?.getContent().users;
  let powerUserId = null;
  if (!userIdToPower) return powerUserId;

  Object.keys(userIdToPower).forEach((userId) => {
    if (userIdToPower[userId] < 50) return;
    if (powerUserId === null) {
      powerUserId = userId;
      return;
    }
    if (userIdToPower[userId] > userIdToPower[powerUserId]) {
      powerUserId = userId;
    }
  });
  return powerUserId;
}

export function getIdServer(userId) {
  const idParts = userId.split(':');
  return idParts[1];
}

export function getServerToPopulation(room) {
  const members = room.getMembers();
  const serverToPop = {};

  members?.forEach((member) => {
    const { userId } = member;
    const server = getIdServer(userId);
    const serverPop = serverToPop[server];
    if (serverPop === undefined) {
      serverToPop[server] = 1;
      return;
    }
    serverToPop[server] = serverPop + 1;
  });

  return serverToPop;
}

export function genRoomVia(room) {
  const via = [];
  const userId = getHighestPowerUserId(room);
  if (userId) {
    const server = getIdServer(userId);
    if (server) via.push(server);
  }
  const serverToPop = getServerToPopulation(room);
  const sortedServers = Object.keys(serverToPop).sort(
    (svrA, svrB) => serverToPop[svrB] - serverToPop[svrA],
  );
  const mostPop3 = sortedServers.slice(0, 3);
  if (via.length === 0) return mostPop3;
  if (mostPop3.includes(via[0])) {
    mostPop3.splice(mostPop3.indexOf(via[0]), 1);
  }
  return via.concat(mostPop3.slice(0, 2));
}

export async function isCrossVerified(deviceId) {
  try {
    const mx = initMatrix.matrixClient;
    const crypto = mx.getCrypto();
    const deviceTrust = await crypto.getDeviceVerificationStatus(mx.getUserId(), deviceId);
    return (
      deviceTrust !== null &&
      (deviceTrust.crossSigningVerified || deviceTrust.signedByOwner || deviceTrust.localVerified)
    );
  } catch (err) {
    tinyConsole.error(err);
    // device does not support encryption
    return null;
  }
}

export function hasCrossSigningAccountData() {
  const mx = initMatrix.matrixClient;
  const masterKeyData = mx.getAccountData('m.cross_signing.master');
  return !!masterKeyData;
}

export function getDefaultSSKey() {
  const mx = initMatrix.matrixClient;
  try {
    return mx.getAccountData('m.secret_storage.default_key').getContent().key;
  } catch (err) {
    tinyConsole.log('No getDefaultSSKey');
    tinyConsole.error(err);
    return undefined;
  }
}

export function getSSKeyInfo(key) {
  const mx = initMatrix.matrixClient;
  try {
    return mx.getAccountData(`m.secret_storage.key.${key}`).getContent();
  } catch (err) {
    tinyConsole.log(`No getSSKeyInfo ${key}`);
    tinyConsole.error(err);
    return undefined;
  }
}

export async function getDevices(userId) {
  const mx = initMatrix.matrixClient;
  const Crypto = initMatrix.matrixClient.getCrypto();
  const mainUserId = mx.getUserId();
  if (userId !== mainUserId) {
    const usersDeviceMap = await Crypto.getUserDeviceInfo([userId, mainUserId]);
    return usersDeviceMap;
  } else {
    const usersDeviceMap = await Crypto.getUserDeviceInfo([userId]);
    return usersDeviceMap;
  }
}

export async function hasDevices(userId) {
  try {
    const usersDeviceMap = await getDevices(userId);
    return Object.values(usersDeviceMap).every(
      (userDevices) => Object.keys(userDevices).length > 0,
    );
  } catch (e) {
    tinyConsole.error(`[matrix] Error determining if it's possible to encrypt to all users: `, e);
    return false;
  }
}

export async function hasDevice(userId, deviceId) {
  try {
    const usersDeviceMap = await getDevices(userId);
    if (typeof deviceId !== 'undefined') return usersDeviceMap.get(userId).get(deviceId);
    else return usersDeviceMap.get(userId);
  } catch (e) {
    tinyConsole.error(`[matrix] Error determining if it's possible to encrypt to all users: `, e);
    return null;
  }
}

export function getHomeServer(yourUserId) {
  return yourUserId.slice(yourUserId.indexOf(':') + 1);
}

const convertBaseId =
  (where) =>
  (id = null, forceMode = false) => {
    const mx = initMatrix.matrixClient;
    const userId = id || mx.getUserId();
    const homeserver = getHomeServer(mx.getUserId());

    if (typeof userId === 'string') {
      if (userId.startsWith(where)) {
        const newUserId = userId.split(':');
        if (
          newUserId.length > 1 &&
          homeserver === newUserId[1] &&
          (matrixAppearance.get('simplerHashtagSameHomeServer') ||
            forceMode ||
            __ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG)
        ) {
          return newUserId[0];
        }
        return newUserId.join(':');
      }
      return userId;
    }
    return '';
  };

export const convertUserId = convertBaseId('@');
export const convertRoomId = convertBaseId('#');

const convertBaseIdReverse =
  (where) =>
  (id = null, forceMode = false) => {
    const mx = initMatrix.matrixClient;
    const userId = id || mx.getUserId();
    if (typeof userId === 'string') {
      if (userId.startsWith(where)) {
        const newUserId = userId.split(':');
        if (
          newUserId.length < 2 &&
          (matrixAppearance.get('simplerHashtagSameHomeServer') ||
            forceMode ||
            __ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG)
        ) {
          const yourUserId = mx.getUserId();
          return `${newUserId[0]}:${getHomeServer(yourUserId)}`;
        }
        return newUserId.join(':');
      }
      return userId;
    }
    return '';
  };

export const convertUserIdReverse = convertBaseIdReverse('@');
export const convertRoomIdReverse = convertBaseIdReverse('#');

export function appearRoomProfile(roomId) {
  const openRoomId = !__ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG
    ? roomId
    : convertRoomIdReverse(roomId);
  openRoomViewer(openRoomId, openRoomId, true);
}

export function appearUserProfile(userId) {
  const openUserId = !__ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG
    ? userId
    : convertUserIdReverse(userId);
  openProfileViewer(openUserId);
}

export const dfAvatarSize = __ENV_APP__.IMG.SIZE.AVATAR;

export function getRoomAvatars(room, size = 32, isDM = false) {
  const mxcUrl = initMatrix.mxcUrl;

  let imageSrc = null;
  if (room) {
    imageSrc = mxcUrl.getAvatarUrl(room, size, size);
    if (!imageSrc && isDM)
      imageSrc = mxcUrl.getAvatarUrl(room.getAvatarFallbackMember(), size, size);
  }

  let imageAnimSrc = null;
  if (room) {
    imageAnimSrc = mxcUrl.getAvatarUrl(room);
    if (!imageAnimSrc && isDM) imageAnimSrc = mxcUrl.getAvatarUrl(room.getAvatarFallbackMember());
  }

  return { imageSrc, imageAnimSrc };
}

if (__ENV_APP__.MODE === 'development') {
  global.matrixUtil = {
    convertUserId,
    convertUserIdReverse,
    convertRoomId,
    convertRoomIdReverse,
    getBaseUrl,
    getUsername,
    getUsernameOfRoomMember,
    isRoomAliasAvailable,
    getPowerLabel,
    parseReply,
    trimHTMLReply,
    hasDMWith,
    getCurrentState,
    joinRuleToIconSrc,
    getHighestPowerUserId,
    getIdServer,
    getServerToPopulation,
    genRoomVia,
    isCrossVerified,
    hasCrossSigningAccountData,
    getDefaultSSKey,
    getSSKeyInfo,
    getDevices,
    hasDevices,
    hasDevice,
  };
}
