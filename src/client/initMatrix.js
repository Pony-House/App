import EventEmitter from 'events';
import * as sdk from 'matrix-js-sdk';

import Olm from '@matrix-org/olm';
import { objType, countObj } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';
import { clearFetchPwaCache } from '@src/util/pwa/installer';
import storageManager from '@src/util/libs/Localstorage';
import MxcUrl from '@src/util/libs/MxcUrl';

import envAPI from '@src/util/libs/env';
import { startTimestamp } from '@src/util/markdown';
import attemptDecryption from '@src/util/libs/attemptDecryption';
import { preloadImages } from '@src/util/tools2';
import {
  defaultAvatar,
  defaultProfileBanner,
  defaultSpaceBanner,
} from '@src/app/atoms/avatar/defaultAvatar';

import MatrixVoiceChat from '@src/util/libs/voiceChat';
import emojiEditor from '@src/util/libs/emoji/EmojiEditor';

import { getSecrets } from './state/auth';
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

  async fetchMessages(
    ops = {
      dir: sdk.Direction.Backward,
      limit: 10,
      filter: null,
      fromToken: null,
      roomId: null,
      relType: null,
      eventId: null,
      filesOnly: false,
    },
  ) {
    // Request parameters
    const params = {
      dir: typeof ops.dir === 'string' ? ops.dir : sdk.Direction.Backward, // "b" = backward (old events), "f" = forward
      limit: typeof ops.limit === 'number' ? ops.limit : 10, // Number of events per page
    };

    // Add Filter items
    const filter = {};
    if (objType(ops.filter, 'object'))
      for (const item in ops.filter) filter[item] = ops.filter[item];

    if (ops.filesOnly) {
      filter.contains_url = true;
      if (!Array.isArray(filter.types)) filter.types = ['m.room.message'];
    }

    // Add Values
    if (typeof ops.fromToken === 'string') params.from = ops.fromToken;
    if (countObj(filter) > 0) params.filter = JSON.stringify(filter);

    // Relation Type
    const relType = typeof ops.relType === 'string' ? ops.relType : null;
    const eventId = typeof ops.eventId === 'string' ? ops.eventId : null;

    // Search API messages
    const response = await this.matrixClient.http.authedRequest(
      'GET',
      `/rooms/${String(ops.roomId)}${
        typeof eventId !== 'string' || typeof relType !== 'string'
          ? `/messages`
          : `/relations/${eventId}/${relType}`
      }`,
      params,
      null,
      { prefix: '/_matrix/client/v3' },
    );

    // Decrypt messages (if necessary)
    const decryptedMessages = await Promise.all(
      response.chunk.map(async (event) => {
        const mEvent = new sdk.MatrixEvent(event);
        if (mEvent.getType() === 'm.room.encrypted') {
          try {
            const decrypted = await this.matrixClient.getCrypto().decryptEvent(mEvent);
            if (objType(decrypted, 'object')) {
              if (objType(decrypted.clearEvent, 'object')) mEvent.clearEvent = decrypted.clearEvent;
              return { mEvent, decrypt: decrypted };
            } else return { mEvent };
          } catch (err) {
            return { mEvent, err };
          }
        }
        return { mEvent };
      }),
    );

    // Anti repeat token
    const isNewToken = (responseToken) =>
      typeof ops.fromToken !== 'string' || ops.fromToken !== responseToken;

    // Return messages and token to next page
    return {
      events: decryptedMessages.reverse(),
      nextToken:
        decryptedMessages.length > 0 &&
        typeof response.end === 'string' &&
        (ops.dir !== sdk.Direction.Backward || isNewToken(response.end))
          ? response.end
          : null, // Token to the next page
      prevToken:
        decryptedMessages.length > 0 &&
        typeof response.start === 'string' &&
        (ops.dir !== sdk.Direction.Forward || isNewToken(response.start))
          ? response.start
          : null, // Token to the prev page
    };
  }

  async init(isGuest = false) {
    const secret = getSecrets();
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
      return this.matrixClient.http.authedRequest(
        'GET',
        `/account/3pid`,
        { access_token: this.matrixClient.getAccessToken() },
        null,
        { prefix: '/_matrix/client/v3' },
      );
    }

    return null;
  }

  async startClient(isGuest = false) {
    try {
      const secret = getSecrets();
      const isPersisted = await storageManager.checkStoragePersisted();
      if (!isPersisted)
        await storageManager.requestStoragePersisted().catch((err) => {
          alert(err.message, 'Error Storage Persisted');
          tinyConsole.error(err);
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
      tinyConsole.install(this.matrixClient.logger);

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
        tinyConsole.log('[matrix-js-sdk] Using initCrypto.');
        await this.matrixClient.initCrypto();
      } else {
        tinyConsole.log('[matrix-js-sdk] Using initRustCrypto.');
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
      tinyConsole.error(err);
      return { ready: false, err };
    }
  }

  setupSync() {
    const sync = {
      NULL: () => {
        tinyConsole.log(`NULL state`);
      },
      SYNCING: () => {
        tinyConsole.log(`SYNCING state`);
      },
      PREPARED: (prevState) => {
        tinyConsole.log(`PREPARED state`);
        tinyConsole.log(`Previous state: `, prevState);
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
        tinyConsole.log(`RECONNECTING state`);
      },
      CATCHUP: () => {
        tinyConsole.log(`CATCHUP state`);
      },
      ERROR: () => {
        tinyConsole.log(`ERROR state`);
      },
      STOPPED: () => {
        tinyConsole.log(`STOPPED state`);
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
