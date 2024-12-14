import EventEmitter from 'events';
import {
  Direction,
  UNSIGNED_THREAD_ID_FIELD,
  THREAD_RELATION_TYPE,
  EventType,
  MatrixEventEvent,
} from 'matrix-js-sdk';
import clone from 'clone';
import { generateApiKey } from 'generate-api-key';

import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import { decryptAllEventsOfTimeline } from '@src/client/state/Timeline/functions';
import cons from '@src/client/state/cons';
import {
  getMemberEventType,
  memberEventAllowed,
  MemberEventsList,
} from '@src/app/organisms/room/MemberEvents';

import { startDb } from './db/indexedDb';
import { toTitleCase } from '../tools';

const genKey = () => generateApiKey().replace(/\~/g, 'pud');
const SYNC_TIMELINE_DOWNLOAD_LIMIT = 100;
const getTableName = (tableData) => (typeof tableData === 'string' ? tableData : tableData.name);

const finishWhereDbPrepare = (memberType, threadId, data, existMemberType = false) => {
  if (!Array.isArray(data.where)) data.where = [data.where];
  if (typeof threadId === 'string' && data.where.thread_id !== 'NULL') {
    data.where.push({
      thread_id: threadId,
      or: {
        event_id: threadId,
      },
    });
  }

  if (memberType || existMemberType) {
    const memberValue =
      typeof memberType === 'string' ||
      (typeof memberType === 'boolean' && memberType === true) ||
      Array.isArray(memberType)
        ? !Array.isArray(memberType)
          ? [memberType]
          : memberType
        : [];

    for (const item in memberValue) if (memberValue[item] === null) memberValue[item] = 'NULL';

    const firstInsert = (value, insertDefault = true) => {
      data.where[0].member_type = { in: [] };
      if (insertDefault) secondInsert('NULL');
      secondInsert(value);
    };

    const secondInsert = (value) => {
      data.where[0].member_type.in.push(value);
    };

    if (memberValue.length < 1) {
      for (const item in MemberEventsList) {
        if (memberEventAllowed(MemberEventsList[item])) {
          if (data.where[0].member_type) {
            secondInsert(MemberEventsList[item]);
          } else {
            firstInsert(MemberEventsList[item]);
          }
        }
      }
    } else {
      for (const item in memberValue) {
        if (data.where[0].member_type) {
          secondInsert(memberValue[item]);
        } else {
          firstInsert(memberValue[item], false);
        }
      }
    }
  }
};

const dontExistTimelineTimeout =
  typeof __ENV_APP__.TIMELINE_TIMEOUT !== 'number' ||
  !Number.isFinite(__ENV_APP__.TIMELINE_TIMEOUT) ||
  Number.isNaN(__ENV_APP__.TIMELINE_TIMEOUT) ||
  __ENV_APP__.TIMELINE_TIMEOUT <= 0;

let TIMELINE_TIMEOUT_MULTI = 0;

export const waitTimelineTimeout = () =>
  new Promise((resolve) => {
    if (dontExistTimelineTimeout) resolve();
    else {
      const tinyTimeout =
        __ENV_APP__.TIMELINE_TIMEOUT +
        Number(__ENV_APP__.TIMELINE_TIMEOUT_MULTI * TIMELINE_TIMEOUT_MULTI);

      setTimeout(() => resolve(), tinyTimeout);
      TIMELINE_TIMEOUT_MULTI++;
      setTimeout(() => {
        TIMELINE_TIMEOUT_MULTI--;
        if (TIMELINE_TIMEOUT_MULTI < 0) TIMELINE_TIMEOUT_MULTI = 0;
      }, 1000);
    }
  });

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

const decryptingCache = {};
const executeDecryptAllEventsOfTimeline = async (tm, roomId) =>
  new Promise((resolve, reject) => {
    if (!Array.isArray(decryptingCache[roomId])) {
      decryptingCache[roomId] = [];
      decryptAllEventsOfTimeline(tm)
        .then((data) => {
          resolve(data);
          for (const item in decryptingCache[roomId]) {
            decryptingCache[roomId][item].resolve(data);
          }
          delete decryptingCache[roomId];
        })
        .catch((err) => {
          reject(err);
          for (const item in decryptingCache[roomId]) {
            decryptingCache[roomId][item].reject(data);
          }
          delete decryptingCache[roomId];
        });
    } else decryptingCache[roomId].push({ resolve, reject });
  });

const objWhereChecker = (join, dataCheck = {}, isClone = false) => {
  const newJson = !isClone ? clone(!Array.isArray(join) ? [join] : join) : join;
  const itemsChecker = (items) => {
    for (const item in items) {
      if (typeof items[item] === 'string') {
        for (const item2 in dataCheck)
          if (items[item].includes(`{${item2}}`))
            items[item] = items[item].replace(`{${item2}}`, dataCheck[item2]);
      } else if (objType(items[item], 'object') || Array.isArray(items[item]))
        itemsChecker(items[item], dataCheck, true);
    }
  };

  for (const index in newJson) itemsChecker(newJson[index]);
  return newJson;
};

class LocalStorageEvent extends EventEmitter {
  constructor(event) {
    super();

    this.event = event;
    this.room = initMatrix.matrixClient.getRoom(this.event.room_id);

    if (this.event.is_thread_root) this.event.thread_id = this.event.is_thread_root;

    if (this.event.primary_replace_event_id) {
      this.event.replace_to = this.event.primary_replace_to;
      this.event.replace_to_id = this.event.primary_replace_to_id;
      this.event.replace_to_ts = this.event.primary_replace_to_ts;
    }

    this.threadId =
      typeof this.event?.thread_id === 'string' && this.event?.thread_id !== 'NULL'
        ? this.event?.thread_id
        : null;

    this.status = this.event?.e_status || null;
    this.sender = this.room ? this.room.getMember(this.event.sender) : null;
    this.replyEventId = this.getWireContent()['m.relates_to']?.['m.in_reply_to']?.event_id;
    this.threadRootId = this.threadRootId();

    if (typeof this.event.primary_replace_event_id !== 'undefined')
      delete this.event.primary_replace_event_id;
    if (typeof this.event.primary_replace_room_id !== 'undefined')
      delete this.event.primary_replace_room_id;
    if (typeof this.event.primary_replace_thread_id !== 'undefined')
      delete this.event.primary_replace_thread_id;
    if (typeof this.event.primary_replace_to !== 'undefined') delete this.event.primary_replace_to;
    if (typeof this.event.primary_replace_to_id !== 'undefined')
      delete this.event.primary_replace_to_id;
    if (typeof this.event.primary_replace_to_ts !== 'undefined')
      delete this.event.primary_replace_to_ts;
    if (typeof this.event.is_thread_room_root !== 'undefined')
      delete this.event.is_thread_room_root;
    if (typeof this.event.is_thread_root !== 'undefined') delete this.event.is_thread_root;

    if (typeof this.event.member_type !== 'undefined' && this.event.member_type === 'NULL')
      delete this.event.member_type;

    this.thread = { id: this.threadId };
  }

  getMemberEventType = () => {
    return this.event.member_type || null;
  };

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
    if (unsigned && typeof unsigned[UNSIGNED_THREAD_ID_FIELD.name] === 'string') {
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
    this._dbVersion = 29;
    this._oldDbVersion = this.getNumber('ponyHouse-db-version') || 0;
    this.dbName = 'pony-house-database';
    this._timelineSyncCache = this.getJson('ponyHouse-timeline-sync', 'obj');
    this._syncTimelineCache = {
      usedIds: [],
      roomId: null,
      threadId: null,
      using: false,
      used: false,
      roomsUsed: [],
      data: [],
    };

    this._sendingEventCache = {};
    this._eventsLoadWaiting = this.getJson('ponyHouse-storage-loading', 'obj');

    this._addToTimelineCache = {};
    this._addToTimelineCache.default = { using: false, data: [] };
    this._addToTimelineCache.sync = { using: false, data: [] };

    this._editedIds = {};
    this._deletedIds = {};
    this._threadIds = {};

    this._eventDbs = [
      'reactions',
      'messages_search',
      'messages_edit',
      'crdt',
      { name: 'timeline', existMemberType: true },
      {
        name: 'messages',
        existMemberType: true,
        join: [
          {
            where: {
              room_id: '{room_id}',
            },
            type: 'left',
            with: 'threads',
            on: `threads.event_id=messages.event_id`,
            as: {
              event_id: 'is_thread_root',
              room_id: 'is_thread_room_root',
            },
          },
          {
            with: 'messages_primary_edit',
            on: `messages_primary_edit.event_id=messages.event_id`,
            type: 'left',
            where: {
              room_id: '{room_id}',
            },
            as: {
              event_id: 'primary_replace_event_id',
              room_id: 'primary_replace_room_id',
              thread_id: 'primary_replace_thread_id',
              replace_id: 'primary_replace_to_id',
              content: 'primary_replace_to',
              origin_server_ts: 'primary_replace_to_ts',
            },
          },
        ],
      },
    ];

    for (const item in this._eventDbs) {
      const data =
        typeof this._eventDbs[item] === 'string'
          ? { name: this._eventDbs[item] }
          : this._eventDbs[item];
      const nameParts = data.name.split('_');
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
        join = null,
        memberType = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._findEventIdInPagination({
          from: data.name,
          eventId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          roomId,
          type,
          limit,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}Count`] = ({
        roomId = null,
        threadId = null,
        showThreads = null,
        showRedaction = null,
        showTransaction = false,
        type = null,
        join = null,
        memberType = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsCounter({
          from: data.name,
          roomId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          type,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
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
        join = null,
        memberType = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsPaginationCount({
          from: data.name,
          roomId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          type,
          limit,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
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
        join = null,
        memberType = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsDataTemplate({
          from: data.name,
          roomId,
          threadId,
          showThreads,
          showRedaction,
          showTransaction,
          type,
          limit,
          page,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}ById`] = ({
        roomId = null,
        threadId = null,
        type = null,
        eventId = null,
        showRedaction = null,
        memberType = null,
      }) =>
        this._eventsDataTemplate({
          from: data.name,
          roomId,
          threadId,
          eventId,
          showRedaction,
          type,
          memberType,
          existMemberType: data.existMemberType,
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
    };

    for (const item in cons.supportEventTypes) {
      this._timelineInsertTypes[cons.supportEventTypes[item]] = (event) => this.setMessage(event);
    }

    window.addEventListener('storage', function (e) {
      tinyThis.emit('storage', e);
    });
  }

  convertToEventFormat(event) {
    return new LocalStorageEvent(clone(event));
  }

  resetTimelineSyncData(roomId, threadId) {
    const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;
    if (roomId && this._timelineSyncCache[valueId]) {
      delete this._timelineSyncCache[valueId];
      this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
      return true;
    } else return false;
  }

  resetAllTimelineSyncData() {
    this.removeItem('ponyHouse-timeline-sync');
    this._timelineSyncCache = {};
  }

  // Sync Timeline
  async _syncTimelineRun(
    room,
    thread,
    eventId,
    checkpoint = null,
    timeline = null,
    firstTime = false,
    singleTime = false,
  ) {
    const tinyThis = this;
    if (!singleTime) this._syncTimelineCache.roomId = null;
    const loadComplete = (roomId, threadId, checkPoint, lastEventId, isNext, err) => {
      tinyThis.warnTimeline(roomId, threadId, eventId, lastEventId, err, {
        firstTime,
        checkPoint,
        isNext,
      });

      const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;
      if (!singleTime && this._syncTimelineCache.roomsUsed.indexOf(valueId) < 0)
        this._syncTimelineCache.roomsUsed.push(valueId);

      tinyThis._sendSyncStatus();
      if (!singleTime) tinyThis._syncTimelineNext();
    };

    try {
      // Prepare data
      if (room && typeof room.roomId === 'string') {
        // Get timeline data
        const mx = initMatrix.matrixClient;
        const tm = timeline || !thread ? room.getLiveTimeline() : thread?.liveTimeline;
        await waitTimelineTimeout();

        // Decrypt time
        if (room.hasEncryptionStateEvent())
          await executeDecryptAllEventsOfTimeline(tm, room.roomId);

        // Get room data
        const roomId = room.roomId;
        const threadId = thread ? thread?.id : null;
        const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;

        // Insert sync data
        if (!singleTime) {
          this._syncTimelineCache.roomId = roomId;
          this._syncTimelineCache.threadId = threadId;
        }
        this._sendSyncStatus();

        // Get checkpoint
        const lastEventId =
          objType(this._timelineSyncCache[valueId], 'object') &&
          typeof this._timelineSyncCache[valueId].lastEvent === 'string' &&
          this._timelineSyncCache[valueId].lastEvent.length > 0
            ? this._timelineSyncCache[valueId].lastEvent
            : null;

        const checkPoint =
          !timeline && typeof checkpoint === 'string' && checkpoint.length > 0
            ? checkpoint
            : lastEventId;

        const isComplete =
          this._timelineSyncCache[valueId] &&
          typeof this._timelineSyncCache[valueId].isComplete === 'boolean'
            ? this._timelineSyncCache[valueId].isComplete
            : false;

        // Needs add data
        if (!isComplete) {
          const events = tm.getEvents();
          if (Array.isArray(events) && events.length > 0) {
            let lastTimelineEventId = null;

            console.log(`[room-db-sync] [${valueId}] Adding new events...`);
            for (const item in events) {
              const eventIdp = events[item].getId();
              if (this._syncTimelineCache.usedIds.indexOf(eventIdp) < 0) {
                if (!singleTime) this._syncTimelineCache.usedIds.push(eventIdp);
                this.addToTimeline(events[item], 'sync');
                lastTimelineEventId = eventIdp;
              }
            }

            await this.waitAddTimeline('sync');
            console.log(`[room-db-sync] [${valueId}] New events added!`);

            if (!singleTime && lastTimelineEventId) {
              this._timelineSyncCache[valueId] = {
                lastEvent: lastTimelineEventId,
                isComplete: false,
              };
              this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
            }
          } else console.log(`[room-db-sync] [${valueId}] No data found to save.`);
        } else
          console.log(`[room-db-sync] [${valueId}] Data load complete! Skipping data saving...`);

        // Next Timeline
        if (!singleTime) {
          const nextTimelineToken = tm.getPaginationToken(Direction.Backward);
          if (!isComplete && nextTimelineToken) {
            console.log(`[room-db-sync] [${valueId}] Preparing next step...`);
            this._syncTimelineCache.used = true;
            // Next checkpoint
            if (!checkPoint || !firstTime) {
              // Validator
              if (lastEventId !== this._timelineSyncCache[valueId].lastEvent) {
                // Next page
                await waitTimelineTimeout();
                await mx.paginateEventTimeline(tm, {
                  backwards: Direction.Forward,
                  limit: SYNC_TIMELINE_DOWNLOAD_LIMIT,
                });

                console.log(
                  `[room-db-sync] [${valueId}] Next data!`,
                  this._timelineSyncCache[valueId].lastEvent,
                );

                this._syncTimelineCache.data.push({
                  eventId,
                  roomId,
                  threadId,
                  thread,
                  room,
                  checkpoint: null,
                  timeline: tm,
                });
                loadComplete(roomId, threadId, checkPoint, lastEventId, true);
              }

              // Complete
              else {
                console.log(`[room-db-sync] [${roomId}] Complete!`);
                loadComplete(roomId, threadId, checkPoint, lastEventId, false);
              }
            }

            // Next event id
            else if (lastEventId !== this._timelineSyncCache[valueId].lastEvent) {
              await waitTimelineTimeout();
              const eTimeline = await mx.getEventTimeline(
                !thread ? room.getUnfilteredTimelineSet() : thread.getUnfilteredTimelineSet(),
                checkPoint,
              );
              console.log(`[room-db-sync] [${valueId}] Next data by event id!`, checkPoint);

              this._syncTimelineCache.data.push({
                roomId,
                thread,
                threadId,
                room,
                checkpoint: null,
                timeline: eTimeline,
                eventId,
              });
              loadComplete(roomId, threadId, checkPoint, lastEventId, true);
            }

            // Complete
            else {
              console.log(`[room-db-sync] [${valueId}] Complete!`);
              loadComplete(roomId, threadId, checkPoint, lastEventId, false);
            }
          } else {
            console.log(`[room-db-sync] [${valueId}] Complete!`);
            loadComplete(roomId, threadId, checkPoint, lastEventId, false);
          }
        } else {
          console.log(`[room-db-sync] [${valueId}] Single Complete!`);
          loadComplete(roomId, threadId, checkPoint, lastEventId, false);
        }
      }

      // Error
      else throw new Error(`[room-db-sync] No room found to sync in the indexedDb!`);
    } catch (err) {
      console.error(err);
      loadComplete(null, null, null, null, false, err);
    }
  }

  // Reset timeline cache
  _resetTimelineCache() {
    this._syncTimelineCache.usedIds = [];
    this._syncTimelineCache.roomsUsed = [];
    this._syncTimelineCache.using = false;
    this._syncTimelineCache.used = false;
    this._syncTimelineCache.roomId = null;
    this._syncTimelineCache.threadId = null;
    this._sendSyncStatus();
  }

  // Next timeline
  _syncTimelineNext() {
    // Get next timeline data
    if (this._syncTimelineCache.data.length > 0) {
      const data = this._syncTimelineCache.data.shift();
      const tinyThis = this;
      // Let's go
      waitTimelineTimeout().then(() =>
        tinyThis._syncTimelineRun(
          data.room,
          data.thread,
          data.eventId,
          data.checkpoint,
          data.timeline,
          data.firstTime,
        ),
      );
    }
    // Progress complete
    else {
      console.log(`[room-db-sync] All complete!`);
      // Used timeline progress
      if (this._syncTimelineCache.used) {
        const tinyRoomsUsed = clone(this._syncTimelineCache.roomsUsed);

        // Complete!
        for (const item in tinyRoomsUsed) {
          const usedRoom = tinyRoomsUsed[item];
          if (this._timelineSyncCache[usedRoom]) {
            this._timelineSyncCache[usedRoom].isComplete = true;
            this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
          }

          console.log(`[room-db-sync] Database checker complete!`);
        }
      }

      // Reset
      this._resetTimelineCache();
    }
  }

  _syncTimeline(room, thread, eventId, checkpoint = null, timeline = null) {
    if (room && typeof room.roomId === 'string') {
      if (this._syncTimelineCache.using) {
        const isSingleTime = this._syncTimelineCache.data.find((item) =>
          item.roomId === room.roomId && (!thread || item.threadId === thread.id) ? true : false,
        );

        if (!isSingleTime)
          this._syncTimelineCache.data.unshift({
            thread,
            roomId: room.roomId,
            threadId: thread ? thread.id : null,
            eventId,
            room,
            checkpoint,
            timeline,
            firstTime: true,
          });

        this._sendSyncStatus();
        this._syncTimelineRun(room, thread, eventId, checkpoint, timeline, true, isSingleTime);
      } else {
        this._syncTimelineCache.using = true;
        this._syncTimelineRun(room, thread, eventId, checkpoint, timeline, true);
      }
    }
  }

  _sendSyncStatus() {
    this.emit('timelineSyncStatus', this._syncTimelineCache);
  }

  getSyncStatus() {
    return this._syncTimelineCache;
  }

  isRoomSyncing(roomId, threadId) {
    if (this._syncTimelineCache.using) {
      if (!threadId)
        return (
          this._syncTimelineCache.roomsUsed.indexOf(roomId) > -1 ||
          this._syncTimelineCache.roomId === roomId
        );
      else
        return (
          this._syncTimelineCache.roomsUsed.indexOf(`${roomId}:${threadId}`) > -1 ||
          (this._syncTimelineCache.roomId === roomId &&
            this._syncTimelineCache.threadId === threadId)
        );
    }

    return false;
  }

  syncTimeline(roomId, threadId, eventId, checkpoint = null) {
    const room = initMatrix.matrixClient.getRoom(roomId);
    const thread = threadId && room ? room.getThread(threadId) : null;
    this._syncTimeline(room, thread, eventId, checkpoint);
  }

  warnTimeline(
    roomId,
    threadId,
    eventId,
    lastEventId = null,
    err = null,
    data = {
      firstTime: false,
      checkPoint: null,
      isNext: false,
    },
  ) {
    const tinyData = clone(data);

    tinyData.roomId = roomId;
    tinyData.threadId = threadId;
    tinyData.lastEventId = lastEventId;
    tinyData.err = err;

    this.emit('dbTimelineLoaded', tinyData, eventId);
    if (typeof eventId === 'string')
      this.emit(`dbTimelineLoaded-${roomId}${threadId ? `-${threadId}` : ''}-${eventId}`, tinyData);
    this.emit(`dbTimelineLoaded-${roomId}${threadId ? `-${threadId}` : ''}`, tinyData, eventId);
  }

  async deleteRoomDb(roomId) {
    const where = { room_id: roomId };

    let index = this._syncTimelineCache.data.findIndex((item) => item.roomId === roomId);
    while (index > -1) {
      this._syncTimelineCache.data.splice(index, 1);
      index = this._syncTimelineCache.data.findIndex((item) => item.roomId === roomId);
    }

    const timeline = await this.storeConnection.remove({ from: 'timeline', where });
    await waitTimelineTimeout();
    const messages = await this.storeConnection.remove({ from: 'messages', where });
    await waitTimelineTimeout();
    const crdt = await this.storeConnection.remove({ from: 'crdt', where });
    await waitTimelineTimeout();
    const reactions = await this.storeConnection.remove({ from: 'reactions', where });
    await waitTimelineTimeout();
    const members = await this.storeConnection.remove({ from: 'members', where });
    await waitTimelineTimeout();
    const messagesEdit = await this.storeConnection.remove({ from: 'messages_edit', where });
    await waitTimelineTimeout();
    const messagesSearch = await this.storeConnection.remove({ from: 'messages_search', where });
    await waitTimelineTimeout();
    const receipt = await this.deleteReceiptByRoomId(roomId);

    return {
      crdt,
      timeline,
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

  _eventFilter(event, data = {}, extraValue = null) {
    const date = event.getDate();
    const threadId = this._getEventThreadId(event);
    const isRedacted = event.isRedacted() ? true : false;

    data.event_id = event.getId();
    data.state_key = event.getStateKey();
    data.is_transaction = data.event_id.startsWith('~') ? true : false;
    data.e_status = event.status;

    data.type = event.getType();
    data.member_type = getMemberEventType(event);
    if (typeof data.member_type !== 'string' || data.member_type.length < 1)
      data.member_type = 'NULL';

    data.sender = event.getSender();
    data.room_id = event.getRoomId();
    data.content = clone(event.getContent());
    data.unsigned = clone(event.getUnsigned());
    data.redaction =
      typeof isRedacted === 'boolean'
        ? isRedacted
        : typeof this._deletedIds[data.event_id] === 'boolean'
          ? this._deletedIds[data.event_id]
          : false;

    if (typeof threadId === 'string' && threadId !== data.event_id) data.thread_id = threadId;
    else data.thread_id = 'NULL';

    if (date) data.origin_server_ts = date.getTime();

    if (typeof data.age !== 'number') delete data.age;
    if (typeof data.type !== 'string') delete data.type;
    if (typeof data.sender !== 'string') delete data.sender;
    if (typeof data.room_id !== 'string') delete data.room_id;
    if (typeof data.state_key !== 'string') delete data.state_key;

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

        data.avatar_url = content.avatar_url;
        data.display_name = content.displayname;

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
                  waitTimelineTimeout().then(() => resolve(result));
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

  _setDataTemplate = (dbName, dbEvent, event, extraValue = null) => {
    const tinyThis = this;
    const data = tinyThis._eventFilter(event, {}, extraValue);
    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .insert({
          into: dbName,
          upsert: true,
          values: [data],
        })
        .then((result) => {
          tinyThis.emit(dbEvent, result, tinyThis.convertToEventFormat(data));
          waitTimelineTimeout().then(() => resolve(result));
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
          waitTimelineTimeout().then(() => resolve(result));
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
    memberType = null,
    existMemberType = false,
    customWhere = null,
    join = null,
  }) {
    const data = { from };
    data.where = { room_id: roomId };
    data.order = { type: 'desc', by: `${join ? `${from}.` : ''}${orderBy}` };
    if (join) data.join = objWhereChecker(join, { room_id: roomId });

    insertObjWhere(data, 'content', content);
    insertObjWhere(data, 'unsigned', unsigned);
    addCustomSearch(data.where, customWhere);

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

      finishWhereDbPrepare(memberType, threadId, data, existMemberType);
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
      finishWhereDbPrepare(memberType, threadId, data, existMemberType);
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
    memberType,
    existMemberType = false,
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

    if (join) data.join = objWhereChecker(join, { room_id: roomId });
    insertObjWhere(data, 'content', content);
    insertObjWhere(data, 'unsigned', unsigned);
    addCustomSearch(data.where, customWhere);
    if (typeof type === 'string') data.where.type = type;

    finishWhereDbPrepare(memberType, threadId, data, existMemberType);
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
    memberType = null,
    existMemberType = false,
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
      memberType,
      existMemberType,
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
    memberType,
    existMemberType = false,
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
      memberType,
      existMemberType,
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
        memberType,
        existMemberType,
        customWhere,
        join,
      });

      if (Array.isArray(items)) {
        for (const item in items) {
          if (items[item].event[valueName] === eventId) {
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

  async setMessageEdit(event) {
    const msgRelative = event.getRelation();
    const replaceTs = event.getTs();

    if (
      msgRelative &&
      (!this._editedIds[msgRelative.event_id] ||
        replaceTs > this._editedIds[msgRelative.event_id].replace_to_ts)
    ) {
      await this.storeConnection.insert({
        into: 'messages_primary_edit',
        upsert: true,
        values: [
          {
            replace_id: msgRelative.event_id,
            event_id: event.getId(),
            room_id: event.getRoomId(),
            thread_id: event.getThread()?.id,
            content: event.getContent(),
            origin_server_ts: replaceTs,
          },
        ],
      });

      this._editedIds[msgRelative.event_id] = {
        replace_to_ts: replaceTs,
        replace_to_id: event.getId(),
        replace_to: event.getContent(),
      };
    }

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
          waitTimelineTimeout().then(() => resolve(result));
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
          waitTimelineTimeout().then(() => resolve(result));
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
      new Promise((resolve, reject) => {
        const eventId = event.getId();
        const extraAdd = {};

        if (tinyThis._editedIds[eventId]) {
          extraAdd.replace_to_ts = tinyThis._editedIds[eventId].replace_to_ts;
          extraAdd.replace_to_id = tinyThis._editedIds[eventId].replace_to_id;
          extraAdd.replace_to = tinyThis._editedIds[eventId].replace_to;
        }

        tinyThis
          ._setDataTemplate('messages', 'dbMessage', event, extraAdd)
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
                waitTimelineTimeout().then(() => resolve(result));
              })
              .catch(reject);
          })
          .catch(reject);
      });

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
                  waitTimelineTimeout().then(() => resolve(result));
                })
                .catch(reject);
            } else waitTimelineTimeout().then(() => resolve(result));
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
      tinyThis._threadIds[threadId] = true;
      if (typeof threadId === 'string') {
        const data = {
          event_id: threadId,
          room_id: event.getRoomId(),
        };
        tinyThis.storeConnection
          .insert({
            into: 'threads',
            upsert: true,
            values: [data],
          })
          .then((result) => {
            tinyThis.emit('dbThreads', result, tinyThis.convertToEventFormat(data));
            waitTimelineTimeout().then(() => resolve(result));
          })
          .catch(reject);
      } else resolve(null);
    });
  }

  _setRedaction(eventId, dbName, isRedacted = false) {
    const tinyThis = this;
    this._deletedIds[eventId] = isRedacted;
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
          waitTimelineTimeout().then(() => resolve(noOfRowsUpdated));
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
          await this._setRedaction(content.redacts, getTableName(this._eventDbs[dbIndex]), true);
        // String
        else if (Array.isArray(content.redacts)) {
          for (const item in content.redacts) {
            if (typeof content.redacts[item] === 'string')
              await this._setRedaction(
                content.redacts[item],
                getTableName(this._eventDbs[dbIndex]),
                true,
              );
          }
        }

        // Transaction Id
        if (unsigned && typeof unsigned.transaction_id === 'string')
          await this._setRedaction(
            `~${event.getRoomId()}:${unsigned.transaction_id}`,
            getTableName(this._eventDbs[dbIndex]),
            true,
          );
      }
    }
  }

  _addToTimelineRun(event, resolve, reject, where) {
    const tinyThis = this;
    const tinyReject = (err) => {
      console.error('[indexed-db] ERROR SAVING TIMELINE DATA!');
      console.error(err);
      tinyThis.emit('dbTimeline-Error', err);
      tinyThis._addToTimeline(where);
      reject(err);
    };

    const tinyComplete = async (result) => {
      await tinyThis._setIsThread(event);
      tinyThis._addToTimeline(where);
      resolve(result);
    };

    const eventType = event.getType();
    if (typeof this._timelineInsertTypes[eventType] === 'function')
      this._timelineInsertTypes[eventType](event)
        .then(async (tinyData) => {
          if (eventType === 'm.room.member') await tinyThis.setMember(event);
          tinyComplete(tinyData);
        })
        .catch(tinyReject);
    else {
      this.setTimeline(event)
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
  }

  _addToTimeline(where) {
    if (this._addToTimelineCache[where].data.length > 0) {
      const eventData = this._addToTimelineCache[where].data.shift();
      this._addToTimelineRun(eventData.event, eventData.resolve, eventData.reject, eventData.where);
      if (this._addToTimelineCache[where].data.length < __ENV_APP__.TIMELINE_EVENTS_PER_TIME)
        this._addToTimeline(where);
    } else {
      this._addToTimelineCache[where].using = false;
    }
  }

  // Timeout waiter script
  waitAddTimeline(where) {
    const tinyThis = this;
    return new Promise((resolve) => {
      const tinyWaitTime = () => {
        if (!tinyThis._addToTimelineCache[where].using) resolve();
        else setTimeout(tinyWaitTime, 200);
      };
      tinyWaitTime();
    });
  }

  // Add to timeline
  async addToTimeline(event, where = 'default') {
    const tinyThis = this;

    // Get data
    const eventId = event.getId();
    const roomId = event.getRoomId();
    const eventSnap = event.toSnapshot();

    // Prepare sync cache
    if (!Array.isArray(tinyThis._eventsLoadWaiting[roomId]))
      tinyThis._eventsLoadWaiting[roomId] = [];

    if (tinyThis._eventsLoadWaiting[roomId].indexOf(eventId) < 0)
      tinyThis._eventsLoadWaiting[roomId].push(eventId);

    tinyThis.setJson('ponyHouse-storage-loading', tinyThis._eventsLoadWaiting);

    // Return sync function
    return new Promise((resolve, reject) => {
      // Remove cache
      const tinyComplete = () => {
        if (Array.isArray(tinyThis._eventsLoadWaiting[roomId])) {
          const index = tinyThis._eventsLoadWaiting[roomId].indexOf(eventId);
          if (index > -1) tinyThis._eventsLoadWaiting[roomId].splice(index, 1);

          if (tinyThis._eventsLoadWaiting[roomId].length < 1)
            delete tinyThis._eventsLoadWaiting[roomId];
        }

        tinyThis.setJson('ponyHouse-storage-loading', tinyThis._eventsLoadWaiting);
      };

      // Resolve and reject functions
      const tinyReject = (err) => {
        tinyComplete();
        reject(err);
      };

      const tinyResolve = (data) => {
        tinyComplete();
        resolve(data);
      };

      // Performance correction
      if (
        !tinyThis._addToTimelineCache[where].using ||
        tinyThis._addToTimelineCache[where].data.length < __ENV_APP__.TIMELINE_EVENTS_PER_TIME
      ) {
        tinyThis._addToTimelineCache[where].using = true;
        tinyThis._addToTimelineRun(eventSnap, tinyResolve, tinyReject, where);
      } else {
        tinyThis._addToTimelineCache[where].data.push({
          event: eventSnap,
          resolve: tinyResolve,
          reject: tinyReject,
          where,
        });
      }
    });
  }

  async _syncSendEvent(eventId, roomId, threadId, key) {
    const mx = initMatrix.matrixClient;
    const room = mx.getRoom(roomId);
    if (room) {
      const mEvent = room.getEventForTxnId(key);
      if (mEvent) this.addToTimeline(mEvent);
      this._syncDeleteSendEvent(roomId, threadId, key, 'dbEventCacheReady', 'SENT');
    }
  }

  _syncDeleteSendEvent(roomId, threadId, key, emitName, emitData) {
    if (this._sendingEventCache[key]) {
      this.emit(
        emitName,
        {
          roomId,
          threadId,
          key,
        },
        this._sendingEventCache[key],
      );
      this._sendingEventCache[key].status = emitData;
      this._sendingEventCache[key].event.e_status = emitData;
      this._sendingEventCache[key].emit(MatrixEventEvent.Status, emitData);
      delete this._sendingEventCache[key];
    }
  }

  _syncPrepareSendEvent(roomId, threadId, key, eventName, content) {
    this._sendingEventCache[key] = this.convertToEventFormat({
      room_id: roomId,
      thread_id: threadId,
      e_status: 'sending',
      event_id: key,
      type: eventName,
      content,
      origin_server_ts: new Date().getTime(),
      unsigned: {},
      redaction: false,
      sender: initMatrix.matrixClient.getUserId(),
    });
    this.emit(
      'dbEventCachePreparing',
      {
        roomId,
        threadId,
        key,
        eventName,
      },
      this._sendingEventCache[key],
    );
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
      const tinyError = (err) => {
        tinyThis._syncDeleteSendEvent(roomId, null, key, 'dbEventCacheError', 'CANCELLED');
        reject(err);
      };

      tinyThis._syncPrepareSendEvent(roomId, null, key, eventName, content);
      initMatrix.matrixClient
        .sendEvent(roomId, eventName, content, key)
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, undefined, key)
            .then(() => resolve(msgData))
            .catch(tinyError),
        )
        .catch(tinyError);
    });
  }

  sendEventThread(roomId, threadId, eventName, content) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      const tinyError = (err) => {
        tinyThis._syncDeleteSendEvent(roomId, threadId, key, 'dbEventCacheError', 'CANCELLED');
        reject(err);
      };

      tinyThis._syncPrepareSendEvent(roomId, threadId, key, eventName, content);
      initMatrix.matrixClient
        .sendEvent(roomId, threadId, eventName, content, key)
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, threadId, key)
            .then(() => resolve(msgData))
            .catch(tinyError),
        )
        .catch(tinyError);
    });
  }

  sendMessage(roomId, content, isEdit = false) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      const tinyError = (err) => {
        if (!isEdit)
          tinyThis._syncDeleteSendEvent(roomId, null, key, 'dbEventCacheError', 'CANCELLED');
        reject(err);
      };

      if (!isEdit) tinyThis._syncPrepareSendEvent(roomId, null, key, 'm.room.message', content);
      initMatrix.matrixClient
        .sendMessage(roomId, content, key)
        .then((msgData) => {
          if (!isEdit)
            tinyThis
              ._syncSendEvent(msgData?.event_id, roomId, undefined, key)
              .then(() => resolve(msgData))
              .catch(tinyError);
          else resolve(msgData);
        })
        .catch(tinyError);
    });
  }

  sendMessageThread(roomId, threadId, content, isEdit = false) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      const tinyError = (err) => {
        if (!isEdit)
          tinyThis._syncDeleteSendEvent(roomId, threadId, key, 'dbEventCacheError', 'CANCELLED');
        reject(err);
      };

      if (!isEdit) tinyThis._syncPrepareSendEvent(roomId, threadId, key, 'm.room.message', content);
      initMatrix.matrixClient
        .sendMessage(roomId, threadId, content, key)
        .then((msgData) => {
          if (!isEdit)
            tinyThis
              ._syncSendEvent(msgData?.event_id, roomId, threadId, key)
              .then(() => resolve(msgData))
              .catch(tinyError);
          else resolve(msgData);
        })
        .catch(tinyError);
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
