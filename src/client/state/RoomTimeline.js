import EventEmitter from 'events';
import { Direction } from 'matrix-js-sdk';

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
  getFirstLinkedTimeline,
  getLastLinkedTimeline,
} from './Timeline/functions';
import installYjs from './Timeline/yjs';

// Class
class RoomTimeline extends EventEmitter {
  constructor(roomId, threadId, roomAlias = null) {
    super();
    installYjs(this);

    // These are local timelines
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.timeline = [];
    this._page = 0;
    this._pages = 0;
    this._selectEvent = null;

    // Client Prepare
    this.matrixClient = initMatrix.matrixClient;
    this.roomId = roomId;
    this.roomAlias = roomAlias;
    this.initialized = false;
    this.ended = false;

    this.timeline = [];
    this.editedTimeline = new Map();
    this.reactionTimeline = new Map();

    this.room = this.matrixClient.getRoom(roomId);
    this.room.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    this._consoleTag = `[timeline] [${roomId}]`;

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
    return this._pages;
  }

  getPage() {
    return this._page;
  }

  setPage(page) {
    return this.paginateTimeline(page);
  }

  _activeEvents() {
    const tinyThis = this;

    // Start timeline events
    this._startTimeline = async (data, eventId) => {
      if (!tinyThis.ended) {
        console.log(`[timeline] Starting timeline ${this.roomId}`);
        const tinyError = (err) => {
          console.error(err);
          alert(message, 'Timeline load error');
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
                const getMsgConfig = tinyThis._buildPagination(1);
                tinyThis._pages = await storageManager.getMessagesCount(getMsgConfig);

                if (!eventId) {
                  const events = await storageManager.getMessages(getMsgConfig);
                  if (!tinyThis.ended) {
                    for (const item in events) {
                      const mEvent = events[item];
                      tinyThis._insertIntoTimeline(mEvent, true);
                    }
                  }
                } else tinyThis._selectEvent = eventId;

                if (!tinyThis.ended) {
                  // if(!tinyThis.initialized) tinyThis.paginateTimeline(true);
                  tinyThis.initialized = true;
                  tinyThis.emit(cons.events.roomTimeline.READY, eventId || null);
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
      if (!tinyThis._belongToRoom(mEvent) && !mEvent.isRedacted()) return;
      if (!tinyThis.ended) {
        this._pages = await storageManager.getMessagesCount(this._buildPagination());
        if (!tinyThis.ended) {
          // Check event
          if (!mEvent.isSending() || mEvent.getSender() === initMatrix.matrixClient.getUserId()) {
            // Check isEdited

            // Send into the timeline
            tinyThis._insertIntoTimeline(mEvent);
          }
        }
      }
    };

    // Reaction events
    this._onReaction = (r, mEvent) => {
      if (!tinyThis.ended) {
        if (!tinyThis._belongToRoom(mEvent)) return;
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
        if (!tinyThis._belongToRoom(mEvent)) return;
        this._pages = await storageManager.getMessagesCount(this._buildPagination());
        if (mEvent.getType() !== 'm.room.redaction') tinyThis._insertIntoTimeline(mEvent);
        else tinyThis._deletingEvent(mEvent);
      }
    };

    // Thread added events
    this._onIsThreadEvent = (r, mEvent) => {
      if (!tinyThis._belongToRoom(mEvent)) return;
      if (!tinyThis.ended) {
      }
    };

    // Prepare events
    storageManager.on('dbMessage', this._onMessage);
    storageManager.on('dbMessageUpdate', this._onMessage);
    storageManager.on('dbReaction', this._onReaction);
    storageManager.on('dbTimeline', this._onTimeline);
    storageManager.on('dbEventIsThread', this._onIsThreadEvent);
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
      storageManager.syncTimeline(this.roomId, eventId);
      if (typeof eventId === 'string' && eventId.length > 0) urlParams.set('event_id', eventId);
      else urlParams.delete('event_id');
      return true;
    } catch {
      return false;
    }
  }

  // Belong to Room
  _belongToRoom(event) {
    return (
      event.getRoomId() === this.roomId && (!this.threadId || event.getThreadId() === this.threadId)
    );
  }

  // Build pagination
  _buildPagination(page, eventId) {
    const limit = getAppearance('pageLimit');
    const getMsgConfig = {
      roomId: this.roomId,
      showRedaction: false,
      limit:
        typeof limit === 'number' && !Number.isNaN(limit) && Number.isFinite(limit) && limit > 0
          ? limit
          : 10,
    };
    if (typeof page === 'number') getMsgConfig.page = page;
    if (!this.threadId) getMsgConfig.showThreads = false;
    if (typeof eventId === 'string') getMsgConfig.eventId = eventId;
    else getMsgConfig.threadId = this.threadId;
    return getMsgConfig;
  }

  // Insert into timeline
  _insertIntoTimeline(mEvent, isFirstTime = false) {
    if (!mEvent.isRedacted() && cons.supportMessageTypes.indexOf(mEvent.getType()) > -1) {
      const pageLimit = getAppearance('pageLimit');
      const eventId = mEvent.getId();

      const msgIndex = this.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex < 0) {
        this.timeline.push(mEvent);
        if (this.timeline.length > pageLimit) {
          const removedEvent = this.timeline.shift();
          this._deletingEventPlaces(removedEvent.getId());
        }

        this.timeline.sort((a, b) => a.getTs() - b.getTs());
      } else this.timeline[msgIndex] = mEvent;

      if (mEvent.isEdited()) this.editedTimeline.set(eventId, [mEvent.getEditedContent()]);
      if (!isFirstTime) this.emit(cons.events.roomTimeline.EVENT, mEvent);
    }
  }

  // Deleting events
  _deletingEventPlaces(redacts) {
    this.editedTimeline.delete(redacts);
    this.reactionTimeline.delete(redacts);
  }

  _deletingEvent(event) {
    const redacts = event.getContent()?.redacts;
    const rEvent = this.deleteFromTimeline(redacts);
    this._deletingEventPlaces(redacts);
    this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent, event);
  }

  // Pagination
  async paginateTimeline(backwards = false) {
    if (!this.ended) {
      // Initialization
      if (this.isOngoingPagination) return false;
      const oldPage = this._page;

      if (typeof backwards === 'boolean') {
        if (backwards) this._page++;
        else this._page--;
      } else if (typeof backwards === 'number') this._page = backwards;

      this.isOngoingPagination = true;

      // Old Size
      const oldSize = this.timeline.length;

      // Try time
      try {
        if (oldPage > 0 || this._selectEvent) {
          let events;
          const tinyThis = this;

          // Normal get page
          const normalGetData = async () => {
            tinyThis._pages = await storageManager.getMessagesCount(this._buildPagination());
            events = await storageManager.getMessages(this._buildPagination(this._page));
          };

          // Remove old timeline
          const clearTimeline = () => {
            while (this.timeline.length > 0) {
              this._deletingEvent(this.timeline[0].getId());
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
              this._buildPagination(undefined, this._selectEvent),
            );

            if (!this.ended) {
              if (data && data.success) {
                this._pages = data.pages;
                this._page = data.page;
                events = data.items;
              } else await normalGetData();

              this._selectEvent = null;
              clearTimeline();
            }
          }

          // Insert events into the timeline
          if (!this.ended && Array.isArray(events)) {
            for (const item in events) {
              const mEvent = events[item];
              this._insertIntoTimeline(mEvent, true);
            }
          }
        }

        if (!this.ended) {
          // Loaded Check
          const loaded = this.timeline.length - oldSize;

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
    return this.timeline;
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

    const tLength = this.timeline.length;

    for (let i = 0; i < tLength; i += 1) {
      const mEvent = this.timeline[i];
      if (mEvent.getTs() > rTs) return i;
    }

    return -1;
  }

  // Simpler scripts
  deleteFromTimeline(eventId) {
    const i = this.getEventIndex(eventId);
    if (i === -1) return undefined;
    return this.timeline.splice(i, 1)[0];
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
    if (this.timeline[0]?.getType() === 'm.room.create') return false;
    const tm = getFirstLinkedTimeline(this.activeTimeline);
    return tm.getPaginationToken(Direction.Backward) !== null;
  }

  canPaginateForward() {
    return !this.isServingLiveTimeline();
  }

  isEncrypted() {
    return this.room && this.room.hasEncryptionStateEvent();
  }

  getReadUpToEventId() {
    const userId = this.matrixClient.getUserId();
    if (!userId) return null;
    return this.thread?.getEventReadUpTo(userId) ?? this.room.getEventReadUpTo(userId);
  }

  getEventIndex(eventId) {
    return this.timeline.findIndex((mEvent) => mEvent.getId() === eventId);
  }

  findEventByIdInTimelineSet(eventId) {
    return this.timeline[this.getEventIndex(eventId)] ?? null;
  }

  findEventById(eventId) {
    return this.timeline[this.getEventIndex(eventId)] ?? null;
  }

  removeInternalListeners() {
    this.ended = true;
    this._disableYdoc();
    storageManager.off('dbMessage', this._onMessage);
    storageManager.off('dbMessageUpdate', this._onMessage);
    storageManager.off('dbReaction', this._onReaction);
    storageManager.off('dbTimeline', this._onTimeline);
    storageManager.off('dbEventIsThread', this._onIsThreadEvent);
    storageManager.off(`dbTimelineLoaded-${this.roomId}`, this._startTimeline);
  }
}

export default RoomTimeline;
