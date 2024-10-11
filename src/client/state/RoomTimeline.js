import EventEmitter from 'events';
import { Direction } from 'matrix-js-sdk';
import clone from 'clone';

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

    // Client Prepare
    this.matrixClient = initMatrix.matrixClient;
    this.roomId = roomId;
    this.roomAlias = roomAlias;

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
    this._activeEvents();

    // Load Members
    setTimeout(() => this.room.loadMembersIfNeeded());
  }

  _activeEvents() {
    const tinyThis = this;

    // Start timeline events
    this._startTimeline = (data, eventId) => {
      // data.firstTime
      tinyThis.emit(cons.events.roomTimeline.READY, eventId || null);
    };

    // Message events
    this._onMessage = (r, event) => {
      if (!tinyThis._belongToRoom(event)) return;
      // Fix event type
      event.type = 'm.room.message';

      // Check isEdited

      // Send into the timeline
      tinyThis._insertIntoTimeline(event);
    };

    // Reaction events
    this._onReaction = (r, event) => {
      if (!tinyThis._belongToRoom(event)) return;
      // Reactions
    };

    // Timeline events
    this._onTimeline = (r, event) => {
      if (!tinyThis._belongToRoom(event)) return;
      if (event.type !== 'm.room.redaction') tinyThis._insertIntoTimeline(event);
      else tinyThis._deletingEvent(event);
    };

    // Prepare events
    storageManager.on('dbMessage', this._onMessage);
    storageManager.on('dbReaction', this._onReaction);
    storageManager.on('dbTimeline', this._onTimeline);
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
    return event.room_id === this.roomId && (!this.threadId || event.thread_id === this.threadId);
  }

  // Convert event format
  _convertEventFormat(event) {
    const mEvent = clone(event);

    mEvent.getAge = () => (mEvent?.unsigned && mEvent.unsigned?.age) || null;
    mEvent.getContent = () => mEvent?.content || null;
    mEvent.getDate = () => new Date(mEvent.origin_server_ts);
    mEvent.getId = () => mEvent?.event_id || null;
    // mEvent.getPrevContent = () => mEvent?.unsigned && mEvent.unsigned?.age || null;
    mEvent.getRelation = () => (mEvent?.content && mEvent?.content.relates_to) || null;
    mEvent.getRoomId = () => mEvent?.room_id || null;
    mEvent.getSender = () => mEvent?.sender || null;
    mEvent.getTs = () => mEvent?.origin_server_ts;
    // mEvent.getThread = () => mEvent?.thread_id ? mEvent?.thread : null;
    mEvent.getType = () => mEvent?.type || null;
    mEvent.getUnsigned = () => mEvent?.unsigned || null;
    mEvent.isRedacted = () => mEvent?.redaction || false;
    mEvent.isRedaction = () => mEvent?.type === 'm.room.redaction' || false;

    return mEvent;
  }

  // Insert into timeline
  _insertIntoTimeline(event) {
    const pageLimit = getAppearance('pageLimit');
    const mEvent = this._convertEventFormat(event);

    this.emit(cons.events.roomTimeline.EVENT, mEvent);
  }

  // Deleting events
  _deletingEvent(event) {
    const mEvent = this._convertEventFormat(event);
    const redacts = mEvent.getContent()?.redacts;
    const rEvent = this.deleteFromTimeline(redacts);
    this.editedTimeline.delete(redacts);
    this.reactionTimeline.delete(redacts);
    this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent, mEvent);
  }

  // Pagination
  async paginateTimeline(backwards = false) {
    // Initialization
    if (this.isOngoingPagination) return false;

    this.isOngoingPagination = true;

    // Token Type
    /* if (
      timelineToPaginate.getPaginationToken(backwards ? Direction.Backward : Direction.Forward) ===
      null
    ) {
      this.emit(cons.events.roomTimeline.PAGINATED, backwards, 0);
      this.isOngoingPagination = false;
      return false;
    } */

    // Old Size
    // const oldSize = this.timeline.length;

    // Try time
    try {
      // Paginate time
      // await this.matrixClient.paginateEventTimeline(timelineToPaginate, { backwards, limit });

      // Loaded Check
      // const loaded = this.timeline.length - oldSize;

      // Complete
      // this.emit(cons.events.roomTimeline.PAGINATED, backwards, loaded);
      this.isOngoingPagination = false;

      updateRoomInfo();
      urlParams.delete('event_id');
      return true;
    } catch {
      // Error
      // this.emit(cons.events.roomTimeline.PAGINATED, backwards, 0);
      this.isOngoingPagination = false;
      return false;
    }
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
  deleteFromTimeline(eventId) {
    const i = this.getEventIndex(eventId);
    if (i === -1) return undefined;
    return this.timeline.splice(i, 1)[0];
  }

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
    storageManager.off('dbMessage', this._onMessage);
    storageManager.off('dbReaction', this._onReaction);
    storageManager.off('dbTimeline', this._onTimeline);
    storageManager.off(`dbTimelineLoaded-${this.roomId}`, this._startTimeline);
  }
}

export default RoomTimeline;
