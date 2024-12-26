import EventEmitter from 'events';
import WebSocket from 'ws';
import clone from 'clone';

import tinyConsole from '@src/util/libs/console';
import { objType } from 'for-promise/utils/lib.mjs';
import tinyAPI from '@src/util/mods';
import { fetchFn } from '@src/client/initMatrix';

class SinkingApi extends EventEmitter {
  constructor() {
    super();
    this._API_SOCKET = 'wss://phish.sinking.yachts';
    this._API_HTTP = 'https://phish.sinking.yachts';
    this._WEBSITE = 'https://sinking.yachts/';
    this._TAG = '[Sinking Yachts]';
    this._ws = null;
    this._closing = false;
    this._cache = [];
  }

  stopSocket() {
    if (this._ws) {
      const tinyThis = this;
      this._closing = true;
      this._ws.on('close', () => {
        tinyThis._closing = false;
        tinyThis._ws = null;
      });
      this._ws.close();
    }
  }

  startSocket(xIdentity = 'PonyHouse-MatrixClient', isRestart = false) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      if ((!tinyThis._ws || isRestart) && !tinyThis._closing) {
        let firstTime = true;
        tinyThis._ws = new WebSocket(`${tinyThis._API_SOCKET}/feed`, {
          headers: { 'X-Identity': xIdentity },
        });

        // Open
        tinyThis._ws.on('open', () => {
          if (firstTime) {
            firstTime = false;
            resolve(true);
          }
          tinyConsole.log(`${tinyThis._TAG} Socket connected.`);
        });

        // Close
        tinyThis._ws.on('close', () => {
          tinyConsole.log(`${tinyThis._TAG} Socket disconnected.`);
          tinyThis
            .startSocket(xIdentity, true)
            .then(() => {
              if (firstTime) {
                firstTime = false;
                resolve(true);
              }
            })
            .catch((err) => {
              if (firstTime) {
                firstTime = false;
                reject(err);
              }
            });
        });

        // Message
        tinyThis._ws.on('message', (data, isBinary) => {
          // Try
          try {
            // Message
            let message = isBinary ? data : data.toString();

            // Filter
            if (typeof message === 'string') {
              message = JSON.parse(message);
            }

            tinyConsole.log(tinyThis._TAG, message);

            // Check
            if (
              objType(message, 'object') &&
              Array.isArray(message.domains) &&
              message.domains.length > 0
            ) {
              // Add
              if (message.type === 'add') {
                for (const item in message.domains) {
                  if (typeof message.domains[item] === 'string') {
                    tinyConsole.log(`${tinyThis._TAG} Domain added: ${message.domains[item]}`);
                    const index = tinyThis._cache.indexOf(message.domains[item]);

                    if (index < 0) {
                      tinyThis._cache.push(message.domains[item]);
                      tinyThis.emit('add', message.domains[item]);
                    }
                  }
                }
              }

              // Remove
              else if (message.type === 'delete') {
                for (const item in message.domains) {
                  if (typeof message.domains[item] === 'string') {
                    tinyConsole.log(`${tinyThis._TAG} Domain deleted: ${message.domains[item]}`);
                    const index = tinyThis._cache.indexOf(message.domains[item]);

                    if (index > -1) {
                      tinyThis._cache.splice(index, 1);
                      tinyThis.emit('delete', message.domains[item]);
                    }
                  }
                }
              }
            }
          } catch (err) {
            // Error
            tinyConsole.error(err);
          }
        });
      } else if (!tinyThis._closing || !isRestart)
        reject(new Error(`${tinyThis._TAG} The socket is started!`));
    });
  }

  check(host) {
    return new Promise((resolve, reject) =>
      fetchFn(`${this._API_HTTP}/v2/check/${host}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
        .then((res) => res.json())
        .then((data) => {
          if (typeof data === 'boolean') resolve(data);
          else resolve(false);
        })
        .catch(reject),
    );
  }

  getChanges(dt) {
    return new Promise((resolve, reject) =>
      fetchFn(`${this._API_HTTP}/v2/recent/${String(dt)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
        .then((res) => res.json())
        .then(resolve)
        .catch(reject),
    );
  }

  dbSize() {
    return new Promise((resolve, reject) =>
      fetchFn(`${this._API_HTTP}/v2/dbsize`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
        .then((res) => res.json())
        .then((amount) => {
          if (typeof amount === 'number') resolve(amount);
          else resolve(null);
        })
        .catch(reject),
    );
  }

  existSocket() {
    return this._ws ? true : false;
  }

  getDomainIndex(domain) {
    if (this._ws) {
      return this._cache.indexOf(domain);
    } else throw new Error('Sinking local cache works with socket only.');
  }

  isListed(domain) {
    const index = this.getDomainIndex(domain);
    return index > -1 ? true : false;
  }

  all() {
    const tinyThis = this;
    return new Promise((resolve, reject) =>
      fetchFn(`${this._API_HTTP}/v2/all`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            let allowed = true;
            const oldCache = clone(tinyThis._cache);

            for (const item in data) {
              if (typeof data[item] === 'string') {
                const index = tinyThis._cache.indexOf(data[item]);
                if (index < 0) {
                  tinyThis._cache.push(data[item]);
                  tinyThis.emit('add', data[item]);
                }
              } else {
                allowed = false;
                break;
              }
            }

            if (allowed) {
              for (const item in oldCache) {
                const indexOld = data.indexOf(oldCache[item]);
                if (indexOld < 0) {
                  const index = tinyThis._cache.indexOf(oldCache[item]);

                  if (index > -1) {
                    tinyThis._cache.splice(index, 1);
                    tinyThis.emit('delete', message.domains[item]);
                  }
                }
              }

              resolve(data);
            } else resolve([]);
          } else resolve([]);
        })
        .catch(reject),
    );
  }
}

const sinkingApi = new SinkingApi();

export default sinkingApi;

export function startSinkingYachts() {
  if (__ENV_APP__.ELECTRON_MODE) {
    // Welcome
    tinyConsole.log(`${sinkingApi._TAG} Scammers protection mod activated! ${sinkingApi._WEBSITE}`);

    // Function
    tinyAPI.on(
      'openUrlChecker',
      (data, host, protocol) =>
        new Promise((resolve, reject) => {
          if (
            (protocol === 'https:' || protocol === 'http:') &&
            (!objType(data, 'object') || !data.isScammer)
          ) {
            const newTinyData = { isScammer: false };
            sinkingApi
              .check(host)
              .then((result) => {
                newTinyData.isScammer = result;
                resolve(newTinyData);
              })
              .catch(reject);
          } else {
            resolve(data);
          }
        }),
    );
  }

  // Invalid device
  else {
    tinyConsole.log(
      `${sinkingApi._TAG} This mod is only compatible with the desktop version. The mod was disabled automatically.`,
    );
  }
}

if (__ENV_APP__.MODE === 'development') {
  global.sinkingApi = sinkingApi;
}
