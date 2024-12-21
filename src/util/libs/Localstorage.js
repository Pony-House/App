import EventEmitter from 'events';
import {
  Direction,
  UNSIGNED_THREAD_ID_FIELD,
  THREAD_RELATION_TYPE,
  EventType,
  MatrixEventEvent,
  EventTimeline,
  MatrixEvent,
} from 'matrix-js-sdk';
import clone from 'clone';
import { generateApiKey } from 'generate-api-key';

import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import { decryptAllEventsOfTimeline } from '@src/client/state/Timeline/functions';
import cons from '@src/client/state/cons';
import { memberEventAllowed, MemberEventsList } from '@src/app/organisms/room/MemberEvents';

import { toTitleCase } from '../tools';
import TinyDbManager from './db/manager';

const genKey = () => generateApiKey().replace(/\~/g, 'pud');
const SYNC_TIMELINE_DOWNLOAD_LIMIT = 100;

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

    if (this.event.is_thread_root) {
      this.event.thread_id = this.event.is_thread_root;
      this.isThreadRoot = true;
    } else this.isThreadRoot = false;

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
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
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

    this._syncTimelineCache = {
      usedIds: [],
      roomId: null,
      threadId: null,
      using: false,
      used: false,
      usedLastTm: false,
      roomsUsed: [],
      roomsIdsUsed: [],
      usedTmLastEvent: [],
      usingTmLastEvent: [],
      data: [],
    };

    this._timelineSyncCache = this.getJson('ponyHouse-timeline-sync', 'obj');
    this._lastTimelineSyncCache = clone(this._timelineSyncCache) || {};
    console.log(`[room-db-sync] [sync] Data loaded!`, this._lastTimelineSyncCache);

    this._sendingEventCache = {};
    this._eventsLoadWaiting = this.getJson('ponyHouse-storage-loading', 'obj');
    this._lastEventsLoadWaiting = clone(this._eventsLoadWaiting) || {};
    this._eventsLoadWaitingUsing = {};

    console.log(`[room-db-sync] [re-add] Data loaded!`, this._lastEventsLoadWaiting);

    this._addToTimelineCache = {};
    this._addToTimelineCache.default = { using: false, data: [] };
    this._addToTimelineCache.sync = { using: false, data: [] };

    this.dbManager = new TinyDbManager();
    this.dbManager.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.dbManager.setTimelineTimeout(waitTimelineTimeout);

    for (const item in this.dbManager._eventDbs) {
      const data =
        typeof this.dbManager._eventDbs[item] === 'string'
          ? { name: this.dbManager._eventDbs[item] }
          : this.dbManager._eventDbs[item];
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

      this.dbManager.on('dbMessageUpdate', (r, mEvent) =>
        tinyThis.emit('dbMessageUpdate', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbThreads', (r, mEvent) =>
        tinyThis.emit('dbThreads', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbMessageEdit', (r, mEvent) =>
        tinyThis.emit('dbMessageEdit', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbMessage', (r, mEvent) =>
        tinyThis.emit('dbMessage', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbCrdt', (r, mEvent) =>
        tinyThis.emit('dbCrdt', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbReaction', (r, mEvent) =>
        tinyThis.emit('dbReaction', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbTimeline', (r, mEvent) =>
        tinyThis.emit('dbTimeline', r, tinyThis.convertToEventFormat(mEvent)),
      );

      this.dbManager.on('dbMember', (r, mEvent) => tinyThis.emit('dbMember', r, mEvent));
      this.dbManager.on('dbReceipt', (r, mEvent) => tinyThis.emit('dbReceipt', r, mEvent));
      this.dbManager.on('dbMessageSearch', (r, mEvent) =>
        tinyThis.emit('dbMessageSearch', r, mEvent),
      );

      this.dbManager.on('dbMessageEditDeleted', (r, mEvent) =>
        tinyThis.emit('dbMessageEditDeleted', r, mEvent),
      );
      this.dbManager.on('dbMessageDeleted', (r, mEvent) =>
        tinyThis.emit('dbMessageDeleted', r, mEvent),
      );
      this.dbManager.on('dbCrdtDeleted', (r, mEvent) => tinyThis.emit('dbCrdtDeleted', r, mEvent));
      this.dbManager.on('dbReactionDeleted', (r, mEvent) =>
        tinyThis.emit('dbReactionDeleted', r, mEvent),
      );
      this.dbManager.on('dbTimelineDeleted', (r, mEvent) =>
        tinyThis.emit('dbTimelineDeleted', r, mEvent),
      );

      this.dbManager.on('dbReceiptDeleted', (event) => tinyThis.emit('dbReceiptDeleted', event));
      this.dbManager.on('dbEventRedaction', (reaction) =>
        tinyThis.emit('dbEventRedaction', reaction),
      );
      this.dbManager.on('isDbCreated', (isDbCreated) => tinyThis.emit('isDbCreated', isDbCreated));
    }

    // Get Content
    this.content = this.getJson('ponyHouse-storage-manager', 'obj');
    this.content.isPersistedLocal =
      typeof this.content.isPersistedLocal === 'boolean' ? this.content.isPersistedLocal : true;

    // Timeline Inserts
    const tinyThis = this;
    this._timelineInsertTypes = {
      'pony.house.crdt': (event) => tinyThis.dbManager.setCrdt(event),
      'm.reaction': (event) => tinyThis.dbManager.setReaction(event),
    };

    for (const item in cons.supportEventTypes) {
      this._timelineInsertTypes[cons.supportEventTypes[item]] = (event) =>
        this.dbManager.setMessage(event);
    }

    window.addEventListener('storage', function (e) {
      tinyThis.emit('storage', e);
    });
  }

  setReceipt(roomId, userId, ts) {
    return this.dbManager.setReceipt(roomId, userId, ts);
  }

  startPonyHouseDb() {
    return this.dbManager.startPonyHouseDb();
  }

  convertToEventFormat(event) {
    return new LocalStorageEvent(clone(event));
  }

  setTmLastEvent(event) {
    const roomId = event.getRoomId();
    const thread = event.getThread();
    const threadId = thread ? thread.id : null || null;
    const eventId = event.getId();
    const ts = event.getTs();

    if (typeof roomId === 'string') {
      const valueId = `${roomId}${typeof threadId === 'string' ? `:${threadId}` : ''}`;
      if (!this._lastTimelineSyncCache[valueId]) {
        if (!this._timelineSyncCache[valueId]) this._timelineSyncCache[valueId] = {};
        if (typeof this._timelineSyncCache[valueId].isComplete !== 'boolean')
          this._timelineSyncCache[valueId].isComplete = false;

        if (
          typeof ts === 'number' &&
          (!objType(this._timelineSyncCache[valueId].tmLastEvent, 'object') ||
            typeof this._timelineSyncCache[valueId].tmLastEvent.ts !== 'number' ||
            ts > this._timelineSyncCache[valueId].tmLastEvent.ts)
        ) {
          this._timelineSyncCache[valueId].tmLastEvent = { id: eventId, ts };
          return this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
        }
      }
      return null;
    }
    throw new Error('Invalid room id');
  }

  resetTimelineSyncData(roomId, threadId) {
    if (roomId) {
      let deleteUsed = false;
      const deleteTinyData = (valueId) => {
        if (this._timelineSyncCache[valueId]) {
          delete this._timelineSyncCache[valueId];
          deleteUsed = true;
        }

        if (this._eventsLoadWaiting[valueId]) {
          delete this._eventsLoadWaiting[valueId];
          deleteUsed = true;
        }

        if (this._lastEventsLoadWaiting[valueId]) delete this._lastEventsLoadWaiting[valueId];
      };

      if (typeof threadId !== 'boolean' || !threadId)
        deleteTinyData(`${roomId}${typeof threadId === 'string' ? `:${threadId}` : ''}`);
      else {
        deleteTinyData(roomId);
        for (const item in this._timelineSyncCache) {
          if (item.startsWith(`${roomId}:`)) deleteTinyData(item);
        }

        for (const item in this._eventsLoadWaiting) {
          if (item.startsWith(`${roomId}:`)) deleteTinyData(item);
        }
      }

      if (deleteUsed) {
        this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
        return true;
      }
    }
    return false;
  }

  resetAllTimelineSyncData() {
    this.removeItem('ponyHouse-timeline-sync');
    this._timelineSyncCache = {};
    this.removeItem('ponyHouse-storage-loading');
    this._eventsLoadWaiting = {};
    this._lastEventsLoadWaiting = {};
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
      if (err) {
        console.error(err);
        alert(err.message, 'Timeline sync error!');
        tinyThis._resetTimelineCache();
        return;
      }

      tinyThis.warnTimeline(roomId, threadId, eventId, lastEventId, {
        firstTime,
        checkPoint,
        isNext,
      });

      const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;
      if (!singleTime && tinyThis._syncTimelineCache.roomsUsed.indexOf(valueId) < 0)
        tinyThis._syncTimelineCache.roomsUsed.push(valueId);

      if (
        !singleTime &&
        !tinyThis._syncTimelineCache.roomsIdsUsed.find(
          (tItem) =>
            tItem.roomId === roomId && (!threadId ? !tItem.threadId : threadId === tItem.threadId),
        )
      ) {
        const newTinyData = { roomId };
        if (threadId) newTinyData.threadId = threadId;
        tinyThis._syncTimelineCache.roomsIdsUsed.push(newTinyData);
      }

      tinyThis._sendSyncStatus();
      if (!singleTime) tinyThis._syncTimelineNext();
    };

    try {
      // Prepare data
      if (room && typeof room.roomId === 'string') {
        // Get timeline data
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

        // Is complete?
        const isComplete =
          this._timelineSyncCache[valueId] &&
          typeof this._timelineSyncCache[valueId].isComplete === 'boolean'
            ? this._timelineSyncCache[valueId].isComplete
            : false;

        // Run normal script
        await tinyThis.waitAddTimeline('sync');

        console.log(
          `[room-db-sync] [${valueId}] [re-add] Reading data...`,
          this._lastEventsLoadWaiting[valueId],
        );
        if (
          Array.isArray(this._lastEventsLoadWaiting[valueId]) &&
          this._lastEventsLoadWaiting[valueId].length > 0
        ) {
          console.log(`[room-db-sync] [${valueId}] [re-add] Re-add progress detected!`);
          this.syncTimelineRecoverEvent(room, threadId, tm);
        }
        await this._syncTimelineRunning(
          firstTime,
          room,
          thread,
          eventId,
          checkpoint,
          timeline,
          singleTime,
          roomId,
          threadId,
          valueId,
          tm,
          isComplete,
          loadComplete,
        );
      }

      // Error
      else throw new Error(`[room-db-sync] No room found to sync in the indexedDb!`);
    } catch (err) {
      console.error(err);
      loadComplete(null, null, null, null, false, err);
    }
  }

  async syncTimelineRecoverEvent(room, threadId, tm) {
    // Matrix Client
    const roomId = room.roomId;
    const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;
    const mx = initMatrix.matrixClient;
    const checkTinyArray = () =>
      this._eventsLoadWaitingUsing[valueId] &&
      Array.isArray(this._lastEventsLoadWaiting[valueId]) &&
      this._lastEventsLoadWaiting[valueId].length > 0;

    if (!this._eventsLoadWaitingUsing[valueId]) {
      console.log(`[room-db-sync] [${valueId}] [re-add] Preparing to re-add events...`);
      this._eventsLoadWaitingUsing[valueId] = true;
      if (checkTinyArray()) {
        try {
          // Start events
          const eTimeline = tm.fork(EventTimeline.FORWARDS);

          const newEvents = [];
          const oldEvents = tm.getEvents();
          for (const item in oldEvents) newEvents.push(oldEvents[item]);
          eTimeline.initialiseState(newEvents);

          // Start data insert
          await this.waitAddTimeline('sync');
          if (checkTinyArray()) {
            console.log(`[room-db-sync] [${valueId}] [re-add] Preparing a little more...`);
            await this.waitAddTimeline('sync');
            if (checkTinyArray()) {
              console.log(`[room-db-sync] [${valueId}] [re-add] Preparing readding id...`);
              console.log(`[room-db-sync] [${valueId}] [re-add]`, eTimeline);
              // Insert new events
              if (checkTinyArray()) {
                for (const item in this._lastEventsLoadWaiting[valueId]) {
                  if (
                    !newEvents.find(
                      (event) =>
                        event.getId() === this._lastEventsLoadWaiting[valueId][item].event_id,
                    )
                  ) {
                    const iEvent = await mx.fetchRoomEvent(
                      roomId,
                      this._lastEventsLoadWaiting[valueId][item],
                    );

                    if (iEvent) eTimeline.addEvent(new MatrixEvent(iEvent));
                  }
                }

                if (room.hasEncryptionStateEvent())
                  await executeDecryptAllEventsOfTimeline(eTimeline, room.roomId);

                const events = eTimeline.getEvents();
                console.log(`[room-db-sync] [${valueId}] [re-add] Readding new events...`, events);
                if (checkTinyArray()) {
                  for (const item in events) {
                    const eventIdp = events[item].getId();
                    if (this._lastEventsLoadWaiting[valueId].indexOf(eventIdp) > -1) {
                      this.addToTimeline(events[item], 'sync');
                    }
                  }

                  delete this._eventsLoadWaiting[valueId];
                  delete this._lastEventsLoadWaiting[valueId];
                  this.setJson('ponyHouse-storage-loading', this._eventsLoadWaiting);

                  await this.waitAddTimeline('sync');
                  console.log(`[room-db-sync] [${valueId}] [re-add] New events readded!`);
                }
              }
            }
          }
        } catch (err) {
          console.error(err);
          alert(err.message, 'Timeline Recover event failed');
        }
      }
      if (typeof this._eventsLoadWaitingUsing[valueId] !== 'undefined')
        delete this._eventsLoadWaitingUsing[valueId];
    }
  }

  async _requestTimelineToken(roomId, paginationToken) {
    const result = await initMatrix.matrixClient.http.authedRequest(
      'GET',
      `/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        from: paginationToken,
        dir: Direction.Forward,
        limit: SYNC_TIMELINE_DOWNLOAD_LIMIT,
      },
    );

    const chuck = result.chunk;
    return chuck;
  }

  async _syncTimelineRunning(
    firstTime,
    room,
    thread,
    eventId,
    checkpoint,
    timeline,
    singleTime,
    roomId,
    threadId,
    valueId,
    tm,
    isComplete,
    loadComplete,
  ) {
    // Matrix client
    const tinyThis = this;
    const mx = initMatrix.matrixClient;

    // Start timeline sync cache
    let canStartSync = false;
    if (!objType(this._timelineSyncCache[valueId], 'object')) {
      this._timelineSyncCache[valueId] = {};
      canStartSync = true;
    }

    if (typeof this._timelineSyncCache[valueId].isComplete !== 'boolean') {
      this._timelineSyncCache[valueId].isComplete = false;
      canStartSync = true;
    }

    if (canStartSync) this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);

    // Get checkpoint
    const lastEventId =
      typeof this._timelineSyncCache[valueId].lastEvent === 'string' &&
      this._timelineSyncCache[valueId].lastEvent.length > 0
        ? this._timelineSyncCache[valueId].lastEvent
        : null;

    const checkPoint =
      !timeline && typeof checkpoint === 'string' && checkpoint.length > 0
        ? checkpoint
        : lastEventId;

    const events = tm.getEvents();
    let canLastCheckPoint =
      objType(this._lastTimelineSyncCache[valueId], 'object') &&
      objType(this._lastTimelineSyncCache[valueId].tmLastEvent, 'object') &&
      typeof this._lastTimelineSyncCache[valueId].tmLastEvent.id === 'string' &&
      typeof this._lastTimelineSyncCache[valueId].tmLastEvent.ts === 'number' &&
      events[events.length - 1] &&
      this._lastTimelineSyncCache[valueId].tmLastEvent.ts < events[events.length - 1].getTs();

    const updateTmLastEventDetector = () => {
      if (canLastCheckPoint) {
        if (tinyThis._syncTimelineCache.usedTmLastEvent.indexOf(valueId) < 0)
          tinyThis._syncTimelineCache.usedTmLastEvent.push(valueId);
      } else {
        const index = tinyThis._syncTimelineCache.usedTmLastEvent.indexOf(valueId);
        if (index > -1) tinyThis._syncTimelineCache.usedTmLastEvent.splice(index, 1);
      }

      if (canLastCheckPoint && !isComplete) {
        if (tinyThis._syncTimelineCache.usingTmLastEvent.indexOf(valueId) < 0)
          tinyThis._syncTimelineCache.usingTmLastEvent.push(valueId);
      } else {
        const index = tinyThis._syncTimelineCache.usingTmLastEvent.indexOf(valueId);
        if (index > -1) tinyThis._syncTimelineCache.usingTmLastEvent.splice(index, 1);
      }

      tinyThis._sendSyncStatus(true);
      tinyThis._syncTimelineCache.usedLastTm = true;
    };

    updateTmLastEventDetector();
    let lastTimelineEventId = null;
    let lastTimelineEventTs = null;
    let lastTimelineToken = null;

    // Needs add data
    if (!isComplete || canLastCheckPoint) {
      if (events.length > 0) {
        console.log(`[room-db-sync] [${valueId}] Adding new events...`);
        for (const item in events) {
          const eventIdp = events[item].getId();
          if (this._syncTimelineCache.usedIds.indexOf(eventIdp) < 0) {
            if (!singleTime) this._syncTimelineCache.usedIds.push(eventIdp);
            this.addToTimeline(events[item], 'sync', true);
            lastTimelineEventId = eventIdp;
            lastTimelineEventTs = events[item].getTs();
          }
        }

        await this.waitAddTimeline('sync');
        console.log(`[room-db-sync] [${valueId}] New events added!`);

        if (!singleTime && lastTimelineEventId) {
          if (!canLastCheckPoint) {
            lastTimelineToken = tm.getPaginationToken(Direction.Backward);
          } else if (
            this._lastTimelineSyncCache[valueId].tmLastEvent &&
            this._lastTimelineSyncCache[valueId].tmLastEvent.ts < lastTimelineEventTs
          ) {
            delete this._lastTimelineSyncCache[valueId].tmLastEvent;
            updateTmLastEventDetector();
          }

          this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
        }
      } else console.log(`[room-db-sync] [${valueId}] No data found to save.`);
    } else console.log(`[room-db-sync] [${valueId}] Data load complete! Skipping data saving...`);

    // To complete data scripts
    const updateTinyData = () => {
      if (!singleTime) {
        if (lastTimelineToken)
          tinyThis._timelineSyncCache[valueId].paginationToken = lastTimelineToken;
        if (lastTimelineEventId)
          tinyThis._timelineSyncCache[valueId].lastEvent = lastTimelineEventId;
        if (lastTimelineEventTs) tinyThis._timelineSyncCache[valueId].lastTs = lastTimelineEventTs;
        tinyThis.setJson('ponyHouse-timeline-sync', tinyThis._timelineSyncCache);
      }
    };

    const tinyComplete = (isNext) => {
      console.log(`[room-db-sync] [${valueId}] Complete!`);
      updateTinyData();
      loadComplete(roomId, threadId, checkPoint, lastEventId, isNext);
    };

    // Next Timeline
    if (!singleTime) {
      const nextTimelineToken = tm.getPaginationToken(Direction.Backward);
      if ((!isComplete && nextTimelineToken) || canLastCheckPoint) {
        this._syncTimelineCache.used = true;

        console.log(`[room-db-sync] [${valueId}] Preparing next step...`);
        console.log(
          `[room-db-sync] [${valueId}] firstTime ${String(firstTime)} / canLastCheckPoint ${String(canLastCheckPoint)} / lastTimelineToken ${String(lastTimelineToken)}`,
        );

        const canSync = firstTime || lastTimelineToken || canLastCheckPoint;
        console.log(`[room-db-sync] [${valueId}] canSync ${String(canSync)}`);

        // Next checkpoint
        if (canSync) {
          // Next page
          console.log(`[room-db-sync] [${valueId}] Getting next timeline page...`);
          await waitTimelineTimeout();
          await mx.paginateEventTimeline(tm, {
            backwards: Direction.Forward,
            limit: SYNC_TIMELINE_DOWNLOAD_LIMIT,
          });

          console.log(`[room-db-sync] [${valueId}] New paginate page loaded!`);

          if (
            this._lastTimelineSyncCache[valueId] &&
            typeof this._lastTimelineSyncCache[valueId].paginationToken === 'string'
          )
            delete this._lastTimelineSyncCache[valueId].paginationToken;

          console.log(
            `[room-db-sync] [${valueId}] Next data!\n${lastTimelineEventId}\n${lastTimelineToken}`,
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
          updateTinyData();
          loadComplete(roomId, threadId, checkPoint, lastEventId, true);
        }
        // Complete
        else tinyComplete(false);
      } else tinyComplete(false);
    } else tinyComplete(false);
  }

  // Reset timeline cache
  _resetTimelineCache() {
    this._syncTimelineCache.usedIds = [];
    this._syncTimelineCache.roomsUsed = [];
    this._syncTimelineCache.roomsIdsUsed = [];
    this._syncTimelineCache.usedTmLastEvent = [];
    this._syncTimelineCache.usingTmLastEvent = [];
    this._syncTimelineCache.using = false;
    this._syncTimelineCache.used = false;
    this._syncTimelineCache.usedLastTm = false;
    this._syncTimelineCache.roomId = null;
    this._syncTimelineCache.threadId = null;
    this._sendSyncStatus();
  }

  // Refresh timeline
  refreshLiveTimeline(room, threadId) {
    const tinyThis = this;
    const roomId = room.roomId;
    const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;
    return new Promise((resolve, reject) => {
      if (!tinyThis._lastEventsLoadWaiting[valueId]) {
        room
          .refreshLiveTimeline()
          .then((data) =>
            room
              .loadMembersIfNeeded()
              .then((data2) => ({ refresh: data, loadMembers: data2 }))
              .catch(reject),
          )
          .catch(reject);
      } else setTimeout(() => tinyThis.refreshLiveTimeline().then(resolve).catch(reject), 100);
    });
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
        const tinyRoomsIdsUsed = clone(this._syncTimelineCache.roomsIdsUsed);
        const usingTmLastEvent = clone(this._syncTimelineCache.usingTmLastEvent);
        const mx = initMatrix.matrixClient;

        // Complete!
        for (const item in tinyRoomsUsed) {
          const usedRoom = tinyRoomsUsed[item];
          if (this._timelineSyncCache[usedRoom]) {
            this._timelineSyncCache[usedRoom].isComplete = true;
            this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
          }
        }

        for (const item in tinyRoomsIdsUsed) {
          const tinyRoom = mx.getRoom(tinyRoomsIdsUsed[item].roomId);
          const tmLastEventUsed = usingTmLastEvent.indexOf(item) > -1 ? true : false;

          if (tinyRoom && !tmLastEventUsed)
            this.refreshLiveTimeline(tinyRoom, tinyRoomsIdsUsed[item].threadId).catch((err) =>
              console.error(err),
            );
        }

        console.log(`[room-db-sync] Database checker complete!`);
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

  _sendSyncStatus(isTmLastEvent = false) {
    this.emit('timelineSyncStatus', this._syncTimelineCache);
    if (isTmLastEvent) this.emit('timelineTmLastEventStatus', this._syncTimelineCache);
  }

  getSyncStatus() {
    return this._syncTimelineCache;
  }

  isRoomSyncing(roomId, threadId) {
    if (this._syncTimelineCache.using) {
      if (!threadId)
        return (
          this._syncTimelineCache.usedTmLastEvent.indexOf(roomId) > -1 ||
          this._syncTimelineCache.roomsUsed.indexOf(roomId) > -1 ||
          this._syncTimelineCache.roomId === roomId
        );
      else
        return (
          this._syncTimelineCache.usedTmLastEvent.indexOf(`${roomId}:${threadId}`) > -1 ||
          this._syncTimelineCache.roomsUsed.indexOf(`${roomId}:${threadId}`) > -1 ||
          (this._syncTimelineCache.roomId === roomId &&
            this._syncTimelineCache.threadId === threadId)
        );
    }

    return false;
  }

  isRoomSyncingTmLast(roomId, threadId) {
    if (this._syncTimelineCache.using) {
      if (!threadId) return this._syncTimelineCache.usedTmLastEvent.indexOf(roomId) > -1;
      else return this._syncTimelineCache.usedTmLastEvent.indexOf(`${roomId}:${threadId}`) > -1;
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

    this.emit('dbTimelineLoaded', tinyData, eventId);
    if (typeof eventId === 'string')
      this.emit(`dbTimelineLoaded-${roomId}${threadId ? `-${threadId}` : ''}-${eventId}`, tinyData);
    this.emit(`dbTimelineLoaded-${roomId}${threadId ? `-${threadId}` : ''}`, tinyData, eventId);
  }

  async deleteRoomDb(roomId) {
    let index = this._syncTimelineCache.data.findIndex((item) => item.roomId === roomId);
    while (index > -1) {
      this._syncTimelineCache.data.splice(index, 1);
      index = this._syncTimelineCache.data.findIndex((item) => item.roomId === roomId);
    }

    this.resetTimelineSyncData(roomId, true);
    return this.dbManager.deleteRoomDb(roomId);
  }

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
      const result = await this.dbManager.storeConnection.select(data);
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
      const result = await this.dbManager.storeConnection.select(data);
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
    return this.dbManager.storeConnection.count(data);
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
      await tinyThis.dbManager._setIsThread(event);
      tinyThis._addToTimeline(where);
      resolve(result);
    };

    const eventType = event.getType();
    if (typeof this._timelineInsertTypes[eventType] === 'function')
      this._timelineInsertTypes[eventType](event)
        .then(async (tinyData) => {
          if (eventType === 'm.room.member') await tinyThis.dbManager.setMember(event);
          tinyComplete(tinyData);
        })
        .catch(tinyReject);
    else {
      this.dbManager
        .setTimeline(event)
        .then(async (result) => {
          try {
            if (eventType === 'm.room.redaction') await tinyThis.dbManager._sendSetRedaction(event);
            if (eventType === 'm.room.member') await tinyThis.dbManager.setMember(event);
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
  async addToTimeline(event, where = 'default', avoidCache = false) {
    const tinyThis = this;

    // Get data
    const eventId = event.getId();
    const roomId = event.getRoomId();

    const thread = event.getThread();
    const threadId = thread ? thread?.id : null;
    const valueId = `${roomId}${threadId ? `:${threadId}` : ''}`;

    const eventSnap = event.toSnapshot();

    // Prepare sync cache
    if (!avoidCache) {
      if (!Array.isArray(tinyThis._eventsLoadWaiting[valueId]))
        tinyThis._eventsLoadWaiting[valueId] = [];

      if (tinyThis._eventsLoadWaiting[valueId].indexOf(eventId) < 0)
        tinyThis._eventsLoadWaiting[valueId].push(eventId);

      tinyThis.setJson('ponyHouse-storage-loading', tinyThis._eventsLoadWaiting);
    }

    // Return sync function
    return new Promise((resolve, reject) => {
      // Remove cache
      const tinyComplete = () => {
        // Exist array
        if (!avoidCache && Array.isArray(tinyThis._eventsLoadWaiting[valueId])) {
          // Remove index 1
          const index = tinyThis._eventsLoadWaiting[valueId].indexOf(eventId);
          if (index > -1) tinyThis._eventsLoadWaiting[valueId].splice(index, 1);

          // Remove index 2
          const index2 = Array.isArray(tinyThis._lastEventsLoadWaiting[valueId])
            ? tinyThis._lastEventsLoadWaiting[valueId].indexOf(eventId)
            : -1;
          if (index2 > -1) tinyThis._lastEventsLoadWaiting[valueId].splice(index2, 1);

          // Remove room
          if (tinyThis._eventsLoadWaiting[valueId].length < 1)
            delete tinyThis._eventsLoadWaiting[valueId];

          // from cache too
          if (
            Array.isArray(tinyThis._lastEventsLoadWaiting[valueId]) &&
            tinyThis._lastEventsLoadWaiting[valueId].length < 1
          )
            delete tinyThis._lastEventsLoadWaiting[valueId];

          // Update cache
          tinyThis.setJson('ponyHouse-storage-loading', tinyThis._eventsLoadWaiting);
        }
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
    if (objType(data, 'object') || objType(data, 'map') || Array.isArray(data)) {
      this.emit('setJson', name, data);
      return global.localStorage.setItem(name, JSON.stringify(data));
    }
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
    this.emit('setItem', name, data);
    return global.localStorage.setItem(name, data);
  }

  getItem(name) {
    return global.localStorage.getItem(name);
  }

  setString(name, data) {
    if (typeof data === 'string') {
      this.emit('setString', name, data);
      return global.localStorage.setItem(name, data);
    }
    throw new Error('The storage value is not string!');
  }

  getString(name) {
    let value = global.localStorage.getItem(name);
    if (typeof value === 'string') return value;

    return null;
  }

  setNumber(name, data) {
    if (typeof data === 'number') {
      this.emit('setNumber', name, data);
      return global.localStorage.setItem(name, data);
    }
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
    if (typeof data === 'boolean') {
      this.emit('setBool', name, data);
      return global.localStorage.setItem(name, data);
    }
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
    this.emit('removeItem', name);
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
