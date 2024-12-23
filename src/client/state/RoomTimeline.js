import EventEmitter from 'events';

import storageManager, { timelineCache } from '@src/util/libs/Localstorage';
import { getAppearance } from '@src/util/libs/appearance';

import initMatrix from '../initMatrix';
import cons from './cons';

import { updateRoomInfo } from '../action/navigation';
import urlParams from '../../util/libs/urlParams';
import { getLastLinkedTimeline, getLiveReaders, getEventReaders } from './Timeline/functions';
import installYjs from './Timeline/yjs';
import { memberEventAllowed } from '@src/app/organisms/room/MemberEvents';

// Class
class RoomTimeline extends EventEmitter {
  constructor(roomId, threadId, roomAlias = null) {
    super();
    installYjs(this);

    // These are local timelines
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this._selectEvent = null;
    this.forceLoad = false;
    this._eventsQueue = { data: [], busy: 0 };
    this._closed = false;

    // Client Prepare
    this.matrixClient = initMatrix.matrixClient;
    this.roomId = roomId;
    this.roomAlias = roomAlias;
    this.initialized = false;
    this.firstStart = false;

    this.editedTimeline = new Map();
    this.reactionTimeline = new Map();

    this.room = this.matrixClient.getRoom(roomId);
    this.room.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    this.timelineId = `${roomId}${threadId ? `:${threadId}` : ''}`;

    if (!timelineCache[this.timelineId])
      timelineCache[this.timelineId] = {
        timeline: [],
        page: 0,
        pages: 0,
        lastEvent: null,
        threadId,
        roomId,
      };

    this.timelineCache = timelineCache[this.timelineId];
    this.timeline = this.timelineCache.timeline;
    for (const item in this.timeline) {
      const mEvent = this.timeline[item];
      if (mEvent.threadId) mEvent.insertThread();
    }

    this._consoleTag = `[timeline] [${roomId}]${threadId ? ` [${threadId}]` : ''}`;

    // Nothing! Tiny cancel time.
    if (this.room === null) {
      throw new Error(`Created a RoomTimeline for a room that doesn't exist: ${roomId}`);
    }

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

    // Load Members
    setTimeout(() => this.room.loadMembersIfNeeded());
  }

  getPages() {
    return this.timelineCache.pages;
  }

  getPage() {
    return this.timelineCache.page;
  }

  setPage(page) {
    return this.paginateTimeline(page);
  }

  setForceLoad(value) {
    if (typeof value === 'boolean') this.forceLoad = value;
  }

  _activeEvents() {
    const tinyThis = this;

    // Start timeline events
    this._startTimeline = async (data, eventId) => {
      if (tinyThis._closed) return;
      console.log(`${this._consoleTag} Starting timeline`);
      const tinyError = (err) => {
        console.error(err);
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

          if (tinyThis.timelineCache.pages < 1) {
            tinyThis.timelineCache.pages = await storageManager.getMessagesPagination(getMsgConfig);
            tinyThis.emit(cons.events.roomTimeline.PAGES_UPDATED, tinyThis.timelineCache);
          }

          if (tinyThis.timelineCache.timeline.length < 1) {
            if (!eventId || tinyThis.forceLoad) {
              const getMsgTinyCfg = tinyThis._buildPagination({ page: 1 });
              const events = await storageManager.getMessages(getMsgTinyCfg);
              while (tinyThis.timelineCache.timeline.length > 0) {
                tinyThis._deletingEventById(tinyThis.timelineCache.timeline[0].getId());
              }

              if (tinyThis._closed) return;
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

          if (tinyThis.timelineCache.page < 1) {
            tinyThis.timelineCache.page = 1;
            tinyThis.emit(cons.events.roomTimeline.PAGES_UPDATED, tinyThis.timelineCache);
          }

          tinyThis.initialized = true;
          tinyThis.emit(cons.events.roomTimeline.READY, eventId || null);
          console.log(`${this._consoleTag} Timeline started`);
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
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc && !mEvent.isRedacted()) return;
      tmc.pages = await storageManager.getMessagesPagination(
        this._buildPagination({ threadId: mEvent.getThreadId(), roomId: mEvent.getRoomId() }),
      );
      // Check event
      if (!mEvent.isSending() || mEvent.getSender() === initMatrix.matrixClient.getUserId()) {
        // Send into the timeline
        if (tinyThis._closed) return;
        tinyThis._insertIntoTimeline(mEvent, tmc);
      }
    };

    this._onYourMessage = (data, mEvent) => {
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      tinyThis._insertIntoTimeline(mEvent, tmc);
    };

    this._onYourMessageComplete = (data, mEvent) => {
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      const eventId = mEvent.getId();
      const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex > -1) {
        this.timelineCache.timeline.splice(msgIndex, 1);
        this._deletingEventPlaces(eventId);
      }
    };

    this._onYourMessageError = (data, mEvent) => {
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      const eventId = mEvent.getId();
      const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex > -1) {
      }
    };

    // Reaction events
    this._onReaction = (r, mEvent) => {
      if (!tinyThis.belongToRoom(mEvent)) return;
      // Reactions
    };

    // Timeline events
    this._onTimeline = (r, mEvent) => {
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc) return;
      if (mEvent.getType() !== 'm.room.redaction') tinyThis._insertIntoTimeline(mEvent, tmc);
      else tinyThis._deletingEvent(mEvent);
    };

    // Thread added events
    this._onThreadEvent = (r, event) => {
      if (!event.room_id !== tinyThis.roomId) return;
      const mEvent = this.findEventById(event.event_id);
      if (!mEvent) return;
      mEvent.insertThread();
    };

    // Crdt events
    this._onCrdt = (r, mEvent) => {
      if (!tinyThis.belongToRoom(mEvent)) return;
      tinyThis.sendCrdtToTimeline(mEvent);
    };

    // Event Status Events
    storageManager.on('dbEventCachePreparing', this._onYourMessage);
    storageManager.on('dbEventCacheReady', this._onYourMessageComplete);
    storageManager.on('dbEventCacheError', this._onYourMessageError);

    // Prepare events
    storageManager.on('dbCrdt', this._onCrdt);
    storageManager.on('dbMessage', this._onMessage);
    storageManager.on('dbMessageUpdate', this._onMessage);
    storageManager.on('dbReaction', this._onReaction);
    storageManager.on('dbTimeline', this._onTimeline);
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
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          tinyThis.waitFirstSync().then(resolve).catch(reject);
        }, 100);
      });
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

  refreshLiveTimeline() {
    return storageManager.refreshLiveTimeline(this.room, this.threadId);
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

  // Get TimelineCache
  getTimelineCache(event) {
    const threadId = event.getThreadId();
    const roomId = event.getRoomId();
    return timelineCache[`${roomId}${threadId ? `:${threadId}` : ''}`];
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
    const page = config.page;
    const eventId = config.eventId;
    const limit = config.limit || getAppearance('pageLimit');

    const getMsgConfig = {
      roomId: roomId,
      showRedaction: false,
    };

    if (typeof limit === 'number') {
      if (!Number.isNaN(limit) && Number.isFinite(limit) && limit > 0) getMsgConfig.limit = limit;
    } else getMsgConfig.limit = 10;

    if (typeof page === 'number') getMsgConfig.page = page;
    if (!threadId) getMsgConfig.showThreads = false;
    if (typeof eventId === 'string' || Array.isArray(eventId)) getMsgConfig.eventId = eventId;
    else getMsgConfig.threadId = threadId;
    return getMsgConfig;
  }

  getRelateToId(mEvent) {
    const relation = mEvent.getRelation();
    return relation && (relation.event_id ?? null);
  }

  async _insertReactions(newEvent) {
    if (this._closed) return;
    // Get event list
    const queryEvents = [];
    if (!Array.isArray(newEvent)) queryEvents.push(newEvent.getId());
    else for (const item in newEvent) queryEvents.push(newEvent[item].getId());

    const events = [];
    await storageManager.getReactions(this._buildPagination({ limit: NaN }));

    // Insert reactions
    for (const item in events) {
      const mEvent = events[item];

      const relateToId = this.getRelateToId(mEvent);
      if (relateToId === null) return null;
      const mEventId = mEvent.getId();

      if (!this.reactionTimeline.has(relateToId)) this.reactionTimeline.set(relateToId, []);
      const mEvents = myMap.get(relateToId);
      if (mEvents.find((ev) => ev.getId() === mEventId)) return;
      mEvents.push(mEvent);
    }
  }

  async _checkEventThreads(newEvent) {
    if (this._closed) return;

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
    // console.log('[timeline] Event room updated!', mEvent);
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

        // Get info
        const pageLimit = getAppearance('pageLimit');
        const eventTs = mEvent.getTs();
        if (
          // Is page 1
          (tmc.page < 2 || forceAdd) &&
          // Exist?
          !mEvent.isRedacted() &&
          // More validation
          cons.supportEventTypes.indexOf(mEvent.getType()) > -1 &&
          // Timeline limit or by event time?
          (tmc.timeline.length < pageLimit || eventTs > tmc.timeline[0].getTs())
        ) {
          // Update last event
          const eventId = mEvent.getId();
          if (!tmc.lastEvent || eventTs > tmc.lastEvent.getTs()) tmc.lastEvent = mEvent;

          // Add reactions and more stuff
          if (!ignoredReactions) {
            await this._insertReactions(mEvent);
            await this._checkEventThreads(mEvent);
          }

          // Insert event
          const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
          if (msgIndex < 0) {
            // Check thread
            if (
              mEvent.thread &&
              typeof mEvent.thread.fetch === 'function' &&
              !mEvent.thread.initialized
            )
              await mEvent.thread.fetch();

            // Add event
            tmc.timeline.push(mEvent);
            if (tmc.timeline.length > pageLimit) {
              // Remove event
              const removedEvent = tmc.timeline.shift();
              this._deletingEventPlaces(removedEvent.getId());
            }

            // Sort list
            tmc.timeline.sort((a, b) => a.getTs() - b.getTs());
          } else tmc.timeline[msgIndex] = mEvent;

          // Complete
          if (tmc.roomId === this.roomId && (!tmc.threadId || tmc.threadId === this.threadId)) {
            if (mEvent.isEdited()) this.editedTimeline.set(eventId, [mEvent.getEditedContent()]);
            if (!isFirstTime) this.emit(cons.events.roomTimeline.EVENT, mEvent);
            this._addingEventPlaces(mEvent);
          }
        }
      } catch (err) {
        console.error(err);
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

  waitTimeline() {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      if (tinyThis._eventsQueue.busy < 1) resolve();
      else setTimeout(() => tinyThis.waitTimeline().then(resolve).catch(reject), 300);
    });
  }

  // Deleting events
  _deletingEventPlaces(redacts) {
    this.editedTimeline.delete(redacts);
    this.reactionTimeline.delete(redacts);
    const mEvent = this.findEventById(redacts);
    if (mEvent) {
      mEvent.off('PonyHouse.ThreatInitialized', this._autoUpdateEvent);
    }
  }

  _addingEventPlaces(mEvent) {
    mEvent.on('PonyHouse.ThreatInitialized', this._autoUpdateEvent);
  }

  _deletingEvent(event) {
    return this._deletingEventById(event.getContent()?.redacts);
  }

  _deletingEventById(redacts, event = null) {
    const rEvent = this.deleteFromTimeline(redacts);
    this._deletingEventPlaces(redacts);
    this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent, event);
  }

  // Pagination
  async paginateTimeline(backwards = false) {
    if (this._closed) return;
    // Initialization
    if (this.isOngoingPagination) return false;
    const oldPage = this.timelineCache.page;

    if (typeof backwards === 'boolean') {
      if (backwards) this.timelineCache.page++;
      else this.timelineCache.page--;
    } else if (typeof backwards === 'number') this.timelineCache.page = backwards;

    this.isOngoingPagination = true;

    // Old Size
    const oldSize = this.timelineCache.timeline.length;

    // Try time
    try {
      // Get Last Page
      if (this.timelineCache.page > 1 && !this.timelineCache.lastEvent) {
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
          tinyThis.timelineCache.pages = await storageManager.getMessagesPagination(
            this._buildPagination(),
          );
          events = await storageManager.getMessages(
            this._buildPagination({ page: this.timelineCache.page }),
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
            this.timelineCache.pages = data.pages;
            this.timelineCache.page = data.page;
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
  deleteFromTimeline(eventId) {
    const i = this.getEventIndex(eventId);
    if (i === -1) return undefined;
    return this.timelineCache.timeline.splice(i, 1)[0];
  }

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
    return this.timelineCache.page !== this.timelineCache.pages;
  }

  canPaginateForward() {
    return this.timelineCache.page > 1;
  }

  isEncrypted() {
    return this.room && this.room.hasEncryptionStateEvent();
  }

  getReadUpToEventId() {
    const userId = this.matrixClient.getUserId();
    if (!userId) return null;
    return this.timelineCache.lastEvent ? this.timelineCache.lastEvent.getId() : null;
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

  removeInternalListeners() {
    this._disableYdoc();
    storageManager.off('dbEventCachePreparing', this._onYourMessage);
    storageManager.off('dbEventCacheReady', this._onYourMessageComplete);
    storageManager.off('dbEventCacheError', this._onYourMessageError);
    storageManager.off('dbCrdt', this._onCrdt);
    storageManager.off('dbMessage', this._onMessage);
    storageManager.off('dbMessageUpdate', this._onMessage);
    storageManager.off('dbReaction', this._onReaction);
    storageManager.off('dbTimeline', this._onTimeline);
    storageManager.off('dbThreads', this._onThreadEvent);
    storageManager.off(
      `dbTimelineLoaded-${this.roomId}${this.threadId ? `-${this.threadId}` : ''}`,
      this._startTimeline,
    );

    for (const item in this.timeline) this._deletingEventPlaces(this.timeline[item].getId());
    this._closed = true;
  }
}

export default RoomTimeline;
