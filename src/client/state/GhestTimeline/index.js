import EventEmitter from 'events';

import storageManager from '@src/util/libs/Localstorage';

import { Direction, MatrixEventEvent, Room, RoomEvent, RoomMemberEvent } from 'matrix-js-sdk';
import initMatrix from '../../initMatrix';
import cons from '../cons';

import { messageIsClassicCrdt } from '../../../util/libs/crdt';

import { updateRoomInfo } from '../../action/navigation';
import urlParams from '../../../util/libs/urlParams';
import tinyFixScrollChat from '../../../app/molecules/media/mediaFix';
import { buildRoomTimeline, startRoomTimelineRefresh } from './GuestRoomTimeline';
import {
  isEdited,
  isReaction,
  hideMemberEvents,
  addToMap,
  getFirstLinkedTimeline,
  getLastLinkedTimeline,
  iterateLinkedTimelines,
  isTimelineLinked,
  decryptAllEventsOfTimeline,
} from './Timeline/functions';

// Class
class RoomTimeline extends EventEmitter {
  constructor(roomId, roomAlias = null, isGuest = false, guestId = null, refreshTime = null) {
    super();

    // These are local timelines
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.timeline = [];
    this.editedTimeline = new Map();
    this.reactionTimeline = new Map();
    this.typingMembers = new Set();

    // Guest Data
    this.isGuest = isGuest;
    this.guestId = guestId;
    this.refreshTime = refreshTime;

    // Client Prepare
    this.matrixClient = initMatrix.matrixClient;
    this.roomId = roomId;
    this.roomAlias = roomAlias;

    this.room = !this.isGuest
      ? this.matrixClient.getRoom(roomId)
      : new Room(roomId, this.matrixClient, this.guestId, {
          lazyLoadMembers: true,
          timelineSupport: true,
        });

    this.room.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    // Nothing! Tiny cancel time.
    if (this.room === null) {
      throw new Error(`Created a RoomTimeline for a room that doesn't exist: ${roomId}`);
    }

    // Insert live timeline
    this.liveTimeline = this.room.getLiveTimeline();
    this.activeTimeline = this.liveTimeline;

    // More data
    this.isOngoingPagination = false;
    this.ongoingDecryptionCount = 0;
    this.initialized = false;

    // Is Guest
    if (this.isGuest) buildRoomTimeline(this);

    // Load Members
    setTimeout(() => this.room.loadMembersIfNeeded());
  }

  static newFromThread(threadId, roomId) {
    const roomTimeline = new RoomTimeline(roomId);
    roomTimeline.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    const thread = roomTimeline.room.getThread(threadId);
    if (!thread) return null;
    thread.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    roomTimeline.liveTimeline = thread.liveTimeline;
    roomTimeline.activeTimeline = thread.liveTimeline;
    roomTimeline.threadId = threadId;
    roomTimeline.thread = thread;

    return roomTimeline;
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

  clearLocalTimelines() {
    this.timeline = [];
    this.clearCrdtLocalTimelines();
  }

  // Add to timeline
  addToTimeline(mEvent) {
    const evType = mEvent.getType();
    if (evType !== 'pony.house.crdt' && !messageIsClassicCrdt(mEvent)) {
      // Filter Room Member Event and Matrix CRDT Events
      if (evType === 'm.room.member' && hideMemberEvents(mEvent)) {
        return;
      }

      // Redacted
      if (mEvent.isRedacted()) return;

      // Is Reaction
      if (isReaction(mEvent)) {
        addToMap(this.reactionTimeline, mEvent);
        return;
      }

      // Support event types filter
      if (!cons.supportEventTypes.includes(evType)) return;
      if (isEdited(mEvent)) {
        addToMap(this.editedTimeline, mEvent);
        return;
      }

      // Timeline insert
      this.timeline.push(mEvent);
    }
  }

  // Populate Functions
  _populateAllLinkedEvents(timeline) {
    const firstTimeline = getFirstLinkedTimeline(timeline);
    iterateLinkedTimelines(firstTimeline, false, (tm) => {
      tm.getEvents().forEach((mEvent) => {
        storageManager.addToTimeline(mEvent);
        return this.addToTimeline(mEvent);
      });
    });
  }

  _populateTimelines() {
    this.clearLocalTimelines();
    this._populateAllLinkedEvents(this.activeTimeline);
  }

  // Reset
  async _reset() {
    if (this.isEncrypted()) await decryptAllEventsOfTimeline(this.activeTimeline);
    this._populateTimelines();

    if (!this.initialized) {
      this.initialized = true;
      this._listenEvents();
    }
  }

  // Load live timeline
  async loadLiveTimeline() {
    this.activeTimeline = this.liveTimeline;
    await this._reset();
    this.emit(cons.events.roomTimeline.READY, null);
    updateRoomInfo();
    return true;
  }

  // Load Event timeline
  async loadEventTimeline(eventId) {
    const timelineSet = this.getUnfilteredTimelineSet();

    try {
      const eventTimeline = await this.matrixClient.getEventTimeline(timelineSet, eventId);
      if (!eventTimeline) {
        return false;
      }
      this.activeTimeline = eventTimeline;
      await this._reset();
      this.emit(cons.events.roomTimeline.READY, eventId);

      if (typeof eventId === 'string' && eventId.length > 0) urlParams.set('event_id', eventId);
      else urlParams.delete('event_id');

      return true;
    } catch {
      return false;
    }
  }

  // Pagination
  async paginateTimeline(backwards = false, limit = 30) {
    // Initialization
    if (this.initialized === false) return false;
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
      this._populateTimelines();

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
  }

  // Has Event timeline
  hasEventInTimeline(eventId, timeline = this.activeTimeline) {
    const timelineSet = this.getUnfilteredTimelineSet();
    const eventTimeline = timelineSet.getTimelineForEvent(eventId);
    if (!eventTimeline) return false;
    return isTimelineLinked(eventTimeline, timeline);
  }

  // Get without filter
  getUnfilteredTimelineSet() {
    return this.thread?.getUnfilteredTimelineSet() ?? this.room.getUnfilteredTimelineSet();
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

  deleteFromTimeline(eventId) {
    const i = this.getEventIndex(eventId);
    if (i === -1) return undefined;
    return this.timeline.splice(i, 1)[0];
  }

  // Active Listens
  _listenEvents() {
    this._listenRoomTimeline = (event, room, data) => {
      if (room.roomId !== this.roomId || event.threadRootId !== this.threadId) return;
      if (this.isOngoingPagination) return;

      // User is currently viewing the old events probably
      // no need to add new event and emit changes.
      // only add reactions and edited messages
      if (this.isServingLiveTimeline() === false) {
        if (!isReaction(event) && !isEdited(event)) return;
      }

      // We only process live events here
      if (!data.liveEvent) return;

      if (event.isEncrypted()) {
        // We will add this event after it is being decrypted.
        this.ongoingDecryptionCount += 1;
        return;
      }

      // FIXME: An unencrypted plain event can come
      // while previous event is still decrypting
      // and has not been added to timeline
      // causing unordered timeline view.

      this.addToTimeline(event);
      this.emit(cons.events.roomTimeline.EVENT, event);
      storageManager.addToTimeline(event);
      tinyFixScrollChat();
    };

    this._listenDecryptEvent = (event) => {
      if (event.getRoomId() !== this.roomId) return;
      if (this.isOngoingPagination) return;

      // Not a live event.
      // so we don't need to process it here
      if (this.ongoingDecryptionCount === 0) return;

      if (this.ongoingDecryptionCount > 0) {
        this.ongoingDecryptionCount -= 1;
      }

      this.addToTimeline(event);
      this.emit(cons.events.roomTimeline.EVENT, event);
      storageManager.addToTimeline(event);
      tinyFixScrollChat();
    };

    this._preListenRoomTimeline = (event, room, toStartOfTimeline, removed, data) =>
      this._listenRoomTimeline(event, room, data);
    this._preListenDecryptEvent = (event) => this._listenDecryptEvent(event);

    this._listenRedaction = (mEvent, room) => {
      if (room.roomId !== this.roomId) return;
      const rEvent = this.deleteFromTimeline(mEvent.event.redacts);
      this.editedTimeline.delete(mEvent.event.redacts);
      this.reactionTimeline.delete(mEvent.event.redacts);
      this.emit(cons.events.roomTimeline.EVENT_REDACTED, rEvent, mEvent);
      tinyFixScrollChat();
    };

    this._listenTypingEvent = (event, member) => {
      if (member.roomId !== this.roomId) return;

      const isTyping = member.typing;
      if (isTyping) this.typingMembers.add(member.userId);
      else this.typingMembers.delete(member.userId);
      this.emit(cons.events.roomTimeline.TYPING_MEMBERS_UPDATED, new Set([...this.typingMembers]));
    };

    this._tryListenReciptEvent = (event, room, tinyTry = 0) => {
      try {
        // we only process receipt for latest message here.
        if (room.roomId !== this.roomId) return;
        const receiptContent = event.getContent();

        const mEvents = this.liveTimeline.getEvents();
        const lastMEvent = mEvents[mEvents.length - 1];

        if (tinyTry < 1000 && lastMEvent) {
          const lastEventId = lastMEvent.getId();
          const lastEventRecipt = receiptContent[lastEventId];

          if (typeof lastEventRecipt === 'undefined') return;
          if (lastEventRecipt['m.read']) {
            this.emit(cons.events.roomTimeline.LIVE_RECEIPT);
          }
        } else {
          const tinyThis = this;
          setTimeout(() => {
            tinyThis._tryListenReciptEvent(event, room, tinyTry + 1);
          }, 100);
        }
      } catch (err) {
        console.error(err);
        alert(err.message, 'Listen Recipt Event Error');
      }

      tinyFixScrollChat();
    };

    this._listenReciptEvent = (event, room) => this._tryListenReciptEvent(event, room);

    // Insert events
    this.matrixClient.on(RoomEvent.Timeline, this._preListenRoomTimeline);
    this.matrixClient.on(RoomEvent.Redaction, this._listenRedaction);
    this.matrixClient.on(MatrixEventEvent.Decrypted, this._preListenDecryptEvent);
    this.matrixClient.on(RoomMemberEvent.Typing, this._listenTypingEvent);
    this.matrixClient.on(RoomEvent.Receipt, this._listenReciptEvent);
    startRoomTimelineRefresh(this);
  }

  removeInternalListeners() {
    if (!this.initialized) return;
    this._disableYdoc();

    this.matrixClient.removeListener(RoomEvent.Timeline, this._preListenRoomTimeline);
    this.matrixClient.removeListener(RoomEvent.Redaction, this._listenRedaction);
    this.matrixClient.removeListener(MatrixEventEvent.Decrypted, this._preListenDecryptEvent);
    this.matrixClient.removeListener(RoomMemberEvent.Typing, this._listenTypingEvent);
    this.matrixClient.removeListener(RoomEvent.Receipt, this._listenReciptEvent);

    if (this.refreshTimelineInterval) clearInterval(this.refreshTimelineInterval);
  }
}

export default RoomTimeline;
