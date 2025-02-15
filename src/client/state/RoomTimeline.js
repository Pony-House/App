import EventEmitter from 'events';

import tinyConsole from '@src/util/libs/console';

import storageManager from '@src/util/libs/localStorage/StorageManager';
import { timelineCache } from '@src/util/libs/localStorage/cache';
import TimelineCacheEvents from '@src/util/libs/localStorage/TimelineCache/Events';

import initMatrix from '../initMatrix';
import cons from './cons';

import { updateRoomInfo } from '../action/navigation';
import urlParams from '../../util/libs/urlParams';
import { getLastLinkedTimeline, getLiveReaders, getEventReaders } from './Timeline/functions';
import { waitForTrue } from '@src/util/libs/timeoutLib';

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

    // installYjs(this);

    // First install
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this._selectEvent = null;
    this.forceLoad = false;
    this._closed = false;

    this.roomId = roomId;
    this.roomAlias = roomAlias;
    this.initialized = false;
    this.firstStart = false;

    // These are local timelines
    const timelineCacheData = timelineCache.getData(roomId, threadId, true);

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

  _activeEvents() {
    const tinyThis = this;

    // Start timeline events
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
                timelineCache._deletingEventById(
                  tinyThis.roomId,
                  tinyThis.threadId,
                  tinyThis.timelineCache.timeline[0].getId(),
                );
              }

              for (const item in events) {
                timelineCache.insertIntoTimeline(
                  events[item],
                  tinyThis.roomId,
                  tinyThis.threadId,
                  tinyThis.timelineCache,
                  true,
                  true,
                  true,
                );
              }
              await tinyThis.waitTimeline();
              await timelineCache._insertReactions(this.roomId, this.threadId, events);
              tinyThis.forceLoad = false;
            } else tinyThis._selectEvent = eventId;
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

    this._onNewEventAdded = (mEvent) => this.emit(cons.events.roomTimeline.EVENT, mEvent);
    this._onNewEventRemoved = (mEvent) =>
      this.emit(cons.events.roomTimeline.EVENT_REDACTED, mEvent);

    timelineCache.on(
      TimelineCacheEvents.insertId('Event', this.roomId, this.threadId),
      this._onNewEventAdded,
    );

    timelineCache.on(
      TimelineCacheEvents.insertId('EventRedaction', this.roomId, this.threadId),
      this._onNewEventRemoved,
    );

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
            timelineCache._deletingEventById(
              tinyThis.roomId,
              tinyThis.threadId,
              tinyThis.timelineCache.timeline[0].getId(),
            );
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
            timelineCache.insertIntoTimeline(
              events[item],
              this.roomId,
              this.threadId,
              this.timelineCache,
              true,
              true,
              true,
            );
          }
          await this.waitTimeline();
          await timelineCache._insertReactions(this.roomId, this.threadId, events);
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
      this.initialized = false;

      // this._disableYdoc();

      timelineCache.off(
        TimelineCacheEvents.insertId('Event', this.roomId, this.threadId),
        this._onNewEventAdded,
      );

      timelineCache.off(
        TimelineCacheEvents.insertId('EventRedaction', this.roomId, this.threadId),
        this._onNewEventRemoved,
      );

      storageManager.off(
        `dbTimelineLoaded-${this.roomId}${this.threadId ? `-${this.threadId}` : ''}`,
        this._startTimeline,
      );

      this._closed = true;
    }
  }

  // Build pagination
  _buildPagination(config = {}) {
    const threadId = config.threadId || this.threadId;
    const roomId = config.roomId || this.roomId;
    return timelineCache.buildPagination(roomId, threadId, config);
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

  findEventByIdInTimelineSet(eventId) {
    return this.findEventById(eventId);
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
    return timelineCache.getData(roomId, threadId);
  }

  findEventById(eventId) {
    return timelineCache.findEventById(this.roomId, this.threadId, eventId);
  }

  getEventIndex(eventId) {
    return timelineCache.getEventIndex(this.roomId, this.threadId, eventId);
  }

  waitTimeline() {
    return timelineCache.waitTimeline(this.roomId, this.threadId);
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
    return timelineCache.getData(this.roomId, this.threadId)?.editedTimeline;
  }

  getReactionTimeline() {
    return timelineCache.getData(this.roomId, this.threadId)?.reactionTimeline;
  }
}

export default RoomTimeline;
