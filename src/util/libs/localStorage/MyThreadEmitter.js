import { RoomEvent } from 'matrix-js-sdk';
import EventEmitter from 'events';
import initMatrix from '@src/client/initMatrix';
import cons from '@src/client/state/cons';
import { getAppearance } from '../appearance';

export const timelineCache = {};

class MyThreadEmitter extends EventEmitter {
  constructor(tinyThis, storageManager) {
    super();
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    this.initialized = false;
    this._starting = null;
    this.rootEvent = null;

    this.room = tinyThis.room;
    this.id = tinyThis.threadId;
    this.roomId = tinyThis.getRoomId();

    this.length = 0;
    this.timeline = [];

    this.hasCurrentUserParticipated = false;

    this.has = (eventId) =>
      this.timeline.findIndex((event) => event.getId() === eventId) > -1 ? true : false;

    this.findEventById = (eventId) => this.timeline.find((event) => event.getId() === eventId);

    this.lastReply = () =>
      this.timeline.length > 0 ? this.timeline[this.timeline.length - 1] : null;

    // Fetch thread data
    const thread = this;
    this.fetch = async () => {
      if (!thread.initialized)
        if (!thread._starting)
          thread._starting = new Promise(async (resolve, reject) => {
            try {
              // Allowed memberType
              const memberType = 'NULL';

              // Get root event data
              if (tinyThis.threadRootId) {
                const rootEvent =
                  timelineCache[thread.roomId] &&
                  Array.isArray(timelineCache[thread.roomId].timeline)
                    ? timelineCache[thread.roomId].timeline.find(
                        (item) => item.getId() === tinyThis.threadRootId,
                      )
                    : null;
                if (rootEvent) thread.rootEvent = rootEvent;
                else {
                  const msg = await storageManager.getMessagesById({
                    roomId: thread.roomId,
                    eventId: tinyThis.threadRootId,
                  });
                  if (msg) thread.rootEvent = msg;
                }
              }

              // Load timeline
              const threadTimeline = await storageManager.getMessages({
                roomId: thread.roomId,
                threadId: thread.id,
                showThreads: true,
                showRedaction: false,
                page: 1,
                memberType,
                limit: getAppearance('pageLimit'),
              });

              // Timeline data updater
              const timelineUpdater = (r, mEvent, toStartOfTimeline = false) => {
                if (mEvent.getId() === thread.id) thread.rootEvent = mEvent;
                if (
                  mEvent.isRedacted() ||
                  mEvent.getRoomId() !== thread.roomId ||
                  mEvent.threadRootId !== thread.id
                )
                  return;

                // User is here
                if (mEvent.getSender() === initMatrix.matrixClient.getUserId())
                  thread.hasCurrentUserParticipated = true;

                // Add event
                const pageLimit = getAppearance('pageLimit');
                if (
                  cons.supportEventTypes.indexOf(mEvent.getType()) > -1 &&
                  (thread.timeline.length < pageLimit ||
                    mEvent.getTs() > thread.timeline[0].getTs())
                ) {
                  const eventId = mEvent.getId();

                  // Add event
                  const msgIndex = thread.timeline.findIndex((item) => item.getId() === eventId);
                  if (msgIndex < 0) {
                    thread.timeline.push(mEvent);
                    thread.length++;

                    // Remove event
                    if (thread.timeline.length > pageLimit) {
                      thread.timeline.shift();
                      thread.length--;
                    }

                    // Sort event
                    thread.timeline.sort((a, b) => a.getTs() - b.getTs());
                  } else thread.timeline[msgIndex] = mEvent;

                  // Emit Timeline event
                  thread.emit(
                    RoomEvent.Timeline,
                    mEvent,
                    mEvent.room,
                    typeof toStartOfTimeline === 'boolean' ? toStartOfTimeline : false,
                  );
                }
              };

              storageManager.on('dbMessage', timelineUpdater);
              storageManager.on('dbMessageUpdate', timelineUpdater);
              for (const item in threadTimeline) timelineUpdater(null, threadTimeline[item], true);

              // Try to find you here
              if (!thread.hasCurrentUserParticipated) {
                const yourMsgs = await storageManager.getMessages({
                  roomId: thread.roomId,
                  threadId: thread.id,
                  showThreads: true,
                  sender: initMatrix.matrixClient.getUserId(),
                  page: 1,
                  limit: 1,
                });
                if (yourMsgs[0]) thread.hasCurrentUserParticipated = true;
              }

              // Complete
              thread.initialized = true;
              thread.emit('PonyHouse.ThreatInitialized', true);
              tinyThis.emit('PonyHouse.ThreatInitialized', thread, tinyThis);
              resolve(thread);
            } catch (err) {
              reject(err);
            }
          });
        else return thread._starting;
      else this;
    };
  }
}

export default MyThreadEmitter;
