import $ from 'jquery';
import clone from 'clone';
import { Crypto } from 'matrix-js-sdk';

import { countObj, objType } from 'for-promise/utils/lib.mjs';
import moment from '@src/util/libs/momentjs';

import initMatrix from '../client/initMatrix';
import { emitUpdateProfile } from '../client/action/navigation';
import tinyAPI from './mods';
import { matrixDevices } from '../app/hooks/useDeviceList';
import mobileEvents from './libs/mobile';

// Cache Data
let mainDeviceAfkCheck = null;
const userInteractions = {
  enabled: false,
  mobile: {
    isActive: true,
  },

  vc: {
    isActive: false,
  },

  afkTime: {
    value: null,
    interval: null,
  },

  devices: matrixDevices.getDevices(),
  afkDevices: [],
};

// Mobile
mobileEvents.on('appStateChangeIsActive', (isActive) => {
  userInteractions.mobile.isActive = isActive;
});

// User AFK

// Update
const lastTimestampUpdate = () => {
  userInteractions.afkTime.value = moment().valueOf();
};

// Voice Chat Mode
export function setVoiceChatMode(value = true) {
  if (typeof value === 'boolean') userInteractions.vc.isActive = value;
}

// Get
export function getUserAfk(type = 'seconds') {
  if (__ENV_APP__.ELECTRON_MODE && global.systemIdleTime?.get) {
    global.systemIdleTime.exec();
    return global.systemIdleTime.get();
  }

  if (typeof userInteractions.afkTime.value === 'number') {
    return moment().diff(userInteractions.afkTime.value, type);
  }

  return null;
}

export function enableAfkSystem(value = true) {
  if (typeof value === 'boolean') userInteractions.enabled = value;
}

// Devices
const devicesUpdater = (devices) => {
  userInteractions.devices = devices;
};

// Interval
const intervalTimestamp = () => {
  if (userInteractions.enabled) {
    // API
    const counter = getUserAfk();
    tinyAPI.emit('afkTimeCounter', counter);
    const content =
      initMatrix.matrixClient.getAccountData('pony.house.profile')?.getContent() ?? {};
    const originalAfk = clone(content.active_devices);
    if (countObj(content) > 0) {
      // API progress...
      tinyAPI.emit('afkTimeCounterProgress', counter);

      // Get Data
      if (!Array.isArray(content.active_devices)) content.active_devices = [];
      const deviceId = initMatrix.matrixClient.getDeviceId();
      const deviceIdIndex = content.active_devices.indexOf(deviceId);

      // Remove Inactive
      if (content.active_devices.length > 0) {
        const newActiveDevices = [];
        for (const item in content.active_devices) {
          if (userInteractions.afkDevices.indexOf(content.active_devices[item]) < 0) {
            newActiveDevices.push(content.active_devices[item]);
          }
        }

        content.active_devices = newActiveDevices;
      }

      // 10 Minutes later...
      if (
        !userInteractions.vc.isActive &&
        (content.status === '🟢' || content.status === 'online') &&
        (counter > 600 ||
          content.status === '🟠' ||
          content.status === 'idle' ||
          !userInteractions.mobile.isActive)
      ) {
        if (deviceIdIndex > -1) content.active_devices.splice(deviceIdIndex, 1);
      }

      // Nope
      else if (deviceIdIndex < 0 && content.active_devices.length < 1) {
        content.active_devices.push(deviceId);
      }

      if (
        !Array.isArray(originalAfk) ||
        originalAfk.length !== content.active_devices.length ||
        typeof mainDeviceAfkCheck !== 'string' ||
        (typeof content.active_devices[0] === 'string' &&
          mainDeviceAfkCheck !== content.active_devices[0])
      ) {
        mainDeviceAfkCheck =
          typeof content.active_devices[0] === 'string' ? content.active_devices[0] : null;
        tinyAPI.emit('afkTimeCounterUpdated', counter);
        initMatrix.matrixClient.setAccountData('pony.house.profile', content);
        emitUpdateProfile(content);
      }
    }
  }
};

// Checker
const devicePingChecker = (devices) => {
  // Prepare
  if (userInteractions.afkDevices) delete userInteractions.afkDevices;
  userInteractions.afkDevices = [];

  if (Array.isArray(devices)) {
    for (const item in devices) {
      if (
        objType(devices[item], 'object') &&
        typeof devices[item].id === 'string' &&
        typeof devices[item].unix === 'number'
      ) {
        // 10 Minutes later...
        const diff = moment().diff(moment(devices[item].unix * 1000), 'minutes');
        if (diff > 10) {
          userInteractions.afkDevices.push(devices[item].id);
        }
      }
    }
  }
};

// Start
export function startUserAfk() {
  if (userInteractions.afkTime.interval) {
    clearInterval(userInteractions.afkTime.interval);
    userInteractions.afkTime.interval = null;
    matrixDevices.off(Crypto.CryptoEvent.DevicesUpdated, devicesUpdater);
  }

  if (!__ENV_APP__.ELECTRON_MODE) {
    $(window).on('mousemove', lastTimestampUpdate);
    userInteractions.afkTime.value = moment().valueOf();
  }

  userInteractions.devices = matrixDevices.getDevices();
  userInteractions.afkTime.interval = setInterval(intervalTimestamp, 1000);
  matrixDevices.on(Crypto.CryptoEvent.DevicesUpdated, devicesUpdater);
  matrixDevices.on('devicePing', devicePingChecker);
}

// Stop
export function stopUserAfk() {
  if (!__ENV_APP__.ELECTRON_MODE) $(window).on('mousemove', lastTimestampUpdate);
  if (userInteractions.afkTime.interval) {
    clearInterval(userInteractions.afkTime.interval);
    userInteractions.afkTime.interval = null;
    matrixDevices.off(Crypto.CryptoEvent.DevicesUpdated, devicesUpdater);
    matrixDevices.off('devicePing', devicePingChecker);
  }

  if (!__ENV_APP__.ELECTRON_MODE) userInteractions.afkTime.value = null;
}
