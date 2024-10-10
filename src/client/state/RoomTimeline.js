import EventEmitter from 'events';

import storageManager from '@src/util/libs/Localstorage';

import { Direction, RoomMemberEvent } from 'matrix-js-sdk';
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

    // Client Prepare
    this.matrixClient = initMatrix.matrixClient;
    this.roomId = roomId;
    this.roomAlias = roomAlias;

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
    if (threadId) {
      this.threadId = threadId;
      this.thread = thread;

      const thread = this.room.getThread(threadId);
      if (!thread) this.threadId = null;
      else thread.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    } else {
      this.threadId = null;
      this.thread = null;
    }

    // More data
    this.isOngoingPagination = false;

    // Load Members
    setTimeout(() => this.room.loadMembersIfNeeded());
  }

  // Load live timeline
  async loadLiveTimeline() {
    this.activeTimeline = this.liveTimeline;
    this.emit(cons.events.roomTimeline.READY, null);
    storageManager.syncTimeline(this.roomId);
    updateRoomInfo();
    return true;
  }

  // Load Event timeline
  async loadEventTimeline(eventId) {
    try {
      this.emit(cons.events.roomTimeline.READY, eventId);
      storageManager.syncTimeline(this.roomId, eventId);
      if (typeof eventId === 'string' && eventId.length > 0) urlParams.set('event_id', eventId);
      else urlParams.delete('event_id');
      return true;
    } catch {
      return false;
    }
  }

  // Pagination
  async paginateTimeline(backwards = false, limit = 30) {
    console.log(`${this._consoleTag} paginateTimeline`, backwards, limit);
    /* 
    // Initialization
    if (this.isOngoingPagination) return false;

    this.isOngoingPagination = true;

    // Get timeline
    const timelineToPaginate = backwards
      ? getFirstLinkedTimeline(this.activeTimeline)
      : getLastLinkedTimeline(this.activeTimeline);

    // Token Type
    if (
      timelineToPaginate.getPaginationToken(backwards ? Direction.Backward : Direction.Forward) ===
      null
    ) {
      this.emit(cons.events.roomTimeline.PAGINATED, backwards, 0);
      this.isOngoingPagination = false;
      return false;
    }

    // Old Size
    const oldSize = this.timeline.length;

    // Try time
    try {
      // Paginate time
      await this.matrixClient.paginateEventTimeline(timelineToPaginate, { backwards, limit });

      // Decrypt time
      if (this.isEncrypted()) await decryptAllEventsOfTimeline(this.activeTimeline);

      // Loaded Check
      const loaded = this.timeline.length - oldSize;

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
    */
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

  //////////////////// Has Event inside the visible timeline
  hasEventInTimeline(eventId, timeline = this.activeTimeline) {
    console.log(`${this._consoleTag} hasEventInTimeline`, eventId, timeline);
  }

  /////////////////////////////////////// Get Event data
  getUnreadEventIndex(readUpToEventId) {
    console.log(`${this._consoleTag} getUnreadEventIndex`, readUpToEventId);
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
  getUnfilteredTimelineSet() {
    return this.thread?.getUnfilteredTimelineSet() ?? this.room.getUnfilteredTimelineSet();
  }

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

  findEventByIdInTimelineSet(eventId, eventTimelineSet = this.getUnfilteredTimelineSet()) {
    return eventTimelineSet.findEventById(eventId);
  }

  findEventById(eventId) {
    return this.timeline[this.getEventIndex(eventId)] ?? null;
  }

  removeInternalListeners() {
    this._disableYdoc();
  }
}

export default RoomTimeline;
