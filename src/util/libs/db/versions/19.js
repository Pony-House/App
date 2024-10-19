import storageManager from '../../Localstorage';

const version18 = async (/* connection */) => {
  storageManager.resetAllTimelineSyncData();
};

export default version18;
