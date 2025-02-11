import storageManager from '@src/util/libs/localStorage/StorageManager';
import cons from './cons';

function getSecret(key) {
  return storageManager.getItem(key);
}

const isAuthenticated = () => getSecret(cons.secretKey.ACCESS_TOKEN) !== null;

const getSecrets = () => ({
  accessToken: getSecret(cons.secretKey.ACCESS_TOKEN),
  deviceId: getSecret(cons.secretKey.DEVICE_ID),
  userId: getSecret(cons.secretKey.USER_ID),
  baseUrl: getSecret(cons.secretKey.BASE_URL),
});

export { isAuthenticated, getSecrets, getSecret };
