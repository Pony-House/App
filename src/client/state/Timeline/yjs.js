import * as Y from 'yjs';
import clone from 'clone';
import objectHash from 'object-hash';
import { objType } from 'for-promise/utils/lib.mjs';

import moment from '@src/util/libs/momentjs';

import { getClientYjs, enableyJsItem } from './functions';

const delayYdocUpdate = 100;
const hashTryLimit = 10;

const crdtEvent = 'pony.house.crdt';

if (__ENV_APP__.MODE === 'development') {
  global.Y = Y;
}

export default function installYjs(tinyThis) {
  tinyThis.crdt = {};

  // Ydoc data
  tinyThis._ydoc = {
    initialized: false,
    data: null,
    last_update: null,

    matrix_update: [],
    cache: [],
    send_events: [],
    sending_event: false,
    error_hash: null,
    error_hash_count: 0,

    cache_timeout: null,

    update_time: { timeout: null, cache: [] },
    init_cache: [],
  };

  tinyThis.sendCrdtToTimeline = function (mEvent) {
    // CRDT
    if (tinyThis._ydoc.initialized) {
      tinyThis.addCrdtToTimeline(mEvent);
    } else {
      tinyThis._ydoc.init_cache.push(mEvent);
    }
  };

  tinyThis.ydocWait = function () {
    return new Promise((resolve) => {
      const tryYdoc = () => {
        if (tinyThis._ydoc) {
          resolve(tinyThis._ydoc);
        } else {
          setTimeout(tryYdoc, 100);
        }
      };

      tryYdoc();
    });
  };

  tinyThis.ydoc = function () {
    return tinyThis._ydoc.data;
  };

  tinyThis.getYmap = function (id) {
    return tinyThis.ydoc().getMap(id);
  };

  tinyThis.getYarray = function (id) {
    return tinyThis.ydoc().getArray(id);
  };

  tinyThis.getYtext = function (id) {
    return tinyThis.ydoc().getText(id);
  };

  tinyThis.clearCrdtLocalTimelines = function () {
    tinyThis._ydoc.init_cache = [];
    tinyThis.crdt = {};
  };

  // To JSON
  tinyThis.ydocToJson = function (tinyIds) {
    // Prepare Ids
    const ids = typeof tinyIds === 'string' ? [tinyIds] : Array.isArray(tinyIds) ? tinyIds : null;

    // Exist Doc
    if (tinyThis._ydoc.data) {
      // Prepare Functions
      const tinyResult = {};
      const getData = (value, key) => {
        const type = enableyJsItem.constructorToString(value);
        if (enableyJsItem.convertToJson[type]) {
          tinyResult[key] = enableyJsItem.convertToJson[type](value);
        }
      };

      // Null. Get all
      if (!ids || ids.length < 1) {
        tinyThis._ydoc.data.share.forEach(getData);
      }

      // Get Values
      else {
        for (const id in ids) {
          const item = tinyThis._ydoc.data.share.get(ids[id]);

          if (item) {
            getData(item, ids[0]);
          }
        }
      }

      return tinyResult;
    }

    // Invalid
    return null;
  };

  // Add crdt
  tinyThis._addCrdt = function (content, timestamp) {
    // Checker
    if (tinyThis._ydoc.data) {
      try {
        if (tinyThis._ydoc.last_update === null || timestamp > tinyThis._ydoc.last_update) {
          // Data
          if (typeof content.data === 'string' && content.data.length > 0) {
            // Get Data
            const data = atob(content.data).split(',');
            for (const item in data) {
              data[item] = Number(data[item]);
            }

            if (data.length > 1) {
              // Prepare to insert into update
              const memoryData = new Uint8Array(data);
              const updateInfo = Y.decodeUpdate(memoryData);
              const newKeys = [];

              getClientYjs(updateInfo, (info) => {
                newKeys.push(info.key);
                tinyThis._ydoc.matrix_update.push(info.key);
              });

              // Fix Doc
              if (
                typeof content.parent === 'string' &&
                typeof content.type === 'string' &&
                content.parent.length > 0 &&
                content.type.length > 0
              ) {
                enableyJsItem.action(tinyThis._ydoc.data, content.type, content.parent);
              }

              // Apply update
              const before = clone(tinyThis.ydocToJson());
              Y.applyUpdate(tinyThis._ydoc.data, memoryData);
              const after = clone(tinyThis.ydocToJson());

              if (objectHash(before) === objectHash(after)) {
                for (const ki in newKeys) {
                  const index = tinyThis._ydoc.matrix_update.indexOf(newKeys[ki]);
                  tinyThis._ydoc.matrix_update.splice(index, 1);
                }
              }
            }
          }

          // Snapshot
          else if (
            objType(content.snapshot, 'object') &&
            typeof content.snapshot.update === 'string' &&
            content.snapshot.update.length > 0 &&
            typeof content.snapshot.encode === 'string' &&
            content.snapshot.encode.length > 0
          ) {
            // Fix doc
            if (objType(content.snapshot.types, 'object')) {
              for (const key in content.snapshot.types) {
                if (
                  typeof content.snapshot.types[key] === 'string' &&
                  content.snapshot.types[key].length > 0
                ) {
                  enableyJsItem.action(tinyThis._ydoc.data, content.snapshot.types[key], key);
                }
              }
            }

            // Get Data
            const data = atob(content.snapshot.update).split(',');
            for (const item in data) {
              data[item] = Number(data[item]);
            }

            if (data.length > 1) {
              // Prepare to insert into update
              const memoryData = new Uint8Array(data);

              // Apply update
              tinyThis._ydoc.last_update = timestamp;
              Y.applyUpdate(tinyThis._ydoc.data, memoryData);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Nope. Wait more
    else {
      tinyThis._ydoc.cache.push({ content, timestamp });

      if (tinyThis._ydoc.cache_timeout) {
        clearTimeout(tinyThis._ydoc.cache_timeout);
        tinyThis._ydoc.cache_timeout = null;
      }

      const tinyTimeout = () => {
        if (tinyThis._ydoc) {
          for (const item in tinyThis._ydoc.cache) {
            tinyThis._addCrdt(
              tinyThis._ydoc.cache[item].content,
              tinyThis._ydoc.cache[item].timestamp,
            );
          }

          tinyThis._ydoc.cache = [];
        } else {
          if (tinyThis._ydoc.cache_timeout) {
            clearTimeout(tinyThis._ydoc.cache_timeout);
            tinyThis._ydoc.cache_timeout = null;
          }

          tinyThis._ydoc.cache_timeout = setTimeout(tinyTimeout, 500);
        }
      };

      tinyThis._ydoc.cache_timeout = setTimeout(tinyTimeout, 500);
    }
  };

  // Add CRDT to timeline
  tinyThis.addCrdtToTimeline = function (mEvent) {
    const { content, origin_server_ts } = mEvent;
    if (objType(content, 'object')) {
      // Content Type
      if (typeof content.store === 'string' && content.store.length > 0) {
        if (!Array.isArray(tinyThis.crdt[content.store])) tinyThis.crdt[content.store] = [];
        tinyThis.crdt[content.store].push(mEvent);
      }

      // Classic values
      else {
        if (!Array.isArray(tinyThis.crdt.DEFAULT)) tinyThis.crdt.DEFAULT = [];
        tinyThis.crdt.DEFAULT.push(mEvent);
      }

      // Send to Crdt
      const eventDate = moment(origin_server_ts);

      // No Reset
      if (!content.resetAll) {
        // Single
        if (!Array.isArray(content.multiData)) {
          tinyThis._addCrdt(content, eventDate.toDate());
        }

        // Multi
        else {
          for (const item in content.multiData) {
            if (objType(content.multiData[item], 'object')) {
              tinyThis._addCrdt(
                content.multiData[item],
                eventDate.clone().add(Number(item), 'seconds').toDate(),
              );
            }
          }
        }
      }

      // Reset
      else {
        tinyThis._disableYdoc();
        tinyThis._ydocEnable(new Y.Doc());
      }
    }
  };

  // CRDT
  tinyThis.deleteCrdtFromTimeline = function (eventId, where = 'DEFAULT') {
    if (Array.isArray(tinyThis.crdt[where])) {
      const i = tinyThis.getCrdtIndex(eventId, where);
      if (i === -1) return undefined;
      return tinyThis.crdt[where].splice(i, 1)[0];
    }
  };

  tinyThis.findCrdtById = function (eventId, where = 'DEFAULT') {
    if (Array.isArray(tinyThis.crdt[where])) {
      return tinyThis.crdt[where][tinyThis.getCrdtIndex(eventId)] ?? null;
    }
  };

  tinyThis.getCrdtIndex = function (eventId, where = 'DEFAULT') {
    if (Array.isArray(tinyThis.crdt[where])) {
      return tinyThis.crdt[where].findIndex((mEvent) => mEvent.event_id === eventId);
    }
  };

  tinyThis.snapshotCrdt = function () {
    const update = enableyJsItem.convertToString(Y.encodeStateAsUpdate(tinyThis._ydoc.data));
    const encode = enableyJsItem.convertToString(Y.encodeSnapshot(Y.snapshot(tinyThis._ydoc.data)));

    const types = {};
    tinyThis._ydoc.data.share.forEach((value, key) => {
      try {
        types[key] = String(
          value.constructor.name.startsWith('_')
            ? value.constructor.name.substring(1)
            : value.constructor.name,
        ).toLocaleLowerCase();
      } catch {
        types[key] = null;
      }
    });

    const newDoc = new Y.Doc();
    Y.applyUpdate(newDoc, update);

    tinyThis._disableYdoc();
    tinyThis._ydocEnable(newDoc);

    return { update, encode, types };
  };

  tinyThis._tryInsertCrdtAgain = function () {
    return new Promise((resolve, reject) => {
      if (tinyThis._ydoc.send_events.length > 0) {
        const newData = tinyThis._ydoc.send_events.shift();

        if (!tinyThis._ydoc.sending_event) {
          tinyThis._ydoc.sending_event = true;

          tinyThis.matrixClient
            .sendEvent(tinyThis.roomId, crdtEvent, newData)
            .then(() => {
              tinyThis._ydoc.sending_event = false;
              tinyThis._ydoc.error_hash = null;
              tinyThis._ydoc.error_hash_count = 0;
              resolve(tinyThis._tryInsertCrdtAgain());
            })
            .catch((err) => {
              console.error(err);
              tinyThis._ydoc.send_events.unshift(newData);
              tinyThis._ydoc.sending_event = false;

              const newError = objectHash(newData);

              if (newError !== tinyThis._ydoc.error_hash) {
                tinyThis._ydoc.error_hash = newError;
                tinyThis._ydoc.error_hash_count = 0;
              } else {
                tinyThis._ydoc.error_hash_count++;
              }

              if (tinyThis._ydoc.error_hash_count <= hashTryLimit) {
                resolve(tinyThis._tryInsertCrdtAgain());
              } else {
                alert(err.message, 'CRDT SYNC ERROR!');
                reject(err);
              }
            });
        } else {
          tinyThis._ydoc.send_events.unshift(newData);
          tinyThis._ydoc.sending_event = false;
          resolve(tinyThis._tryInsertCrdtAgain());
        }
      }

      resolve(true);
    });
  };

  tinyThis._insertCrdt = function (data, type, parent, store = 'DEFAULT') {
    return new Promise((resolve) => {
      const newData = { data, store, type, parent };
      if (!tinyThis._ydoc.sending_event) {
        tinyThis._ydoc.sending_event = true;

        tinyThis.matrixClient
          .sendEvent(tinyThis.roomId, crdtEvent, newData)
          .then(() => {
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = null;
            resolve(tinyThis._tryInsertCrdtAgain());
          })
          .catch((err) => {
            console.error(err);
            tinyThis._ydoc.send_events.unshift(newData);
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = objectHash(newData);
            resolve(tinyThis._tryInsertCrdtAgain());
          });
      } else {
        tinyThis._ydoc.send_events.push(newData);
        resolve(tinyThis._tryInsertCrdtAgain());
      }
    });
  };

  tinyThis.resetCrdt = function () {
    return new Promise((resolve) => {
      const newData = { resetAll: true };
      if (!tinyThis._ydoc.sending_event) {
        tinyThis._ydoc.sending_event = true;

        tinyThis.matrixClient
          .sendEvent(tinyThis.roomId, crdtEvent, newData)
          .then(() => {
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = null;
            resolve(tinyThis._tryInsertCrdtAgain());
          })
          .catch((err) => {
            console.error(err);
            tinyThis._ydoc.send_events.unshift(newData);
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = objectHash(newData);
            resolve(tinyThis._tryInsertCrdtAgain());
          });
      } else {
        tinyThis._ydoc.send_events.push(newData);
        resolve(tinyThis._tryInsertCrdtAgain());
      }
    });
  };

  tinyThis._insertCrdtMulti = function (multiData) {
    return new Promise((resolve) => {
      const newData = { multiData };
      if (!tinyThis._ydoc.sending_event) {
        tinyThis._ydoc.sending_event = true;

        tinyThis.matrixClient
          .sendEvent(tinyThis.roomId, crdtEvent, newData)
          .then(() => {
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = null;
            resolve(tinyThis._tryInsertCrdtAgain());
          })
          .catch((err) => {
            console.error(err);
            tinyThis._ydoc.send_events.unshift(newData);
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = objectHash(newData);
            resolve(tinyThis._tryInsertCrdtAgain());
          });
      } else {
        tinyThis._ydoc.send_events.push(newData);
        resolve(tinyThis._tryInsertCrdtAgain());
      }
    });
  };

  tinyThis._insertSnapshotCrdt = function (snapshot, type, parent, store = 'DEFAULT') {
    return new Promise((resolve) => {
      const newData = { snapshot, store, type, parent };
      if (!tinyThis._ydoc.sending_event) {
        tinyThis._ydoc.sending_event = true;

        tinyThis.matrixClient
          .sendEvent(tinyThis.roomId, crdtEvent, newData)
          .then(() => {
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = null;
            resolve(tinyThis._tryInsertCrdtAgain());
          })
          .catch((err) => {
            console.error(err);
            tinyThis._ydoc.send_events.unshift(newData);
            tinyThis._ydoc.sending_event = false;
            tinyThis._ydoc.error_hash = objectHash(newData);
            resolve(tinyThis._tryInsertCrdtAgain());
          });
      } else {
        tinyThis._ydoc.send_events.push(newData);
        resolve(tinyThis._tryInsertCrdtAgain());
      }
    });
  };

  tinyThis._ydocEnable = function (ydoc) {
    tinyThis._ydoc.data = ydoc;
    tinyThis._ydoc.matrix_update = [];

    tinyThis._ydoc.data.on('update', (update) => {
      const updateInfo = Y.decodeUpdate(update);

      // Checker
      let needUpdate = true;
      let itemType;
      let parent;
      getClientYjs(updateInfo, (info, type) => {
        // Get Index
        const index = tinyThis._ydoc.matrix_update.indexOf(info.key);
        if (index > -1) {
          tinyThis._ydoc.matrix_update.splice(index, 1);
          needUpdate = false;
        }

        // Get new value type
        else if (type === 'structs') {
          const struct = tinyThis._ydoc.data.store.clients.get(info.key);
          if (Array.isArray(struct) && struct.length > 0 && struct[struct.length - 1]) {
            const item = struct[struct.length - 1];

            try {
              itemType = enableyJsItem.constructorToString(item.parent);
            } catch {
              itemType = null;
            }

            if (typeof info.value.parent === 'string' && info.value.parent.length > 0) {
              parent = info.value.parent;
            }
          }
        }
      });

      // Insert update into the room
      if (needUpdate) {
        try {
          // Event Name
          const eventName = 'DEFAULT';

          const eventResult = () => {
            // Get CRDT List and user Id
            const items = tinyThis.crdt[eventName];
            // const userId = tinyThis.matrixClient.getUserId();

            // Counter Checker
            let crdtCount = 0;
            if (Array.isArray(items) && items.length > 0) {
              // Check Events
              for (const item in items) {
                // Get Content
                const content = items[item].getContent();

                // First Check
                if (
                  // userId === items[item].getSender() &&
                  objType(content, 'object') &&
                  content.store === eventName
                ) {
                  // Is Data
                  if (
                    (typeof content.data === 'string' && content.data.length > 0) ||
                    (Array.isArray(content.multiData) && content.multiData.length > 0)
                  ) {
                    crdtCount++;
                  }

                  // Is Snapshot
                  else if (
                    objType(content.snapshot, 'object') &&
                    typeof content.snapshot.update === 'string' &&
                    content.snapshot.update.length > 0 &&
                    typeof content.snapshot.encode === 'string' &&
                    content.snapshot.encode.length > 0
                  ) {
                    crdtCount = 0;
                  }
                }
              }
            }

            // Send snapshot
            if (crdtCount > 7) {
              tinyThis._insertSnapshotCrdt(tinyThis.snapshotCrdt(), itemType, parent, eventName);
            }
          };

          // Prepare Data
          tinyThis._ydoc.update_time.cache.push({
            data: enableyJsItem.convertToString(update),
            type: itemType,
            parent,
            store: eventName,
          });
          if (tinyThis._ydoc.update_time.timeout) clearTimeout(tinyThis._ydoc.update_time.timeout);

          // Insert CRDT and prepare to check snapshot sender
          tinyThis._ydoc.update_time.timeout = setTimeout(() => {
            if (tinyThis._ydoc.update_time.cache.length <= 1) {
              if (tinyThis._ydoc.update_time.cache[0]) {
                const newTinyData = clone(tinyThis._ydoc.update_time.cache[0]);
                tinyThis
                  ._insertCrdt(
                    newTinyData.data,
                    newTinyData.type,
                    newTinyData.parent,
                    newTinyData.store,
                  )
                  .then(eventResult);
              }
            } else {
              tinyThis._insertCrdtMulti(clone(tinyThis._ydoc.update_time.cache)).then(eventResult);
            }

            delete tinyThis._ydoc.update_time.cache;
            tinyThis._ydoc.update_time.cache = [];
          }, delayYdocUpdate);
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  tinyThis._disableYdoc = function () {
    if (tinyThis._ydoc.data) tinyThis._ydoc.data.destroy();
    tinyThis._ydoc.matrix_update = [];
  };

  tinyThis.initYdoc = function () {
    if (!tinyThis._ydoc.initialized) {
      tinyThis._ydoc.initialized = true;
      tinyThis._ydocEnable(new Y.Doc());

      const initLength = tinyThis._ydoc.init_cache.length;
      if (initLength > 0) {
        for (let i = 0; i < initLength; i++) {
          let mEvent;
          try {
            mEvent = tinyThis._ydoc.init_cache.shift();
          } catch {
            mEvent = null;
          }

          if (mEvent) tinyThis.addCrdtToTimeline(mEvent);
        }
      }
    }
  };
}
