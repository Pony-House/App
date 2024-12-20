import { Client } from '@xmtp/xmtp-js';
import EventEmitter from 'events';
import { tinyCrypto } from '../ethers/base';
import envAPI from '@src/util/libs/env';
import storageManager from '@src/util/libs/Localstorage';

// Create a client using keys returned from getKeys
const ENCODING = 'binary';
const mode = 'dev';

export const getEnv = (env) =>
  env === 'dev' || env === 'production' || env === 'local' ? env : null;

export const buildLocalStorageKey = (walletAddress) =>
  walletAddress ? `xmtp:${getEnv(mode)}:keys:${walletAddress}` : '';

export const loadKeys = (walletAddress) => {
  const val = storageManager.getItem(buildLocalStorageKey(walletAddress));
  return val ? Buffer.from(val, ENCODING) : null;
};

export const storeKeys = (walletAddress, keys) => {
  storageManager.setItem(buildLocalStorageKey(walletAddress), Buffer.from(keys).toString(ENCODING));
};

export const wipeKeys = (walletAddress) => {
  // This will clear the conversation cache + the private keys
  storageManager.removeItem(buildLocalStorageKey(walletAddress));
};

class Xmtp extends EventEmitter {
  constructor() {
    super();
    this.ready = false;
  }

  async start() {
    if (envAPI.get('WEB3') && tinyCrypto.connected && !this.ready) {
      try {
        const signer = await tinyCrypto.getWeb3().getSigner();
        let address = await signer.getAddress();
        if (typeof address === 'string' && mode === 'dev') address = `${address}_dev`;

        let keys = loadKeys(address);
        if (!keys) {
          keys = await Client.getKeys(signer, {
            // we don't need to publish the contact here since it
            // will happen when we create the client later
            skipContactPublishing: true,
            // we can skip persistence on the keystore for this short-lived
            // instance
            persistConversations: false,
            env: mode,
          });
          storeKeys(address, keys);
        }

        this.xmtp = await Client.create(null, {
          privateKeyOverride: keys,
        });

        this.ready = true;
      } catch (err) {
        this.ready = false;
        console.error(err);
      }

      return this.ready;
    }
    return false;
  }

  getXmtp() {
    if (this.ready) return this.xmtp;
    return null;
  }
}

const web3Talk = new Xmtp(mode);
web3Talk.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

if (__ENV_APP__.MODE === 'development') {
  global.web3Talk = web3Talk;
}

export default web3Talk;
