import EventEmitter from 'events';

import tinyConsole from '@src/util/libs/console';

import storageManager from '@src/util/libs/localStorage/StorageManager';
import { timelineCache } from '@src/util/libs/localStorage/cache';

import initMatrix from '../initMatrix';
import cons from './cons';

import { updateRoomInfo } from '../action/navigation';
import urlParams from '../../util/libs/urlParams';
import { getLastLinkedTimeline, getLiveReaders, getEventReaders } from './Timeline/functions';
import installYjs from './Timeline/yjs';
import TinyEventChecker from './Notifications/validator';
import { memberEventAllowed } from '@src/util/Events';
import { waitForTrue } from '@src/util/libs/timeoutLib';

const tinyCheckEvent = new TinyEventChecker();

// Class
class RoomTimeline extends EventEmitter {
  constructor(roomId, threadId, roomAlias = null) {
    super();

    // Add Room
    this.matrixClient = initMatrix.matrixClient;
    this.room = this.matrixClient.getRoom(roomId);
    this.room.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    // Nothing! Tiny cancel time.
    if (this.room === null)
      throw new Error(`Created a RoomTimeline for a room that doesn't exist: ${roomId}`);

    // First install
    installYjs(this);
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this._selectEvent = null;
    this.forceLoad = false;
    this._eventsQueue = { data: [], busy: 0 };
    this._closed = false;

    this.roomId = roomId;
    this.roomAlias = roomAlias;
    this.initialized = false;
    this.firstStart = false;

    this.timelineId = `${roomId}${threadId ? `:${threadId}` : ''}`;

    // These are local timelines
    const timelineCacheData = timelineCache.get(roomId, threadId, true);

    this.timelineCache = timelineCacheData;
    this.timeline = this.timelineCache.timeline;
    for (const item in this.timeline) {
      const mEvent = this.timeline[item];
      if (mEvent.threadId) mEvent.insertThread();
    }

    this._consoleTag = `[timeline] [${roomId}]${threadId ? ` [${threadId}]` : ''}`;

    // Insert live timeline
    this.liveTimeline = this.room.getLiveTimeline();
    this.activeTimeline = this.liveTimeline;

    // Thread Data
    this.thread = null;
    if (threadId) this.threadId = threadId;
    else this.threadId = null;

    // More data
    this.isOngoingPagination = false;
    this._activeEvents();
    tinyConsole.log(`${this._consoleTag} The timeline script is being executed...`);

    // Load Members
    setTimeout(() => this.room.loadMembersIfNeeded());
  }

  _timelineUpdated(eventType, mEvent) {
    tinyConsole.log(
      `${this._consoleTag} [${eventType}]${mEvent ? ` [${mEvent.getType()}]` : ''} Timeline updated!`,
    );
  }

  _activeEvents() {
    const tinyThis = this;

    // Start timeline events
    this._syncComplete = async (roomId, threadId) => {
      if (
        tinyThis._closed ||
        roomId !== this.roomId ||
        (this.threadId && this.threadId !== threadId)
      )
        return;
      await this._insertReactions(this.timeline);
      await this.checkEventThreads(this.timeline);
    };

    this._startTimeline = async (data, eventId) => {
      tinyConsole.log(`${this._consoleTag} Starting timeline`);
      const tinyError = (err) => {
        tinyConsole.error(err);
        alert(err.message, 'Timeline load error');
      };

      if (data.firstTime) {
        try {
          if (tinyThis.threadId) {
            let thread = tinyThis.room.getThread(tinyThis.threadId);
            if (!thread) {
              await initMatrix.matrixClient.getEventTimeline(
                tinyThis.getUnfilteredTimelineSet(),
                tinyThis.threadId,
              );

              const tm = tinyThis.room.getLiveTimeline();
              if (tinyThis.room.hasEncryptionStateEvent()) await decryptAllEventsOfTimeline(tm);
              thread = tinyThis.room.getThread(tinyThis.threadId);
            }

            if (thread) {
              tinyThis.thread = thread;
              thread.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
            }
          }

          const getMsgConfig = tinyThis._buildPagination({ page: 1 });

          if (tinyThis.getPages() < 1) {
            tinyThis._setPages(await storageManager.getMessagesPagination(getMsgConfig));
            tinyThis.emit(cons.events.roomTimeline.PAGES_UPDATED, tinyThis.timelineCache);
          }

          if (tinyThis.timelineCache.timeline.length < 1) {
            if (!eventId || tinyThis.forceLoad) {
              const getMsgTinyCfg = tinyThis._buildPagination({ page: 1 });
              const events = await storageManager.getMessages(getMsgTinyCfg);
              while (tinyThis.timelineCache.timeline.length > 0) {
                tinyThis._deletingEventById(tinyThis.timelineCache.timeline[0].getId());
              }

              for (const item in events) {
                tinyThis._insertIntoTimeline(events[item], undefined, true, true, true);
              }
              await tinyThis.waitTimeline();
              await this._insertReactions(events);
              tinyThis.forceLoad = false;
            } else tinyThis._selectEvent = eventId;
          }

          if (tinyThis._ydoc.initialized) {
            const events = await storageManager.getCrdt(getMsgConfig);
            for (const item in events) {
              const mEvent = events[item];
              tinyThis.sendCrdtToTimeline(mEvent);
            }
          }

          if (tinyThis.getPage() < 1) {
            tinyThis._setPage(1);
            tinyThis.emit(cons.events.roomTimeline.PAGES_UPDATED, tinyThis.timelineCache);
          }

          tinyThis.initialized = true;
          tinyThis.emit(cons.events.roomTimeline.READY, eventId || null);
          tinyConsole.log(`${this._consoleTag} Timeline started`);
          tinyThis.firstStart = true;
        } catch (err) {
          tinyError(err);
        }
      } else {
        tinyThis.initialized = true;
        tinyThis.firstStart = true;
        tinyThis.emit(cons.events.roomTimeline.TIMELINE_INIT_UPDATED, tinyThis.initialized);
      }
    };

    // Message events
    this._onMessage = async (r, mEvent) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.check(mEvent)) return;
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc && !mEvent.isRedacted()) return;
      tinyConsole.log(`${tinyThis._consoleTag} New message: ${mEvent.getId()}`);
      tmc.pages = await storageManager.getMessagesPagination(
        this._buildPagination({ threadId: mEvent.getThreadId(), roomId: mEvent.getRoomId() }),
      );
      // Check event
      if (!mEvent.isSending() || mEvent.getSender() === initMatrix.matrixClient.getUserId()) {
        // Send into the timeline
        tinyThis._insertIntoTimeline(mEvent, tmc);
      }
      return tinyThis._timelineUpdated('message', mEvent);
    };

    this._onYourMessage = async (data, mEvent) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.check(mEvent)) return;
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      tinyThis._insertIntoTimeline(mEvent, tmc);
      return tinyThis._timelineUpdated('your-message', mEvent);
    };

    this._onYourMessageComplete = async (data, mEvent) => {
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      const eventId = mEvent.getId();
      const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex > -1) {
        this.timelineCache.timeline.splice(msgIndex, 1);
        this._deletingEventPlaces(eventId);
      }
      return tinyThis._timelineUpdated('message-complete', mEvent);
    };

    this._onYourMessageError = async (data, mEvent) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.check(mEvent)) return;
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      const eventId = mEvent.getId();
      const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex > -1) {
      }
      return tinyThis._timelineUpdated('message-error', mEvent);
    };

    // Reaction events
    this._onReaction = async (r, mEvent) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.check(mEvent)) return;
      if (!tinyThis.belongToRoom(mEvent)) return;
      tinyThis._insertReaction(mEvent);
      return tinyThis._timelineUpdated('reaction', mEvent);
    };

    // Timeline events
    this._onTimeline = async (r, mEvent) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.check(mEvent)) return;
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      tinyConsole.log(`${tinyThis._consoleTag} New timeline event: ${mEvent.getId()}`);
      if (mEvent.getType() !== 'm.room.redaction') tinyThis._insertIntoTimeline(mEvent, tmc);
      else tinyThis._deletingEvent(mEvent);
      return tinyThis._timelineUpdated('timeline-event', mEvent);
    };

    this._onRedaction = async (info) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.checkIds(info.roomId, info.eventId)) return;
      const { eventId, isRedacted, roomId } = info;
      if (!isRedacted || roomId !== this.roomId) return;
      tinyConsole.log(`${tinyThis._consoleTag} New redaction: ${eventId}`);
      tinyThis._deletingEventById(eventId);
      return tinyThis._timelineUpdated('redaction');
    };

    // Thread added events
    this._onThreadEvent = async (r, event) => {
      await tinyThis.waitTimeline();
      if (!tinyCheckEvent.checkIds(event.room_id, event.event_id)) return;
      if (!event.room_id !== tinyThis.roomId) return;
      tinyConsole.log(`${tinyThis._consoleTag} New thread event: ${event.event_id}`);
      const mEvent = this.findEventById(event.event_id);
      if (!mEvent) return;
      await mEvent.insertThread();
      return tinyThis._timelineUpdated('thread-event');
    };

    // Crdt events
    this._onCrdt = (r, mEvent) => {
      if (!tinyCheckEvent.check(mEvent)) return;
      if (!tinyThis.belongToRoom(mEvent)) return;
      tinyThis.sendCrdtToTimeline(mEvent);
      return tinyThis._timelineUpdated('crdt', mEvent);
    };

    // Updated events
    this._onEventsUpdated = async (type, mEvent, roomId /*, threadId */) => {
      await tinyThis.waitTimeline();
      const eventId = mEvent.getId();

      if (type === 'redact') {
        tinyConsole.log(`${tinyThis._consoleTag} New redaction from local: ${eventId}`);
        tinyThis._deletingEventById(eventId);
        return tinyThis._timelineUpdated('redaction');
      }
    };

    // Event Status Events
    storageManager.on('_eventUpdated', this._onEventsUpdated);
    storageManager.on('dbEventCachePreparing', this._onYourMessage);
    storageManager.on('dbEventCacheReady', this._onYourMessageComplete);
    storageManager.on('dbEventCacheError', this._onYourMessageError);

    // Prepare events
    storageManager.on('timelineSyncComplete', this._syncComplete);
    storageManager.on('timelineSyncNext', this._syncComplete);
    storageManager.on('dbCrdt', this._onCrdt);
    storageManager.on('dbMessage', this._onMessage);
    storageManager.on('dbMessageUpdate', this._onMessage);
    storageManager.on('dbReaction', this._onReaction);
    storageManager.on('dbTimeline', this._onTimeline);
    storageManager.on('dbEventRedaction', this._onRedaction);
    storageManager.on('dbThreads', this._onThreadEvent);
    storageManager.on(
      `dbTimelineLoaded-${this.roomId}${this.threadId ? `-${this.threadId}` : ''}`,
      this._startTimeline,
    );
  }

  async waitFirstSync() {
    if (this.firstStart) return true;
    else {
      const tinyThis = this;
      return waitForTrue(() => true, 100);
    }
  }

  // Load live timeline
  async loadLiveTimeline() {
    this.activeTimeline = this.liveTimeline;

    if (this.threadId) {
      this.thread = this.threadId && this.room ? this.room.getThread(this.threadId) : null;
      if (!this.thread) {
        this.thread = await initMatrix.matrixClient.getThreadTimeline(
          this.liveTimeline,
          this.threadId,
        );
      }

      if (this.thread) {
        this.liveTimeline = this.thread.liveTimeline;
        this.activeTimeline = this.liveTimeline;
      }
    }

    this.syncTimeline();
    updateRoomInfo();
    return true;
  }

  syncTimeline() {
    if (this.timeline.length > 0)
      storageManager.warnTimeline(
        this.roomId,
        this.threadId,
        this.timeline[this.timeline.length - 1].getId(),
        {
          firstTime: true,
          isNext: false,
        },
      );
    else storageManager.syncTimeline(this.roomId, this.threadId);
  }

  // Load Event timeline
  async loadEventTimeline(eventId) {
    try {
      if (!this.hasEventInTimeline(eventId)) {
        this._selectEvent = eventId;
        await this.paginateTimeline(true);
      }

      this.emit(cons.events.roomTimeline.READY, eventId);
      if (typeof eventId === 'string' && eventId.length > 0) urlParams.set('event_id', eventId);
      else urlParams.delete('event_id');
      return true;
    } catch {
      return false;
    }
  }

  // Belong to Room
  belongToRoom(event) {
    return (
      event.getRoomId() === this.roomId && (!this.threadId || event.getThreadId() === this.threadId)
    );
  }

  belongToTimelineList(event) {
    return this.getTimelineCache(event) ? true : false;
  }

  // Can load page
  canLoadNextPage() {
    return !this.isRoomSyncing() && !this.isOngoingPagination && this.initialized;
  }

  // Is room syncing
  isRoomSyncing() {
    return storageManager.isRoomSyncing(this.roomId, this.threadId);
  }

  // Is room syncing last received events
  isRoomSyncingTmLast() {
    return storageManager.isRoomSyncingTmLast(this.roomId, this.threadId);
  }

  // Build pagination
  _buildPagination(config = {}) {
    const threadId = config.threadId || this.threadId;
    const roomId = config.roomId || this.roomId;
    return timelineCache.buildPagination(roomId, threadId, config);
  }

  async checkEventThreads(newEvent) {
    // Get event list
    const queryEvents = [];
    const queryEvents2 = [];
    if (!Array.isArray(newEvent)) {
      if (!newEvent.thread) {
        queryEvents.push(newEvent.getId());
        queryEvents2.push(newEvent);
      }
    } else
      for (const item in newEvent) {
        if (!newEvent[item].thread) {
          queryEvents.push(newEvent[item].getId());
          queryEvents2.push(newEvent[item]);
        }
      }

    // Get thread
    if (queryEvents.length > 0) {
      const tEvents = await storageManager.getThreads({
        roomId: this.roomId,
        eventId: queryEvents,
      });

      if (tEvents) {
        for (const item in tEvents) {
          const threadEvent = tEvents[item];

          if (
            threadEvent.thread &&
            typeof threadEvent.thread.fetch === 'function' &&
            !threadEvent.thread.initialized
          )
            await threadEvent.thread.fetch();

          // Replace to new event
          queryEvents2
            .find((event) => event.getId() === threadEvent.getId())
            .replaceThread(threadEvent);
        }
      }
    }
  }

  _autoUpdateEvent(thread, mEvent) {
    // tinyConsole.log('[timeline] Event room updated!', mEvent);
  }

  async _addEventQueue(ignoredReactions = false) {
    // Add event
    const tinyThis = this;
    const eventQueue = this._eventsQueue.data.shift();
    if (eventQueue) {
      // Complete
      const tinyComplete = () => {
        if (tinyThis._eventsQueue.data.length < 1) this._eventsQueue.busy--;
        else tinyThis._addEventQueue(ignoredReactions);
      };

      try {
        const { mEvent, tmc, isFirstTime, forceAdd } = eventQueue;
        // Validate
        if (!memberEventAllowed(mEvent.getMemberEventType(), true)) {
          tinyComplete();
          return;
        }

        // Complete
        const eventInserted = await timelineCache.updateItem(
          mEvent,
          tmc,
          (removedEvent) => {
            tinyThis._deletingEventPlaces(removedEvent.getId());
            // Event removed
          },
          forceAdd,
        );
        if (eventInserted) {
          if (tmc.roomId === this.roomId && (!tmc.threadId || tmc.threadId === this.threadId)) {
            if (mEvent.isEdited())
              this.getEditedTimeline().set(mEvent.getId(), [mEvent.getEditedContent()]);
            if (!isFirstTime) this.emit(cons.events.roomTimeline.EVENT, mEvent);
            // Event added
          }
        }
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Timeline updater error!');
      }

      // Complete
      tinyComplete();
    }
  }

  // Insert into timeline
  _insertIntoTimeline(
    mEvent,
    tmc = this.timelineCache,
    isFirstTime = false,
    forceAdd = false,
    ignoredReactions = false,
  ) {
    this._eventsQueue.data.push({ mEvent, tmc, isFirstTime, forceAdd });
    this._eventsQueue.data.sort((a, b) => a.mEvent.getTs() - b.mEvent.getTs());
    if (this._eventsQueue.busy < 1) {
      this._eventsQueue.busy++;
      this._addEventQueue(ignoredReactions);
    }
  }

  // Pagination
  async paginateTimeline(backwards = false) {
    // Initialization
    if (this.isOngoingPagination) return false;
    const oldPage = this.getPage();

    if (typeof backwards === 'boolean') {
      if (backwards) this._addPage();
      else this._subPage();
    } else if (typeof backwards === 'number') this._setPage(backwards);

    this.isOngoingPagination = true;

    // Old Size
    const oldSize = this.timelineCache.timeline.length;

    // Try time
    try {
      // Get Last Page
      if (this.getPage() > 1 && !this.timelineCache.lastEvent) {
        const firstTimeline = await storageManager.getMessages(
          this._buildPagination({ page: 1, limit: 1 }),
        );
        if (firstTimeline[0]) this.timelineCache.lastEvent = firstTimeline[0];
      }

      if (oldPage > 0 || this._selectEvent) {
        let events;
        const tinyThis = this;

        // Normal get page
        const normalGetData = async () => {
          tinyThis._setPages(await storageManager.getMessagesPagination(this._buildPagination()));
          events = await storageManager.getMessages(
            this._buildPagination({ page: this.getPage() }),
          );
          tinyThis.emit(cons.events.roomTimeline.PAGES_UPDATED, tinyThis.timelineCache);
        };

        // Remove old timeline
        const clearTimeline = () => {
          while (tinyThis.timelineCache.timeline.length > 0) {
            tinyThis._deletingEventById(tinyThis.timelineCache.timeline[0].getId());
          }
        };

        // Normal get page
        if (!this._selectEvent) {
          await normalGetData();
          clearTimeline();
        }

        // Use event id
        if (this._selectEvent) {
          const data = await storageManager.getLocationMessagesId(
            this._buildPagination({ eventId: this._selectEvent }),
          );

          if (data && data.success) {
            this._setPages(data.pages);
            this._setPage(data.page);
            events = data.items;
            tinyThis.emit(cons.events.roomTimeline.PAGES_UPDATED, tinyThis.timelineCache);
          } else await normalGetData();

          this._selectEvent = null;
          clearTimeline();
        }

        // Insert events into the timeline
        if (Array.isArray(events)) {
          for (const item in events) {
            this._insertIntoTimeline(events[item], undefined, true, true, true);
          }
          await this.waitTimeline();
          await this._insertReactions(events);
        }
      }

      // Loaded Check
      const loaded = this.timelineCache.timeline.length - oldSize;

      // Complete
      this.emit(cons.events.roomTimeline.PAGINATED, backwards, loaded);
      this.isOngoingPagination = false;

      updateRoomInfo();
      urlParams.delete('event_id');
      return true;
    } catch {
      // Error
      this.emit(cons.events.roomTimeline.PAGINATED, backwards, 0);
      this.isOngoingPagination = false;
      return false;
    }
  }

  // Get Event data
  getUnreadEventIndex(readUpToEventId) {
    if (!this.hasEventInTimeline(readUpToEventId)) return -1;

    const readUpToEvent = this.findEventByIdInTimelineSet(readUpToEventId);
    if (!readUpToEvent) return -1;
    const rTs = readUpToEvent.getTs();

    const tLength = this.timelineCache.timeline.length;

    for (let i = 0; i < tLength; i += 1) {
      const mEvent = this.timelineCache.timeline[i];
      if (mEvent.getTs() > rTs) return i;
    }

    return -1;
  }

  // Simpler scripts

  // Checar se isso ainda vai continuar sendo usado.
  getUnfilteredTimelineSet() {
    return !this.thread
      ? this.room.getUnfilteredTimelineSet()
      : this.thread.getUnfilteredTimelineSet();
  }

  // Checar se isso ainda vai continuar sendo usado.
  isServingLiveTimeline() {
    return getLastLinkedTimeline(this.activeTimeline) === this.liveTimeline;
  }

  canPaginateBackward() {
    if (
      this.timelineCache.timeline[0] &&
      this.timelineCache.timeline[0]?.getType() === 'm.room.create'
    )
      return false;
    return this.getPage() !== this.getPages();
  }

  canPaginateForward() {
    return this.getPage() > 1;
  }

  getReadUpToEventId() {
    const userId = this.matrixClient.getUserId();
    if (!userId) return null;
    return this.timelineCache.lastEvent ? this.timelineCache.lastEvent.getId() : null;
  }

  removeInternalListeners() {
    if (!this._closed) {
      this._eventsQueue.data = [];
      this._eventsQueue.busy = 0;
      this.initialized = false;

      this._disableYdoc();

      storageManager.off('_eventUpdated', this._onEventsUpdated);
      storageManager.off('timelineSyncComplete', this._syncComplete);
      storageManager.off('timelineSyncNext', this._syncComplete);
      storageManager.off('dbEventCachePreparing', this._onYourMessage);
      storageManager.off('dbEventCacheReady', this._onYourMessageComplete);
      storageManager.off('dbEventCacheError', this._onYourMessageError);
      storageManager.off('dbCrdt', this._onCrdt);
      storageManager.off('dbMessage', this._onMessage);
      storageManager.off('dbMessageUpdate', this._onMessage);
      storageManager.off('dbReaction', this._onReaction);
      storageManager.off('dbTimeline', this._onTimeline);
      storageManager.off('dbEventRedaction', this._onRedaction);
      storageManager.off('dbThreads', this._onThreadEvent);
      storageManager.off(
        `dbTimelineLoaded-${this.roomId}${this.threadId ? `-${this.threadId}` : ''}`,
        this._startTimeline,
      );

      this._closed = true;
    }
  }

  // Get User renders
  getEventReaders(mEvent) {
    return getEventReaders(this.room, this.liveTimeline, mEvent);
  }

  getLiveReaders() {
    return getLiveReaders(this.room, this.liveTimeline);
  }

  getEvents() {
    return this.timelineCache.timeline;
  }

  // Has Event inside the visible timeline
  hasEventInTimeline(eventId) {
    return this.getEventIndex(eventId) > -1 ? true : false;
  }

  // Other scripts
  waitTimeline() {
    const tinyThis = this;
    return waitForTrue(() => tinyThis._eventsQueue.busy < 1, 300);
  }

  getEventIndex(eventId) {
    return this.timelineCache.timeline.findIndex((mEvent) => mEvent.getId() === eventId);
  }

  findEventByIdInTimelineSet(eventId) {
    return this.findEventById(eventId);
  }

  findEventById(eventId) {
    return this.timelineCache.timeline[this.getEventIndex(eventId)] ?? null;
  }

  isEncrypted() {
    return this.room && this.room.hasEncryptionStateEvent();
  }

  setPage(page) {
    return this.paginateTimeline(page);
  }

  setForceLoad(value) {
    if (typeof value === 'boolean') this.forceLoad = value;
  }

  // Timeline cache
  getTimelineCache(event) {
    const threadId = event.getThreadId();
    const roomId = event.getRoomId();
    return timelineCache.get(roomId, threadId);
  }

  _insertReaction(mEvent) {
    const result = timelineCache.insertReaction(this.roomId, this.threadId, mEvent);
    if (result.inserted) this.emit(cons.events.roomTimeline.EVENT, mEvent);
    if (result.deleted) this.emit(cons.events.roomTimeline.EVENT_REDACTED, mEvent);
  }

  async _insertReactions(events) {
    const result = await timelineCache.insertReactions(this.roomId, this.threadId, events);
    for (const index in result) {
      if (result[index].data.inserted)
        this.emit(cons.events.roomTimeline.EVENT, result[index].mEvent);
      if (result[index].data.deleted)
        this.emit(cons.events.roomTimeline.EVENT_REDACTED, result[index].mEvent);
    }
  }

  _deletingEvent(event) {
    const rEvent = timelineCache.deletingEvent(this.roomId, this.threadId, event);
    if (rEvent) this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent);
  }

  _deletingEventById(redacts) {
    const rEvent = timelineCache.deletingEventById(this.roomId, this.threadId, redacts);
    if (rEvent) this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent);
  }

  _deletingEventPlaces(redacts) {
    const rEvent = timelineCache.deletingEventPlaces(this.roomId, this.threadId, redacts);
    if (rEvent) this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent);
  }

  getPages() {
    return timelineCache.getPages(this.roomId, this.threadId);
  }

  getPage() {
    return timelineCache.getPage(this.roomId, this.threadId);
  }

  _setPages(value) {
    return timelineCache.setPages(this.roomId, this.threadId, value);
  }

  _setPage(value) {
    return timelineCache.setPage(this.roomId, this.threadId, value);
  }

  _addPage(value) {
    return timelineCache.addPageValue(this.roomId, this.threadId, value);
  }

  _subPage(value) {
    return timelineCache.subPageValue(this.roomId, this.threadId, value);
  }

  getEditedTimeline() {
    return timelineCache.get(this.roomId, this.threadId)?.editedTimeline;
  }

  getReactionTimeline() {
    return timelineCache.get(this.roomId, this.threadId)?.reactionTimeline;
  }
}

export default RoomTimeline;
