import encrypt from 'matrix-encrypt-attachment';
import EventEmitter from 'events';
import { generateApiKey } from 'generate-api-key';

import { fetchFn } from '@src/client/initMatrix';
import { avatarDefaultColor } from '@src/app/atoms/avatar/Avatar';

import { colorMXID } from '../colorMXID';
import { getBlobSafeMimeType } from '../mimetypes';
import envAPI from './env';
import tinyConsole from './console';

const LOAD_DELAY_COUNTER = __ENV_APP__.MXC_FETCH_WAITER;
const fetchLimit = {
  default: __ENV_APP__.MXC_FETCH_LIMIT.DEFAULT,
  emoji: __ENV_APP__.MXC_FETCH_LIMIT.EMOJI,
  avatar: __ENV_APP__.MXC_FETCH_LIMIT.AVATAR,
  media: __ENV_APP__.MXC_FETCH_LIMIT.MEDIA,
  attach: __ENV_APP__.MXC_FETCH_LIMIT.ATTACH,
};

export const getFetchLimit = (name = 'default') =>
  typeof fetchLimit[name] === 'number' ? fetchLimit[name] : fetchLimit.default;

const fetchTimeout = {
  default: __ENV_APP__.MXC_FETCH_TIMEOUT.DEFAULT,
  emoji: __ENV_APP__.MXC_FETCH_TIMEOUT.EMOJI,
  avatar: __ENV_APP__.MXC_FETCH_TIMEOUT.AVATAR,
  media: __ENV_APP__.MXC_FETCH_TIMEOUT.MEDIA,
  attach: __ENV_APP__.MXC_FETCH_TIMEOUT.ATTACH,
};

export const getFetchTimeout = (name = 'default') =>
  typeof fetchTimeout[name] === 'number' ? fetchTimeout[name] : fetchTimeout.default;

// Mxc Url
class MxcUrl extends EventEmitter {
  // Constructor
  constructor(mxBase) {
    super();
    this.mx = mxBase;
    this._fetchWait = {};
    this._isAuth = envAPI.get('MXC_AUTHENTICATED_MEDIA');
    this._queue = {};
    this._queueExec = {};
    this._loadDelay = 0;
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

    const tinyThis = this;
    envAPI.on('MXC_AUTHENTICATED_MEDIA', (value) => {
      if (typeof value === 'boolean') tinyThis._isAuth = value;
    });
  }

  // Set Auth Mode
  setAuthMode(value) {
    if (typeof value === 'boolean') this._isAuth = value;
  }

  isAuth() {
    return this._isAuth;
  }

  // Check Queue Cache
  _fixQueueCache(queueId = 'default') {
    if (!Array.isArray(this._queue[queueId])) this._queue[queueId] = [];
    if (!Array.isArray(this._queueExec[queueId])) this._queueExec[queueId] = [];
  }

  // Check Url Cache
  _checkUrlCache(url, type = '') {
    if (typeof global.cacheFileElectron === 'function') {
      return global.cacheFileElectron(url, type);
    }
    return url;
  }

  // Fetch queue
  _checkFetchQueue(queueId = 'default') {
    const tinyThis = this;
    tinyThis._fixQueueCache(queueId);

    // Get executation
    if (this._queueExec[queueId].length > 0) {
      for (const item in this._queueExec[queueId]) {
        if (!this._queueExec[queueId][item].exec) {
          // Execute now
          this._queueExec[queueId][item].exec = true;
          const tinyData = this._queueExec[queueId][item];

          // Complete
          const tinyComplete = () => {
            tinyThis._loadDelay -= LOAD_DELAY_COUNTER;
            if (tinyThis._loadDelay < 0) tinyThis._loadDelay = 0;
            // Remove old item
            const index = tinyThis._queueExec[queueId].findIndex(
              (tItem) => tItem.key === tinyData.key,
            );
            if (index > -1) {
              tinyThis._queueExec[queueId].splice(index, 1);
            }

            // Add new fetch
            if (tinyThis._queue[queueId].length > 0) {
              while (
                tinyThis._queue[queueId].length > 0 &&
                tinyThis._queueExec[queueId].length < getFetchLimit(queueId)
              ) {
                tinyThis._queueExec[queueId].push(tinyThis._queue[queueId].shift());
              }
            }

            // Check again
            tinyThis._checkFetchQueue(queueId);
          };

          // Fetch
          setTimeout(() => {
            tinyThis._loadDelay += LOAD_DELAY_COUNTER;
            fetchFn(tinyData.url, tinyData.options)
              .then((res) => {
                if (!res.ok) {
                  res
                    .json()
                    .then((e) => {
                      const err = new Error(e.error);
                      err.code = e.errcode;
                      tinyComplete();
                      tinyData.reject(err);
                    })
                    .catch((err) => {
                      tinyComplete();
                      tinyData.reject(err);
                    });
                  return;
                }
                tinyComplete();
                tinyData.resolve(res);
              })
              .catch((err) => {
                tinyComplete();
                tinyData.reject(err);
              });
          }, tinyThis._loadDelay);
        }
      }
    }
  }

  // Image
  readImageUrl(url) {
    if (!__ENV_APP__.ELECTRON_MODE) return url;
    return this._checkUrlCache(url, 'img');
  }

  // Custom
  readCustomUrl(url, type) {
    if (!__ENV_APP__.ELECTRON_MODE) return url;
    return this._checkUrlCache(url, type);
  }

  // Video
  readVideoUrl(url) {
    if (!__ENV_APP__.ELECTRON_MODE) return url;
    return this._checkUrlCache(url, 'video');
  }

  // Audio
  readAudioUrl(url) {
    if (!__ENV_APP__.ELECTRON_MODE) return url;
    return this._checkUrlCache(url, 'audio');
  }

  // Decrypt Blob
  async getDecryptedBlob(response = null, type = null, decryptData = null) {
    const arrayBuffer = await response.arrayBuffer();
    const dataArray = await encrypt.decryptAttachment(arrayBuffer, decryptData);
    const blob = new Blob([dataArray], { type: getBlobSafeMimeType(type) });
    return blob;
  }

  // Fetch Url
  fetch(
    link = null,
    type = null,
    ignoreCustomUrl = false,
    queueId = 'default',
    ignoreAuth = false,
  ) {
    let tinyLink = !ignoreCustomUrl ? this.readCustomUrl(link) : link;
    const FETCH_TIMEOUT = getFetchTimeout(queueId);

    const options = {
      method: 'GET',
      headers: {},
      signal: FETCH_TIMEOUT > 0 ? AbortSignal.timeout(FETCH_TIMEOUT) : undefined,
    };

    if (typeof type === 'string' && type.length > 0) {
      try {
        const tinyUrl = new URL(tinyLink);
        if (typeof tinyUrl.search === 'string' && tinyUrl.search.length > 0) tinyLink += `&`;
        else tinyLink += `?`;
        tinyLink += `ph_mxc_type=${type}`;
      } catch (err) {
        tinyConsole.log(`MCX Error in the URL: ${tinyLink}`);
        tinyConsole.error(err);
      }
    }

    if (!ignoreAuth && this._isAuth && this.mx && link.startsWith(`${this.mx.baseUrl}/`)) {
      const accessToken = typeof this.mx.getAccessToken === 'function' && this.mx.getAccessToken();
      if (accessToken) options.headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Execute fetch
    return new Promise((resolve, reject) => {
      const tinyThis = this;
      tinyThis._fixQueueCache(queueId);

      const key = generateApiKey();
      const tinyFetch = { key, url: tinyLink, options, resolve, reject, exec: false };

      // Execute now
      if (tinyThis._queueExec[queueId].length < getFetchLimit(queueId))
        tinyThis._queueExec[queueId].push(tinyFetch);
      // Later
      else tinyThis._queue[queueId].push(tinyFetch);

      tinyThis._checkFetchQueue(queueId);
    });
  }

  // Get Fetch Blob
  async getBlob(response = null, type = null, tinyLink = '', decryptData = null) {
    if (decryptData !== null && !tinyLink.startsWith('ponyhousetemp://')) {
      const blob = await this.getDecryptedBlob(response, type, decryptData);
      return blob;
    }
    const blob = await response.blob();
    return blob;
  }

  // Fetch Blob
  async fetchBlob(
    link = null,
    fileType = 'unknown',
    type = null,
    decryptData = null,
    queueId = 'default',
    ignoreAuth = false,
  ) {
    const tinyLink = this.readCustomUrl(link);
    const response = await this.fetch(tinyLink, fileType, true, queueId, ignoreAuth);
    return this.getBlob(response, type, tinyLink, decryptData);
  }

  // Focus Fetch Blob
  async focusFetchBlob(
    link = null,
    fileType = 'unknown',
    type = null,
    decryptData = null,
    queueId = 'default',
    ignoreAuth = false,
  ) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const waitId = `${link}`;
      if (!tinyThis._fetchWait[waitId]) {
        tinyThis._fetchWait[waitId] = true;
        tinyThis
          .fetchBlob(link, fileType, type, decryptData, queueId, ignoreAuth)
          // Complete
          .then((result) => {
            tinyThis.emit(`fetchBlob:then:${waitId}`, result);
            delete tinyThis._fetchWait[waitId];
            resolve(result);
          })
          // Error
          .catch((err) => {
            tinyThis.emit(`fetchBlob:catch:${waitId}`, err);
            delete tinyThis._fetchWait[waitId];
            reject(err);
          });
      }

      // Wait
      else {
        const funcs = {};
        const key = generateApiKey();

        const tinyComplete = (isResolve) => {
          if (isResolve) tinyThis.off(`fetchBlob:catch:${waitId}`, funcs[`${key}_TinyReject`]);
          else tinyThis.off(`fetchBlob:then:${waitId}`, funcs[`${key}_TinyResolve`]);
        };

        funcs[`${key}_TinyResolve`] = (result) => {
          resolve(result);
          tinyComplete(true);
        };
        funcs[`${key}_TinyReject`] = (err) => {
          reject(err);
          tinyComplete(false);
        };

        tinyThis.once(`fetchBlob:then:${waitId}`, funcs[`${key}_TinyResolve`]);
        tinyThis.once(`fetchBlob:catch:${waitId}`, funcs[`${key}_TinyReject`]);
      }
    });
  }

  // MXC Protocol to Http
  toHttp(
    mxcUrl,
    width,
    height,
    resizeMethod = 'scale',
    allowDirectLinks = undefined,
    allowRedirects = undefined,
  ) {
    if (typeof mxcUrl === 'string')
      return this.mx.mxcUrlToHttp(
        mxcUrl,
        width,
        height,
        height || width ? resizeMethod : undefined,
        allowDirectLinks,
        allowRedirects,
        this._isAuth,
      );
    return null;
  }

  // Classic getAvatarUrl
  getAvatarUrlClassic(
    user,
    width,
    height,
    resizeMethod = 'scale',
    allowDefault = undefined,
    allowDirectLinks = undefined,
  ) {
    return user?.getAvatarUrl(
      this.mx.baseUrl,
      width,
      height,
      height || width ? resizeMethod : undefined,
      allowDefault,
      allowDirectLinks,
    );
  }

  // Get Avatar Url
  getAvatarUrl(
    user,
    width,
    height,
    resizeMethod = 'scale',
    allowDefault = undefined,
    allowDirectLinks = undefined,
  ) {
    if (user) {
      let avatarUrl = this.toHttp(
        user?.getMxcAvatarUrl(),
        width,
        height,
        height || width ? resizeMethod : undefined,
        allowDirectLinks,
      );
      if (!avatarUrl && allowDefault) {
        avatarUrl = avatarDefaultColor(colorMXID(user.userId || user.roomId));
      }
      return avatarUrl;
    }
    return null;
  }

  validUrl(mxcUrl) {
    if (typeof mxcUrl === 'string') {
      const mxc = mxcUrl.split('/');

      if (mxc.length === 4 && mxc[0] && mxc[1] === '' && mxc[2] && mxc[3]) {
        return true;
      } else {
        return false;
      }
    }
    return false;
  }
}

// Class Module
export default MxcUrl;
