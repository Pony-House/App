import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';
import EventEmitter from 'events';

import { startDb } from './indexedDb';
import eventsDb from './eventsDb';
import getMemberEventType from '@src/app/organisms/room/getMemberEventType';

const getTableName = (tableData) => (typeof tableData === 'string' ? tableData : tableData.name);

class TinyDbManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    this._dbVersion = 31;
    this._oldDbVersion = global.localStorage.getItem('ponyHouse-db-version') || 0;
    this.dbName = 'pony-house-database';

    this._editedIds = {};
    this._deletedIds = {};

    this._queryCache = { data: [], busy: 0 };
    this._waitTimelineTimeout = () => new Promise((resolve) => resolve());
  }

  _runQuery(funcName, query, resolve, reject) {
    this._queryCache.busy++;
    this.emit('queryQueue', this._queryCache.busy);
    const tinyThis = this;
    this.storeConnection[funcName](query)
      .then((result) => {
        tinyThis._queryCache.busy--;
        tinyThis.emit('queryQueue', tinyThis._queryCache.busy);
        tinyThis._nextQuery();
        resolve(result);
      })
      .catch((err) => {
        tinyThis._queryCache.busy--;
        tinyThis.emit('queryQueue', tinyThis._queryCache.busy);
        tinyThis._nextQuery();
        reject(err);
      });
  }

  _nextQuery() {
    if (this._queryCache.data.length > 0) {
      this._queryCache.data.sort((a, b) => b.ts - a.ts);
      const data = this._queryCache.data.shift();
      this._runQuery(data.funcName, data.query, data.resolve, data.reject);
    }
  }

  _executeQuery(funcName, query, ts, resolve, reject) {
    if (this._queryCache.busy < __ENV_APP__.TIMELINE_EVENTS_PER_TIME)
      this._runQuery(funcName, query, resolve, reject);
    else this._queryCache.data.push({ funcName, query, resolve, reject, ts });
  }

  _insertQuery(query, date) {
    const tinyThis = this;
    const ts = date || new Date().valueOf();
    return new Promise((resolve, reject) =>
      tinyThis._executeQuery('insert', query, ts, resolve, reject),
    );
  }

  _updateQuery(query, date) {
    const tinyThis = this;
    const ts = date || new Date().valueOf();
    return new Promise((resolve, reject) =>
      tinyThis._executeQuery('update', query, ts, resolve, reject),
    );
  }

  _removeQuery(query, date) {
    const tinyThis = this;
    const ts = date || new Date().valueOf();
    return new Promise((resolve, reject) =>
      tinyThis._executeQuery('remove', query, ts, resolve, reject),
    );
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
    const threadId = event.threadRootId;
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
      tinyThis
        ._insertQuery(
          {
            into: dbName,
            upsert: true,
            values: [data],
          },
          event.getTs(),
        )
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
      tinyThis
        ._removeQuery(
          {
            from: dbName,
            where: where
              ? where
              : {
                  event_id: event.getId(),
                },
          },
          event.getTs(),
        )
        .then((result) => {
          tinyThis.emit(dbEvent, result, event);
          tinyThis._waitTimelineTimeout().then(() => resolve(result));
        })
        .catch(reject),
    );
  };

  async deleteRoomDb(roomId) {
    const where = { room_id: roomId };

    const timeline = await this._removeQuery({ from: 'timeline', where });
    await this._waitTimelineTimeout();
    const messages = await this._removeQuery({ from: 'messages', where });
    await this._waitTimelineTimeout();
    const crdt = await this._removeQuery({ from: 'crdt', where });
    await this._waitTimelineTimeout();
    const reactions = await this._removeQuery({ from: 'reactions', where });
    await this._waitTimelineTimeout();
    const members = await this._removeQuery({ from: 'members', where });
    await this._waitTimelineTimeout();
    const messagesEdit = await this._removeQuery({ from: 'messages_edit', where });
    await this._waitTimelineTimeout();
    const messagesSearch = await this._removeQuery({ from: 'messages_search', where });
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
              tinyThis
                ._insertQuery(
                  {
                    into: 'members',
                    upsert: true,
                    values: [data],
                  },
                  event.getTs(),
                )
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
      await this._insertQuery(
        {
          into: 'messages_primary_edit',
          upsert: true,
          values: [
            {
              replace_id: msgRelative.event_id,
              event_id: event.getId(),
              room_id: event.getRoomId(),
              thread_id: event.getThread()?.id || event.threadRootId,
              content: event.getContent(),
              origin_server_ts: replaceTs,
            },
          ],
        },
        event.getTs(),
      );

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

      tinyThis
        ._insertQuery(
          {
            into: 'receipt',
            upsert: true,
            values: [data],
          },
          ts,
        )
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
      tinyThis
        ._removeQuery({
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

            tinyThis
              ._insertQuery(
                {
                  into: 'messages_search',
                  upsert: true,
                  values: [tinyItem],
                },
                event.getTs(),
              )
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
                      tinyThis
                        ._updateQuery(
                          {
                            in: 'messages',
                            set: data2,
                            where: {
                              event_id: relatesTo.event_id,
                            },
                          },
                          event.getTs(),
                        )
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

              tinyThis
                ._insertQuery(
                  {
                    into: 'messages_search',
                    upsert: true,
                    values: [tinyItem],
                  },
                  event.getTs(),
                )
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
    return this._setDataTemplate('reactions', 'dbReaction', event, (data) => {
      const relation = event.getRelation();
      if (relation && typeof relation.event_id === 'string') data.target_id = relation.event_id;
    });
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

  _setIsThread(event) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const threadId = event.threadRootId;
      if (typeof threadId === 'string') {
        const data = {
          event_id: threadId,
          room_id: event.getRoomId(),
        };
        tinyThis
          ._insertQuery(
            {
              into: 'threads',
              upsert: true,
              values: [data],
            },
            event.getTs(),
          )
          .then((result) => {
            tinyThis.emit('dbThreads', result, data);
            tinyThis._waitTimelineTimeout().then(() => resolve(result));
          })
          .catch(reject);
      } else resolve(null);
    });
  }

  _setRedaction(eventId, roomId, dbName, isRedacted = false) {
    const tinyThis = this;
    this._deletedIds[eventId] = isRedacted;
    return new Promise((resolve, reject) =>
      tinyThis
        ._updateQuery({
          in: dbName,
          set: {
            redaction: isRedacted,
          },
          where: {
            room_id: roomId,
            event_id: eventId,
          },
        })
        .then((noOfRowsUpdated) => {
          if (typeof noOfRowsUpdated === 'number' && noOfRowsUpdated > 0)
            tinyThis.emit('dbEventRedaction', {
              in: dbName,
              eventId,
              roomId,
              noOfRowsUpdated,
              isRedacted,
            });
          tinyThis._waitTimelineTimeout().then(() => resolve(noOfRowsUpdated));
        })
        .catch(reject),
    );
  }

  async _sendSetRedaction(event) {
    for (const dbIndex in eventsDb) {
      const content = event.getContent();
      const unsigned = event.getUnsigned();
      if (content) {
        // Normal way
        if (typeof content.redacts === 'string')
          await this._setRedaction(
            content.redacts,
            event.getRoomId(),
            getTableName(eventsDb[dbIndex]),
            true,
          );
        // String
        else if (Array.isArray(content.redacts)) {
          for (const item in content.redacts) {
            if (typeof content.redacts[item] === 'string')
              await this._setRedaction(
                content.redacts[item],
                event.getRoomId(),
                getTableName(eventsDb[dbIndex]),
                true,
              );
          }
        }

        // Transaction Id
        if (unsigned && typeof unsigned.transaction_id === 'string')
          await this._setRedaction(
            `~${event.getRoomId()}:${unsigned.transaction_id}`,
            event.getRoomId(),
            getTableName(eventsDb[dbIndex]),
            true,
          );
      }
    }
  }
}

export default TinyDbManager;
