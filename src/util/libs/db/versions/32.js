import storageManager from '../../localStorage/StorageManager';

const version32 = async (connection) => {
  await connection.clear('crdt');
};

export default version32;
