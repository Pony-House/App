import React, { useMemo } from 'react';
import EventEmitter from 'events';
import { ClientEvent, RoomStateEvent } from 'matrix-js-sdk';

import tinyConsole from '@src/util/libs/console';

import { imageMimes, imageExts } from '@src/util/MimesUtil';

import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import { ImagePack as ImagePackBuilder } from '@src/app/organisms/emoji-board/custom-emoji';
import { uploadContent } from '@src/app/molecules/file-input/FileInput';

import { getCurrentState } from '../../matrixUtil';
import { suffixRename } from '../../common';
import { getSelectRoom } from '../../selectedRoom';
import { updateEmojiList } from '@src/client/action/navigation';
import EmojiEvents from './EmojiEvents';

// Class Base
class EmojiEditor extends EventEmitter {
  constructor() {
    super();
    this.personalPack = null;
    this.roomsPack = {};
  }

  // Emoji Usage
  getUsage(usage) {
    if (usage.includes('emoticon') && usage.includes('sticker')) return 'both';
    if (usage.includes('emoticon')) return 'emoticon';
    if (usage.includes('sticker')) return 'sticker';

    return 'both';
  }

  // Valid Usage
  isValidUsage(newUsage) {
    return (
      typeof newUsage === 'string' &&
      (newUsage === 'emoticon' || newUsage === 'sticker' || newUsage === 'both')
    );
  }

  // Pack Manager
  getPackState(room) {
    const packEvents = getCurrentState(room).getStateEvents(EmojiEvents.RoomEmotes);
    const unUsablePacks = [];
    const usablePacks = packEvents.filter((mEvent) => {
      if (typeof mEvent.getContent()?.images !== 'object') {
        unUsablePacks.push(mEvent);
        return false;
      }
      return true;
    });

    return { usablePacks, unUsablePacks };
  }

  isStateKeyAvailable(room, key) {
    return !getCurrentState(room).getStateEvents(EmojiEvents.RoomEmotes, key);
  }

  _createPack(roomId, name) {
    const mx = initMatrix.matrixClient;
    const room = mx.getRoom(roomId);
    const { unUsablePacks } = this.getPackState(room);

    const packContent = {
      pack: { display_name: name },
      images: {},
    };

    let stateKey = '';
    if (unUsablePacks.length > 0) {
      const mEvent = unUsablePacks[0];
      stateKey = mEvent.getStateKey();
    } else {
      stateKey = packContent.pack.display_name.replace(/\s/g, '-');
      if (!this.isStateKeyAvailable(room, stateKey)) {
        stateKey = suffixRename(stateKey, (sRoom, key) => this.isStateKeyAvailable(sRoom, key));
      }
    }

    return { packContent, stateKey };
  }

  createPack(roomId, name) {
    const mx = initMatrix.matrixClient;
    const tinyThis = this;
    const { packContent, stateKey } = this._createPack(roomId, name);
    return new Promise((resolve, reject) =>
      mx
        .sendStateEvent(roomId, EmojiEvents.RoomEmotes, packContent, stateKey)
        .then((data) => {
          tinyThis.emit('packCreated', { roomId, packContent, stateKey });
          resolve({ data, stateKey, packContent });
        })
        .catch(reject),
    );
  }

  deletePack(roomId, stateKey) {
    const tinyThis = this;
    const mx = initMatrix.matrixClient;
    return new Promise((resolve, reject) =>
      mx
        .sendStateEvent(roomId, EmojiEvents.RoomEmotes, {}, stateKey)
        .then((data) => {
          const { pack } = tinyThis.getRoom(roomId, stateKey);
          tinyThis.emit('packDeleted', { pack, roomId, stateKey });

          if (pack && pack.images) {
            [...pack.images].map(([shortcode]) => {
              tinyThis._delete(shortcode, roomId, stateKey);
            });
          }

          resolve(data);
        })
        .catch(reject),
    );
  }

  // Global Pack
  addGlobalPack(roomId, stateKey) {
    const tinyThis = this;
    const mx = initMatrix.matrixClient;
    const content = mx.getAccountData(EmojiEvents.EmoteRooms)?.getContent() ?? {};
    if (!content.rooms) content.rooms = {};
    if (!content.rooms[roomId]) content.rooms[roomId] = {};
    content.rooms[roomId][stateKey] = {};
    return new Promise((resolve, reject) => {
      mx.setAccountData(EmojiEvents.EmoteRooms, content)
        .then((data) => {
          tinyThis.emit('addGlobalPack', content, roomId, stateKey);
          resolve(data);
        })
        .catch(reject);
    });
  }

  removeGlobalPack(roomId, stateKey) {
    const tinyThis = this;
    const mx = initMatrix.matrixClient;
    const content = mx.getAccountData(EmojiEvents.EmoteRooms)?.getContent() ?? {};
    if (!content.rooms) return Promise.resolve();
    if (!content.rooms[roomId]) return Promise.resolve();
    delete content.rooms[roomId][stateKey];
    if (Object.keys(content.rooms[roomId]).length === 0) {
      delete content.rooms[roomId];
    }
    return new Promise((resolve, reject) => {
      mx.setAccountData(EmojiEvents.EmoteRooms, content)
        .then((data) => {
          tinyThis.emit('removeGlobalPack', content, roomId, stateKey);
          resolve(data);
        })
        .catch(reject);
    });
  }

  isGlobalPack(roomId, stateKey) {
    const mx = initMatrix.matrixClient;
    const globalContent = mx.getAccountData(EmojiEvents.EmoteRooms)?.getContent();
    if (typeof globalContent !== 'object') return false;

    const { rooms } = globalContent;
    if (typeof rooms !== 'object') return false;

    return rooms[roomId]?.[stateKey] !== undefined;
  }

  // Supported File
  allowedExt(filename) {
    const filenameSplit = filename.split('.');
    return imageExts.indexOf(filenameSplit[filenameSplit.length - 1]) > -1;
  }

  allowedMime(mime) {
    return imageMimes.indexOf(mime) > -1;
  }

  // Is Emoji Event
  isEmojiEvent(event) {
    const eventType = event.getType();
    return eventType === EmojiEvents.EmoteRooms || eventType === EmojiEvents.UserEmotes;
  }

  getPersonal() {
    if (objType(this.personalPack, 'object')) return this.personalPack;
    return {
      pack: ImagePackBuilder.parsePack(initMatrix.matrixClient.getUserId(), {
        pack: { display_name: 'Personal' },
        images: {},
      }),
      sendPackContent: (content) => this._sendUserImagePack(content),
    };
  }

  getRoom(roomId, stateKey) {
    if (objType(this.roomsPack[roomId], 'object') && this.roomsPack[roomId][stateKey])
      return this.roomsPack[roomId][stateKey];
    return {
      pack: null,
      sendPackContent: null,
    };
  }

  // Start events
  start() {
    const mx = initMatrix.matrixClient;
    const tinyThis = this;

    mx.addListener(ClientEvent.AccountData, (event) => {
      if (event.getType() !== EmojiEvents.UserEmotes) return;
      tinyConsole.log('[matrix-emoji-editor] [personal-emojis] Updated!');
      tinyThis.personalPack = tinyThis.useUserImagePack(false);
      tinyThis.emit('personalUpdated', tinyThis.personalPack);
    });

    mx.on(RoomStateEvent.Events, (event) => {
      if (event.getType() !== EmojiEvents.RoomEmotes) return;
      const roomId = event.getRoomId();
      const stateKey = event.getStateKey();
      if (roomId && stateKey) {
        tinyConsole.log('[matrix-emoji-editor] [room-emojis] Updated!', roomId, stateKey);

        if (!tinyThis.roomsPack[roomId]) tinyThis.roomsPack[roomId] = {};
        tinyThis.roomsPack[roomId][stateKey] = tinyThis.useRoomImagePack(
          roomId,
          stateKey,
          event,
          false,
        );

        tinyThis.emit('roomUpdated', tinyThis.roomsPack[roomId][stateKey], roomId, stateKey);
      }
    });

    mx.addListener(ClientEvent.DeleteRoom, (roomId) => {
      tinyConsole.log('[matrix-emoji-editor] [room-emojis] Removed!', roomId);
      tinyThis.emit(
        'roomDeleted',
        roomId,
        objType(tinyThis.roomsPack[roomId], 'object') ? tinyThis.roomsPack[roomId] : null,
      );

      if (tinyThis.roomsPack[roomId]) delete tinyThis.roomsPack[roomId];
    });
  }

  // User Image Pack
  _sendUserImagePack(content) {
    const mx = initMatrix.matrixClient;
    return new Promise((resolve, reject) =>
      mx
        .setAccountData(EmojiEvents.UserEmotes, content)
        .then(() => {
          updateEmojiList(getSelectRoom());
          resolve(true);
        })
        .catch(reject),
    );
  }

  useUserImagePack(isReact = true) {
    const mx = initMatrix.matrixClient;
    const packEvent = mx.getAccountData(EmojiEvents.UserEmotes);
    const pack = isReact
      ? useMemo(
          () =>
            ImagePackBuilder.parsePack(
              mx.getUserId(),
              packEvent?.getContent() ?? {
                pack: { display_name: 'Personal' },
                images: {},
              },
            ),
          [],
        )
      : ImagePackBuilder.parsePack(
          mx.getUserId(),
          packEvent?.getContent() ?? {
            pack: { display_name: 'Personal' },
            images: {},
          },
        );
    const sendPackContent = (content) => this._sendUserImagePack(content);

    return {
      pack,
      sendPackContent,
    };
  }

  // Room Image Pack
  _sendRoomImagePack(roomId, stateKey) {
    const mx = initMatrix.matrixClient;
    return (content) =>
      new Promise((resolve, reject) =>
        mx
          .sendStateEvent(roomId, EmojiEvents.RoomEmotes, content, stateKey)
          .then(() => {
            updateEmojiList(roomId);
            resolve(true);
          })
          .catch(reject),
      );
  }
  useRoomImagePack(roomId, stateKey, definedPackEvent = null, isReact = true) {
    const mx = initMatrix.matrixClient;
    const room = mx.getRoom(roomId);
    if (definedPackEvent || room) {
      const packEvent =
        definedPackEvent || getCurrentState(room).getStateEvents(EmojiEvents.RoomEmotes, stateKey);

      if (packEvent) {
        const pack = isReact
          ? useMemo(
              () => ImagePackBuilder.parsePack(packEvent.getId(), packEvent.getContent()),
              [room, stateKey],
            )
          : ImagePackBuilder.parsePack(packEvent.getId(), packEvent.getContent());
        const sendPackContent = this._sendRoomImagePack(roomId, stateKey);

        return {
          pack,
          sendPackContent,
        };
      }
    }
    return null;
  }

  // Get new emoji key
  _getNewKey(pack, key) {
    if (typeof key !== 'string') return undefined;
    let newKey = key?.replace(/\s/g, '_');
    if (pack.getImages().get(newKey)) {
      newKey = suffixRename(newKey, (suffixedKey) => pack.getImages().get(suffixedKey));
    }
    return newKey;
  }

  // Change Emoji Avatar
  _avatarChange(url, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);
    pack.setAvatarUrl(url);

    if (roomId) this.emit('avatarChangeToRoom', { url }, roomId, stateKey);
    else this.emit('avatarChangeToPersonal', { url });
    return { pack, sendPackContent };
  }

  avatarChange(url, roomId, stateKey) {
    const { pack, sendPackContent } = this._avatarChange(url, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Edit Emoji Profile
  _editProfile(name, attribution, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);
    if (name) pack.setDisplayName(name);
    if (attribution) pack.setAttribution(attribution);
    const newProfile = {
      name: name ? name : pack.displayName ? pack.displayName : null,
      attribution: attribution ? attribution : pack.attribution ? pack.attribution : null,
    };

    if (roomId) this.emit('editProfileToRoom', newProfile, roomId, stateKey);
    else this.emit('editProfileToPersonal', newProfile);
    return { pack, sendPackContent };
  }

  editProfile(name, attribution, roomId, stateKey) {
    const { pack, sendPackContent } = this._editProfile(name, attribution, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Emoji Usage Change
  _usageChange(newUsage, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);
    const usage = [];
    if (newUsage === 'emoticon' || newUsage === 'both') usage.push('emoticon');
    if (newUsage === 'sticker' || newUsage === 'both') usage.push('sticker');
    pack.setUsage(usage);
    pack.getImages().forEach((img) => pack.setImageUsage(img.shortcode, undefined));

    if (roomId) this.emit('usageChangeToRoom', { usage }, roomId, stateKey);
    else this.emit('usageChangeToPersonal', { usage });
    return { pack, sendPackContent };
  }

  usageChange(newUsage, roomId, stateKey) {
    const { pack, sendPackContent } = this._usageChange(newUsage, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Rename Emoji
  _rename(key, newKeyValue, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);
    const newKey = this._getNewKey(pack, newKeyValue);

    if (!newKey || newKey === key) return;
    pack.updateImageKey(key, newKey);

    if (roomId) this.emit('renameToRoom', { key, newKey }, roomId, stateKey);
    else this.emit('renameToPersonal', { key, newKey });
    return { pack, sendPackContent, newKey };
  }

  rename(key, newKeyValue, roomId, stateKey) {
    const { pack, sendPackContent } = this._rename(key, newKeyValue, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Delete Emoji
  _delete(key, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);
    pack.removeImage(key);

    if (roomId) this.emit('deleteToRoom', { key }, roomId, stateKey);
    else this.emit('deleteToPersonal', { key });
    return { pack, sendPackContent };
  }

  delete(key, roomId, stateKey) {
    const { pack, sendPackContent } = this._delete(key, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Delete Multi Emojis
  _deleteMulti(data, roomId, stateKey) {
    if (Array.isArray(data)) {
      for (const item in data) {
        this._delete(data[item], roomId, stateKey);
      }

      const { pack, sendPackContent } = roomId
        ? this.getRoom(roomId, stateKey)
        : this.getPersonal();
      return { pack, sendPackContent };
    }
  }

  async deleteMulti(data, roomId, stateKey) {
    if (Array.isArray(data)) {
      const { pack, sendPackContent } = _deleteMulti(data, roomId, stateKey);
      return sendPackContent && pack
        ? sendPackContent(pack.getContent())
        : new Promise((resolve) => resolve(null));
    }
  }

  // Usage Emoji
  _usage(key, newUsage, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);

    const usage = [];
    if (newUsage === 'emoticon' || newUsage === 'both') usage.push('emoticon');
    if (newUsage === 'sticker' || newUsage === 'both') usage.push('sticker');
    pack.setImageUsage(key, usage);

    if (roomId) this.emit('usageToRoom', { key, usage }, roomId, stateKey);
    else this.emit('usageToPersonal', { key, usage });
    return { pack, sendPackContent };
  }

  usage(key, newUsage, roomId, stateKey) {
    const { pack, sendPackContent } = this._usage(key, newUsage, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Add Emoji
  _add(key, url, roomId, stateKey) {
    const { pack, sendPackContent } = !roomId ? this.getPersonal() : this.getRoom(roomId, stateKey);

    const newKey = this._getNewKey(pack, key);
    if (!newKey || !url) return;

    pack.addImage(newKey, {
      url,
    });

    if (roomId) this.emit('addToRoom', { key: newKey, url }, roomId, stateKey);
    else this.emit('addToPersonal', { key: newKey, url });
    return { pack, sendPackContent, key: newKey };
  }

  add(key, url, roomId, stateKey) {
    const { pack, sendPackContent } = this._add(key, url, roomId, stateKey);
    return sendPackContent && pack
      ? sendPackContent(pack.getContent())
      : new Promise((resolve) => resolve(null));
  }

  // Add Multi Emojis
  async _addMulti(data, roomId, stateKey) {
    if (objType(data, 'object')) {
      const urls = {};

      for (const item in data) {
        const fileSplit = data[item].filename.split('.');
        const { content_uri: url } = await uploadContent(
          data[item].file,
          {
            name: data[item].filename,
            type: `image/${fileSplit[fileSplit.length - 1]}`,
          },
          true,
        );
        if (url) urls[item] = url;
      }

      for (const item in urls) {
        const { key } = this._add(data[item].shortcode, urls[item], roomId, stateKey);
        if (this.isValidUsage(data[item].usage))
          this._usage(key, data[item].usage, roomId, stateKey);
      }

      const { pack, sendPackContent } = roomId
        ? this.getRoom(roomId, stateKey)
        : this.getPersonal();
      return { pack, sendPackContent };
    }
  }

  async addMulti(data, roomId, stateKey) {
    if (objType(data, 'object')) {
      const { pack, sendPackContent } = await this._addMulti(data, roomId, stateKey);
      return sendPackContent && pack
        ? sendPackContent(pack.getContent())
        : new Promise((resolve) => resolve(null));
    }
  }

  // Add Emoji Pack
  async addEmojiPack(data, roomId, stateKey) {
    if (
      objType(data, 'object') &&
      objType(data.items, 'object') &&
      typeof data.client === 'string' &&
      data.client === 'pony-house'
    ) {
      if (data.avatarFile) {
        const fileSplit = data.avatarFilename.split('.');
        const { content_uri: url } = await uploadContent(
          data.avatarFile,
          {
            name: data.avatarFilename,
            type: `image/${fileSplit[fileSplit.length - 1]}`,
          },
          true,
        );
        if (url) this._avatarChange(url, roomId, stateKey);
      }

      if (this.isValidUsage(data.usage)) this._usageChange(data.usage, roomId, stateKey);

      if (typeof data.attribution === 'string' && data.attribution.length > 0) {
        this._editProfile(null, data.attribution, roomId, stateKey);
      }

      const { pack, sendPackContent } = await this._addMulti(data.items, roomId, stateKey);
      return sendPackContent && pack
        ? sendPackContent(pack.getContent())
        : new Promise((resolve) => resolve(null));
    }
  }

  async createEmojiPack(data, roomId) {
    if (objType(data, 'object') && typeof data.title === 'string') {
      const { stateKey } = await this.createPack(roomId, data.title);
      return this.addEmojiPack(data, roomId, stateKey);
    }
  }
}

// Functions and class
const emojiEditor = new EmojiEditor();
emojiEditor.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default emojiEditor;

if (__ENV_APP__.MODE === 'development') {
  global.emojiEditor = emojiEditor;
}
