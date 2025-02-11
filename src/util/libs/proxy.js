import EventEmitter from 'events';
import storageManager from './localStorage/StorageManager';

/* 
  direct - In direct mode all connections are created directly, without any proxy involved.
  fixed_servers - In fixed_servers mode the proxy configuration is specified in proxyRules. This is the default mode if proxyRules is specified.
  system - In system mode the proxy configuration is taken from the operating system. Note that the system mode is different from setting no proxy configuration. In the latter case, Electron falls back to the system settings only if no command-line options influence the proxy configuration.    
*/

export const canProxy = () => __ENV_APP__.ELECTRON_MODE && global.electronWindow;

// Emitter
class MatrixProxy extends EventEmitter {
  constructor() {
    super();
    this.Initialized = false;
    this.proxyInit = false;
    this.protocols = [
      { value: 'socks5', text: 'Socks5' },
      { value: 'http', text: 'Http' },
      { value: 'https', text: 'Https' },
    ];
    this.modes = [
      { value: 'system', text: 'System' },
      { value: 'fixed_servers', text: 'Custom' },
    ];
  }

  canProxy(type) {
    return canProxy(type);
  }

  // Get Proxy
  getProxyConfig() {
    // Elecron Mode
    if (this.canProxy()) {
      const proxySettings = {};
      if (this.content.enabled) {
        if (this.content.mode === 'system') proxySettings.mode = 'system';
        else if (
          this.content.mode === 'fixed_servers' &&
          typeof this.content.protocol === 'string' &&
          typeof this.content.address === 'string' &&
          typeof this.content.port === 'number' &&
          this.content.port > -1
        ) {
          proxySettings.mode = 'fixed_servers';
          proxySettings.proxyRules = `${this.content.protocol}://${this.content.address}:${String(this.content.port)}`;
        } else proxySettings.mode = 'direct';
      } else proxySettings.mode = 'direct';
      return proxySettings;
    }
    // Nothing
    else return null;
  }

  // Send Proxy Update
  updateProxy() {
    if (this.proxyInit) {
      // Electron Mode
      if (this.canProxy('electron')) {
        global.electronWindow.setProxy(this.getProxyConfig());
      }
      return;
    }
    throw new Error('Proxy is not initialized!');
  }

  // Start Proxy
  startProxy() {
    const tinyThis = this;
    return new Promise((resolve) => {
      if (!tinyThis.proxyInit) {
        tinyThis.proxyInit = true;
        tinyThis._start();
        // Elecron Mode
        if (tinyThis.canProxy('electron')) {
          global.electronWindow.once('setProxy', (data) => {
            resolve();
            tinyThis.emit('setProxy', { type: 'electron', data });
            global.electronWindow.on('setProxy', (data2) => {
              tinyThis.emit('setProxy', { type: 'electron', data: data2 });
            });
          });
          global.electronWindow.setProxy(tinyThis.getProxyConfig());
        }

        // Normal
        else resolve();
      } else resolve();
    });
  }

  // Start settings
  _start() {
    if (!this.Initialized) {
      this.Initialized = true;

      // Get Content
      this.content = storageManager.getJson('ponyHouse-proxy', 'obj');
      this.contentDefault = {};

      // Prepare settings
      this.contentDefault.enabled = false;
      this.content.enabled =
        typeof this.content.enabled === 'boolean'
          ? this.content.enabled
          : this.contentDefault.enabled;

      this.contentDefault.mode = 'system';
      this.content.mode =
        typeof this.content.mode === 'string' ? this.content.mode : this.contentDefault.mode;

      this.contentDefault.protocol = 'socks5';
      this.content.protocol =
        typeof this.content.protocol === 'string'
          ? this.content.protocol
          : this.contentDefault.protocol;

      this.contentDefault.address = '127.0.0.1';
      this.content.address =
        typeof this.content.address === 'string'
          ? this.content.address
          : this.contentDefault.address;

      this.contentDefault.port = 9050;
      this.content.port =
        typeof this.content.port === 'number' ? this.content.port : this.contentDefault.port;
    }
  }

  reset(folder) {
    this._start();
    if (typeof this.contentDefault[folder] !== 'undefined') {
      this.content[folder] = this.contentDefault[folder];
      storageManager.setJson('ponyHouse-proxy', this.content);
      this.emit(folder, value);
    }
  }

  resetAll() {
    for (const folder in this.contentDefault) {
      this.reset(folder);
    }
  }

  // Config
  get(folder) {
    this._start();
    if (typeof folder === 'string' && folder.length > 0) {
      if (typeof this.content[folder] !== 'undefined') return this.content[folder];
      return null;
    }
    return this.content;
  }

  set(folder, value) {
    this._start();
    if (typeof folder === 'string') {
      this.content[folder] = value;
      storageManager.setJson('ponyHouse-proxy', this.content);
      this.emit(folder, value);
    }
  }
}

// Functions and class
const matrixProxy = new MatrixProxy();
export function getProxyStorage(folder) {
  return matrixProxy.get(folder);
}

export function setProxyStorage(folder, value) {
  return matrixProxy.set(folder, value);
}

export const toggleProxyAction = (dataFolder, setToggle) => (data) => {
  setProxyStorage(dataFolder, data);
  setToggle(data === true);
};

matrixProxy.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default matrixProxy;

if (__ENV_APP__.MODE === 'development') {
  global.proxyApi = {
    getCfg: getProxyStorage,
    setCfg: setProxyStorage,
  };
}
