import storageManager from '../../Localstorage';

const version18 = async (connection) => {
  storageManager.resetAllTimelineSyncData();
  await connection.clear('encrypted');
  await connection.clear('timeline');
  await connection.clear('crdt');
  await connection.clear('messages_edit');
  await connection.clear('messages');
  await connection.clear('messages_search');
  await connection.clear('reactions');
};

export default version18;
