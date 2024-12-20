import { ethers } from 'ethers';

import { objType } from 'for-promise/utils/lib.mjs';

import moment from '@src/util/libs/momentjs';
import getEnsManager from './abi/ethereum/0xa58e81fe9b61b5c3fe2afd33cf304c454abfc7cb';
import { tinyCrypto } from './base';

const chainBalance = {};
const ens = {
  reverseName: {},
};

// Clear cache
setInterval(() => {
  for (const address in ens.reverseName) {
    if (ens.reverseName[address].timeout < 1) {
      delete ens.reverseName[address];
    } else {
      ens.reverseName[address].timeout--;
    }
  }

  for (const chain in chainBalance) {
    for (const address in chainBalance[chain]) {
      if (chainBalance[chain][address].timeout < 1) {
        delete chainBalance[chain][address];
      } else {
        chainBalance[chain][address].timeout--;
      }
    }
  }
}, 60000);

export const getUserBalance = (chain, address, forceNoCache = false) =>
  new Promise((resolve, reject) => {
    // Insert Chain
    if (!chainBalance[chain]) chainBalance[chain] = {};

    // Exist cache?
    if (
      !forceNoCache &&
      chainBalance[chain][address] &&
      (typeof chainBalance[chain][address].value === 'string' ||
        typeof chainBalance[chain][address].value === 'number')
    ) {
      resolve({
        value: chainBalance[chain][address].value,
        date: chainBalance[chain][address].date,
        cache: true,
      });
    }

    // Nope
    else if (objType(tinyCrypto.userProviders, 'object') && tinyCrypto.userProviders.ethereum) {
      tinyCrypto.userProviders[chain]
        .getBalance(address)
        .then((n) => {
          let balance = ethers.formatEther(n);
          if (balance.endsWith('.')) balance = `${balance}00`;

          chainBalance[chain][address] = { value: balance, timeout: 60, date: moment() };
          resolve({
            value: chainBalance[chain][address].value,
            date: chainBalance[chain][address].date,
            cache: false,
          });
        })
        .catch(reject);
    } else {
      resolve(null);
    }
  });

export const getEnsDomain = (address, forceNoCache = false) =>
  new Promise((resolve, reject) => {
    // Exist cache?
    if (
      !forceNoCache &&
      ens.reverseName[address] &&
      typeof ens.reverseName[address].value === 'string'
    ) {
      resolve({ data: ens.reverseName[address].value, cache: true });
    }

    // Nope
    else if (objType(tinyCrypto.userProviders, 'object') && tinyCrypto.userProviders.ethereum) {
      if (!ens.ethereum) {
        ens.ethereum = getEnsManager();
      }

      if (ens.ethereum.node) {
        ens.ethereum
          .node(address)
          .call()
          .then((domain) => {
            ens.reverseName[address] = { value: domain, timeout: 60 };
            resolve({ data: ens.reverseName[address].value, cache: false });
          })
          .catch(reject);
      } else {
        resolve(null);
      }
    } else {
      resolve(null);
    }
  });
