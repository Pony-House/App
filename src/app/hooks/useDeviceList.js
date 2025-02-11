import { useState, useEffect } from 'react';
import { ClientEvent, Crypto } from 'matrix-js-sdk';
import EventEmitter from 'events';

import moment from 'moment-timezone';
import objectHash from 'object-hash';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';
import initMatrix from '../../client/initMatrix';

// Emitter
class MatrixDevices extends EventEmitter {
  constructor() {
    super();
    this.devices = [];
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
  }

  updateDevices(devices) {
    if (Array.isArray(devices)) this.devices = devices;
  }

  getDevices() {
    return this.devices;
  }
}

const matrixDevices = new MatrixDevices();

// Export
let firstTime = true;
export { matrixDevices };
export function useDeviceList() {
  // Data
  const mx = initMatrix.matrixClient;
  const [deviceList, setDeviceList] = useState(null);
  const [deviceKeys, setDeviceKeys] = useState(null);

  // Effect
  useEffect(() => {
    let isMounted = true;

    // Start update
    const updateDevices = () => {
      const tinyErr = (err) => {
        tinyConsole.error(err);
        alert(err.message, 'Matrix Devices Error');
      };

      mx.getDevices()
        .then((data) => {
          mx.getCrypto()
            .getOwnDeviceKeys()
            .then((dKeys) => {
              if (!isMounted) return;

              const devices = data.devices || [];
              matrixDevices.updateDevices(devices);
              matrixDevices.emit('devicesUpdated', devices);
              if (firstTime) firstTime = false;

              setDeviceKeys(dKeys);
              setDeviceList(devices);
            })
            .catch(tinyErr);
        })
        .catch(tinyErr);
    };

    // First check
    updateDevices();

    // Get update
    const handleDevicesUpdate = (users) => {
      if (users.includes(mx.getUserId())) {
        updateDevices();
      }
    };

    // Events
    const handleAccountData = (event) => {
      if (event.getType() === 'pony.house.ping') {
        const devicesData = mx.getAccountData('pony.house.ping').getContent() ?? {};
        matrixDevices.emit(
          'devicePing',
          objType(devicesData, 'object') && Array.isArray(devicesData.pings)
            ? devicesData.pings
            : [],
        );
      }
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    mx.on(Crypto.CryptoEvent.DevicesUpdated, handleDevicesUpdate);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
      mx.removeListener(Crypto.CryptoEvent.DevicesUpdated, handleDevicesUpdate);
      isMounted = false;
    };
  }, []);

  // Complete
  return { deviceList, deviceKeys };
}
