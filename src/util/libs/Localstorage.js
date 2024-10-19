import EventEmitter from 'events';
import { Direction } from 'matrix-js-sdk';
import clone from 'clone';

import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import { decryptAllEventsOfTimeline } from '@src/client/state/Timeline/functions';
import cons from '@src/client/state/cons';

import { startDb } from './db/indexedDb';

const SYNC_TIMELINE_DOWNLOAD_LIMIT = 100;

const insertObjWhere = (data, name, obj) => {
  if (objType(obj, 'object')) {
    for (const item in obj) {
      data.where[`${name}.${item}`] = obj[item];
    }
  }
};

const addCustomSearch = (where, items) => {
  if (objType(items)) {
    for (const name in items) {
      const type = objType(items[name]);
      if (type === 'string' || type === 'array' || type === 'object') where[name] = items[name];
      else if (type === 'object') {
        for (const item in items[name]) {
          where[name] = items[name][item];
        }
      }
    }
  }
};

class StorageManager extends EventEmitter {
  constructor() {
    super();
    this.isPersisted = null;

    // Db
    this._dbVersion = 20;
    this._oldDbVersion = this.getNumber('ponyHouse-db-version') || 0;
    this.dbName = 'pony-house-database';
    this._timelineSyncCache = this.getJson('ponyHouse-timeline-sync', 'obj');
    this._syncTimelineCache = { using: false, used: false, roomsUsed: [], data: [] };

    // Get Content
    this.content = this.getJson('ponyHouse-storage-manager', 'obj');
    this.content.isPersistedLocal =
      typeof this.content.isPersistedLocal === 'boolean' ? this.content.isPersistedLocal : true;

    // Timeline Inserts
    const tinyThis = this;
    this._timelineInsertTypes = {
      'pony.house.crdt': (event) => tinyThis.setCrdt(event),
      'm.reaction': (event) => tinyThis.setReaction(event),
      'm.room.encrypted': (event) => tinyThis.setEncrypted(event),
    };

    for (const item in cons.supportMessageTypes) {
      this._timelineInsertTypes[cons.supportMessageTypes[item]] = (event) => this.setMessage(event);
    }

    window.addEventListener('storage', function (e) {
      tinyThis.emit('storage', e);
    });
  }

  resetTimelineSyncData(roomId) {
    if (roomId && this._timelineSyncCache[roomId]) {
      delete this._timelineSyncCache[roomId];
      this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
      return true;
    } else return false;
  }

  resetAllTimelineSyncData() {
    this.removeItem('ponyHouse-timeline-sync');
    this._timelineSyncCache = {};
  }

  // Sync Timeline
  async _syncTimelineRun(room, eventId, checkpoint = null, timeline = null, firstTime = false) {
    const tinyThis = this;
    const loadComplete = (roomId, checkPoint, lastEventId, err) => {
      const tinyData = {
        roomId,
        firstTime,
        checkPoint,
        lastEventId,
        err,
      };

      tinyThis.emit('dbTimelineLoaded', tinyData, eventId);
      if (typeof eventId === 'string')
        tinyThis.emit(`dbTimelineLoaded-${roomId}-${eventId}`, tinyData);
      tinyThis.emit(`dbTimelineLoaded-${roomId}`, tinyData, eventId);
      if (this._syncTimelineCache.roomsUsed.indexOf(roomId) < 0)
        this._syncTimelineCache.roomsUsed.push(roomId);
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

        const isComplete =
          this._timelineSyncCache[roomId] &&
          typeof this._timelineSyncCache[roomId].isComplete === 'boolean'
            ? this._timelineSyncCache[roomId].isComplete
            : false;
        if (!isComplete) {
          const events = tm.getEvents();
          if (Array.isArray(events) && events.length > 0) {
            this._timelineSyncCache[roomId] = { lastEvent: events[0].getId(), isComplete: false };
            this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
            for (const item in events) {
              this.addToTimeline(events[item]);
            }
          }
        }

        // Next Timeline
        const nextTimelineToken = tm.getPaginationToken(Direction.Backward);
        if (!isComplete && nextTimelineToken) {
          this._syncTimelineCache.used = true;
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
                eventId,
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
              eventId,
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
      else throw new Error(`[room-db-sync] No room found to sync in the indexedDb!`);
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
        this._syncTimelineRun(
          data.room,
          data.eventId,
          data.checkpoint,
          data.timeline,
          data.firstTime,
        );
      else {
        const tinyThis = this;
        setTimeout(
          () =>
            tinyThis._syncTimelineRun(
              data.room,
              data.eventId,
              data.checkpoint,
              data.timeline,
              data.firstTime,
            ),
          __ENV_APP__.TIMELINE_TIMEOUT,
        );
      }
    } else {
      console.log(`[room-db-sync] All complete!`);
      if (this._syncTimelineCache.used) {
        console.log(`[room-db-sync] Updating redaction data...`);
        const tinyThis = this;
        tinyThis.storeConnection
          .select({
            from: 'timeline',
            where: { type: 'm.room.redaction' },
          })
          .then((redactions) => {
            for (const item in redactions) {
              if (redactions[item].content && typeof redactions[item].content.redacts === 'string')
                tinyThis._sendSetReaction({
                  getContent: () => ({ redacts: redactions[item].content.redacts }),
                });
            }
            console.log(`[room-db-sync] Redaction data request sent!`);
          })
          .catch(console.error);
      }

      for (const item in this._syncTimelineCache.roomsUsed) {
        const usedRoom = this._syncTimelineCache.roomsUsed[item];
        if (this._timelineSyncCache[usedRoom]) {
          this._timelineSyncCache[usedRoom].isComplete = true;
          this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
        }
      }

      this._syncTimelineCache.roomsUsed = [];
      this._syncTimelineCache.using = false;
      this._syncTimelineCache.used = false;
    }
  }

  _syncTimeline(room, eventId, checkpoint = null, timeline = null) {
    if (room && typeof room.roomId === 'string') {
      if (this._syncTimelineCache.using) {
        this._syncTimelineCache.data.push({
          roomId: room.roomId,
          eventId,
          room,
          checkpoint,
          timeline,
          firstTime: true,
        });
      } else {
        this._syncTimelineCache.using = true;
        this._syncTimelineRun(room, eventId, checkpoint, timeline, true);
      }
    }
  }

  syncTimeline(roomId, eventId, checkpoint = null) {
    this._syncTimeline(initMatrix.matrixClient.getRoom(roomId), eventId, checkpoint);
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
    const messagesEdit = await this.storeConnection.remove({ from: 'messages_edit', where });
    const messagesSearch = await this.storeConnection.remove({ from: 'messages_search', where });
    const receipt = await this.deleteReceiptByRoomId(roomId);

    return {
      timeline,
      encrypted,
      messages,
      reactions,
      members,
      messagesEdit,
      messagesSearch,
      receipt,
    };
  }

  _getEventThreadId(event) {
    const thread = event.getThread();
    const content = event.getContent();
    return thread && typeof thread.id === 'string'
      ? thread.id
      : content &&
          content['m.relates_to'] &&
          content['m.relates_to']['rel_type'] === 'm.thread' &&
          typeof content['m.relates_to'].event_id === 'string'
        ? content['m.relates_to'].event_id
        : null;
  }

  _eventFilter(event, data = {}, extraValue = null, filter = {}) {
    const date = event.getDate();
    const threadId = this._getEventThreadId(event);

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
    if (typeof extraValue === 'function') extraValue(data);

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

  _setDataTemplate = (dbName, dbEvent, event, extraValue = null, filter = {}) => {
    const tinyThis = this;
    const data = tinyThis._eventFilter(event, {}, extraValue, filter);
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

  _deleteDataByIdTemplate = (dbName, dbEvent, event, where) => {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      tinyThis.storeConnection;
      remove({
        from: dbName,
        where: where
          ? where
          : {
              event_id: event.getId(),
            },
      })
        .then((result) => {
          tinyThis.emit(dbEvent, result);
          resolve(result);
        })
        .catch(reject);
    });
  };

  async _eventsDataTemplate({
    from = '',
    roomId = null,
    threadId = null,
    type = null,
    content = null,
    unsigned = null,
    limit = null,
    page = null,
    orderBy = 'origin_server_ts',
    customWhere = null,
    join = null,
  }) {
    const data = { from };
    data.where = { room_id: roomId };
    data.order = { type: 'desc', by: orderBy };
    if (join) data.join = join;

    insertObjWhere(data, 'content', content);
    insertObjWhere(data, 'unsigned', unsigned);
    addCustomSearch(data.where, customWhere);
    if (typeof threadId === 'string') data.where.thread_id = threadId;
    if (typeof type === 'string') data.where.type = type;

    if (typeof limit === 'number') {
      if (!Number.isNaN(limit) && Number.isFinite(limit) && limit > -1) data.limit = limit;
      else data.limit = 0;

      if (typeof page === 'number') {
        if (page !== 1) data.skip = limit * Number(page - 1);
      }
    }

    const result = await this.storeConnection.select(data);
    return Array.isArray(result) ? result.reverse() : [];
  }

  async _eventsCounter({
    from = '',
    threadId = null,
    roomId = null,
    unsigned = null,
    content = null,
    type = null,
    customWhere = null,
    join = null,
  }) {
    const data = { from };
    data.where = { room_id: roomId };
    if (join) data.join = join;
    insertObjWhere(data, 'content', content);
    insertObjWhere(data, 'unsigned', unsigned);
    addCustomSearch(data.where, customWhere);
    if (typeof threadId === 'string') data.where.thread_id = threadId;
    if (typeof type === 'string') data.where.type = type;
    return this.storeConnection.count(data);
  }

  async _eventsPaginationCount({
    from = '',
    roomId = null,
    threadId = null,
    unsigned = null,
    content = null,
    type = null,
    limit = null,
    customWhere = null,
    join = null,
  }) {
    const count = await this._eventsCounter({
      from,
      roomId,
      threadId,
      unsigned,
      content,
      type,
      customWhere,
      join,
    });

    if (limit >= count) return 1;
    if (count / 2 < limit) return 2;
    return Math.floor(count / limit);
  }

  async _findEventIdInPagination({
    eventId = null,
    valueName = 'event_id',
    from = '',
    threadId = null,
    roomId = null,
    type = null,
    limit = null,
    unsigned = null,
    content = null,
    customWhere = null,
    join = null,
  }) {
    const pages = await this._eventsPaginationCount({
      from,
      threadId,
      roomId,
      unsigned,
      content,
      type,
      limit,
      customWhere,
      join,
    });

    const data = { success: false, items: [], page: null };
    for (let i = 0; i < pages; i++) {
      const p = i + 1;
      const items = await this._eventsDataTemplate({
        from,
        roomId,
        threadId,
        unsigned,
        content,
        type,
        limit,
        page: p,
        customWhere,
        join,
      });

      if (Array.isArray(items)) {
        for (const item in items) {
          if (items[item][valueName] === eventId) {
            data.success = true;
            data.page = p;
            data.items = items;
            break;
          }
        }
      }

      if (data.success) break;
    }

    return data;
  }

  setMessageEdit(event) {
    const msgRelative = event.getRelation();
    return this._setDataTemplate('messages_edit', 'dbMessageEdit', event, (data) => {
      data.replace_event_id = msgRelative.event_id;
    });
  }

  deleteMessageEditById(event) {
    return this._deleteDataByIdTemplate('messages_edit', 'dbMessageEditDeleted', event);
  }

  deleteMessageEditByReplaceId(event) {
    return this._deleteDataByIdTemplate('messages_edit', 'dbMessageEditDeleted', event, {
      replace_event_id: event.getId(),
    });
  }

  setReceipt(roomId, userId, ts) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const data = {
        id: `${roomId}_${userId}`,
        room_id: roomId,
        user_id: userId,
        origin_server_ts: ts,
      };

      tinyThis.storeConnection
        .insert({
          into: 'receipt',
          upsert: true,
          values: [data],
        })
        .then((result) => {
          tinyThis.emit('dbReceipt', result, data);
          resolve(result);
        })
        .catch(reject);
    });
  }

  _deleteReceiptTemplate(where, id) {
    const tinyThis = this;
    const whereData = {};
    whereData[where] = id;

    return new Promise((resolve, reject) => {
      tinyThis.storeConnection;
      remove({
        from: 'receipt',
        where: whereData,
      })
        .then((result) => {
          tinyThis.emit('dbReceiptDeleted', result);
          resolve(result);
        })
        .catch(reject);
    });
  }

  deleteReceiptById(id) {
    return this._deleteReceiptTemplate('id', id);
  }

  deleteReceiptByUserId(id) {
    return this._deleteReceiptTemplate('user_id', id);
  }

  deleteReceiptByRoomId(id) {
    return this._deleteReceiptTemplate('room_id', id);
  }

  getLocationMessageSearchId({
    eventId = null,
    threadId = null,
    roomId = null,
    type = null,
    limit = null,
    body = null,
    formattedBody = null,
    format = null,
    mimeType = null,
    url = null,
  }) {
    return this._findEventIdInPagination({
      from: 'messages_search',
      eventId,
      threadId,
      roomId,
      type,
      limit,
      customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
    });
  }

  getMessageSearchCount({
    roomId = null,
    threadId = null,
    type = null,
    body = null,
    formattedBody = null,
    format = null,
    mimeType = null,
    url = null,
  }) {
    return this._eventsCounter({
      from: 'messages_search',
      roomId,
      threadId,
      type,
      customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
    });
  }

  getMessageSearchPagination({
    roomId = null,
    threadId = null,
    type = null,
    limit = null,
    body = null,
    formattedBody = null,
    format = null,
    mimeType = null,
    url = null,
  }) {
    return this._eventsPaginationCount({
      from: 'messages_search',
      roomId,
      threadId,
      type,
      limit,
      customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
    });
  }

  getMessagesSearch({
    roomId = null,
    threadId = null,
    type = null,
    limit = null,
    page = null,
    body = null,
    formattedBody = null,
    format = null,
    mimeType = null,
    url = null,
  }) {
    return this._eventsDataTemplate({
      from: 'messages_search',
      roomId,
      threadId,
      type,
      limit,
      page,
      customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
    });
  }

  getLocationMessageId({
    eventId = null,
    threadId = null,
    roomId = null,
    type = null,
    limit = null,
  }) {
    return this._findEventIdInPagination({
      from: 'messages',
      eventId,
      threadId,
      roomId,
      type,
      limit,
    });
  }

  getMessages({ roomId = null, threadId = null, type = null, limit = null, page = null }) {
    return this._eventsDataTemplate({
      from: 'messages',
      roomId,
      threadId,
      type,
      limit,
      page,
    });
  }

  getMessageCount({ roomId = null, threadId = null, type = null }) {
    return this._eventsCounter({
      from: 'messages',
      roomId,
      threadId,
      type,
    });
  }

  getMessagePagination({ roomId = null, threadId = null, type = null, limit = null }) {
    return this._eventsPaginationCount({
      from: 'messages',
      roomId,
      threadId,
      type,
      limit,
    });
  }

  setMessage(event) {
    const tinyThis = this;
    const setMessage = () =>
      new Promise((resolve, reject) => {
        tinyThis
          ._setDataTemplate('messages', 'dbMessage', event)
          .then((result) => {
            const data = tinyThis._eventFilter(event);
            const tinyItem = {
              event_id: data.event_id,
              redaction: data.redaction,
              origin_server_ts: data.origin_server_ts,
            };

            if (typeof data.sender === 'string') tinyItem.sender = data.sender;
            if (typeof data.room_id === 'string') tinyItem.room_id = data.room_id;
            if (typeof data.thread_id === 'string') tinyItem.thread_id = data.thread_id;

            if (data.content) {
              if (typeof data.content.msgtype === 'string') tinyItem.type = data.content.msgtype;
              if (typeof data.content.body === 'string') tinyItem.body = data.content.body;
              if (typeof data.content.formatted_body === 'string')
                tinyItem.formatted_body = data.content.formatted_body;
              if (typeof data.content.format === 'string') tinyItem.format = data.content.format;

              if (data.content.file) {
                if (typeof data.content.file.mimetype === 'string')
                  tinyItem.mimetype = data.content.file.mimetype;

                if (typeof data.content.file.url === 'string') tinyItem.url = data.content.file.url;
              }
            }

            tinyThis.storeConnection
              .insert({
                into: 'messages_search',
                upsert: true,
                values: [tinyItem],
              })
              .then(() => resolve(result))
              .catch(reject);
          })
          .catch(reject);
      });

    const setMessageEdit = () =>
      new Promise((resolve, reject) => {
        tinyThis
          .setMessageEdit(event)
          .then((result) => {
            const data = tinyThis._eventFilter(event);
            const content = event.getContent();
            const relatesTo = content?.['m.relates_to'];
            const newContent = content?.['m.new_content'];

            if (relatesTo && newContent) {
              const tinyItem = {
                event_id: relatesTo.event_id,
                redaction: data.redaction,
                origin_server_ts: data.origin_server_ts,
              };

              if (typeof newContent.msgtype === 'string') tinyItem.type = newContent.msgtype;
              if (typeof newContent.body === 'string') tinyItem.body = newContent.body;
              if (typeof newContent.formatted_body === 'string')
                tinyItem.formatted_body = newContent.formatted_body;
              if (typeof newContent.format === 'string') tinyItem.format = newContent.format;

              if (typeof data.sender === 'string') tinyItem.sender = data.sender;
              if (typeof data.room_id === 'string') tinyItem.room_id = data.room_id;
              if (typeof data.thread_id === 'string') tinyItem.thread_id = data.thread_id;

              if (newContent.file) {
                if (typeof newContent.file.mimetype === 'string')
                  tinyItem.mimetype = newContent.file.mimetype;

                if (typeof newContent.file.url === 'string') tinyItem.url = newContent.file.url;
              }

              tinyThis.storeConnection
                .select({
                  from: 'messages',
                  limit: 1,
                  where: { event_id: relatesTo.event_id },
                })
                .then((messages2) => {
                  if (Array.isArray(messages2) && messages2[0]) {
                    // Message migration
                    const msgTs = messages2[0].replace_to_ts;
                    const data2 = {};
                    data2.replace_to_ts = data.origin_server_ts;
                    data2.replace_to_id = data.event_id;
                    data2.replace_to = content;
                    if (
                      typeof msgTs !== 'number' ||
                      Number.isNaN(msgTs) ||
                      !Number.isFinite(msgTs) ||
                      msgTs <= 0 ||
                      data2.replace_to_ts >= msgTs
                    ) {
                      tinyThis.storeConnection.update({
                        in: 'messages',
                        set: data2,
                        where: {
                          event_id: relatesTo.event_id,
                        },
                      });
                    }
                  }
                });

              tinyThis.storeConnection
                .insert({
                  into: 'messages_search',
                  upsert: true,
                  values: [tinyItem],
                })
                .then(() => resolve(result))
                .catch(reject);
            } else resolve(result);
          })
          .catch(reject);
      });

    const msgRelative = event.getRelation();
    if (
      !msgRelative ||
      typeof msgRelative.event_id !== 'string' ||
      typeof msgRelative.rel_type !== 'string'
    )
      return setMessage();
    else if (msgRelative.rel_type === 'm.replace') return setMessageEdit();
    else return setMessage();
  }

  deleteMessageById(event) {
    return this._deleteDataByIdTemplate('messages', 'dbMessageDeleted', event);
  }

  setCrdt(event) {
    return this._setDataTemplate('crdt', 'dbCrdt', event);
  }

  deleteCrdtById(event) {
    return this._deleteDataByIdTemplate('crdt', 'dbCrdtDeleted', event);
  }

  getReactions({ roomId = null, threadId = null, type = null, limit = null, page = null }) {
    return this._eventsDataTemplate({
      from: 'reactions',
      roomId,
      threadId,
      type,
      limit,
      page,
    });
  }

  setReaction(event) {
    return this._setDataTemplate('reactions', 'dbReaction', event);
  }

  deleteReactionById(event) {
    return this._deleteDataByIdTemplate('reactions', 'dbReactionDeleted', event);
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

  _setIsThread(event) {
    const threadId = this._getEventThreadId(event);
    const eventId = event.getId();
    this.storeConnection
      .update({
        in: 'messages',
        set: {
          is_thread: true,
        },
        where: {
          event_id: threadId,
        },
      })
      .then((noOfRowsUpdated) => {
        if (typeof noOfRowsUpdated === 'number' && noOfRowsUpdated > 0)
          tinyThis.emit('dbEventIsThread', {
            eventId,
            threadId,
            noOfRowsUpdated,
          });
        resolve(noOfRowsUpdated);
      })
      .catch(reject);
  }

  _setRedaction(event, dbName, isRedacted = false) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const content = event.getContent();
      if (content && typeof content.redacts === 'string') {
        const eventId = content.redacts;
        tinyThis.storeConnection
          .update({
            in: dbName,
            set: {
              redaction: isRedacted,
            },
            where: {
              event_id: eventId,
            },
          })
          .then((noOfRowsUpdated) => {
            if (typeof noOfRowsUpdated === 'number' && noOfRowsUpdated > 0)
              tinyThis.emit('dbEventRedaction', {
                in: dbName,
                eventId,
                noOfRowsUpdated,
                isRedacted,
              });
            resolve(noOfRowsUpdated);
          })
          .catch(reject);
      }
    });
  }

  _sendSetReaction(event) {
    const dbs = [
      'reactions',
      'messages_search',
      'messages',
      'messages_edit',
      'crdt',
      'timeline',
      'encrypted',
    ];
    for (const dbIndex in dbs) {
      this._setRedaction(event, dbs[dbIndex], true);
    }
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
        const eventType = event.getType();
        if (typeof tinyThis._timelineInsertTypes[eventType] === 'function')
          tinyThis._timelineInsertTypes[eventType](event).then(resolve).catch(tinyReject);
        else {
          if (eventType === 'm.room.redaction') tinyThis._sendSetReaction(event);
          if (eventType === 'm.room.member') tinyThis.setMember(event);
          tinyThis.setTimeline(event);
        }

        tinyThis._setIsThread(event);
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
