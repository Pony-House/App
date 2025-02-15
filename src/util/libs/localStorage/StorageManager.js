import { EventType, MatrixEventEvent, MatrixEvent } from 'matrix-js-sdk';
import clone from 'clone';

import { objType } from 'for-promise/utils/lib.mjs';
import tinyConsole from '@src/util/libs/console';

import initMatrix from '@src/client/initMatrix';
import cons from '@src/client/state/cons';

import { toTitleCase } from '../../tools';
import TinyDbManager from '../db/manager';
import eventsDb from '../db/eventsDb';
import { waitForTrue } from '../timeoutLib';

// Local Storage modules
import StorageManagerBase from './Ls';
import LocalStorageEvent from './LocalStorageEvent';
import {
  genKey,
  getRoomValueId,
  finishWhereDbPrepare,
  insertObjWhere,
  addCustomSearch,
  objWhereChecker,
} from './lib';
import { timelineCache } from './cache';

// Class
class StorageManager extends StorageManagerBase {
  constructor() {
    super();

    this._syncTimelineCache = {
      eventsAdded: {},
      usedIds: [],
      using: false,
      usedLastTm: false,
      usedTmLastEvent: [],
      usingTmLastEvent: [],
      data: [],
      busy: 0,
    };

    this._timelineSyncCache = this.getJson('ponyHouse-timeline-sync', 'obj');
    tinyConsole.log(`[room-db-sync] [sync] Data loaded!`, this._timelineSyncCache);

    this._timelineLastEvent = this.getJson('ponyHouse-timeline-le-sync', 'obj');
    this._lastTimelineLastEvent = clone(this._timelineLastEvent) || {};
    tinyConsole.log(`[room-db-sync] [sync] Data loaded!`, this._lastTimelineLastEvent);

    this._sendingEventCache = {};
    this._eventsLoadWaiting = this.getJson('ponyHouse-storage-loading', 'obj');
    this._lastEventsLoadWaiting = clone(this._eventsLoadWaiting) || {};
    this._eventsLoadWaitingUsing = {};

    tinyConsole.log(`[room-db-sync] [re-add] Data loaded!`, this._lastEventsLoadWaiting);

    // new Worker(new URL("worker.js", import.meta.url));
    this.dbManager = new TinyDbManager();

    for (const item in eventsDb) {
      const data = typeof eventsDb[item] === 'string' ? { name: eventsDb[item] } : eventsDb[item];
      const nameParts = data.name.split('_');
      let funcName = '';
      for (let i = 0; i < nameParts.length; i++) {
        funcName += toTitleCase(nameParts[i]);
      }

      const tinyOrder =
        typeof data.orderWhere === 'string' || typeof data.orderBy === 'string'
          ? `${typeof data.orderWhere === 'string' ? data.orderWhere : data.name}.${typeof data.orderBy === 'string' ? data.orderBy : 'origin_server_ts'}`
          : null;

      const forceTransaction =
        typeof data.forceTransaction === 'boolean' ? data.forceTransaction : false;

      this[`getLocation${funcName}Id`] = ({
        targetId = null,
        eventId = null,
        threadId = null,
        showThreads = null,
        sender = null,
        showRedaction = null,
        showTransaction = false,
        roomId = null,
        type = null,
        limit = null,
        join = null,
        memberType = null,
        order = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._findEventIdInPagination({
          order: order || tinyOrder,
          from: data.name,
          eventId,
          targetId,
          threadId,
          showThreads,
          sender,
          showRedaction,
          showTransaction: showTransaction || forceTransaction,
          roomId,
          type,
          limit,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}Count`] = ({
        targetId = null,
        roomId = null,
        threadId = null,
        eventId,
        showThreads = null,
        sender = null,
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
          eventId,
          targetId,
          showThreads,
          sender,
          showRedaction,
          showTransaction: showTransaction || forceTransaction,
          type,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}Pagination`] = ({
        targetId = null,
        roomId = null,
        threadId = null,
        eventId = null,
        showThreads = null,
        sender = null,
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
          eventId,
          targetId,
          showThreads,
          sender,
          showRedaction,
          showTransaction: showTransaction || forceTransaction,
          type,
          limit,
          memberType,
          existMemberType: data.existMemberType,
          join: join || data.join,
          customWhere: { body, mimetype: mimeType, url, format, formatted_body: formattedBody },
        });

      this[`get${funcName}`] = ({
        targetId = null,
        roomId = null,
        threadId = null,
        eventId = null,
        showThreads = null,
        sender = null,
        showRedaction = null,
        showTransaction = false,
        type = null,
        limit = null,
        page = null,
        join = null,
        memberType = null,
        order = null,

        body = null,
        formattedBody = null,
        format = null,
        mimeType = null,
        url = null,
      }) =>
        this._eventsDataTemplate({
          order: order || tinyOrder,
          from: data.name,
          roomId,
          threadId,
          eventId,
          targetId,
          showThreads,
          sender,
          showRedaction,
          showTransaction: showTransaction || forceTransaction,
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
        sender = null,
        eventId = null,
        showRedaction = null,
        memberType = null,
        showTransaction = null,
        join = null,
      }) =>
        this._eventsDataTemplate({
          isSingle: true,
          from: data.name,
          sender,
          roomId,
          threadId,
          eventId,
          showRedaction,
          type,
          memberType,
          showTransaction: showTransaction || forceTransaction,
          existMemberType: data.existMemberType,
          join: join || data.join,
        });

      this.dbManager.on('dbMessageUpdate', (r, mEvent) =>
        tinyThis.emit('dbMessageUpdate', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbMessageEdit', (r, mEvent) =>
        tinyThis.emit('dbMessageEdit', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbMessage', (r, mEvent) =>
        tinyThis.emit('dbMessage', r, tinyThis.convertToEventFormat(mEvent)),
      );
      this.dbManager.on('dbTimeline', (r, mEvent) =>
        tinyThis.emit('dbTimeline', r, tinyThis.convertToEventFormat(mEvent)),
      );

      this.dbManager.on('dbReaction', (r, mEvent) =>
        tinyThis.emit('dbReaction', r, tinyThis.convertToEventFormat(mEvent)),
      );

      this.dbManager.on('dbThreads', (r, event) => tinyThis.emit('dbThreads', r, event));

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
      this.dbManager.on('dbReactionDeleted', (r, mEvent) =>
        tinyThis.emit('dbReactionDeleted', r, mEvent),
      );
      this.dbManager.on('dbTimelineDeleted', (r, mEvent) =>
        tinyThis.emit('dbTimelineDeleted', r, mEvent),
      );

      this.dbManager.on('dbReceiptDeleted', (event) => tinyThis.emit('dbReceiptDeleted', event));
      this.dbManager.on('dbEventRedaction', (event) => tinyThis.emit('dbEventRedaction', event));
      this.dbManager.on('isDbCreated', (isDbCreated) => tinyThis.emit('isDbCreated', isDbCreated));

      this._dbQueryQueue = 0;
      this.dbManager.on('queryQueue', (queryQueue) => {
        tinyThis._dbQueryQueue = queryQueue;
      });
    }

    // Timeline Inserts
    const tinyThis = this;
    this._timelineInsertTypes = {
      'm.reaction': (event) => tinyThis.dbManager.setReaction(event),
    };

    for (const item in cons.supportEventTypes) {
      this._timelineInsertTypes[cons.supportEventTypes[item]] = (event) =>
        this.dbManager.setMessage(event);
    }
  }

  setReceipt(roomId, userId, ts) {
    return this.dbManager.setReceipt(roomId, userId, ts);
  }

  startPonyHouseDb() {
    return this.dbManager.startPonyHouseDb();
  }

  convertToEventFormat(event) {
    return new LocalStorageEvent(clone(event), storageManager);
  }

  setTmLastEvent(event) {
    const roomId = event.getRoomId();
    const thread = event.getThread();
    const threadId = thread ? thread.id : this.threadRootId || null;
    const eventId = event.getId();
    const ts = event.getTs();

    if (typeof roomId === 'string') {
      const valueId = getRoomValueId(roomId, threadId);
      if (
        typeof ts === 'number' &&
        (!this._timelineLastEvent[valueId] ||
          typeof this._timelineLastEvent[valueId].ts !== 'number' ||
          ts > this._timelineLastEvent[valueId].ts)
      ) {
        this._timelineLastEvent[valueId] = { id: eventId, ts };
        return this.setJson('ponyHouse-timeline-le-sync', this._timelineLastEvent);
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

        if (this._timelineLastEvent[valueId]) {
          delete this._timelineLastEvent[valueId];
          deleteUsed = true;
        }

        if (this._lastEventsLoadWaiting[valueId]) delete this._lastEventsLoadWaiting[valueId];
        timelineCache.deleteData(valueId);
      };

      if (typeof threadId !== 'boolean' || !threadId)
        deleteTinyData(getRoomValueId(roomId, threadId));
      else {
        deleteTinyData(roomId);
        for (const item in this._timelineSyncCache) {
          if (item.startsWith(`${roomId}:`)) deleteTinyData(item);
        }

        for (const item in this._timelineLastEvent) {
          if (item.startsWith(`${roomId}:`)) deleteTinyData(item);
        }

        for (const item in this._eventsLoadWaiting) {
          if (item.startsWith(`${roomId}:`)) deleteTinyData(item);
        }
      }

      if (deleteUsed) {
        this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
        this.setJson('ponyHouse-timeline-le-sync', this._timelineLastEvent);
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
    this.removeItem('ponyHouse-timeline-le-sync');
    this._timelineLastEvent = {};
    this._lastEventsLoadWaiting = {};
    timelineCache.resetData();
  }

  // Sync Timeline
  async _syncTimelineRun(
    room,
    thread,
    eventId,
    tm = null,
    firstTime = false,
    singleTime = false,
    newUpdateTinyData = null,
  ) {
    const tinyThis = this;
    const loadComplete = (roomId, threadId, updateTinyData, isNext, newTm = null, err = null) => {
      // Default
      const valueId = getRoomValueId(roomId, threadId);

      // Error
      if (err) {
        tinyConsole.error(err);
        alert(err.message, 'Timeline sync error!');

        if (!singleTime && typeof tinyThis._syncTimelineCache.eventsAdded[valueId] === 'number')
          tinyThis._syncTimelineCache.eventsAdded[valueId] = 0;
        tinyThis._syncTimelineCache.busy--;
        tinyThis._sendSyncStatus(roomId, threadId);
        return;
      }

      // Warn timeline
      tinyThis.warnTimeline(roomId, threadId, eventId, {
        firstTime,
        isNext,
      });

      // Next Timeline
      if (!singleTime && isNext) {
        tinyThis._syncTimelineRun(room, thread, eventId, newTm || tm, false, false, updateTinyData);
        tinyThis.emit('timelineSyncNext', roomId, threadId);
      }
      // Complete!
      else {
        if (!singleTime && typeof tinyThis._syncTimelineCache.eventsAdded[valueId] === 'number')
          tinyThis._syncTimelineCache.eventsAdded[valueId] = 0;
        tinyThis._syncTimelineCache.busy--;
        tinyThis._sendSyncStatus(roomId, threadId);

        tinyConsole.log(`[room-db-sync] [${valueId}] All complete!`);
        tinyThis._syncTimelineComplete(roomId, threadId, valueId);
      }
    };

    try {
      // Prepare data
      if (room && typeof room.roomId === 'string') {
        // Get room data
        const roomId = room.roomId;
        const threadId = thread ? thread?.id : null;
        const valueId = getRoomValueId(roomId, threadId);

        tinyConsole.log(`[room-db-sync] [${valueId}] Waiting...`);

        // Is complete?
        const isComplete =
          this._timelineSyncCache[valueId] &&
          typeof this._timelineSyncCache[valueId].isComplete === 'boolean'
            ? this._timelineSyncCache[valueId].isComplete
            : false;

        // Check others events waiting for sync time
        if (!this._eventsLoadWaitingUsing[valueId]) {
          tinyConsole.log(`[room-db-sync] [${valueId}] [re-add] Reading data...`);
          if (
            Array.isArray(this._lastEventsLoadWaiting[valueId]) &&
            this._lastEventsLoadWaiting[valueId].length > 0
          ) {
            tinyConsole.log(`[room-db-sync] [${valueId}] [re-add] Re-add progress detected!`);
            this._eventsLoadWaitingUsing[valueId] = true;
            this.syncTimelineRecoverEvent(room, threadId);
          }
        }

        // Matrix client
        const mx = initMatrix.matrixClient;
        const em = initMatrix.eventManager;

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

        // Get events
        const roomMsgRequest = await em.fetchEvents({
          roomId,
          threadId,
          limit: __ENV_APP__.PAG_LIMIT,
          ignoreCache: true,
          fromToken: this._timelineSyncCache[valueId]
            ? this._timelineSyncCache[valueId].paginationToken
            : null,
        });

        const events = roomMsgRequest.events.map((eventData) => eventData.mEvent);

        // Can use the last event mode. This method will synchronize events until the last event received from this timeline. (ignoring the full sync mode)
        let canLastCheckPoint =
          objType(this._lastTimelineLastEvent[valueId], 'object') &&
          typeof this._lastTimelineLastEvent[valueId].id === 'string' &&
          typeof this._lastTimelineLastEvent[valueId].ts === 'number' &&
          events[events.length - 1] &&
          events[events.length - 1].getTs() < this._lastTimelineLastEvent[valueId].ts
            ? true
            : false;

        // Update the non-full sync mode
        const updateTmLastEventDetector = () => {
          // Can use? Add this room into room list of this mode.
          if (canLastCheckPoint) {
            if (tinyThis._syncTimelineCache.usedTmLastEvent.indexOf(valueId) < 0)
              tinyThis._syncTimelineCache.usedTmLastEvent.push(valueId);
          }

          // Nope? Remove it now.
          else {
            const index = tinyThis._syncTimelineCache.usedTmLastEvent.indexOf(valueId);
            if (index > -1) tinyThis._syncTimelineCache.usedTmLastEvent.splice(index, 1);
          }

          // Same thing, but this is a permanent cache store.
          if (canLastCheckPoint && !isComplete) {
            if (tinyThis._syncTimelineCache.usingTmLastEvent.indexOf(valueId) < 0)
              tinyThis._syncTimelineCache.usingTmLastEvent.push(valueId);
          } else {
            const index = tinyThis._syncTimelineCache.usingTmLastEvent.indexOf(valueId);
            if (index > -1) tinyThis._syncTimelineCache.usingTmLastEvent.splice(index, 1);
          }

          // Complete
          tinyThis._syncTimelineCache.usedLastTm = canLastCheckPoint;
          tinyThis._sendSyncStatus(roomId, threadId, true);
        };

        updateTmLastEventDetector();
        let lastTimelineEventId = null;
        let lastTimelineEventTs = null;
        let lastTimelineToken = null;

        // Needs add data
        tinyConsole.log(
          `[room-db-sync] [${valueId}] This room full sync is ${isComplete ? 'complete' : 'incomplete'}${canLastCheckPoint ? ' and need sync last events received' : ''}...`,
        );
        if (!isComplete || canLastCheckPoint) {
          // Read event list
          if (events.length > 0) {
            // Events added here
            let eventsAdded = 0;

            // Create new cache here to global events added list
            if (typeof this._syncTimelineCache.eventsAdded[valueId] !== 'number')
              this._syncTimelineCache.eventsAdded[valueId] = 0;

            // Start the progress
            tinyConsole.log(`[room-db-sync] [${valueId}] Adding new events...`);
            let needsRemoveLastSync = false;
            for (const item in events) {
              // Get event id and check if this is a new event
              const eventIdp = events[item].getId();
              if (this._syncTimelineCache.usedIds.indexOf(eventIdp) < 0) {
                this._syncTimelineCache.usedIds.push(eventIdp);

                // Get thread
                /* const newThread =
                  !events[item].threadRootId || events[item].threadRootId === events[item].getId()
                    ? events[item].getThread()
                    : null;
                if (newThread && typeof newThread.id === 'string')
                  this.syncTimeline(roomId, newThread.id);
                else if (events[item].threadRootId)
                  this.syncTimeline(roomId, events[item].threadRootId); */

                // Send the event to the timeline database manager
                this.addToTimeline(events[item], true);

                // Update cache values
                if (!singleTime) this._syncTimelineCache.eventsAdded[valueId]++;

                // Event id
                lastTimelineEventId = eventIdp;

                // Event ts
                lastTimelineEventTs = events[item].getTs();

                // Update the last checkpoint
                if (
                  canLastCheckPoint &&
                  this._lastTimelineLastEvent[valueId] &&
                  (lastTimelineEventTs <= this._lastTimelineLastEvent[valueId].ts ||
                    lastTimelineEventId === this._lastTimelineLastEvent[valueId].id)
                ) {
                  delete this._lastTimelineLastEvent[valueId];
                  if (
                    this._lastTimelineLastEvent[valueId] &&
                    this._timelineLastEvent[valueId].id === this._lastTimelineLastEvent[valueId].id
                  )
                    needsRemoveLastSync = true;

                  updateTmLastEventDetector();
                  tinyConsole.log(
                    `[room-db-sync] [${valueId}] The last events part is complete now!`,
                  );
                }

                // New event added++
                eventsAdded++;
              }
            }

            // Wait the full timeline sync from the database
            this._sendSyncStatus(roomId, threadId);
            await this.waitAddTimeline();
            tinyConsole.log(`[room-db-sync] [${valueId}] ${eventsAdded} new events added!`);
            if (needsRemoveLastSync) {
              if (this._timelineLastEvent[valueId].id === this._lastTimelineLastEvent[valueId].id) {
                delete this._timelineLastEvent[valueId];
                this.setJson('ponyHouse-timeline-le-sync', this._timelineLastEvent);
              }
            }

            // Function here? execute it now
            if (typeof newUpdateTinyData === 'function') newUpdateTinyData();

            // Update the non-full sync data
            if (!singleTime && lastTimelineEventId) {
              lastTimelineToken = roomMsgRequest.nextToken;

              // Complete
              this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
            }
          } else tinyConsole.log(`[room-db-sync] [${valueId}] No data found to save.`);
        } else
          tinyConsole.log(
            `[room-db-sync] [${valueId}] Data load complete! Skipping data saving...`,
          );

        // To complete data scripts (New function created here)
        const updateTinyData = () => {
          if (!singleTime) {
            if (lastTimelineToken)
              tinyThis._timelineSyncCache[valueId].paginationToken = lastTimelineToken;
            if (lastTimelineEventId)
              tinyThis._timelineSyncCache[valueId].lastEvent = lastTimelineEventId;
            if (lastTimelineEventTs)
              tinyThis._timelineSyncCache[valueId].lastTs = lastTimelineEventTs;
            tinyThis.setJson('ponyHouse-timeline-sync', tinyThis._timelineSyncCache);
          }
        };

        // Mission complete
        const tinyComplete = (isNext, msg = 'Complete!', newTm = null) => {
          tinyConsole.log(`[room-db-sync] [${valueId}] ${msg}`);
          loadComplete(roomId, threadId, updateTinyData, isNext, newTm);
        };

        // Next Timeline
        if (!singleTime) {
          const nextTimelineToken = roomMsgRequest.nextToken;
          if (
            (!isComplete && nextTimelineToken) ||
            (canLastCheckPoint && this._lastTimelineLastEvent[valueId])
          ) {
            tinyConsole.log(
              `[room-db-sync] [${valueId}] Preparing next step...\nfirstTime ${String(firstTime)}\ncanLastCheckPoint ${String(canLastCheckPoint)}\nlastTimelineToken ${String(lastTimelineToken)}`,
            );

            // Next page
            tinyConsole.log(`[room-db-sync] [${valueId}] Getting next timeline page...`);

            // Done!
            tinyComplete(
              true,
              `[room-db-sync] [${valueId}] Next data!\n${lastTimelineEventId}\n${lastTimelineToken}`,
            );

            // Complete
          } else tinyComplete(false);
        } else tinyComplete(false);
      }

      // Error
      else throw new Error(`[room-db-sync] No room found to sync in the indexedDb!`);
    } catch (err) {
      tinyConsole.error(err);
      loadComplete(null, null, null, false, null, err);
    }
  }

  async syncTimelineRecoverEvent(room, threadId) {
    // Matrix Client
    const roomId = room.roomId;
    const valueId = getRoomValueId(roomId, threadId);
    const mx = initMatrix.matrixClient;

    // Checker
    const checkTinyArray = () =>
      this._eventsLoadWaitingUsing[valueId] &&
      Array.isArray(this._lastEventsLoadWaiting[valueId]) &&
      this._lastEventsLoadWaiting[valueId].length > 0;

    // Starting...
    tinyConsole.log(`[room-db-sync] [${valueId}] [re-add] Preparing to re-add events...`);
    if (checkTinyArray()) {
      try {
        // Get events
        const events = [];
        for (const item in this._lastEventsLoadWaiting[valueId]) {
          let iEvent = null;

          // Get data from cache
          if (room) iEvent = room.findEventById(this._lastEventsLoadWaiting[valueId][item]);

          // Get data from server
          if (!iEvent) {
            iEvent = await mx.fetchRoomEvent(roomId, this._lastEventsLoadWaiting[valueId][item]);
            if (iEvent) events.push(new MatrixEvent(iEvent));
          } else events.push(iEvent);
        }

        // Decrypt messages (if necessary)
        await Promise.all(
          events.map(async (mEvent) => {
            if (mEvent.getType() === 'm.room.encrypted') {
              try {
                const decrypted = await mx.getCrypto().decryptEvent(mEvent);
                if (objType(decrypted, 'object') && objType(decrypted.clearEvent, 'object'))
                  mEvent.clearEvent = decrypted.clearEvent;
              } catch {}
            }
          }),
        );

        // Add new events
        tinyConsole.log(`[room-db-sync] [${valueId}] [re-add] Readding new events...`, events);
        if (checkTinyArray()) {
          for (const item in events) {
            const eventIdp = events[item].getId();
            if (this._lastEventsLoadWaiting[valueId].indexOf(eventIdp) > -1) {
              this.addToTimeline(events[item]);
            }
          }

          // Complete
          await this.waitAddTimeline();
          delete this._eventsLoadWaiting[valueId];
          delete this._lastEventsLoadWaiting[valueId];
          this.setJson('ponyHouse-storage-loading', this._eventsLoadWaiting);
          tinyConsole.log(`[room-db-sync] [${valueId}] [re-add] New events readded!`);
        }
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Timeline Recover event failed');
      }
    }
    if (typeof this._eventsLoadWaitingUsing[valueId] !== 'undefined')
      delete this._eventsLoadWaitingUsing[valueId];
  }

  // Reset timeline cache
  _resetTimelineCache(forceReset = false) {
    if (this._syncTimelineCache.busy < 1 || forceReset) {
      this._syncTimelineCache.eventsAdded = {};
      this._syncTimelineCache.usedTmLastEvent = [];
      this._syncTimelineCache.usingTmLastEvent = [];
      this._syncTimelineCache.using = false;
      this._syncTimelineCache.usedLastTm = false;
      this._syncTimelineCache.busy = 0;
      this._sendSyncStatus('ALL');
    }
  }

  // Next timeline
  _syncTimelineComplete(roomId, threadId, valueId) {
    // Complete!
    if (this._timelineSyncCache[valueId]) {
      this._timelineSyncCache[valueId].isComplete = true;
      this.setJson('ponyHouse-timeline-sync', this._timelineSyncCache);
    }

    // 100% complete message
    if (this._syncTimelineCache.busy < 1)
      tinyConsole.log(`[room-db-sync] Database checker complete!`);

    // Reset
    this.emit('timelineSyncComplete', roomId, threadId);
    this._resetTimelineCache();
  }

  _sendSyncStatus(roomId, threadId, isTmLastEvent = false) {
    this.emit('timelineSyncStatus', roomId, threadId, this._syncTimelineCache);
    if (isTmLastEvent)
      this.emit('timelineTmLastEventStatus', roomId, threadId, this._syncTimelineCache);
  }

  getSyncStatus() {
    return this._syncTimelineCache;
  }

  isSyncingTimelines() {
    return this._syncTimelineCache.using;
  }

  isRoomSyncing(roomId, threadId) {
    const valueId = getRoomValueId(roomId, threadId);
    return (
      this.isSyncingTimelines() &&
      typeof this._syncTimelineCache.eventsAdded[valueId] === 'number' &&
      this._syncTimelineCache.eventsAdded[valueId] > 0
    );
  }

  isRoomSyncingTmLast(roomId, threadId) {
    if (this.isSyncingTimelines()) {
      if (!threadId) return this._syncTimelineCache.usedTmLastEvent.indexOf(roomId) > -1;
      else return this._syncTimelineCache.usedTmLastEvent.indexOf(`${roomId}:${threadId}`) > -1;
    }
    return false;
  }

  syncTimeline(roomId, threadId, eventId) {
    const room = initMatrix.matrixClient.getRoom(roomId);
    const thread = threadId && room ? room.getThread(threadId) : null;
    if (room && typeof room.roomId === 'string') {
      const newData = {
        thread,
        roomId: room.roomId,
        threadId: thread ? thread.id : null,
        eventId,
        room,
        timeline: !thread ? room.getLiveTimeline() : thread.liveTimeline,
        firstTime: true,
        singleTime: false,
      };

      if (this._syncTimelineCache.using) {
        newData.singleTime =
          this._syncTimelineCache.data.findIndex((item) =>
            item.roomId === room.roomId && (!thread || item.threadId === thread.id) ? true : false,
          ) > -1
            ? true
            : false;
        this._syncTimelineCache.data.unshift(newData);
      } else this._syncTimelineCache.data.push(newData);

      tinyConsole.log(
        `[room-db-sync] [${newData.roomId}${newData.threadId ? `:${newData.threadId}` : ''}] Preparing to sync the room...`,
      );

      this._syncTimelineCache.using = true;
      this._syncTimelineCache.busy++;
      this._sendSyncStatus(newData.roomId, newData.threadId);

      this._syncTimelineRun(
        newData.room,
        newData.thread,
        newData.eventId,
        newData.timeline,
        newData.firstTime,
        newData.singleTime,
      );

      return;
    }
  }

  warnTimeline(
    roomId,
    threadId,
    eventId,
    data = {
      firstTime: false,
      isNext: false,
    },
  ) {
    const tinyData = clone(data);
    tinyData.roomId = roomId;
    tinyData.threadId = threadId;

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
    targetId = null,
    order = null,
    isSingle = false,
    from = '',
    roomId = null,
    threadId = null,
    eventId = null,
    showThreads = null,
    sender = null,
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
    data.where = {};

    if (!isSingle) {
      data.order = { type: 'desc', by: `${join ? `${from}.` : ''}${orderBy}` };
      if (typeof order === 'string') data.order.by = order;
      else if (objType(order, 'object') && typeof order.by === 'string') data.order.by = order.by;
    }

    if (join) data.join = objWhereChecker(join, { room_id: roomId, thread_id: threadId });

    insertObjWhere(data, 'content', content);
    insertObjWhere(data, 'unsigned', unsigned);
    addCustomSearch(data.where, customWhere);

    if (typeof roomId === 'string') data.where.room_id = roomId;
    else if (Array.isArray(roomId)) data.where.room_id = { in: roomId };

    if (typeof sender === 'string') data.where.sender = sender;
    else if (Array.isArray(sender)) data.where.sender = { in: sender };

    if (typeof type === 'string') data.where.type = type;
    else if (Array.isArray(type)) data.where.type = { in: type };

    if (typeof showThreads === 'boolean') {
      if (showThreads) data.where.thread_id = { '!=': 'NULL' };
      else if (!showThreads) data.where.thread_id = 'NULL';
    }

    if (typeof showRedaction === 'boolean') {
      if (showRedaction) data.where.redaction = true;
      else if (!showRedaction) data.where.redaction = false;
    }

    if (showTransaction !== true) data.where.is_transaction = false;

    if (!isSingle) {
      if (typeof eventId === 'string') data.where.event_id = eventId;
      else if (Array.isArray(eventId)) data.where.event_id = { in: eventId };

      if (typeof targetId === 'string') data.where.target_id = targetId;
      else if (Array.isArray(targetId)) data.where.target_id = { in: targetId };

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
    targetId = null,
    from = '',
    threadId = null,
    eventId = null,
    showThreads = null,
    sender = null,
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

    if (join) data.join = objWhereChecker(join, { room_id: roomId, thread_id: threadId });
    insertObjWhere(data, 'content', content);
    insertObjWhere(data, 'unsigned', unsigned);
    addCustomSearch(data.where, customWhere);

    if (typeof roomId === 'string') data.where.room_id = roomId;
    else if (Array.isArray(roomId)) data.where.room_id = { in: roomId };

    if (typeof type === 'string') data.where.type = type;
    else if (Array.isArray(type)) data.where.type = { in: type };

    if (typeof sender === 'string') data.where.sender = sender;
    else if (Array.isArray(sender)) data.where.sender = { in: sender };

    if (typeof eventId === 'string') data.where.event_id = eventId;
    else if (Array.isArray(eventId)) data.where.event_id = { in: eventId };

    if (typeof targetId === 'string') data.where.target_id = targetId;
    else if (Array.isArray(targetId)) data.where.target_id = { in: targetId };

    finishWhereDbPrepare(memberType, threadId, data, existMemberType);
    return this.dbManager.storeConnection.count(data);
  }

  async _eventsPaginationCount({
    targetId = null,
    from = '',
    roomId = null,
    threadId = null,
    eventId = null,
    sender = null,
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
      targetId,
      from,
      roomId,
      threadId,
      eventId,
      sender,
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
    order = null,
    eventId = null,
    targetId = null,
    valueName = 'event_id',
    from = '',
    threadId = null,
    showThreads = null,
    showRedaction = null,
    sender = null,
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
      targetId,
      from,
      threadId,
      showThreads,
      showRedaction,
      showTransaction,
      sender,
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
        targetId,
        order,
        from,
        roomId,
        threadId,
        showThreads,
        sender,
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

  // Timeout waiter script
  waitAddTimeline() {
    const tinyThis = this;
    return waitForTrue(() => tinyThis._dbQueryQueue < 1, 200);
  }

  // Add to timeline
  async addToTimeline(event, avoidCache = false) {
    const tinyThis = this;
    // Get data
    const eventId = event.getId();
    const roomId = event.getRoomId();

    const thread = event.getThread();
    const threadId = thread ? thread?.id : event.threadRootId || null;
    const valueId = getRoomValueId(roomId, threadId);

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
      // tinyConsole.log(`[room-db-sync] Adding new event "${eventSnap.getId()}"...`);
      const tinyReject = (err) => {
        tinyConsole.error(`[room-db-sync] Error in the event "${eventSnap.getId()}"!`);
        tinyConsole.error('[indexed-db] ERROR SAVING TIMELINE DATA!');
        tinyConsole.error(err);
        tinyThis.emit('dbTimeline-Error', err);
        tinyComplete();
        reject(err);
      };

      const funcComplete = async (result) => {
        await tinyThis.dbManager._setIsThread(eventSnap);
        // tinyConsole.log(`[room-db-sync] Event "${eventSnap.getId()}" added!`);
        tinyComplete();
        resolve(result);
      };

      const eventType = eventSnap.getType();
      if (typeof tinyThis._timelineInsertTypes[eventType] === 'function')
        tinyThis._timelineInsertTypes[eventType](eventSnap)
          .then(async (tinyData) => {
            if (eventType === 'm.room.member') await tinyThis.dbManager.setMember(eventSnap);
            funcComplete(tinyData);
          })
          .catch(tinyReject);
      else {
        tinyThis.dbManager
          .setTimeline(eventSnap)
          .then(async (result) => {
            try {
              if (eventType === 'm.room.redaction')
                await tinyThis.dbManager._sendSetRedaction(eventSnap);
              if (eventType === 'm.room.member') await tinyThis.dbManager.setMember(eventSnap);
              funcComplete(result);
            } catch (err) {
              tinyReject(err);
            }
          })
          .catch(tinyReject);
      }
    });
  }

  async _syncSendEvent(eventId, roomId, threadId, key, originalEvent, type) {
    const mx = initMatrix.matrixClient;
    const room = mx.getRoom(roomId);
    if (room) {
      const mEvent = room.getEventForTxnId(key);
      if (mEvent) this.addToTimeline(mEvent);
      this._syncDeleteSendEvent(roomId, threadId, key, 'dbEventCacheReady', 'SENT');
    }
    if (originalEvent) this.emit('_eventUpdated', type, originalEvent, roomId, threadId, key);
  }

  _syncDeleteSendEvent(roomId, threadId, key, emitName, emitData, originalEvent, type) {
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

  async redactEvent(roomId, mEvent, reason) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const key = genKey();
      tinyConsole.log(`[redact-sender] [${roomId}] Redact the event: ${mEvent.getId()}`);

      initMatrix.matrixClient
        .redactEvent(
          roomId,
          mEvent.getId(),
          key,
          typeof reason === 'undefined' ? undefined : { reason },
        )
        .then((msgData) =>
          tinyThis
            ._syncSendEvent(msgData?.event_id, roomId, undefined, key, mEvent, 'redact')
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
}

// Functions and class
const storageManager = new StorageManager();
export default storageManager;

if (__ENV_APP__.MODE === 'development') {
  global.storageManager = storageManager;
}
