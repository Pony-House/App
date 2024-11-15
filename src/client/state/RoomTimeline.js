import EventEmitter from 'events';

import storageManager from '@src/util/libs/Localstorage';
import { getAppearance } from '@src/util/libs/appearance';

import initMatrix from '../initMatrix';
import cons from './cons';

import { updateRoomInfo } from '../action/navigation';
import urlParams from '../../util/libs/urlParams';
import tinyFixScrollChat from '../../app/molecules/media/mediaFix';
import {
  isEdited,
  isReaction,
  hideMemberEvents,
  getLastLinkedTimeline,
} from './Timeline/functions';
import installYjs from './Timeline/yjs';

const timelineCache = {};

// Class
class RoomTimeline extends EventEmitter {
  constructor(roomId, threadId, roomAlias = null) {
    super();
    installYjs(this);

    // These are local timelines
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this._selectEvent = null;
    this.forceLoad = false;

    // Client Prepare
    this.matrixClient = initMatrix.matrixClient;
    this.roomId = roomId;
    this.roomAlias = roomAlias;
    this.initialized = false;
    this.ended = false;

    this.editedTimeline = new Map();
    this.reactionTimeline = new Map();

    this.room = this.matrixClient.getRoom(roomId);
    this.room.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    this.timelineId = `${roomId}${threadId ? `_${threadId}` : ''}`;

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
      if (!tinyThis.ended) {
        console.log(`[timeline] Starting timeline ${this.roomId}`);
        const tinyError = (err) => {
          console.error(err);
          alert(err.message, 'Timeline load error');
        };

        if (!data.err) {
          if (data.firstTime) {
            try {
              if (tinyThis.threadId) {
                let thread = tinyThis.room.getThread(tinyThis.threadId);
                if (!thread) {
                  await initMatrix.matrixClient.getEventTimeline(
                    tinyThis.room.getUnfilteredTimelineSet(),
                    tinyThis.threadId,
                  );

                  if (!tinyThis.ended) {
                    const tm = tinyThis.room.getLiveTimeline();
                    if (tinyThis.room.hasEncryptionStateEvent())
                      await decryptAllEventsOfTimeline(tm);
                    thread = tinyThis.room.getThread(tinyThis.threadId);
                  }
                }

                if (thread) {
                  tinyThis.thread = thread;
                  thread.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
                }
              }

              if (!tinyThis.ended) {
                const getMsgConfig = tinyThis._buildPagination({ page: 1 });

                if (tinyThis.timelineCache.pages < 1) {
                  tinyThis.timelineCache.pages =
                    await storageManager.getMessagesPagination(getMsgConfig);
                }

                if (tinyThis.timelineCache.timeline.length < 1) {
                  if (!eventId || tinyThis.forceLoad) {
                    const events = await storageManager.getMessages(getMsgConfig);
                    while (tinyThis.timelineCache.timeline.length > 0) {
                      tinyThis._deletingEventById(tinyThis.timelineCache.timeline[0].getId());
                    }

                    if (!tinyThis.ended) {
                      for (const item in events) {
                        tinyThis._insertIntoTimeline(events[item], undefined, true, true);
                      }
                    }
                    tinyThis.forceLoad = false;
                  } else tinyThis._selectEvent = eventId;
                }

                if (!tinyThis.ended) {
                  if (tinyThis._ydoc.initialized) {
                    const events = await storageManager.getCrdt(getMsgConfig);
                    if (!tinyThis.ended) {
                      for (const item in events) {
                        const mEvent = events[item];
                        tinyThis.sendCrdtToTimeline(mEvent);
                      }
                    }
                  }

                  if (!tinyThis.ended) {
                    // if(!tinyThis.initialized) tinyThis.paginateTimeline(true);
                    tinyThis.initialized = true;
                    tinyThis.emit(cons.events.roomTimeline.READY, eventId || null);
                    console.log(`[timeline] Timeline started ${this.roomId}`);
                  }
                }
              }
            } catch (err) {
              tinyError(err);
            }
          }
        } else tinyError(data.err);
      }
    };

    // Message events
    this._onMessage = async (r, mEvent) => {
      const tmc = tinyThis.getTimelineCache(mEvent);
      if (!tmc && !mEvent.isRedacted()) return;
      if (!tinyThis.ended) {
        tmc.pages = await storageManager.getMessagesPagination(
          this._buildPagination({ threadId: mEvent.getThreadId(), roomId: mEvent.getRoomId() }),
        );
        if (!tinyThis.ended) {
          // Check event
          if (!mEvent.isSending() || mEvent.getSender() === initMatrix.matrixClient.getUserId()) {
            // Check isEdited

            // Send into the timeline
            tinyThis._insertIntoTimeline(mEvent, tmc);
          }
        }
      }
    };

    // Reaction events
    this._onReaction = (r, mEvent) => {
      if (!tinyThis.ended) {
        if (!tinyThis.belongToRoom(mEvent)) return;
        console.log(
          `${mEvent.getType()} ${mEvent.getRoomId()} ${mEvent.getId()} Reaction Wait ${mEvent.getSender()}`,
          mEvent.getContent(),
          mEvent,
        );
        // Reactions
      }
    };

    // Timeline events
    this._onTimeline = async (r, mEvent) => {
      if (!tinyThis.ended) {
        const tmc = tinyThis.getTimelineCache(mEvent);
        if (!tmc) return;
        tmc.pages = await storageManager.getMessagesPagination(
          this._buildPagination({ threadId: mEvent.getThreadId(), roomId: mEvent.getRoomId() }),
        );
        if (mEvent.getType() !== 'm.room.redaction') tinyThis._insertIntoTimeline(mEvent, tmc);
        else tinyThis._deletingEvent(mEvent);
      }
    };

    // Thread added events
    this._onThreadEvent = (r, mEvent) => {
      if (!tinyThis.belongToRoom(mEvent)) return;
      if (!tinyThis.ended) {
      }
    };

    // Crdt events
    this._onCrdt = (r, mEvent) => {
      if (!tinyThis.belongToRoom(mEvent)) return;
      if (!tinyThis.ended) tinyThis.sendCrdtToTimeline(mEvent);
    };

    // Prepare events
    storageManager.on('dbCrdt', this._onCrdt);
    storageManager.on('dbMessage', this._onMessage);
    storageManager.on('dbMessageUpdate', this._onMessage);
    storageManager.on('dbReaction', this._onReaction);
    storageManager.on('dbTimeline', this._onTimeline);
    storageManager.on('dbThreads', this._onThreadEvent);
    storageManager.on(`dbTimelineLoaded-${this.roomId}`, this._startTimeline);
  }

  // Load live timeline
  async loadLiveTimeline() {
    this.activeTimeline = this.liveTimeline;
    storageManager.syncTimeline(this.roomId);
    updateRoomInfo();
    return true;
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
    return timelineCache[`${roomId}${threadId ? `_${threadId}` : ''}`];
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
      limit:
        typeof limit === 'number' && !Number.isNaN(limit) && Number.isFinite(limit) && limit > 0
          ? limit
          : 10,
    };
    if (typeof page === 'number') getMsgConfig.page = page;
    if (!threadId) getMsgConfig.showThreads = false;
    if (typeof eventId === 'string') getMsgConfig.eventId = eventId;
    else getMsgConfig.threadId = threadId;
    return getMsgConfig;
  }

  // Insert into timeline
  _insertIntoTimeline(mEvent, tmc = this.timelineCache, isFirstTime = false, forceAdd = false) {
    const pageLimit = getAppearance('pageLimit');
    const eventTs = mEvent.getTs();
    if (
      (tmc.page < 2 || forceAdd) &&
      !mEvent.isRedacted() &&
      cons.supportMessageTypes.indexOf(mEvent.getType()) > -1 &&
      (tmc.timeline.length < pageLimit || eventTs > tmc.timeline[0].getTs())
    ) {
      const eventId = mEvent.getId();
      if (!tmc.lastEvent || eventTs > tmc.lastEvent.getTs()) tmc.lastEvent = mEvent;

      const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex < 0) {
        tmc.timeline.push(mEvent);
        if (tmc.timeline.length > pageLimit) {
          const removedEvent = tmc.timeline.shift();
          this._deletingEventPlaces(removedEvent.getId());
        }

        tmc.timeline.sort((a, b) => a.getTs() - b.getTs());
      } else tmc.timeline[msgIndex] = mEvent;

      if (tmc.roomId === this.roomId && (!tmc.threadId || tmc.threadId === this.threadId)) {
        if (mEvent.isEdited()) this.editedTimeline.set(eventId, [mEvent.getEditedContent()]);
        if (!isFirstTime) this.emit(cons.events.roomTimeline.EVENT, mEvent);
      }
    }
  }

  // Deleting events
  _deletingEventPlaces(redacts) {
    this.editedTimeline.delete(redacts);
    this.reactionTimeline.delete(redacts);
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
    if (!this.ended) {
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
          if (!this.ended && this._selectEvent) {
            const data = await storageManager.getLocationMessagesId(
              this._buildPagination({ eventId: this._selectEvent }),
            );

            if (!this.ended) {
              if (data && data.success) {
                this.timelineCache.pages = data.pages;
                this.timelineCache.page = data.page;
                events = data.items;
              } else await normalGetData();

              this._selectEvent = null;
              clearTimeline();
            }
          }

          // Insert events into the timeline
          if (!this.ended && Array.isArray(events)) {
            for (const item in events) {
              this._insertIntoTimeline(events[item], undefined, true, true);
            }
          }
        }

        if (!this.ended) {
          // Loaded Check
          const loaded = this.timelineCache.timeline.length - oldSize;

          // Complete
          this.emit(cons.events.roomTimeline.PAGINATED, backwards, loaded);
          this.isOngoingPagination = false;

          updateRoomInfo();
          urlParams.delete('event_id');
          return true;
        }
        return false;
      } catch {
        // Error
        this.emit(cons.events.roomTimeline.PAGINATED, backwards, 0);
        this.isOngoingPagination = false;
        return false;
      }
    }
    return false;
  }

  // Get User renders
  getEventReaders(mEvent) {
    const liveEvents = this.liveTimeline.getEvents();
    const readers = [];
    if (!mEvent) return [];

    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      readers.splice(readers.length, 0, ...this.room.getUsersReadUpTo(liveEvents[i]));
      if (mEvent === liveEvents[i]) break;
    }

    return [...new Set(readers)];
  }

  getLiveReaders() {
    const liveEvents = this.liveTimeline.getEvents();
    const getLatestVisibleEvent = () => {
      for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
        const mEvent = liveEvents[i];
        if (mEvent.getType() === 'm.room.member' && hideMemberEvents(mEvent)) {
          continue;
        }

        if (
          !mEvent.isRedacted() &&
          !isReaction(mEvent) &&
          !isEdited(mEvent) &&
          cons.supportEventTypes.includes(mEvent.getType())
        ) {
          tinyFixScrollChat();
          return mEvent;
        }
      }

      tinyFixScrollChat();
      return liveEvents[liveEvents.length - 1];
    };

    return this.getEventReaders(getLatestVisibleEvent());
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
    return this.room.getUnfilteredTimelineSet();
  }

  // Checar se isso ainda vai continuar sendo usado.
  isServingLiveTimeline() {
    return getLastLinkedTimeline(this.activeTimeline) === this.liveTimeline;
  }

  canPaginateBackward() {
    if (this.timelineCache.timeline[0]?.getType() === 'm.room.create') return false;
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
    return this.timelineCache.timeline[this.getEventIndex(eventId)] ?? null;
  }

  findEventById(eventId) {
    return this.timelineCache.timeline[this.getEventIndex(eventId)] ?? null;
  }

  removeInternalListeners() {
    this.ended = true;
    this._disableYdoc();
    storageManager.off('dbCrdt', this._onCrdt);
    storageManager.off('dbMessage', this._onMessage);
    storageManager.off('dbMessageUpdate', this._onMessage);
    storageManager.off('dbReaction', this._onReaction);
    storageManager.off('dbTimeline', this._onTimeline);
    storageManager.off('dbThreads', this._onThreadEvent);
    storageManager.off(`dbTimelineLoaded-${this.roomId}`, this._startTimeline);
  }
}

export default RoomTimeline;
