import forPromise from 'for-promise';
import { EventEmitter } from 'events';
import $ from 'jquery';

export const postMessage = (data) => {
  if (
    ('serviceWorker' in navigator || 'ServiceWorker' in navigator) &&
    navigator.serviceWorker.controller &&
    navigator.serviceWorker.controller.postMessage
  ) {
    return navigator.serviceWorker.controller.postMessage(data);
  }
  return null;
};

let usingPWA = false;
let deferredPrompt;
window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
  const body = $('body');
  body.removeClass('window-browser').removeClass('window-standalone');

  let displayMode = 'browser';
  if (evt.matches) {
    displayMode = 'standalone';
  }

  // Log display mode change to analytics
  console.log(`[PWA] DISPLAY_MODE_CHANGED`, displayMode);
  body.addClass(`window-${displayMode}`);
});

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  // e.preventDefault();

  // Stash the event so it can be triggered later.
  deferredPrompt = e;

  // Update UI notify the user they can install the PWA
  // showInstallPromotion();

  // Optionally, send analytics event that PWA install promo was shown.
  console.log(`[PWA] 'beforeinstallprompt' event was fired.`, deferredPrompt);
});

window.addEventListener('appinstalled', () => {
  // Hide the app-provided install promotion
  // hideInstallPromotion();

  // Clear the deferredPrompt so it can be garbage collected
  deferredPrompt = null;

  // Optionally, send analytics event to indicate successful install
  console.log(`[PWA] PWA was installed`);
});

if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log(`[PWA] This is running as standalone.`);
  $('body').addClass(`window-standalone`);
} else {
  console.log(`[PWA] This is running as browser.`);
  $('body').addClass(`window-browser`);
}

export function getPWADisplayMode() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  if (document.referrer.startsWith('android-app://')) {
    return 'twa';
  }

  if (navigator.standalone || isStandalone) {
    return 'standalone';
  }

  return 'browser';
}

export function isUsingPWA() {
  return usingPWA;
}

export function clearFetchPwaCache() {
  postMessage({
    type: 'CLEAR_FETCH_CACHE',
  });
}

const startPWA = () => {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'ACTIVE_TABS') {
      if (Array.isArray(event.data.tabs)) {
        const newTabs = event.data.tabs;
        const tabs = tinyPwa.getTabs();

        const removeTabs = [];
        const addTabs = [];
        for (const item in tabs) {
          // Remove
          if (newTabs.findIndex((tab) => tab.id === tabs[item].id) < 0) removeTabs.push(tabs[item]);
          // Add
          else addTabs.push(tabs[item]);
        }

        for (const item in newTabs) {
          const newTab = tabs.find((tab) => tab.id === newTabs[item].id);
          // Update
          if (newTab) {
            for (const id in tabs[item]) {
              tabs[item][id] = newTab[id];
            }
            const index = addTabs.findIndex((tab) => tab.id === newTab.id);
            if (index > -1) addTabs.splice(index, 1);
          }
          // Add
          else addTabs.push(newTabs[item]);
        }

        // Complete
        for (const item in addTabs) tinyPwa._addTab(addTabs[item]);
        for (const item in removeTabs) tinyPwa._removeTab(removeTabs[item].id);
      }
      // tinyPwa._setTabId
    }
  });

  postMessage({
    type: 'GET_ACTIVE_TABS',
    id: Date.now(),
  });
  setInterval(
    () =>
      postMessage({
        type: 'GET_ACTIVE_TABS',
        id: Date.now(),
      }),
    60000,
  );
};

export function installPWA() {
  if ('serviceWorker' in navigator || 'ServiceWorker' in navigator) {
    // Get Items
    const cacheChecker = { count: 0, removed: false, keep: false };
    navigator.serviceWorker
      .getRegistrations()
      .then((items) => {
        // Register new Service Worker
        const registerNewService = () =>
          navigator.serviceWorker
            .register('./service-worker.js', { scope: './' })
            // Complete
            .then(() => {
              console.log('[PWA] Service Worker Registered.');
              usingPWA = true;
              startPWA();
            })
            // Error
            .catch((err) => {
              console.log('[PWA] Service Worker Failed to Register.');
              console.error(err);
            });

        if (items.length > 0) {
          forPromise({ data: items }, async (item, fn, fnErr) => {
            // Get Url data
            const tinyUrl =
              items[item].active &&
              typeof items[item].active.scriptURL === 'string' &&
              items[item].active.scriptURL.length > 0
                ? new URL(items[item].active.scriptURL)
                : {};

            // Remove old stuff
            if (
              cacheChecker.count > 0 ||
              !items[item].active ||
              (items[item].active.state !== 'activated' &&
                items[item].active.state !== 'activating') ||
              tinyUrl.pathname !== '/service-worker.js'
            ) {
              items[item]
                .unregister()
                .then((success) => {
                  if (!success)
                    console.error(`[PWA] Fail to remove the Service Worker ${items[item].scope}`);
                  else cacheChecker.removed = true;
                  fn();
                })
                .catch(fnErr);
            }

            // Update tiny stuff
            else if (
              __ENV_APP__.MXC_SERVICE_WORKER &&
              items[item].active &&
              (items[item].active.state === 'activated' ||
                items[item].active.state === 'activating') &&
              tinyUrl.pathname === '/service-worker.js'
            ) {
              items[item]
                .update()
                .then((success) => {
                  if (!success)
                    console.error(`[PWA] Fail to update the Service Worker ${items[item].scope}`);
                  else {
                    console.log('[PWA] Service Worker Updated.');
                    cacheChecker.keep = true;
                    usingPWA = true;
                    startPWA();
                  }
                  fn();
                })
                .catch(fnErr);
            }

            // Add count
            cacheChecker.count++;
          })
            // Remove progress complete
            .then(() => {
              if (__ENV_APP__.MXC_SERVICE_WORKER) {
                if (cacheChecker.removed && !cacheChecker.keep) {
                  registerNewService();
                }
              }
            })
            // Error
            .catch((err) => {
              console.log('[PWA] Service Worker Failed to Unregister.');
              console.error(err);
            });
        } else if (__ENV_APP__.MXC_SERVICE_WORKER) registerNewService();
      })
      // Error
      .catch((err) => {
        console.log('[PWA] Service Worker Failed to get Register list.');
        console.error(err);
      });
  }
}

class TinyPwa extends EventEmitter {
  constructor() {
    super();
    this.tabs = [];
    this.tabId = null;
  }

  _addTab(item) {
    this.tabs.push(item);
    this.emit('tabAdded', item);
  }

  _removeTab(id) {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index > -1) {
      const item = this.tabs.splice(index, 1);
      this.emit('tabRemoved', item);
    }
  }

  _setTabId(id) {
    this.tabId = id;
  }

  getTabs() {
    return this.tabs;
  }

  getTab(id) {
    return this.tabs.find((item) => item.id === id);
  }

  getTabId() {
    this.tabId;
  }

  getDisplayMode() {
    return getPWADisplayMode();
  }

  clearFetchCache() {
    return clearFetchPwaCache();
  }

  isEnabled() {
    return isUsingPWA();
  }
}

const tinyPwa = new TinyPwa();
tinyPwa.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default tinyPwa;

if (__ENV_APP__.MODE === 'development') {
  global.tinyPwa = tinyPwa;
}
