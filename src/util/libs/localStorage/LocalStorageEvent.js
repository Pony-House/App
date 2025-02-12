import { UNSIGNED_THREAD_ID_FIELD, THREAD_RELATION_TYPE } from 'matrix-js-sdk';
import EventEmitter from 'events';
import { objType } from 'for-promise/utils/lib.mjs';

import initMatrix from '@src/client/initMatrix';
import MyThreadEmitter from './MyThreadEmitter';

export const threadsCache = {};

class LocalStorageEvent extends EventEmitter {
  constructor(event, storageManager) {
    super();

    this.storageManager = storageManager;
    this.event = event;
    this.room = initMatrix.matrixClient.getRoom(this.event.room_id);

    if (this.event.is_thread_root) {
      this.event.thread_id = this.event.is_thread_root;
      this.isThreadRoot = true;
    } else this.isThreadRoot = false;

    if (this.event.primary_replace_event_id) {
      this.event.replace_to = this.event.primary_replace_to;
      this.event.replace_to_id = this.event.primary_replace_to_id;
      this.event.replace_to_ts = this.event.primary_replace_to_ts;
    }

    this.threadId =
      typeof this.event?.thread_id === 'string' && this.event?.thread_id !== 'NULL'
        ? this.event?.thread_id
        : null;

    this._forceRedaction = false;
    this.status = this.event?.e_status || null;
    this.sender = this.room ? this.room.getMember(this.event.sender) : null;
    this.replyEventId = this.getWireContent()['m.relates_to']?.['m.in_reply_to']?.event_id;
    this.threadRootId = this.threadRootId();

    if (typeof this.event.primary_replace_event_id !== 'undefined')
      delete this.event.primary_replace_event_id;
    if (typeof this.event.primary_replace_room_id !== 'undefined')
      delete this.event.primary_replace_room_id;
    if (typeof this.event.primary_replace_thread_id !== 'undefined')
      delete this.event.primary_replace_thread_id;
    if (typeof this.event.primary_replace_to !== 'undefined') delete this.event.primary_replace_to;
    if (typeof this.event.primary_replace_to_id !== 'undefined')
      delete this.event.primary_replace_to_id;
    if (typeof this.event.primary_replace_to_ts !== 'undefined')
      delete this.event.primary_replace_to_ts;
    if (typeof this.event.is_thread_room_root !== 'undefined')
      delete this.event.is_thread_room_root;
    if (typeof this.event.is_thread_root !== 'undefined') delete this.event.is_thread_root;

    if (typeof this.event.member_type !== 'undefined' && this.event.member_type === 'NULL')
      delete this.event.member_type;

    if (!this.initThread()) this.thread = null;
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
  }

  /* *
  
      The thread has two boot processes...
      This function will initialize the object "this.thread" to be available. 
      This function is used when you still do not have an event with thread enabled.
  
      After activating the thread, you need to use "this.thread.fetch()" to run the final startup 
      that will make the thread behave like the matrix-js-sdk threads.
  
      If you want to boot the thread completely, you can place true in the "fetchNow" value.
      But if you put true, the value will return a promise.
  
    * */
  initThread(fetchNow = false) {
    if (!this.thread) {
      // Get Id
      const threadId = this.threadId || this.threadRootId;

      // Let's create it
      if (threadId && this.isThreadRoot) {
        // Add thread id into the event
        this.threadId = threadId;
        const threadValue = `${this.getRoomId()}:${threadId}`;

        // Create the thread class and and this into the event
        if (!threadsCache[threadValue]) threadsCache[threadValue] = new MyThreadEmitter(this);
        this.thread = threadsCache[threadValue];

        // Complete!
        return !fetchNow ? true : this.thread.fetch();
      }

      // Nope! Tiny fail...
      return !fetchNow
        ? false
        : new Promise((resolve, reject) =>
            reject(new Error('This event is not ready to be a thread!')),
          );
    }
    throw new Error('The thread has already been activated in this event!');
  }

  insertThread() {
    if (!this.thread) {
      this.threadId = this.getId();
      this.threadRootId = this.threadId;
      this.event.thread_id = this.threadId;
      this.isThreadRoot = true;
      return this.initThread(true);
    }
    return this.thread;
  }

  replaceThread(mEvent) {
    this.threadId = mEvent.threadId;
    this.thread = mEvent.thread;
    this.isThreadRoot = mEvent.isThreadRoot;
    this.threadRootId = mEvent.threadRootId;
    this.event.thread_id = mEvent.event.thread_id;
    this.emit('PonyHouse.ThreadReplaced', mEvent.thread);
  }

  getMemberEventType = () => {
    return this.event.member_type || null;
  };

  threadRootId = () => {
    const relatesTo = this.getWireContent()?.['m.relates_to'];
    if (relatesTo?.rel_type === THREAD_RELATION_TYPE.name) {
      return relatesTo.event_id;
    }
    if (this.thread) {
      return this.thread.id;
    }
    if (this.threadId !== null) {
      return this.threadId;
    }
    const unsigned = this.getUnsigned();
    if (unsigned && typeof unsigned[UNSIGNED_THREAD_ID_FIELD.name] === 'string') {
      return unsigned[UNSIGNED_THREAD_ID_FIELD.name];
    }
    return undefined;
  };

  getRelation = () => {
    if (!this.isRelation()) {
      return null;
    }
    return this.getWireContent()['m.relates_to'] ?? null;
  };

  getContent = () => {
    if (this.event?.replace_to) {
      return this.event?.replace_to['m.new_content'] || {};
    } else {
      return this.getOriginalContent();
    }
  };

  isRelation = (relType) => {
    const relation = this.getWireContent()?.['m.relates_to'];
    return !!(
      relation?.rel_type &&
      relation.event_id &&
      (relType ? relation.rel_type === relType : true)
    );
  };

  getThreadId = () => this.threadId;
  getThread = () => this.thread;

  getPrevContent = () => this?.getUnsigned().prev_content || {};
  getWireContent = () => this.event?.content || {};
  getOriginalContent = () => this.event.content || {};

  getId = () => this.event?.event_id || null;
  getRoomId = () => this.event?.room_id || null;
  getSender = () => this.event?.sender || null;
  getType = () => this.event?.type || null;

  getAge = () => (this.event?.unsigned && this.event.unsigned?.age) || null;
  getTs = () => this.event?.origin_server_ts;
  getDate = () => (this.event.origin_server_ts ? new Date(this.event.origin_server_ts) : null);

  getUnsigned = () => this.event?.unsigned || null;
  getServerAggregatedRelation = (relType) => this.getUnsigned()['m.relations']?.[relType];

  getStateKey = () => this.event.state_key;
  isState = () => this.event.state_key !== undefined;
  isEncrypted = () => false;

  isNotRedactedInDb = () =>
    (this.getUnsigned().redacted_because && !this.event?.redaction) || false;
  isRedactedDbOnly = () => (!this.getUnsigned().redacted_because && this.event?.redaction) || false;
  isRedacted = () =>
    this.getUnsigned().redacted_because || this.event?.redaction || this._forceRedaction || null;
  isRedaction = () => this.event?.type === 'm.room.redaction' || false;
  isSending = () => this.status !== 'sent' && !!this.status;

  getEditedContent = () => this.event?.replace_to || null;
  isEdited = () =>
    typeof this.event?.replace_to_id === 'string' &&
    typeof this.event?.replace_to_ts === 'number' &&
    objType(this.event?.replace_to, 'object')
      ? true
      : false;

  forceRedaction = () => {
    this._forceRedaction = true;
    this.event.redaction = true;
  };
}

export default LocalStorageEvent;
