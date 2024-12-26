/*
  Always place EnvAPI within any module export. NEVER DO THE OTHER WAY!
*/

import EventEmitter from 'events';
import tinyConsole from '@src/util/libs/console';

import storageManager from './Localstorage';

const ENV_NAME_LIMIT = 50;

// Emitter
class EnvAPI extends EventEmitter {
  constructor() {
    super();
    this.Initialized = false;
    this.InitializedDB = false;
  }

  async startDB() {
    this.start();
    if (!this.InitializedDB) {
      this.InitializedDB = true;

      if (__ENV_APP__.ELECTRON_MODE) {
        if (global.tinyJsonDB && typeof global.tinyJsonDB.startClient === 'function')
          await global.tinyJsonDB.startClient();

        if (typeof __ENV_APP__.WEB3 === 'boolean' && __ENV_APP__.WEB3) {
          const WEB3 = await this.getDB('WEB3');
          if (typeof WEB3 === 'boolean') this.content.WEB3 = WEB3;
        }

        if (typeof __ENV_APP__.IPFS === 'boolean' && __ENV_APP__.IPFS) {
          const IPFS = await this.getDB('IPFS');
          if (typeof IPFS === 'boolean') this.content.IPFS = IPFS;
        }

        if (typeof __ENV_APP__.SAVE_ROOM_DB === 'boolean' && __ENV_APP__.SAVE_ROOM_DB) {
          const SAVE_ROOM_DB = await this.getDB('SAVE_ROOM_DB');
          if (typeof SAVE_ROOM_DB === 'boolean') this.content.SAVE_ROOM_DB = SAVE_ROOM_DB;
        }

        if (
          typeof __ENV_APP__.MXC_AUTHENTICATED_MEDIA === 'boolean' &&
          __ENV_APP__.MXC_AUTHENTICATED_MEDIA
        ) {
          const MXC_AUTHENTICATED_MEDIA = await this.getDB('MXC_AUTHENTICATED_MEDIA');
          if (typeof MXC_AUTHENTICATED_MEDIA === 'boolean')
            this.content.MXC_AUTHENTICATED_MEDIA = MXC_AUTHENTICATED_MEDIA;
        }
      }
    }
  }

  start() {
    if (!this.Initialized) {
      this.Initialized = true;

      this.content = !__ENV_APP__.ELECTRON_MODE
        ? storageManager.getJson('ponyHouse-env', 'obj')
        : {};

      if (typeof __ENV_APP__.WEB3 === 'boolean' && __ENV_APP__.WEB3) {
        this.content.WEB3 = typeof this.content.WEB3 === 'boolean' ? this.content.WEB3 : true;
      } else {
        this.content.WEB3 = false;
      }

      if (typeof __ENV_APP__.IPFS === 'boolean' && __ENV_APP__.IPFS) {
        this.content.IPFS = typeof this.content.IPFS === 'boolean' ? this.content.IPFS : true;
      } else {
        this.content.IPFS = false;
      }

      if (typeof __ENV_APP__.SAVE_ROOM_DB === 'boolean' && __ENV_APP__.SAVE_ROOM_DB) {
        this.content.SAVE_ROOM_DB =
          typeof this.content.SAVE_ROOM_DB === 'boolean' ? this.content.SAVE_ROOM_DB : true;
      } else {
        this.content.SAVE_ROOM_DB = false;
      }

      if (
        typeof __ENV_APP__.MXC_AUTHENTICATED_MEDIA === 'boolean' &&
        __ENV_APP__.MXC_AUTHENTICATED_MEDIA
      ) {
        this.content.MXC_AUTHENTICATED_MEDIA =
          typeof this.content.MXC_AUTHENTICATED_MEDIA === 'boolean'
            ? this.content.MXC_AUTHENTICATED_MEDIA
            : true;
      } else {
        this.content.MXC_AUTHENTICATED_MEDIA = false;
      }
    }
  }

  get(folder) {
    this.start();
    if (typeof folder === 'string' && folder.length > 0) {
      if (typeof this.content[folder] !== 'undefined') return this.content[folder];
      return null;
    }

    return this.content;
  }

  async getDB(folder) {
    if (__ENV_APP__.ELECTRON_MODE) {
      const newValue = await global.tinyJsonDB.get('envData', folder);
      return newValue;
    }

    return null;
  }

  set(folder, value) {
    this.start();
    if (typeof folder === 'string' && (typeof value === 'string' || typeof value === 'boolean')) {
      if (folder.length <= ENV_NAME_LIMIT) {
        this.content[folder] = value;

        if (!__ENV_APP__.ELECTRON_MODE) {
          storageManager.setJson('ponyHouse-env', this.content);
        } else {
          global.tinyJsonDB.update('envData', folder, value);
        }

        this.emit(folder, value);
      } else {
        tinyConsole.error(
          `ENV value name length is greater than the limit! Limit: ${ENV_NAME_LIMIT}`,
        );
      }
    }
  }
}

// Functions and class
const envAPI = new EnvAPI();
envAPI.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default envAPI;

if (__ENV_APP__.MODE === 'development') {
  global.envAPI = envAPI;
}
