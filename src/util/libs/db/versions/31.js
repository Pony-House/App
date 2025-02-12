import storageManager from '../../localStorage/StorageManager';

const version31 = async (connection) => {
  storageManager.resetAllTimelineSyncData();
};

export default version31;
