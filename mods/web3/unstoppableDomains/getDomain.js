import { objType } from 'for-promise/utils/lib.mjs';
import { tinyCrypto } from '@mods/web3/ethers/base';

import getUdManager from './abi/polygon/0xa9a6a3626993d487d2dbda3173cf58ca1a9d9e9f';
import getWallets from '../../ud';

const ud = {
  addressList: {},
  reverseName: {},
};

// Get Domain
const getUdDomain = (address) =>
  new Promise((resolve, reject) => {
    // Exist cache?
    if (ud.reverseName[address] && typeof ud.reverseName[address].value === 'string') {
      resolve(ud.reverseName[address].value);
    }

    // Nope
    else if (objType(tinyCrypto.userProviders, 'object') && tinyCrypto.userProviders.polygon) {
      if (!ud.polygon) {
        ud.polygon = getUdManager();
      }

      if (ud.polygon.reverseNameOf) {
        ud.polygon.reverseNameOf
          .staticCall(address)
          .then((domain) => {
            ud.reverseName[address] = { value: domain, timeout: 60 };
            resolve(ud.reverseName[address].value);
          })
          .catch(reject);
      } else {
        resolve(null);
      }
    } else {
      resolve(null);
    }
  });

// Get Domain
const getUdDomains = (address, domain) =>
  new Promise((resolve, reject) => {
    // Exist cache?
    if (ud.addressList[address] && Array.isArray(ud.addressList[address].domains)) {
      resolve(ud.addressList[address].domains);
    }

    // Nope
    else if (objType(tinyCrypto.userProviders, 'object') && tinyCrypto.userProviders.polygon) {
      if (!ud.polygon) {
        ud.polygon = getUdManager();
      }

      if (ud.polygon.getMany) {
        ud.polygon.namehash
          .staticCall(domain.split('.'))
          .then((tokenId) => {
            ud.polygon.getMany
              .staticCall(getWallets, tokenId)
              .then((domains) => {
                ud.addressList[address] = { domains, timeout: 60 };
                resolve(ud.addressList[address].domains);
              })
              .catch(reject);
          })
          .catch(reject);
      } else {
        resolve(null);
      }
    } else {
      resolve(null);
    }
  });

// Clear cache
setInterval(() => {
  for (const address in ud.addressList) {
    if (ud.addressList[address].timeout < 1) {
      delete ud.addressList[address];
    } else {
      ud.addressList[address].timeout--;
    }
  }

  for (const address in ud.reverseName) {
    if (ud.reverseName[address].timeout < 1) {
      delete ud.reverseName[address];
    } else {
      ud.reverseName[address].timeout--;
    }
  }
}, 60000);

export { getUdDomains, getUdDomain };
