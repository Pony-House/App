/**
 * Service worker interepts requests for images
 * It puts retrieved images in cache for 1 day
 * If image not found responds with fallback
 */

const INVALIDATION_INTERVAL = Number(24 * 60 * 60 * 1000) * 31; // 31 days
const NS = 'MAGE';
const SEPARATOR = '|';
const VERSION = Math.ceil(now() / INVALIDATION_INTERVAL);

/**
 * Helper to get current timestamp
 * @returns {Number}
 */
function now() {
  const d = new Date();
  return d.getTime();
}

/**
 * Build cache storage key that includes namespace, url and record version
 * @param {String} url
 * @returns {String}
 */
function buildKey(url) {
  return NS + SEPARATOR + url + SEPARATOR + VERSION;
}

/**
 * The complete Triforce, or one or more components of the Triforce.
 * @typedef {Object} RecordKey
 * @property {String} ns - namespace
 * @property {String} url - request identifier
 * @property {String} ver - record varsion
 */

/**
 * Parse cache key
 * @param {String} key
 * @returns {RecordKey}
 */
function parseKey(key) {
  const parts = key.split(SEPARATOR);
  return {
    ns: parts[0],
    key: parts[1],
    ver: parseInt(parts[2], 10),
  };
}

/**
 * Invalidate records matchinf actual version
 *
 * @param {Cache} caches
 * @returns {Promise}
 */
function purgeExpiredRecords(caches) {
  console.log('[PWA] [service-worker] Purging...');
  return caches.keys().then(function (keys) {
    return Promise.all(
      keys.map(function (key) {
        const record = parseKey(key);
        if (record.ns === NS && record.ver !== VERSION) {
          console.log('[PWA] [service-worker] deleting', key);
          return caches.delete(key);
        }
      }),
    );
  });
}

/**
 * Proxy request using cache-first strategy
 *
 * @param {Cache} caches
 * @param {Request} request
 * @returns {Promise}
 */
function proxyRequest(caches, request) {
  const key = buildKey(request.url);
  // set namespace
  return caches.open(key).then(function (cache) {
    // check cache
    return cache.match(request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      // { mode: "no-cors" } gives opaque response
      // https://fetch.spec.whatwg.org/#concept-filtered-response-opaque
      // so we cannot get info about response status
      const resolve = (networkResponse) => {
        if (networkResponse.type !== 'opaque' && networkResponse.ok === false) {
          throw new Error(
            `Resource not available\nType: ${networkResponse.type}\n${networkResponse.statusText}`,
          );
        }

        if (!networkResponse.ok) {
          const err = new Error(`Connection error: ${networkResponse.statusText}`);
          err.requestData = {
            status: networkResponse.status,
            statusText: networkResponse.statusText,
            type: networkResponse.type,
            redirected: networkResponse.redirected,
            headers: networkResponse.headers,
          };
          throw err;
        }
        console.info(
          '[PWA] [service-worker] Fetch it through Network',
          request.url,
          networkResponse.type,
        );
        cache.put(request, networkResponse.clone());
        return networkResponse;
      };

      return fetch(request.clone()).then(resolve);
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(purgeExpiredRecords(caches));
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  const origin = self?.origin || self.location?.origin;

  if (
    request.method !== 'GET' ||
    request.url.startsWith('blob:') ||
    request.url.startsWith('data:') ||
    typeof origin !== 'string' ||
    origin.length < 1 ||
    (!request.url.startsWith(`${origin}/img/`) &&
      !request.url.startsWith(`${origin}/js/`) &&
      !request.url.startsWith(`${origin}/sound/`) &&
      !request.url.startsWith(`${origin}/twemoji/`) &&
      !request.url.startsWith(`${origin}/assets/`) &&
      !request.url !== `${origin}/olm.wasm` &&
      !request.url !== `${origin}/manifest.json` &&
      !request.url !== `${origin}/404.html` &&
      !request.url !== `${origin}/ipfs-404.html`)
  ) {
    // Detect matrix file url
    const urlPath = request.url.split('/');
    const skipUrlPath = 2;
    if (
      urlPath[skipUrlPath + 1] === '_matrix' &&
      ((urlPath[skipUrlPath + 2] === 'media' &&
        (urlPath[skipUrlPath + 4] === 'download' || urlPath[skipUrlPath + 4] === 'thumbnail')) ||
        (urlPath[skipUrlPath + 2] === 'client' &&
          urlPath[skipUrlPath + 4] === 'media' &&
          (urlPath[skipUrlPath + 5] === 'download' || urlPath[skipUrlPath + 5] === 'thumbnail')))
    ) {
      if (!request.url.endsWith('ph_mxc_type=image')) return;
    } else return;
  }

  if (request.mode === 'navigate') eventTypes.GET_ACTIVE_TABS(event);

  event.respondWith(proxyRequest(caches, request));
});

const eventTypes = {
  CLEAR_FETCH_CACHE: (event) =>
    event.waitUntil(
      caches.keys().then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            return caches.delete(cacheName);
          }),
        );
      }),
    ),

  UPDATE_TAB_DATA: (event) =>
    self.clients
      .matchAll({ type: 'window' })
      .then((clients) => {
        const originalUrl = event.source.url;

        const tab = {
          frameType: event.source.frameType,
          id: event.source.id,
          type: event.source.type,
          url: event.source.url,
        };

        if (event.data.content)
          for (const item in event.data.content)
            if (item !== 'id' && item !== 'frameType' && item !== 'type')
              tab[item] = event.data.content[item];

        if (!tab.url.startsWith('https://') || !tab.url.startsWith('http://'))
          tab.url = originalUrl;

        for (const item in clients) clients[item].postMessage({ type: 'ACTIVE_TAB', tab });
      })
      .catch(console.error),

  GET_ACTIVE_TABS: (event) =>
    self.clients
      .matchAll({ type: 'window' })
      .then((clients) => {
        const activeTabs = [];

        for (const item in clients) {
          const client = clients[item];
          activeTabs.push({
            frameType: client.frameType,
            id: client.id,
            type: client.type,
            url: client.url,
          });
        }

        event.source.postMessage({
          type: 'WINDOW_TAB',
          tab: {
            frameType: event.source.frameType,
            id: event.source.id,
            type: event.source.type,
            url: event.source.url,
          },
        });

        for (const item in clients)
          clients[item].postMessage({ type: 'ACTIVE_TABS', tabs: activeTabs });
      })
      .catch(console.error),
};

self.addEventListener('message', (event) => {
  if (event.data && typeof eventTypes[event.data.type] === 'function')
    eventTypes[event.data.type](event);
});
