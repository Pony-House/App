import EventEmitter from 'events';
import {
  Direction,
  UNSIGNED_THREAD_ID_FIELD,
  THREAD_RELATION_TYPE,
  EventType,
} from 'matrix-js-sdk';
import clone from 'clone';
import { generateApiKey } from 'generate-api-key';

import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import { decryptAllEventsOfTimeline } from '@src/client/state/Timeline/functions';
import cons from '@src/client/state/cons';

import { startDb } from './db/indexedDb';
import { toTitleCase } from '../tools';

const genKey = () => generateApiKey().replace(/\~/g, 'pud');
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

class LocalStorageEvent extends EventEmitter {
  constructor(event) {
    super();

    this.event = event;
    this.room = initMatrix.matrixClient.getRoom(this.event.room_id);

    this.threadId =
      typeof this.event?.thread_id === 'string' && this.event?.thread_id !== 'NULL'
        ? this.event?.thread_id
        : null;

    this.status = this.event?.e_status || null;
    this.sender = this.room ? this.room.getMember(this.event.sender) : null;
    this.replyEventId = this.getWireContent()['m.relates_to']?.['m.in_reply_to']?.event_id;
    this.threadRootId = this.threadRootId();

    this.thread = { id: this.threadId };
  }

  threadRootId = () => {
    const relatesTo = this.getWireContent()?.['m.relates_to'];
    if (relatesTo?.rel_type === THREAD_RELATION_TYPE.name) {
      return relatesTo.event_id;
    }
    if (this.thread) {
      return this.thread.id;
    }
    if (this.threadId !== null) {
      return this.threadId;
    }
    const unsigned = this.getUnsigned();
    if (typeof unsigned[UNSIGNED_THREAD_ID_FIELD.name] === 'string') {
      return unsigned[UNSIGNED_THREAD_ID_FIELD.name];
    }
    return undefined;
  };

  getRelation = () => {
    if (!this.isRelation()) {
      return null;
    }
    return this.getWireContent()['m.relates_to'] ?? null;
  };

  getContent = () => {
    if (this.event?.replace_to) {
      return this.event?.replace_to['m.new_content'] || {};
    } else {
      return this.getOriginalContent();
    }
  };

  isRelation = (relType) => {
    const relation = this.getWireContent()?.['m.relates_to'];
    return !!(
      relation?.rel_type &&
      relation.event_id &&
      (relType ? relation.rel_type === relType : true)
    );
  };

  getThreadId = () => this.threadId;
  isThread = () =>
    typeof this.event?.is_thread === 'boolean'
      ? this.event.is_thread
      : this.threadId === this.event?.event_id
        ? true
        : false;
  getThread = () => this.thread;

  getPrevContent = () => this?.getUnsigned().prev_content || {};
  getWireContent = () => this.event?.content || {};
  getOriginalContent = () => this.event.content || {};

  getId = () => this.event?.event_id || null;
  getRoomId = () => this.event?.room_id || null;
  getSender = () => this.event?.sender || null;
  getType = () => this.event?.type || null;

  getAge = () => (this.event?.unsigned && this.event.unsigned?.age) || null;
  getTs = () => this.event?.origin_server_ts;
  getDate = () => (this.event.origin_server_ts ? new Date(this.event.origin_server_ts) : null);

  getUnsigned = () => this.event?.unsigned || null;
  getServerAggregatedRelation = (relType) => this.getUnsigned()['m.relations']?.[relType];

  getStateKey = () => this.event.state_key;
  isState = () => this.event.state_key !== undefined;
  isEncrypted = () => false;

  isNotRedactedInDb = () =>
    (this.getUnsigned().redacted_because && !this.event?.redaction) || false;
  isRedactedDbOnly = () => (!this.getUnsigned().redacted_because && this.event?.redaction) || false;
  isRedacted = () => this.getUnsigned().redacted_because || this.event?.redaction || null;
  isRedaction = () => this.event?.type === 'm.room.redaction' || false;
  isSending = () => this.status !== 'sent' && !!this.status;

  getEditedContent = () => this.event?.replace_to || null;
  isEdited = () =>
    typeof this.event?.replace_to_id === 'string' &&
    typeof this.event?.replace_to_ts === 'number' &&
    objType(this.event?.replace_to, 'object')
      ? true
      : false;
}

class StorageManager extends EventEmitter {
  constructor() {
    super();
    this.isPersisted = null;

    // Db
    this._dbVersion = 23;
    this._oldDbVersion = this.getNumber('ponyHouse-db-version') || 0;
    this.dbName = 'pony-house-database';
    this._timelineSyncCache = this.getJson('ponyHouse-timeline-sync', 'obj');
    this._syncTimelineCache = { usedIds: [], using: false, used: false, roomsUsed: [], data: [] };
    this._addToTimelineCache = { using: false, data: [] };

    this._eventDbs = [
      'reactions',
      'messages_search',
      'messages',
      'messages_edit',
      'crdt',
      'timeline',
      'encrypted',
    ];

    for (const item in this._eventDbs) {
      const nameParts = this._eventDbs[item].split('_');
      let funcName = '';
      for (let i = 0; i < nameParts.length; i++) {
        funcName += toTitleCase(nameParts[i]);
      }

      this[`getLocation${funcName}Id`] = ({
        eventId = null,
        threadId = null,
        showThreads = null,
        showRedaction = null,
        showTransaction = false,
        roomId = null,
        type = null,
        limit = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._findEventIdInPagination({
          from: this._eventDbs[item],
          eventId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          roomId,
          type,
          limit,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}Count`] = ({
        roomId = null,
        threadId = null,
        showThreads = null,
        showRedaction = null,
        showTransaction = false,
        type = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsCounter({
          from: this._eventDbs[item],
          roomId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          type,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}Pagination`] = ({
        roomId = null,
        threadId = null,
        showThreads = null,
        showRedaction = null,
        showTransaction = false,
        type = null,
        limit = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsPaginationCount({
          from: this._eventDbs[item],
          roomId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          type,
          limit,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}`] = ({
        roomId = null,
        threadId = null,
        showThreads = null,
        showRedaction = null,
        showTransaction = false,
        type = null,
        limit = null,
        page = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsDataTemplate({
          from: this._eventDbs[item],
          roomId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          type,
          limit,
          page,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}ById`] = ({
        roomId = null,
        threadId = null,
        type = null,
        eventId = null,
        showRedaction = null,
      }) =>
        this._eventsDataTemplate({
          from: this._eventDbs[item],
          roomId,
          threadId,
          eventId,
          showRedaction,
          type,
        });
    }

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

  convertToEventFormat(event) {
    return new LocalStorageEvent(clone(event));
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
    const loadComplete = (roomId, checkPoint, lastEventId, isNext, err) => {
      const tinyData = {
        roomId,
        firstTime,
        checkPoint,
        lastEventId,
        isNext,
        err,
      };

      tinyThis.emit('dbTimelineLoaded', tinyData, eventId);
      if (typeof eventId === 'string')
        tinyThis.emit(`dbTimelineLoaded-${roomId}-${eventId}`, tinyData);
      tinyThis.emit(`dbTimelineLoaded-${roomId}`, tinyData, eventId);
      if (this._syncTimelineCache.roomsUsed.indexOf(roomId) < 0)
        this._syncTimelineCache.roomsUsed.push(roomId);

      // if (!isNext) room.refreshLiveTimeline().catch(console.error);
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
            let lastTimelineEventId = null;

            for (const item in events) {
              const eventIdp = events[item].getId();
              if (this._syncTimelineCache.usedIds.indexOf(eventIdp) < 0) {
                this._syncTimelineCache.usedIds.push(eventIdp);
                this.addToTimeline(events[item]);
                lastTimelineEventId = eventIdp;
              }
            }

            if (lastTimelineEventId) {
              this._timelineSyncCache[roomId] = {
                lastEvent: lastTimelineEventId,
                isComplete: false,
              };
              this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
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
              loadComplete(roomId, checkPoint, lastEventId, true);
            }

            // Complete
            else {
              console.log(`[room-db-sync] [${roomId}] Complete!`);
              loadComplete(roomId, checkPoint, lastEventId, false);
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
            loadComplete(roomId, checkPoint, lastEventId, true);
          }

          // Complete
          else {
            console.log(`[room-db-sync] [${roomId}] Complete!`);
            loadComplete(roomId, checkPoint, lastEventId, false);
          }
        } else {
          console.log(`[room-db-sync] [${roomId}] Complete!`);
          loadComplete(roomId, checkPoint, lastEventId, false);
        }
      }

      // Error
      else throw new Error(`[room-db-sync] No room found to sync in the indexedDb!`);
    } catch (err) {
      console.error(err);
      loadComplete(null, null, null, false, err);
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
        const tinyThis = this;
        const tinyRoomsUsed = clone(this._syncTimelineCache.roomsUsed);

        console.log(`[room-db-sync] Updating redaction data...`);
        tinyThis.storeConnection
          .select({
            from: 'timeline',
            where: { type: 'm.room.redaction' },
          })
          .then(async (redactions) => {
            for (const item in redactions) {
              if (redactions[item].content && typeof redactions[item].content.redacts === 'string')
                tinyThis._sendSetRedaction(
                  {
                    getContent: () => ({ redacts: redactions[item].content.redacts }),
                    getUnsigned: () => ({ redacts: redactions[item].unsigned }),
                    getRoomId: () => redactions[item].room_id,
                  },
                  true,
                );
            }
            console.log(`[room-db-sync] Redaction data request sent!`);
            console.log(`[room-db-sync] Updating thread and more redaction data...`);
            tinyThis.storeConnection
              .select({
                from: 'messages',
              })
              .then(async (threadMsg) => {
                // Check Data
                for (const item in threadMsg) {
                  const mEvent = tinyThis.convertToEventFormat(threadMsg[item]);

                  // Check redaction
                  if (mEvent.isNotRedactedInDb()) {
                    tinyThis._setRedaction(mEvent.getId(), 'messages', true, true);
                    tinyThis._setRedaction(mEvent.getId(), 'messages_search', true, true);
                  }

                  // Transaction Id to redaction
                  if (mEvent.isRedacted()) {
                    const unsigned = mEvent.getUnsigned();
                    if (unsigned && typeof unsigned.transaction_id === 'string') {
                      const transId = `~${mEvent.getRoomId()}:${unsigned.transaction_id}`;
                      tinyThis._setRedaction(transId, 'messages', true, true);
                      tinyThis._setRedaction(transId, 'messages_search', true, true);
                    }
                  }

                  // Check threads
                  if (mEvent.threadId) await tinyThis._setIsThread(mEvent, true);
                }
                console.log(`[room-db-sync] Thread and more redaction data request sent!`);

                // Complete!
                for (const item in tinyRoomsUsed) {
                  const usedRoom = tinyRoomsUsed[item];
                  if (this._timelineSyncCache[usedRoom]) {
                    this._timelineSyncCache[usedRoom].isComplete = true;
                    this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
                  }

                  console.log(`[room-db-sync] Database checker complete!`);
                  // const room = initMatrix.matrixClient.getRoom(usedRoom);
                  // if (room) room.refreshLiveTimeline();
                }
              })
              .catch(console.error);
          })
          .catch(console.error);
      }

      this._syncTimelineCache.usedIds = [];
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

    data.event_id = event.getId();
    data.is_transaction = data.event_id.startsWith('~') ? true : false;
    data.e_status = event.status;

    if (filter.type !== false) data.type = event.getType();
    if (filter.sender !== false) data.sender = event.getSender();
    if (filter.room_id !== false) data.room_id = event.getRoomId();
    if (filter.content !== false) data.content = clone(event.getContent());
    if (filter.unsigned !== false) data.unsigned = clone(event.getUnsigned());
    if (filter.redaction !== false) data.redaction = event.isRedacted();

    if (filter.thread_id !== false) {
      if (typeof threadId === 'string') data.thread_id = threadId;
      else data.thread_id = 'NULL';
    }

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
        console.error('[indexed-db] ERROR SAVING MEMBER DATA!');
        console.error(err);
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
                  tinyThis.emit('dbMember', result, { event: clone(data) });
                  resolve(result);
                })
                .catch(tinyReject);
            } else resolve(null);
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
    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .insert({
          into: dbName,
          upsert: true,
          values: [data],
        })
        .then((result) => {
          tinyThis.emit(dbEvent, result, tinyThis.convertToEventFormat(data));
          resolve(result);
        })
        .catch(reject),
    );
  };

  _deleteDataByIdTemplate = (dbName, dbEvent, event, where) => {
    const tinyThis = this;
    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .remove({
          from: dbName,
          where: where
            ? where
            : {
                event_id: event.getId(),
              },
        })
        .then((result) => {
          tinyThis.emit(dbEvent, result, event);
          resolve(result);
        })
        .catch(reject),
    );
  };

  async _eventsDataTemplate({
    from = '',
    roomId = null,
    threadId = null,
    eventId = null,
    showThreads = null,
    type = null,
    showRedaction = null,
    showTransaction = null,
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
    if (typeof threadId === 'string' && data.where.thread_id !== 'NULL')
      data.where.thread_id = threadId;
    if (typeof type === 'string') data.where.type = type;

    if (typeof showThreads === 'boolean') {
      if (showThreads) data.where.thread_id = { '!=': 'NULL' };
      else if (!showThreads) data.where.thread_id = 'NULL';
    }

    if (typeof showRedaction === 'boolean') {
      if (showRedaction) data.where.redaction = true;
      else if (!showRedaction) data.where.redaction = false;
    }

    if (showTransaction !== true) data.where.is_transaction = false;

    if (typeof eventId !== 'string') {
      if (typeof limit === 'number') {
        if (!Number.isNaN(limit) && Number.isFinite(limit) && limit > -1) data.limit = limit;
        else data.limit = 0;

        if (typeof page === 'number') {
          if (page !== 1) data.skip = limit * Number(page - 1);
        }
      }

      const result = await this.storeConnection.select(data);
      if (Array.isArray(result)) {
        for (const item in result) {
          result[item] = this.convertToEventFormat(result[item]);
        }
        return result.reverse();
      } else return [];
    } else {
      data.where.event_id = eventId;
      data.limit = 1;
      const result = await this.storeConnection.select(data);
      if (Array.isArray(result) && result.length > 0 && result[0])
        return this.convertToEventFormat(result[0]);
      else return null;
    }
  }

  async _eventsCounter({
    from = '',
    threadId = null,
    showThreads = null,
    showRedaction = null,
    showTransaction = null,
    roomId = null,
    unsigned = null,
    content = null,
    type = null,
    customWhere = null,
    join = null,
  }) {
    const data = { from };
    data.where = { room_id: roomId };

    if (typeof showThreads === 'boolean') {
      if (showThreads) data.where.thread_id = { '!=': 'NULL' };
      else if (!showThreads) data.where.thread_id = 'NULL';
    }

    if (typeof showRedaction === 'boolean') {
      if (showRedaction) data.where.redaction = true;
      else if (!showRedaction) data.where.redaction = false;
    }

    if (showTransaction !== true) data.where.is_transaction = false;

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
    showThreads = null,
    showRedaction = null,
    showTransaction = null,
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
      showThreads,
      showRedaction,
      showTransaction,
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
    showThreads = null,
    showRedaction = null,
    showTransaction = null,
    roomId = null,
    type = null,
    limit = null,
    unsigned = null,
    content = null,
    customWhere = null,
    join = null,
  }) {
    const data = { success: false, items: [], page: null, pages: null };
    data.pages = await this._eventsPaginationCount({
      from,
      threadId,
      showThreads,
      showRedaction,
      showTransaction,
      roomId,
      unsigned,
      content,
      type,
      limit,
      customWhere,
      join,
    });

    for (let i = 0; i < data.pages; i++) {
      const p = i + 1;
      const items = await this._eventsDataTemplate({
        from,
        roomId,
        threadId,
        showThreads,
        showRedaction,
        showTransaction,
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

        if (data.success) {
          for (const item in data.items) {
            data.items[item] = this.convertToEventFormat(data.items[item]);
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
          tinyThis.emit('dbReceipt', result, { event: clone(data) });
          resolve(result);
        })
        .catch(reject);
    });
  }

  _deleteReceiptTemplate(where, id) {
    const tinyThis = this;
    const whereData = {};
    whereData[where] = id;

    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .remove({
          from: 'receipt',
          where: whereData,
        })
        .then((result) => {
          tinyThis.emit('dbReceiptDeleted', result);
          resolve(result);
        })
        .catch(reject),
    );
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

  setMessage(event) {
    const tinyThis = this;
    const setMessage = () =>
      new Promise((resolve, reject) =>
        tinyThis
          ._setDataTemplate('messages', 'dbMessage', event, { is_thread: false })
          .then((result) => {
            const data = tinyThis._eventFilter(event);
            const tinyItem = {
              event_id: data.event_id,
              redaction: data.redaction,
              origin_server_ts: data.origin_server_ts,
            };

            tinyItem.is_transaction = tinyItem.event_id.startsWith('~') ? true : false;
            tinyItem.e_status = event.status;

            if (typeof data.sender === 'string') tinyItem.sender = data.sender;
            if (typeof data.room_id === 'string') tinyItem.room_id = data.room_id;
            if (typeof data.thread_id === 'string') tinyItem.thread_id = data.thread_id;
            else tinyItem.thread_id = 'NULL';

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
              .then((result2) => {
                tinyThis.emit('dbMessageSearch', result2, tinyItem);
                resolve(result);
              })
              .catch(reject);
          })
          .catch(reject),
      );

    const setMessageEdit = () =>
      new Promise((resolve, reject) =>
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

              tinyItem.is_transaction = tinyItem.event_id.startsWith('~') ? true : false;
              tinyItem.e_status = event.status;

              if (typeof newContent.msgtype === 'string') tinyItem.type = newContent.msgtype;
              if (typeof newContent.body === 'string') tinyItem.body = newContent.body;
              if (typeof newContent.formatted_body === 'string')
                tinyItem.formatted_body = newContent.formatted_body;
              if (typeof newContent.format === 'string') tinyItem.format = newContent.format;

              if (typeof data.sender === 'string') tinyItem.sender = data.sender;
              if (typeof data.room_id === 'string') tinyItem.room_id = data.room_id;
              if (typeof data.thread_id === 'string') tinyItem.thread_id = data.thread_id;
              else tinyItem.thread_id = 'NULL';

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
                      tinyThis.storeConnection
                        .update({
                          in: 'messages',
                          set: data2,
                          where: {
                            event_id: relatesTo.event_id,
                          },
                        })
                        .then((result2) =>
                          tinyThis.emit(
                            'dbMessageUpdate',
                            result2,
                            tinyThis.convertToEventFormat(Object.assign(messages2[0], data2)),
                          ),
                        );
                    }
                  }
                });

              tinyThis.storeConnection
                .insert({
                  into: 'messages_search',
                  upsert: true,
                  values: [tinyItem],
                })
                .then((result2) => {
                  tinyThis.emit('dbMessageSearch', result2, tinyItem);
                  resolve(result);
                })
                .catch(reject);
            } else resolve(result);
          })
          .catch(reject),
      );

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
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const threadId = tinyThis._getEventThreadId(event);
      if (typeof threadId === 'string') {
        const eventId = event.getId();
        tinyThis.storeConnection
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
              tinyThis.emit(
                'dbEventIsThread',
                {
                  eventId,
                  threadId,
                  noOfRowsUpdated,
                },
                event,
              );
            resolve(noOfRowsUpdated);
          })
          .catch(reject);
      } else resolve(null);
    });
  }

  _setRedaction(eventId, dbName, isRedacted = false) {
    const tinyThis = this;
    return new Promise((resolve, reject) =>
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
        .catch(reject),
    );
  }

  async _sendSetRedaction(event) {
    for (const dbIndex in this._eventDbs) {
      const content = event.getContent();
      const unsigned = event.getUnsigned();
      if (content) {
        // Normal way
        if (typeof content.redacts === 'string')
          await this._setRedaction(content.redacts, this._eventDbs[dbIndex], true);
        // String
        else if (Array.isArray(content.redacts)) {
          for (const item in content.redacts) {
            if (typeof content.redacts[item] === 'string')
              await this._setRedaction(content.redacts[item], this._eventDbs[dbIndex], true);
          }
        }

        // Transaction Id
        if (unsigned && typeof unsigned.transaction_id === 'string')
          await this._setRedaction(
            `~${event.getRoomId()}:${unsigned.transaction_id}`,
            this._eventDbs[dbIndex],
            true,
          );
      }
    }
  }

  _addToTimelineRun(event) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const tinyReject = (err) => {
        console.error('[indexed-db] ERROR SAVING TIMELINE DATA!');
        console.error(err);
        tinyThis.emit('dbTimeline-Error', err);
        tinyThis._addToTimeline();
        reject(err);
      };

      const tinyComplete = async (result) => {
        await tinyThis._setIsThread(event);
        tinyThis._addToTimeline();
        resolve(result);
      };

      const eventType = event.getType();
      if (typeof tinyThis._timelineInsertTypes[eventType] === 'function')
        tinyThis._timelineInsertTypes[eventType](event).then(tinyComplete).catch(tinyReject);
      else {
        tinyThis
          .setTimeline(event)
          .then(async (result) => {
            try {
              if (eventType === 'm.room.redaction') await tinyThis._sendSetRedaction(event);
              if (eventType === 'm.room.member') await tinyThis.setMember(event);
              tinyComplete(result);
            } catch (err) {
              tinyReject(err);
            }
          })
          .catch(tinyReject);
      }
    });
  }

  _addToTimeline() {
    if (this._addToTimelineCache.data.length > 0) {
      const event = this._addToTimelineCache.data.shift();
      this._addToTimelineRun(event);
    } else {
      this._addToTimelineCache.using = false;
    }
  }

  addToTimeline(event) {
    if (!this._addToTimelineCache.using) {
      this._addToTimelineCache.using = true;
      this._addToTimelineRun(event.toSnapshot());
    } else {
      this._addToTimelineCache.data.push(event.toSnapshot());
    }
  }

  async _syncSendEvent(eventId, roomId, threadId, key) {
    const mx = initMatrix.matrixClient;
    const room = mx.getRoom(roomId);
    if (room) {
      const mEvent = room.getEventForTxnId(key);
      if (mEvent) this.addToTimeline(mEvent);
    }
  }

  async redactEvent(roomId, eventId, reason) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      initMatrix.matrixClient
        .redactEvent(roomId, eventId, key, typeof reason === 'undefined' ? undefined : { reason })
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, undefined, key)
            .then(() => resolve(msgData))
            .catch(reject),
        )
        .catch(reject);
    });
  }

  sendEvent(roomId, eventName, content) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      initMatrix.matrixClient
        .sendEvent(roomId, eventName, content, key)
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, undefined, key)
            .then(() => resolve(msgData))
            .catch(reject),
        )
        .catch(reject);
    });
  }

  sendEventThread(roomId, threadId, eventName, content) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      initMatrix.matrixClient
        .sendEvent(roomId, threadId, eventName, content, key)
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, threadId, key)
            .then(() => resolve(msgData))
            .catch(reject),
        )
        .catch(reject);
    });
  }

  sendMessage(roomId, content) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      initMatrix.matrixClient
        .sendMessage(roomId, content, key)
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, undefined, key)
            .then(() => resolve(msgData))
            .catch(reject),
        )
        .catch(reject);
    });
  }

  sendMessageThread(roomId, threadId, content) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      initMatrix.matrixClient
        .sendMessage(roomId, threadId, content, key)
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, threadId, key)
            .then(() => resolve(msgData))
            .catch(reject),
        )
        .catch(reject);
    });
  }

  sendStickerMessage(roomId, url, info, body) {
    return this.sendEvent(roomId, EventType.Sticker, {
      url,
      info,
      body: body || 'Sticker',
    });
  }

  sendStickerMessageThread(roomId, threadId, url, info, body) {
    return this.sendEventThread(roomId, threadId, EventType.Sticker, {
      url,
      info,
      body: body || 'Sticker',
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
