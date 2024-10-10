import EventEmitter from 'events';
import { Direction } from 'matrix-js-sdk';
import clone from 'clone';

import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import { decryptAllEventsOfTimeline } from '@src/client/state/Timeline/functions';

import { startDb } from './db/indexedDb';

const SYNC_TIMELINE_DOWNLOAD_LIMIT = 100;

class StorageManager extends EventEmitter {
  constructor() {
    super();
    this.isPersisted = null;

    // Db
    this._dbVersion = 7;
    this._oldDbVersion = this.getNumber('ponyHouse-db-version') || 0;
    this.dbName = 'pony-house-database';
    this._timelineSyncCache = this.getJson('ponyHouse-timeline-sync', 'obj');
    this._syncTimelineCache = { using: false, data: [] };

    // Get Content
    this.content = this.getJson('ponyHouse-storage-manager', 'obj');
    this.content.isPersistedLocal =
      typeof this.content.isPersistedLocal === 'boolean' ? this.content.isPersistedLocal : true;

    const tinyThis = this;
    window.addEventListener('storage', function (e) {
      tinyThis.emit('storage', e);
    });
  }

  // Sync Timeline
  async _syncTimelineRun(room, checkpoint = null, timeline = null, firstTime = false) {
    const tinyThis = this;
    const loadComplete = (roomId, checkPoint, lastEventId, err) => {
      const tinyData = {
        roomId,
        firstTime,
        checkPoint,
        lastEventId,
        err,
      };

      tinyThis.emit('dbTimelineLoaded', tinyData);
      tinyThis.emit(`dbTimelineLoaded-${roomId}`, tinyData);
      tinyThis._syncTimelineNext();
    };

    try {
      // Prepare data
      if (room && typeof room.roomId === 'string') {
        const mx = initMatrix.matrixClient;
        const tm = timeline || room.getLiveTimeline();
        if (room.hasEncryptionStateEvent()) await decryptAllEventsOfTimeline(tm);
        const roomId = room.roomId;

        // Get checkpoint
        const lastEventId =
          objType(this._timelineSyncCache[roomId], 'object') &&
          typeof this._timelineSyncCache[roomId].lastEvent === 'string' &&
          this._timelineSyncCache[roomId].lastEvent.length > 0
            ? this._timelineSyncCache[roomId].lastEvent
            : null;

        const checkPoint =
          !timeline && typeof checkpoint === 'string' && checkpoint.length > 0
            ? checkpoint
            : lastEventId;

        const events = tm.getEvents();
        if (Array.isArray(events) && events.length > 0) {
          this._timelineSyncCache[roomId] = { lastEvent: events[0].getId() };
          this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
          for (const item in events) {
            this.addToTimeline(events[item]);
          }
        }

        // Next Timeline
        const nextTimelineToken = tm.getPaginationToken(Direction.Backward);
        if (nextTimelineToken) {
          // Next checkpoint
          if (!checkPoint || !firstTime) {
            // Validator
            if (lastEventId !== this._timelineSyncCache[roomId].lastEvent) {
              // Next page
              await mx.paginateEventTimeline(tm, {
                backwards: Direction.Forward,
                limit: SYNC_TIMELINE_DOWNLOAD_LIMIT,
              });

              console.log(
                `[room-db-sync] [${roomId}] Next data!`,
                this._timelineSyncCache[roomId].lastEvent,
              );

              this._syncTimelineCache.data.push({
                roomId: roomId,
                room,
                checkpoint: null,
                timeline: tm,
              });
              loadComplete(roomId, checkPoint, lastEventId);
            }

            // Complete
            else {
              console.log(`[room-db-sync] [${roomId}] Complete!`);
              loadComplete(roomId, checkPoint, lastEventId);
            }
          }

          // Next event id
          else if (lastEventId !== this._timelineSyncCache[roomId].lastEvent) {
            const eTimeline = await mx.getEventTimeline(
              room.getUnfilteredTimelineSet(),
              checkPoint,
            );
            console.log(`[room-db-sync] [${roomId}] Next data by event id!`, checkPoint);

            this._syncTimelineCache.data.push({
              roomId: roomId,
              room,
              checkpoint: null,
              timeline: eTimeline,
            });
            loadComplete(roomId, checkPoint, lastEventId);
          }

          // Complete
          else {
            console.log(`[room-db-sync] [${roomId}] Complete!`);
            loadComplete(roomId, checkPoint, lastEventId);
          }
        } else {
          console.log(`[room-db-sync] [${roomId}] Complete!`);
          loadComplete(roomId, checkPoint, lastEventId);
        }
      }

      // Error
      else throw new Error(`[room-db-sync] [${roomId}] No room found to sync in the indexedDb!`);
    } catch (err) {
      console.error(err);
      loadComplete(null, null, null, err);
    }
  }

  _syncTimelineNext() {
    if (this._syncTimelineCache.data.length > 0) {
      const data = this._syncTimelineCache.data.shift();
      if (
        typeof __ENV_APP__.TIMELINE_TIMEOUT !== 'number' ||
        !Number.isFinite(__ENV_APP__.TIMELINE_TIMEOUT) ||
        Number.isNaN(__ENV_APP__.TIMELINE_TIMEOUT) ||
        __ENV_APP__.TIMELINE_TIMEOUT <= 0
      )
        this._syncTimelineRun(data.room, data.checkpoint, data.timeline, data.firstTime);
      else {
        const tinyThis = this;
        setTimeout(
          () =>
            tinyThis._syncTimelineRun(data.room, data.checkpoint, data.timeline, data.firstTime),
          __ENV_APP__.TIMELINE_TIMEOUT,
        );
      }
    } else {
      console.log(`[room-db-sync] All complete!`);
      this._syncTimelineCache.using = false;
    }
  }

  _syncTimeline(room, checkpoint = null, timeline = null) {
    if (room && typeof room.roomId === 'string') {
      if (this._syncTimelineCache.using) {
        this._syncTimelineCache.data.push({
          roomId: room.roomId,
          room,
          checkpoint,
          timeline,
          firstTime: true,
        });
      } else {
        this._syncTimelineCache.using = true;
        this._syncTimelineRun(room, checkpoint, timeline, true);
      }
    }
  }

  syncTimeline(roomId, checkpoint = null) {
    this._syncTimeline(initMatrix.matrixClient.getRoom(roomId), checkpoint);
  }

  async deleteRoomDb(roomId) {
    const where = { room_id: roomId };

    let index = this._syncTimelineCache.data.findIndex((item) => item.roomId === roomId);
    while (index > -1) {
      this._syncTimelineCache.data.splice(index, 1);
      index = this._syncTimelineCache.data.findIndex((item) => item.roomId === roomId);
    }

    const timeline = await this.storeConnection.remove({ from: 'timeline', where });
    const encrypted = await this.storeConnection.remove({ from: 'encrypted', where });
    const messages = await this.storeConnection.remove({ from: 'messages', where });
    const reactions = await this.storeConnection.remove({ from: 'reactions', where });
    const members = await this.storeConnection.remove({ from: 'members', where });
    return { timeline, encrypted, messages, reactions, members };
  }

  _eventFilter(event, data = {}, filter = {}) {
    const date = event.getDate();
    const thread = event.getThread();
    const threadId = thread && typeof thread.id === 'string' ? thread.id : null;

    if (filter.event_id !== false) data.event_id = event.getId();
    if (filter.type !== false) data.type = event.getType();
    if (filter.sender !== false) data.sender = event.getSender();
    if (filter.room_id !== false) data.room_id = event.getRoomId();
    if (filter.content !== false) data.content = clone(event.getContent());
    if (filter.unsigned !== false) data.unsigned = clone(event.getUnsigned());
    if (filter.redaction !== false) data.redaction = event.isRedaction();

    if (filter.thread_id !== false && typeof threadId === 'string') data.thread_id = threadId;
    if (filter.origin_server_ts !== false && date) data.origin_server_ts = date.getTime();

    if (typeof data.age !== 'number') delete data.age;
    if (typeof data.type !== 'string') delete data.type;
    if (typeof data.sender !== 'string') delete data.sender;
    if (typeof data.room_id !== 'string') delete data.room_id;

    if (!objType(data.content, 'object')) delete data.content;
    if (!objType(data.unsigned, 'object')) delete data.unsigned;

    return data;
  }

  setMember(event) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const data = {};
      const tinyReject = (err) => {
        console.log('[indexed-db] ERROR SAVING MEMBER DATA!', data);
        tinyThis.emit('dbMember-Error', err, data);
        reject(err);
      };
      try {
        const content = event.getContent();
        const date = event.getDate();

        data.user_id = event.getSender();
        data.room_id = event.getRoomId();
        data.type = content.membership;

        if (date) data.origin_server_ts = date.getTime();
        data.id = `${data.user_id}:${data.room_id}`;

        tinyThis.storeConnection
          .select({
            from: 'members',
            limit: 1,
            where: {
              id: data.id,
            },
          })
          .then((oldData) => {
            const tinyData = oldData[0];
            if (
              typeof data.origin_server_ts === 'number' &&
              (!tinyData ||
                typeof tinyData.origin_server_ts !== 'number' ||
                data.origin_server_ts >= tinyData.origin_server_ts)
            ) {
              tinyThis.storeConnection
                .insert({
                  into: 'members',
                  upsert: true,
                  values: [data],
                })
                .then((result) => {
                  tinyThis.emit('dbMember', result, data);
                  resolve(result);
                })
                .catch(tinyReject);
            }
          })
          .catch(tinyReject);
      } catch (err) {
        tinyReject(err);
      }
    });
  }

  _setDataTemplate = (dbName, dbEvent, event, filter = {}) => {
    const tinyThis = this;
    const data = tinyThis._eventFilter(event, {}, filter);
    return new Promise((resolve, reject) => {
      tinyThis.storeConnection
        .insert({
          into: dbName,
          upsert: true,
          values: [data],
        })
        .then((result) => {
          tinyThis.emit(dbEvent, result, data);
          resolve(result);
        })
        .catch(reject);
    });
  };

  _deleteDataByIdTemplate = (dbName, dbEvent, event) => {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      tinyThis.storeConnection;
      remove({
        from: dbName,
        where: {
          event_id: event.getId(),
        },
      })
        .then((result) => {
          tinyThis.emit(dbEvent, result, data);
          resolve(result);
        })
        .catch(reject);
    });
  };

  setCrdt(event) {
    return this._setDataTemplate('crdt', 'dbCrdt', event);
  }

  setReaction(event) {
    return this._setDataTemplate('reactions', 'dbReaction', event);
  }

  setMessage(event) {
    return this._setDataTemplate('messages', 'dbMessage', event);
  }

  setEncrypted(event) {
    return this._setDataTemplate('encrypted', 'dbEncrypted', event);
  }

  deleteEncryptedById(event) {
    return this._deleteDataByIdTemplate('encrypted', 'dbEncryptedDeleted', event);
  }

  setTimeline(event) {
    return this._setDataTemplate('timeline', 'dbTimeline', event);
  }

  deleteTimelineById(event) {
    return this._deleteDataByIdTemplate('timeline', 'dbTimelineDeleted', event);
  }

  addToTimeline(event) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const data = {};
      const tinyReject = (err) => {
        console.log('[indexed-db] ERROR SAVING TIMELINE DATA!', data);
        tinyThis.emit('dbTimeline-Error', err, data);
        reject(err);
      };
      try {
        const insertTypes = {
          'pony.house.crdt': () => tinyThis.setCrdt(event),
          'm.reaction': () => tinyThis.setReaction(event),
          'm.room.message': () => tinyThis.setMessage(event),
          'm.room.encrypted': () => tinyThis.setEncrypted(event),
        };

        const eventType = event.getType();
        if (typeof insertTypes[eventType] === 'function')
          insertTypes[eventType]().then(resolve).catch(tinyReject);
        else {
          if (eventType === 'm.room.member') tinyThis.setMember(event);
          tinyThis.setTimeline(event);
        }
      } catch (err) {
        tinyReject(err);
      }
    });
  }

  async startPonyHouseDb() {
    const isDbCreated = await startDb(this);
    this._oldDbVersion = this._dbVersion;
    this.setNumber('ponyHouse-db-version', this._dbVersion);
    this.emit('isDbCreated', isDbCreated);
    return isDbCreated;
  }

  getLocalStorage() {
    return global.localStorage;
  }

  getIndexedDB() {
    return global.indexedDB;
  }

  getIsPersisted() {
    return this.isPersisted;
  }

  getIsPersistedLocal() {
    return this.isPersisted ? this.content.isPersistedLocal : false;
  }

  setIsPersistedLocal(value) {
    if (typeof value === 'boolean') {
      this.content.isPersistedLocal = value;
      this.setJson('ponyHouse-storage-manager', this.content);
      this.emit('isPersistedLocal', value);
    }
  }

  async estimate() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate();
    }
    return null;
  }

  async checkStoragePersisted() {
    // Check if site's storage has been marked as persistent
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persisted();
    } else this.isPersisted = null;
    return this.isPersisted;
  }

  async requestStoragePersisted() {
    // Request persistent storage for site
    if (navigator.storage && navigator.storage.persist) {
      this.isPersisted = await navigator.storage.persist();
    } else this.isPersisted = null;
    this.emit('isPersisted', this.isPersisted);
    return this.isPersisted;
  }

  localStorageExist() {
    return typeof Storage !== 'undefined';
  }

  setJson(name, data) {
    if (objType(data, 'object') || objType(data, 'map') || Array.isArray(data))
      return global.localStorage.setItem(name, JSON.stringify(data));
    throw new Error('The storage value is not json!');
  }

  getJson(name, defaultData = null) {
    if (
      typeof defaultData !== 'string' ||
      (defaultData !== 'array' &&
        defaultData !== 'obj' &&
        defaultData !== 'map' &&
        defaultData !== 'null')
    ) {
      return JSON.parse(global.localStorage.getItem(name));
    } else {
      let content = global.localStorage.getItem(name);
      const defaultValue =
        defaultData === 'obj'
          ? {}
          : defaultData === 'array'
            ? []
            : defaultData === 'map'
              ? new Map()
              : null;
      try {
        content = JSON.parse(content) ?? defaultValue;
      } catch {
        content = defaultValue;
      }
      return content;
    }
  }

  setItem(name, data) {
    return global.localStorage.setItem(name, data);
  }

  getItem(name) {
    return global.localStorage.getItem(name);
  }

  setString(name, data) {
    if (typeof data === 'string') return global.localStorage.setItem(name, data);
    throw new Error('The storage value is not string!');
  }

  getString(name) {
    let value = global.localStorage.getItem(name);
    if (typeof value === 'string') return value;

    return null;
  }

  setNumber(name, data) {
    if (typeof data === 'number') return global.localStorage.setItem(name, data);
    throw new Error('The storage value is not number!');
  }

  getNumber(name) {
    let number = global.localStorage.getItem(name);
    if (typeof number === 'number') return number;
    if (typeof number === 'string' && number.length > 0) {
      number = Number(number);
      if (!Number.isNaN(number)) return number;
    }

    return null;
  }

  setBool(name, data) {
    if (typeof data === 'boolean') return global.localStorage.setItem(name, data);
    throw new Error('The storage value is not boolean!');
  }

  getBool(name) {
    const value = global.localStorage.getItem(name);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }

    return null;
  }

  removeItem(name) {
    return global.localStorage.removeItem(name);
  }

  clearLocalStorage() {
    global.localStorage.clear();
  }
}

// Functions and class
const storageManager = new StorageManager();
storageManager.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default storageManager;

if (__ENV_APP__.MODE === 'development') {
  global.storageManager = storageManager;
}
