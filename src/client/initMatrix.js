import EventEmitter from 'events';
import * as sdk from 'matrix-js-sdk';

import Olm from '@matrix-org/olm';

import { clearFetchPwaCache } from '@src/util/pwa/installer';
import storageManager from '@src/util/libs/Localstorage';
import MxcUrl from '@src/util/libs/MxcUrl';

import envAPI from '@src/util/libs/env';
import { startTimestamp } from '@src/util/markdown';
import attemptDecryption from '@src/util/libs/attemptDecryption';
import { preloadImages } from '@src/util/tools';
import {
  defaultAvatar,
  defaultProfileBanner,
  defaultSpaceBanner,
} from '@src/app/atoms/avatar/defaultAvatar';

import MatrixVoiceChat from '@src/util/libs/voiceChat';
import emojiEditor from '@src/util/libs/emoji/EmojiEditor';

import { secret } from './state/auth';
import RoomList from './state/RoomList';
import UserList from './state/UserList';
import AccountData from './state/AccountData';
import RoomsInput from './state/RoomsInput';
import Notifications from './state/Notifications';
import { cryptoCallbacks } from './state/secretStorageKeys';
import navigation from './state/navigation';
import cons from './state/cons';

global.Olm = Olm;

const fetchBase = (url, ops) => {
  return global.fetch(url.href, ops);
};

const fetchFn = global.fetch;
export { fetchFn };

class InitMatrix extends EventEmitter {
  constructor() {
    super();
    this.isGuest = false;
    navigation.initMatrix = this;
  }

  setGuest(value) {
    if (typeof value === 'boolean') {
      this.matrixClient.setGuest(value);
      this.isGuest = value;
    }
  }

  setMatrixClient(mx) {
    this.matrixClient = mx;
    this.isGuest = mx.isGuest();
    if (__ENV_APP__.MODE === 'development') {
      global.initMatrix = { matrixClient: mx, mxcUrl: this.mxcUrl };
    }
  }

  async init(isGuest = false) {
    const started = await this.startClient(isGuest);
    if (started.ready) {
      this.setupSync();
      this.listenEvents();
      return { userId: secret.userId };
    }
    return { userId: null, err: started.err };
  }

  async getAccount3pid() {
    if (this.matrixClient) {
      const res = await fetchFn(
        `${this.matrixClient.baseUrl}/_matrix/client/v3/account/3pid?access_token=${this.matrixClient.getAccessToken()}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      const data = await res.json();
      return data;
    }

    return null;
  }

  async startClient(isGuest = false) {
    try {
      const isPersisted = await storageManager.checkStoragePersisted();
      if (!isPersisted)
        await storageManager.requestStoragePersisted().catch((err) => {
          alert(err.message, 'Error Storage Persisted');
          console.error(err);
        });

      startTimestamp();

      const avatarsToLoad = [];
      for (let i = 0; i < 9; i++) {
        avatarsToLoad.push(defaultAvatar(i));
        avatarsToLoad.push(defaultProfileBanner(i));
        avatarsToLoad.push(defaultSpaceBanner(i));
      }

      preloadImages(avatarsToLoad);
      await storageManager.startPonyHouseDb();

      const indexedDBStore = new sdk.IndexedDBStore({
        indexedDB: storageManager.getIndexedDB(),
        localStorage: storageManager.getLocalStorage(),
        dbName: 'web-sync-store',
      });

      const clientOps = {
        baseUrl: secret.baseUrl,

        accessToken: secret.accessToken,
        userId: secret.userId,
        store: indexedDBStore,

        cryptoStore: new sdk.IndexedDBCryptoStore(global.indexedDB, 'crypto-store'),

        deviceId: secret.deviceId,

        useE2eForGroupCall: !isGuest,
        isVoipWithNoMediaAllowed: !isGuest,
        timelineSupport: true,
        supportsCallTransfer: !isGuest,

        cryptoCallbacks,
        verificationMethods: ['m.sas.v1'],
      };

      if (__ENV_APP__.ELECTRON_MODE) {
        clientOps.fetchFn = fetchBase;
      }

      this.matrixClient = sdk.createClient(clientOps);
      this.mxcUrl = new MxcUrl(this.matrixClient);
      if (storageManager.getBool(cons.secretKey.IS_GUEST)) this.setGuest(true);

      emojiEditor.start();
      attemptDecryption.start();
      if (__ENV_APP__.ELECTRON_MODE) {
        if (global.tinyJsonDB && typeof global.tinyJsonDB.startClient === 'function')
          await global.tinyJsonDB.startClient();

        // if (typeof global.startMediaCacheElectron === 'function')
        //  await global.startMediaCacheElectron();
      }

      await envAPI.startDB();
      await indexedDBStore.startup();

      if (!__ENV_APP__.RUST_CRYPTO_MODE) {
        console.log('[matrix-js-sdk] Using initCrypto.');
        await this.matrixClient.initCrypto();
      } else {
        console.log('[matrix-js-sdk] Using initRustCrypto.');
        await this.matrixClient.initRustCrypto();
      }

      this.matrixClient.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

      await this.matrixClient.startClient({
        // includeArchivedRooms: true,
        disablePresence: false,
        lazyLoadMembers: true,
        threadSupport: true,
        // initialSyncLimit: 100,
      });

      this.supportExtendedProfiles = await this.matrixClient.doesServerSupportExtendedProfiles();
      // getExtendedProfile(userId: string)
      // getExtendedProfileProperty(userId: string, key: string)
      // setExtendedProfileProperty(key: string, value: unknown)

      this.matrixClient.setGlobalErrorOnUnknownDevices(false);
      return { ready: true };
    } catch (err) {
      alert(err.message, 'Client Start Error');
      console.error(err);
      return { ready: false, err };
    }
  }

  setupSync() {
    const sync = {
      NULL: () => {
        console.log(`NULL state`);
      },
      SYNCING: () => {
        console.log(`SYNCING state`);
      },
      PREPARED: (prevState) => {
        console.log(`PREPARED state`);
        console.log(`Previous state: `, prevState);
        if (__ENV_APP__.MODE === 'development') {
          global.initMatrix = this;
        }
        if (prevState === null) {
          this.isEncryptionEnabledInRoom =
            this.matrixClient &&
            typeof this.matrixClient.getCrypto === 'function' &&
            typeof this.matrixClient.getCrypto().isEncryptionEnabledInRoom === 'function'
              ? this.matrixClient.getCrypto().isEncryptionEnabledInRoom
              : () => false;

          this.roomList = new RoomList(this.matrixClient);
          this.userList = new UserList(this.matrixClient);
          this.accountData = new AccountData(this.roomList);
          this.roomsInput = new RoomsInput(this.matrixClient, this.roomList);
          this.notifications = new Notifications(this.roomList);
          this.voiceChat = new MatrixVoiceChat(this.matrixClient);

          this.matrixClient.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

          this.emit('init_loading_finished');
          this.notifications._initNoti();
        } else {
          this.notifications?._initNoti();
        }
      },
      RECONNECTING: () => {
        console.log(`RECONNECTING state`);
      },
      CATCHUP: () => {
        console.log(`CATCHUP state`);
      },
      ERROR: () => {
        console.log(`ERROR state`);
      },
      STOPPED: () => {
        console.log(`STOPPED state`);
      },
    };
    this.matrixClient.on(sdk.ClientEvent.Sync, (state, prevState) => sync[state](prevState));
  }

  listenEvents() {
    this.matrixClient.on(sdk.HttpApiEvent.SessionLoggedOut, async () => {
      this.matrixClient.stopClient();
      await this.matrixClient.clearStores();
      storageManager.clearLocalStorage();
      window.location.reload();
    });
  }

  async logout() {
    this.matrixClient.stopClient();
    try {
      await this.matrixClient.logout();
    } catch {
      // ignore if failed to logout
    }
    await this.matrixClient.clearStores();
    if (global.tinyJsonDB && typeof global.tinyJsonDB.clearData === 'function')
      await global.tinyJsonDB.clearData();
    storageManager.clearLocalStorage();
    window.location.reload();
  }

  clearCacheAndReload() {
    clearFetchPwaCache();
    this.matrixClient.stopClient();
    this.matrixClient.store.deleteAllData().then(() => {
      if (global.tinyJsonDB && typeof global.tinyJsonDB.clearCacheData === 'function') {
        global.tinyJsonDB.clearCacheData().then(() => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    });
  }
}

const initMatrix = new InitMatrix();
initMatrix.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

export default initMatrix;
