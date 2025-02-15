import EventEmitter from 'events';

import storageManager from '../StorageManager';
import { getAppearance } from '../../appearance';
import tinyConsole from '../../console';
import { waitForTrue } from '../../timeoutLib';
import TimelineCacheEvents from './Events';
import TinyEventChecker from '@src/client/state/Notifications/validator';
import { memberEventAllowed } from '@src/util/Events';
import initMatrix from '@src/client/initMatrix';
import { decryptAllEventsOfTimeline } from '@src/client/state/Timeline/functions';

const tinyCheckEvent = new TinyEventChecker();

class TimelineCachePagination extends EventEmitter {
  #_firstEventsEnabled;

  constructor() {
    super();
    const tinyThis = this;
    this.#_firstEventsEnabled = false;
    this._activeEvents = () => {
      if (!tinyThis.#_firstEventsEnabled) {
        // Timeline loaded
        storageManager.on('dbTimelineLoaded', async (data, eventId) => {
          // Get timeline cache
          const { roomId, threadId } = data;
          const tmc = tinyThis.getData(roomId, threadId, true);

          // Start the progress
          tinyConsole.log(`${this.consoleTag(roomId, threadId)} Starting timeline`);
          const tinyError = (err) => {
            tinyConsole.error(err);
            alert(err.message, 'Timeline load error');
          };

          // First time
          if (data.firstTime) {
            try {
              // Prepare data
              const room = initMatrix.matrixClient.getRoom(roomId);
              let thread;
              const getUnfilteredTimelineSet = () => {
                return !thread
                  ? room.getUnfilteredTimelineSet()
                  : thread.getUnfilteredTimelineSet();
              };

              // Read thread
              if (threadId) {
                // Get cache
                thread = room.getThread(threadId);
                // No cache
                if (!thread) {
                  await initMatrix.matrixClient.getEventTimeline(
                    getUnfilteredTimelineSet(),
                    threadId,
                  );

                  // Decrypt timeline and get the thread again
                  const tm = room.getLiveTimeline();
                  if (room.hasEncryptionStateEvent()) await decryptAllEventsOfTimeline(tm);
                  thread = room.getThread(threadId);
                }

                // Exist thread
                if (thread) {
                  tinyThis.emit(TimelineCacheEvents.GetThread, thread);
                  tinyThis.emit(
                    TimelineCacheEvents.insertId('GetThread', roomId, threadId),
                    thread,
                  );

                  thread.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
                }
              }

              // Get msg config
              let needUpdatePage = false;

              // Set pages
              if (tinyThis.getPages(roomId, threadId) < 1) {
                const getMsgConfig = tinyThis.buildPagination(roomId, threadId, {
                  page: 1,
                });

                const pages = await storageManager.getMessagesPagination(getMsgConfig);
                tinyThis.setPages(roomId, threadId, pages);
                needUpdatePage = true;
              }

              // Insert timeline items
              if (tmc.timeline.length < 1) {
                // Normal mode
                if (!eventId) {
                  // Get items
                  const getMsgTinyCfg = tinyThis.buildPagination(roomId, threadId, {
                    page: 1,
                  });
                  const events = await storageManager.getMessages(getMsgTinyCfg);

                  // Clear old items
                  while (tmc.timeline.length > 0) {
                    tinyThis._deletingEventById(roomId, threadId, tmc.timeline[0].getId());
                  }

                  // Insert new items
                  for (const item in events) {
                    tinyThis.insertIntoTimeline(
                      events[item],
                      roomId,
                      threadId,
                      tmc,
                      true,
                      true,
                      true,
                    );
                  }

                  // Insert reactions
                  await tinyThis.waitTimeline(roomId, threadId);
                  await tinyThis._insertReactions(roomId, threadId, events);
                }

                // Select event
                else {
                  tinyThis.emit(TimelineCacheEvents.SelectedEvent, eventId);
                  tinyThis.emit(
                    TimelineCacheEvents.insertId('SelectedEvent', roomId, threadId),
                    eventId,
                  );
                }
              }

              // Set page
              if (tinyThis.getPage(roomId, threadId) < 1) {
                tinyThis.setPage(roomId, threadId, 1);
                needUpdatePage = true;
              }

              // Update Pages
              if (needUpdatePage) {
                tinyThis.emit(TimelineCacheEvents.PagesUpdated, tmc);
                tinyThis.emit(TimelineCacheEvents.insertId('PagesUpdated', roomId, threadId), tmc);
              }

              // Init data
              tinyThis.emit(TimelineCacheEvents.TimelineInitialized, true);
              tinyThis.emit(
                TimelineCacheEvents.insertId('TimelineInitialized', roomId, threadId),
                true,
              );

              // Ready!
              tinyThis.emit(TimelineCacheEvents.TimelineReady, eventId || null);
              tinyThis.emit(
                TimelineCacheEvents.insertId('TimelineReady', roomId, threadId),
                eventId || null,
              );

              tinyConsole.log(`${this.consoleTag(roomId, threadId)} Timeline started`);
            } catch (err) {
              tinyError(err);
            }
          }
          // Nope first time
          else {
            // Init data
            tinyThis.emit(TimelineCacheEvents.TimelineInitialized, true);
            tinyThis.emit(
              TimelineCacheEvents.insertId('TimelineInitialized', roomId, threadId),
              true,
            );

            // Init updated
            tinyThis.emit(TimelineCacheEvents.TimelineInitUpdated, null);
            tinyThis.emit(
              TimelineCacheEvents.insertId('TimelineInitUpdated', roomId, threadId),
              null,
            );
          }
        });

        // Updated events
        storageManager.on('_eventUpdated', async (type, mEvent, roomId, threadId) => {
          await tinyThis.waitTimeline(roomId, threadId);
          const eventId = mEvent.getId();

          if (type === 'redact')
            tinyThis.deletingEventById(roomId, threadId, eventId, 'event from local');
        });

        // Message events
        storageManager.on('dbEventCachePreparing', async (data, mEvent) => {
          const roomId = mEvent.getRoomId();
          const threadId = mEvent.getThreadId();

          await tinyThis.waitTimeline(roomId, threadId);
          if (!tinyCheckEvent.check(mEvent)) return;

          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc) return;
          tinyThis.insertIntoTimeline(mEvent, roomId, threadId, tmc);
        });

        storageManager.on('dbEventCacheReady', async (data, mEvent) => {
          const roomId = mEvent.getRoomId();
          const threadId = mEvent.getThreadId();

          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc) return;

          const eventId = mEvent.getId();
          const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
          if (msgIndex > -1) {
            tmc.timeline.splice(msgIndex, 1);
            tinyThis._deletingEventPlaces(roomId, threadId, eventId);
          }
        });

        storageManager.on('dbEventCacheError', async (data, mEvent) => {
          const roomId = mEvent.getRoomId();
          const threadId = mEvent.getThreadId();

          await tinyThis.waitTimeline(roomId, threadId);
          if (!tinyCheckEvent.check(mEvent)) return;

          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc) return;

          const eventId = mEvent.getId();
          const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
          if (msgIndex > -1) {
            // NEED NEW TINY SCRIPT HERE!
            console.log(
              `[timeline-error] ERROR CACHE ${tmc.timeline[msgIndex].getId()}`,
              tmc.timeline[msgIndex],
            );
          }
        });

        // Prepare events
        const syncComplete = async (roomId, threadId) => {
          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc) return;
          await tinyThis._insertReactions(roomId, threadId, tmc.timeline);
          if (!threadId) await tinyThis._checkEventThreads(roomId, tmc.timeline);
        };
        storageManager.on('timelineSyncComplete', syncComplete);
        storageManager.on('timelineSyncNext', syncComplete);

        // Message events
        const onMessage = async (r, mEvent) => {
          const roomId = mEvent.getRoomId();
          const threadId = mEvent.getThreadId();

          await tinyThis.waitTimeline(roomId, threadId);
          if (!tinyCheckEvent.check(mEvent)) return;

          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc && !mEvent.isRedacted()) return;

          tinyConsole.log(
            `${tinyThis.consoleTag(roomId, threadId)} New message: ${mEvent.getId()}`,
          );

          tmc.pages = await storageManager.getMessagesPagination(
            tinyThis.buildPagination(roomId, threadId),
          );

          // Check event
          if (!mEvent.isSending() || mEvent.getSender() === initMatrix.matrixClient.getUserId()) {
            // Send into the timeline
            tinyThis.insertIntoTimeline(mEvent, roomId, threadId, tmc);
          }
        };
        storageManager.on('dbMessage', onMessage);
        storageManager.on('dbMessageUpdate', onMessage);

        // Reaction events
        storageManager.on('dbReaction', async (r, mEvent) => {
          const roomId = mEvent.getRoomId();
          const threadId = mEvent.getThreadId();

          await tinyThis.waitTimeline(roomId, threadId);
          if (!tinyCheckEvent.check(mEvent)) return;

          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc) return;

          tinyThis._insertReaction(roomId, threadId, mEvent);
        });

        // Timeline events
        storageManager.on('dbTimeline', async (r, mEvent) => {
          const roomId = mEvent.getRoomId();
          const threadId = mEvent.getThreadId();

          await tinyThis.waitTimeline(roomId, threadId);
          if (!tinyCheckEvent.check(mEvent)) return;

          const tmc = tinyThis.getData(roomId, threadId);
          if (!tmc) return;

          tinyConsole.log(
            `${tinyThis.consoleTag(roomId, threadId)} New timeline event: ${mEvent.getId()}`,
          );
          if (mEvent.getType() !== 'm.room.redaction')
            tinyThis.insertIntoTimeline(mEvent, roomId, threadId, tmc);
          else tinyThis._deletingEvent(roomId, threadId, mEvent);
        });

        // Redaction Events
        storageManager.on('dbEventRedaction', async (info) => {
          const { eventId, isRedacted, roomId, threadId } = info;

          await tinyThis.waitTimeline(roomId, threadId);
          if (!tinyCheckEvent.checkIds(info.roomId, info.eventId)) return;
          if (!isRedacted) return;

          tinyThis.deletingEventById(roomId, threadId, eventId);
        });

        // Thread added events
        storageManager.on('dbThreads', async (r, event) => {
          await tinyThis.waitTimeline(event.room_id, null);
          if (!tinyCheckEvent.checkIds(event.room_id, event.event_id)) return;

          tinyConsole.log(
            `${tinyThis.consoleTag(event.room_id, null)} New thread event: ${event.event_id}`,
          );

          const mEvent = tinyThis.findEventById(event.room_id, null, event.event_id);
          if (!mEvent) return;
          await mEvent.insertThread();
        });

        tinyThis.#_firstEventsEnabled = true;
      }
    };
  }

  async _checkEventThreads(roomId, newEvent) {
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
        roomId,
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

  // Insert into timeline
  insertIntoTimeline(
    mEvent,
    roomId,
    threadId,
    tmc = null,
    isFirstTime = false,
    forceAdd = false,
    ignoredReactions = false,
  ) {
    tmc.eventsQueue.data.push({
      mEvent,
      tmc,
      isFirstTime,
      forceAdd,
      roomId,
      threadId,
    });

    tmc.eventsQueue.data.sort((a, b) => a.mEvent.getTs() - b.mEvent.getTs());
    if (tmc.eventsQueue.busy < 1) {
      tmc.eventsQueue.busy++;
      this._addEventQueue(ignoredReactions, tmc.eventsQueue);
    }
  }

  async _addEventQueue(ignoredReactions = false, eventsQueue = {}) {
    // Add event
    const tinyThis = this;
    const eventQueue = eventsQueue.data.shift();
    if (eventQueue) {
      // Complete
      const tinyComplete = () => {
        if (eventsQueue.data.length < 1) eventsQueue.busy--;
        else tinyThis._addEventQueue(ignoredReactions, eventsQueue);
      };

      try {
        const { mEvent, tmc, isFirstTime, forceAdd, roomId, threadId } = eventQueue;
        // Validate
        if (!memberEventAllowed(mEvent.getMemberEventType(), true)) {
          tinyComplete();
          return;
        }

        // Complete
        const eventInserted = await this.updateItem(
          mEvent,
          tmc,
          // Event removed
          (removedEvent) => tinyThis._deletingEventPlaces(roomId, threadId, removedEvent.getId()),
          forceAdd,
        );
        if (eventInserted) {
          if (mEvent.isEdited())
            tmc.editedTimeline.set(mEvent.getId(), [mEvent.getEditedContent()]);

          // Event added
          if (!isFirstTime) {
            this.emit(TimelineCacheEvents.Event, mEvent);
            this.emit(TimelineCacheEvents.insertId('Event', roomId, threadId), mEvent);
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

  // Wait timeline
  waitTimeline(roomId, threadId) {
    const tinyThis = this;
    return waitForTrue(() => {
      const tmc = tinyThis.getData(roomId, threadId);
      return !tmc || tmc.eventsQueue.busy < 1;
    }, 300);
  }

  // Build Pagination
  buildPagination(roomId, threadId, config = {}) {
    // Get config
    const page = config.page;
    const eventId = config.eventId;
    const limit = config.limit;

    // Config Json
    const getMsgConfig = {
      roomId: roomId,
      showRedaction: false,
    };

    // Limit
    if (typeof limit === 'number') {
      if (!Number.isNaN(limit) && Number.isFinite(limit) && limit > 0) getMsgConfig.limit = limit;
    } else getMsgConfig.limit = getAppearance('pageLimit');

    // Page Number
    if (typeof page === 'number') getMsgConfig.page = page;

    // No thread value
    if (!threadId) getMsgConfig.showThreads = false;
    if (typeof eventId === 'string' || Array.isArray(eventId)) getMsgConfig.eventId = eventId;
    else getMsgConfig.threadId = threadId;

    // Complete
    return getMsgConfig;
  }

  // Search Events
  findEventById(roomId, threadId, eventId) {
    const tmc = this.getData(roomId, threadId);
    if (tmc) return tmc.timeline[this.getEventIndex(roomId, threadId, eventId)] ?? null;
    return null;
  }

  getEventIndex(roomId, threadId, eventId) {
    const tmc = this.getData(roomId, threadId);
    if (tmc) return tmc.timeline.findIndex((mEvent) => mEvent.getId() === eventId);
    return null;
  }

  // Prepare events
  _deletingEventPlaces(roomId, threadId, redacts) {
    const rEvent = this.deletingEventPlaces(roomId, threadId, redacts);
    if (rEvent) {
      this.emit(TimelineCacheEvents.EventRedaction, rEvent);
      this.emit(TimelineCacheEvents.insertId('EventRedaction', roomId, threadId), rEvent);
    }
  }

  _deletingEvent(roomId, threadId, event) {
    const rEvent = this.deletingEvent(roomId, threadId, event);
    if (rEvent) {
      this.emit(TimelineCacheEvents.EventRedaction, rEvent);
      this.emit(TimelineCacheEvents.insertId('EventRedaction', roomId, threadId), rEvent);
    }
  }

  _deletingEventById(roomId, threadId, redacts) {
    return this.deletingEventById(roomId, threadId, redacts);
  }

  _insertReaction(roomId, threadId, mEvent) {
    const result = this.insertReaction(roomId, threadId, mEvent);
    if (result) {
      if (result.inserted) {
        this.emit(TimelineCacheEvents.Event, mEvent);
        this.emit(TimelineCacheEvents.insertId('Event', roomId, threadId), mEvent);
      }
      if (result.deleted) {
        this.emit(TimelineCacheEvents.EventRedaction, mEvent);
        this.emit(TimelineCacheEvents.insertId('EventRedaction', roomId, threadId), mEvent);
      }
    }
  }

  async _insertReactions(roomId, threadId, events) {
    const result = await this.insertReactions(roomId, threadId, events);
    for (const index in result) {
      if (result[index].data) {
        if (result[index].data.inserted) {
          this.emit(TimelineCacheEvents.Event, result[index].mEvent);
          this.emit(TimelineCacheEvents.insertId('Event', roomId, threadId), result[index].mEvent);
        }
        if (result[index].data.deleted) {
          this.emit(TimelineCacheEvents.EventRedaction, result[index].mEvent);
          this.emit(
            TimelineCacheEvents.insertId('EventRedaction', roomId, threadId),
            result[index].mEvent,
          );
        }
      }
    }
  }
}

export default TimelineCachePagination;
