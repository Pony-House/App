import * as linkify from 'linkifyjs';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import initMatrix from '../../client/initMatrix';
import convertProtocols from './convertProtocols';
import moment from './momentjs';
import { getAppearance } from './appearance';
import storageManager from './Localstorage';
import { waitForTrue } from './timeoutLib';

const tinyCache = {};
const urlConvert = {
  http: (url) => `https${url.substring(4, url.length)}`,
};

const localStoragePlace = 'pony-house-url-preview';
const urlPreviewStore = {
  using: false,
  firstTime: true,
  getRaw: () => {
    urlPreviewStore.refreshFirstTime();
    return storageManager.getJson(localStoragePlace, 'obj');
  },

  refreshFirstTime() {
    if (urlPreviewStore.firstTime) {
      urlPreviewStore.firstTime = false;
      urlPreviewStore.refresh();
    }
  },

  validator: (value) =>
    objType(value, 'object') &&
    objType(value.data, 'object') &&
    typeof value.timeout === 'number' &&
    value.timeout > 0,

  get: (url) => {
    urlPreviewStore.refreshFirstTime();
    const storage = urlPreviewStore.getRaw();
    if (typeof url === 'string') {
      if (linkify.test(url)) {
        if (urlPreviewStore.validator(storage[url])) {
          storage[url].timeout = moment(storage[url].timeout);
          return storage[url];
        }

        urlPreviewStore.delete(url);
      }
    } else {
      for (const url2 in storage) {
        if (urlPreviewStore.validator(storage[url2])) {
          storage[url2].timeout = moment(storage[url2].timeout);
        } else {
          delete storage[url2];
          urlPreviewStore.delete(url2);
        }
      }

      return storage;
    }

    return null;
  },

  set: (url, value) => {
    urlPreviewStore.refreshFirstTime();
    try {
      if ((typeof url === 'string' && linkify.test(url)) || value === null) {
        const storage = urlPreviewStore.getRaw();

        const newValue = {
          data: objType(value, 'object') ? value.data : null,
          timeout: value !== null ? value.timeout.valueOf() : null,
        };

        if (urlPreviewStore.validator(newValue)) {
          storage[url] = newValue;
        } else if (storage[url]) {
          delete storage[url];
        }

        return storageManager.setJson(localStoragePlace, storage);
      }
    } catch (err) {
      tinyConsole.error(err);
      return null;
    }

    return null;
  },

  delete: (url) => {
    urlPreviewStore.refreshFirstTime();
    return urlPreviewStore.set(url, null);
  },

  refresh: () => {
    const newData = urlPreviewStore.get();

    for (const item in newData) {
      tinyCache[item] = newData[item];
    }
  },
};

setInterval(() => {
  for (const item in tinyCache) {
    if (!tinyCache[item].timeout.isValid() || moment().isAfter(tinyCache[item].timeout)) {
      delete tinyCache[item];

      setTimeout(() => {
        urlPreviewStore.delete(item);
      }, 1);
    }
  }
}, 60000);

export { urlPreviewStore };

const fixGetUrlValues = (tinyUrl, data) => {
  if (objType(data, 'object')) {
    if (
      typeof data['og:url'] === 'string' &&
      !data['og:url'].startsWith('https://') &&
      !data['og:url'].startsWith('http://')
    ) {
      const url = new URL(tinyUrl);
      data['og:url'] = `${url.origin}${data['og:url']}`;
    }
  }
  return data;
};

export default function getUrlPreview(newUrl, ts = 0) {
  return new Promise((resolve, reject) => {
    const mx = initMatrix.matrixClient;
    if (typeof newUrl === 'string' && linkify.test(newUrl)) {
      // Protocol
      const url = convertProtocols(newUrl, newUrl);
      const embedParallelLoad = getAppearance('embedParallelLoad');

      // Check URL
      if (
        tinyCache[url.href] &&
        (objType(tinyCache[url.href].data, 'object') || tinyCache[url.href].data === null)
      ) {
        resolve(fixGetUrlValues(url.href, tinyCache[url.href].data));
      } else {
        let tinyUrl = url.href;
        for (const item in urlConvert) {
          if (tinyUrl.startsWith(`${item}://`)) {
            tinyUrl = urlConvert[item](tinyUrl);
            break;
          }
        }

        // Check Storage
        const storeCache = urlPreviewStore.get(tinyUrl);

        // New
        if (!storeCache) {
          // Start cache manager
          waitForTrue(() => !urlPreviewStore.using, 500).then(() => {
            if (!embedParallelLoad) urlPreviewStore.using = true;
            mx.getUrlPreview(tinyUrl, ts)
              .then((embed) => {
                tinyCache[url.href] = { data: embed, timeout: moment().add(12, 'hours') };
                urlPreviewStore.set(url.href, tinyCache[url.href]);
                urlPreviewStore.using = false;
                resolve(fixGetUrlValues(url.href, embed));
              })
              .catch((err) => {
                tinyCache[url.href] = { data: null, timeout: moment().add(1, 'hours') };
                urlPreviewStore.delete(url.href);
                urlPreviewStore.using = false;
                reject(err);
              });
          });
        }

        // Use cache
        else {
          resolve(fixGetUrlValues(tinyUrl, storeCache.data));
        }
      }
    }
  });
}

if (__ENV_APP__.MODE === 'development') {
  global.getUrlPreviewCache = tinyCache;
}
