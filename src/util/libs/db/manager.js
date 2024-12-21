import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';
import EventEmitter from 'events';

import { startDb } from './indexedDb';
import { getMemberEventType } from '@src/app/organisms/room/MemberEvents';

const getTableName = (tableData) => (typeof tableData === 'string' ? tableData : tableData.name);

class TinyDbManager extends EventEmitter {
  constructor() {
    super();

    this._dbVersion = 29;
    this._oldDbVersion = global.localStorage.getItem('ponyHouse-db-version') || 0;
    this.dbName = 'pony-house-database';

    this._editedIds = {};
    this._deletedIds = {};
    this._threadIds = {};

    this._eventDbs = [
      'reactions',
      'messages_search',
      'messages_edit',
      'crdt',
      { name: 'timeline', existMemberType: true },
      {
        name: 'messages',
        existMemberType: true,
        join: [
          {
            where: {
              room_id: '{room_id}',
            },
            type: 'left',
            with: 'threads',
            on: `threads.event_id=messages.event_id`,
            as: {
              event_id: 'is_thread_root',
              room_id: 'is_thread_room_root',
            },
          },
          {
            with: 'messages_primary_edit',
            on: `messages_primary_edit.event_id=messages.event_id`,
            type: 'left',
            where: {
              room_id: '{room_id}',
            },
            as: {
              event_id: 'primary_replace_event_id',
              room_id: 'primary_replace_room_id',
              thread_id: 'primary_replace_thread_id',
              replace_id: 'primary_replace_to_id',
              content: 'primary_replace_to',
              origin_server_ts: 'primary_replace_to_ts',
            },
          },
        ],
      },
    ];

    this._waitTimelineTimeout = new Promise((resolve) => resolve());
  }

  setTimelineTimeout(waitTimelineTimeout) {
    this._waitTimelineTimeout = waitTimelineTimeout;
  }

  async startPonyHouseDb() {
    const isDbCreated = await startDb(this);
    this._oldDbVersion = this._dbVersion;
    global.localStorage.setItem('ponyHouse-db-version', this._dbVersion);
    this.emit('isDbCreated', isDbCreated);
    return isDbCreated;
  }

  _eventFilter(event, data = {}, extraValue = null) {
    const date = event.getDate();
    const threadId = this._getEventThreadId(event);
    const isRedacted = event.isRedacted() ? true : false;

    data.event_id = event.getId();
    data.state_key = event.getStateKey();
    data.is_transaction = data.event_id.startsWith('~') ? true : false;
    data.e_status = event.status;

    data.type = event.getType();
    data.member_type = getMemberEventType(event);
    if (typeof data.member_type !== 'string' || data.member_type.length < 1)
      data.member_type = 'NULL';

    data.sender = event.getSender();
    data.room_id = event.getRoomId();
    data.content = clone(event.getContent());
    data.unsigned = clone(event.getUnsigned());
    data.redaction =
      typeof isRedacted === 'boolean'
        ? isRedacted
        : typeof this._deletedIds[data.event_id] === 'boolean'
          ? this._deletedIds[data.event_id]
          : false;

    if (typeof threadId === 'string' && threadId !== data.event_id) data.thread_id = threadId;
    else data.thread_id = 'NULL';

    if (date) data.origin_server_ts = date.getTime();

    if (typeof data.age !== 'number') delete data.age;
    if (typeof data.type !== 'string') delete data.type;
    if (typeof data.sender !== 'string') delete data.sender;
    if (typeof data.room_id !== 'string') delete data.room_id;
    if (typeof data.state_key !== 'string') delete data.state_key;

    if (!objType(data.content, 'object')) delete data.content;
    if (!objType(data.unsigned, 'object')) delete data.unsigned;
    if (typeof extraValue === 'function') extraValue(data);

    return data;
  }

  _setDataTemplate = (dbName, dbEvent, event, extraValue = null) => {
    const tinyThis = this;
    const data = tinyThis._eventFilter(event, {}, extraValue);
    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .insert({
          into: dbName,
          upsert: true,
          values: [data],
        })
        .then((result) => {
          tinyThis.emit(dbEvent, result, data);
          tinyThis._waitTimelineTimeout().then(() => resolve(result));
        })
        .catch(reject),
    );
  };

  _deleteDataByIdTemplate = (dbName, dbEvent, event, where) => {
    const tinyThis = this;
    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .remove({
          from: dbName,
          where: where
            ? where
            : {
                event_id: event.getId(),
              },
        })
        .then((result) => {
          tinyThis.emit(dbEvent, result, event);
          tinyThis._waitTimelineTimeout().then(() => resolve(result));
        })
        .catch(reject),
    );
  };

  async deleteRoomDb(roomId) {
    const where = { room_id: roomId };

    const timeline = await this.storeConnection.remove({ from: 'timeline', where });
    await this._waitTimelineTimeout();
    const messages = await this.storeConnection.remove({ from: 'messages', where });
    await this._waitTimelineTimeout();
    const crdt = await this.storeConnection.remove({ from: 'crdt', where });
    await this._waitTimelineTimeout();
    const reactions = await this.storeConnection.remove({ from: 'reactions', where });
    await this._waitTimelineTimeout();
    const members = await this.storeConnection.remove({ from: 'members', where });
    await this._waitTimelineTimeout();
    const messagesEdit = await this.storeConnection.remove({ from: 'messages_edit', where });
    await this._waitTimelineTimeout();
    const messagesSearch = await this.storeConnection.remove({ from: 'messages_search', where });
    await this._waitTimelineTimeout();
    const receipt = await this.deleteReceiptByRoomId(roomId);

    return {
      crdt,
      timeline,
      messages,
      reactions,
      members,
      messagesEdit,
      messagesSearch,
      receipt,
    };
  }

  setMember(event) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const data = {};
      try {
        const content = event.getContent();
        const date = event.getDate();

        data.user_id = event.getSender();
        data.room_id = event.getRoomId();
        data.type = content.membership;

        data.avatar_url = content.avatar_url;
        data.display_name = content.displayname;

        if (date) data.origin_server_ts = date.getTime();
        data.id = `${data.user_id}:${data.room_id}`;

        tinyThis.storeConnection
          .select({
            from: 'members',
            limit: 1,
            where: {
              id: data.id,
            },
          })
          .then((oldData) => {
            const tinyData = oldData[0];
            if (
              typeof data.origin_server_ts === 'number' &&
              (!tinyData ||
                typeof tinyData.origin_server_ts !== 'number' ||
                data.origin_server_ts >= tinyData.origin_server_ts)
            ) {
              tinyThis.storeConnection
                .insert({
                  into: 'members',
                  upsert: true,
                  values: [data],
                })
                .then((result) => {
                  tinyThis.emit('dbMember', result, { event: clone(data) });
                  tinyThis._waitTimelineTimeout().then(() => resolve(result));
                })
                .catch(reject);
            } else resolve(null);
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  async setMessageEdit(event) {
    const msgRelative = event.getRelation();
    const replaceTs = event.getTs();

    if (
      msgRelative &&
      (!this._editedIds[msgRelative.event_id] ||
        replaceTs > this._editedIds[msgRelative.event_id].replace_to_ts)
    ) {
      await this.storeConnection.insert({
        into: 'messages_primary_edit',
        upsert: true,
        values: [
          {
            replace_id: msgRelative.event_id,
            event_id: event.getId(),
            room_id: event.getRoomId(),
            thread_id: event.getThread()?.id,
            content: event.getContent(),
            origin_server_ts: replaceTs,
          },
        ],
      });

      this._editedIds[msgRelative.event_id] = {
        replace_to_ts: replaceTs,
        replace_to_id: event.getId(),
        replace_to: event.getContent(),
      };
    }

    return this._setDataTemplate('messages_edit', 'dbMessageEdit', event, (data) => {
      data.replace_event_id = msgRelative.event_id;
    });
  }

  deleteMessageEditById(event) {
    return this._deleteDataByIdTemplate('messages_edit', 'dbMessageEditDeleted', event);
  }

  deleteMessageEditByReplaceId(event) {
    return this._deleteDataByIdTemplate('messages_edit', 'dbMessageEditDeleted', event, {
      replace_event_id: event.getId(),
    });
  }

  setReceipt(roomId, userId, ts) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const data = {
        id: `${roomId}_${userId}`,
        room_id: roomId,
        user_id: userId,
        origin_server_ts: ts,
      };

      tinyThis.storeConnection
        .insert({
          into: 'receipt',
          upsert: true,
          values: [data],
        })
        .then((result) => {
          tinyThis.emit('dbReceipt', result, { event: clone(data) });
          tinyThis._waitTimelineTimeout().then(() => resolve(result));
        })
        .catch(reject);
    });
  }

  _deleteReceiptTemplate(where, id) {
    const tinyThis = this;
    const whereData = {};
    whereData[where] = id;

    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .remove({
          from: 'receipt',
          where: whereData,
        })
        .then((result) => {
          tinyThis.emit('dbReceiptDeleted', result);
          tinyThis._waitTimelineTimeout().then(() => resolve(result));
        })
        .catch(reject),
    );
  }

  deleteReceiptById(id) {
    return this._deleteReceiptTemplate('id', id);
  }

  deleteReceiptByUserId(id) {
    return this._deleteReceiptTemplate('user_id', id);
  }

  deleteReceiptByRoomId(id) {
    return this._deleteReceiptTemplate('room_id', id);
  }

  setMessage(event) {
    const tinyThis = this;
    const setMessage = () =>
      new Promise((resolve, reject) => {
        const eventId = event.getId();
        const extraAdd = {};

        if (tinyThis._editedIds[eventId]) {
          extraAdd.replace_to_ts = tinyThis._editedIds[eventId].replace_to_ts;
          extraAdd.replace_to_id = tinyThis._editedIds[eventId].replace_to_id;
          extraAdd.replace_to = tinyThis._editedIds[eventId].replace_to;
        }

        tinyThis
          ._setDataTemplate('messages', 'dbMessage', event, extraAdd)
          .then((result) => {
            const data = tinyThis._eventFilter(event);
            const tinyItem = {
              event_id: data.event_id,
              redaction: data.redaction,
              origin_server_ts: data.origin_server_ts,
            };

            tinyItem.is_transaction = tinyItem.event_id.startsWith('~') ? true : false;
            tinyItem.e_status = event.status;

            if (typeof data.sender === 'string') tinyItem.sender = data.sender;
            if (typeof data.room_id === 'string') tinyItem.room_id = data.room_id;
            if (typeof data.thread_id === 'string') tinyItem.thread_id = data.thread_id;
            else tinyItem.thread_id = 'NULL';

            if (data.content) {
              if (typeof data.content.msgtype === 'string') tinyItem.type = data.content.msgtype;
              if (typeof data.content.body === 'string') tinyItem.body = data.content.body;
              if (typeof data.content.formatted_body === 'string')
                tinyItem.formatted_body = data.content.formatted_body;
              if (typeof data.content.format === 'string') tinyItem.format = data.content.format;

              if (data.content.file) {
                if (typeof data.content.file.mimetype === 'string')
                  tinyItem.mimetype = data.content.file.mimetype;

                if (typeof data.content.file.url === 'string') tinyItem.url = data.content.file.url;
              }
            }

            tinyThis.storeConnection
              .insert({
                into: 'messages_search',
                upsert: true,
                values: [tinyItem],
              })
              .then((result2) => {
                tinyThis.emit('dbMessageSearch', result2, tinyItem);
                tinyThis._waitTimelineTimeout().then(() => resolve(result));
              })
              .catch(reject);
          })
          .catch(reject);
      });

    const setMessageEdit = () =>
      new Promise((resolve, reject) =>
        tinyThis
          .setMessageEdit(event)
          .then((result) => {
            const data = tinyThis._eventFilter(event);
            const content = event.getContent();
            const relatesTo = content?.['m.relates_to'];
            const newContent = content?.['m.new_content'];

            if (relatesTo && newContent) {
              const tinyItem = {
                event_id: relatesTo.event_id,
                redaction: data.redaction,
                origin_server_ts: data.origin_server_ts,
              };

              tinyItem.is_transaction = tinyItem.event_id.startsWith('~') ? true : false;
              tinyItem.e_status = event.status;

              if (typeof newContent.msgtype === 'string') tinyItem.type = newContent.msgtype;
              if (typeof newContent.body === 'string') tinyItem.body = newContent.body;
              if (typeof newContent.formatted_body === 'string')
                tinyItem.formatted_body = newContent.formatted_body;
              if (typeof newContent.format === 'string') tinyItem.format = newContent.format;

              if (typeof data.sender === 'string') tinyItem.sender = data.sender;
              if (typeof data.room_id === 'string') tinyItem.room_id = data.room_id;
              if (typeof data.thread_id === 'string') tinyItem.thread_id = data.thread_id;
              else tinyItem.thread_id = 'NULL';

              if (newContent.file) {
                if (typeof newContent.file.mimetype === 'string')
                  tinyItem.mimetype = newContent.file.mimetype;

                if (typeof newContent.file.url === 'string') tinyItem.url = newContent.file.url;
              }

              tinyThis.storeConnection
                .select({
                  from: 'messages',
                  limit: 1,
                  where: { event_id: relatesTo.event_id },
                })
                .then((messages2) => {
                  if (Array.isArray(messages2) && messages2[0]) {
                    // Message migration
                    const msgTs = messages2[0].replace_to_ts;
                    const data2 = {};
                    data2.replace_to_ts = data.origin_server_ts;
                    data2.replace_to_id = data.event_id;
                    data2.replace_to = content;
                    if (
                      typeof msgTs !== 'number' ||
                      Number.isNaN(msgTs) ||
                      !Number.isFinite(msgTs) ||
                      msgTs <= 0 ||
                      data2.replace_to_ts >= msgTs
                    ) {
                      tinyThis.storeConnection
                        .update({
                          in: 'messages',
                          set: data2,
                          where: {
                            event_id: relatesTo.event_id,
                          },
                        })
                        .then((result2) =>
                          tinyThis.emit(
                            'dbMessageUpdate',
                            result2,
                            Object.assign(messages2[0], data2),
                          ),
                        );
                    }
                  }
                });

              tinyThis.storeConnection
                .insert({
                  into: 'messages_search',
                  upsert: true,
                  values: [tinyItem],
                })
                .then((result2) => {
                  tinyThis.emit('dbMessageSearch', result2, tinyItem);
                  tinyThis._waitTimelineTimeout().then(() => resolve(result));
                })
                .catch(reject);
            } else tinyThis._waitTimelineTimeout().then(() => resolve(result));
          })
          .catch(reject),
      );

    const msgRelative = event.getRelation();
    if (
      !msgRelative ||
      typeof msgRelative.event_id !== 'string' ||
      typeof msgRelative.rel_type !== 'string'
    )
      return setMessage();
    else if (msgRelative.rel_type === 'm.replace') return setMessageEdit();
    else return setMessage();
  }

  deleteMessageById(event) {
    return this._deleteDataByIdTemplate('messages', 'dbMessageDeleted', event);
  }

  setCrdt(event) {
    return this._setDataTemplate('crdt', 'dbCrdt', event);
  }

  deleteCrdtById(event) {
    return this._deleteDataByIdTemplate('crdt', 'dbCrdtDeleted', event);
  }

  setReaction(event) {
    return this._setDataTemplate('reactions', 'dbReaction', event);
  }

  deleteReactionById(event) {
    return this._deleteDataByIdTemplate('reactions', 'dbReactionDeleted', event);
  }

  setTimeline(event) {
    return this._setDataTemplate('timeline', 'dbTimeline', event);
  }

  deleteTimelineById(event) {
    return this._deleteDataByIdTemplate('timeline', 'dbTimelineDeleted', event);
  }

  _getEventThreadId(event) {
    const thread = event.getThread();
    const content = event.getContent();
    return thread && typeof thread.id === 'string'
      ? thread.id
      : content &&
          content['m.relates_to'] &&
          content['m.relates_to']['rel_type'] === 'm.thread' &&
          typeof content['m.relates_to'].event_id === 'string'
        ? content['m.relates_to'].event_id
        : null;
  }

  _setIsThread(event) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const threadId = tinyThis._getEventThreadId(event);
      tinyThis._threadIds[threadId] = true;
      if (typeof threadId === 'string') {
        const data = {
          event_id: threadId,
          room_id: event.getRoomId(),
        };
        tinyThis.storeConnection
          .insert({
            into: 'threads',
            upsert: true,
            values: [data],
          })
          .then((result) => {
            tinyThis.emit('dbThreads', result, data);
            tinyThis._waitTimelineTimeout().then(() => resolve(result));
          })
          .catch(reject);
      } else resolve(null);
    });
  }

  _setRedaction(eventId, dbName, isRedacted = false) {
    const tinyThis = this;
    this._deletedIds[eventId] = isRedacted;
    return new Promise((resolve, reject) =>
      tinyThis.storeConnection
        .update({
          in: dbName,
          set: {
            redaction: isRedacted,
          },
          where: {
            event_id: eventId,
          },
        })
        .then((noOfRowsUpdated) => {
          if (typeof noOfRowsUpdated === 'number' && noOfRowsUpdated > 0)
            tinyThis.emit('dbEventRedaction', {
              in: dbName,
              eventId,
              noOfRowsUpdated,
              isRedacted,
            });
          tinyThis._waitTimelineTimeout().then(() => resolve(noOfRowsUpdated));
        })
        .catch(reject),
    );
  }

  async _sendSetRedaction(event) {
    for (const dbIndex in this._eventDbs) {
      const content = event.getContent();
      const unsigned = event.getUnsigned();
      if (content) {
        // Normal way
        if (typeof content.redacts === 'string')
          await this._setRedaction(content.redacts, getTableName(this._eventDbs[dbIndex]), true);
        // String
        else if (Array.isArray(content.redacts)) {
          for (const item in content.redacts) {
            if (typeof content.redacts[item] === 'string')
              await this._setRedaction(
                content.redacts[item],
                getTableName(this._eventDbs[dbIndex]),
                true,
              );
          }
        }

        // Transaction Id
        if (unsigned && typeof unsigned.transaction_id === 'string')
          await this._setRedaction(
            `~${event.getRoomId()}:${unsigned.transaction_id}`,
            getTableName(this._eventDbs[dbIndex]),
            true,
          );
      }
    }
  }
}

export default TinyDbManager;
