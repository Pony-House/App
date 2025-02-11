import storageManager from '@src/util/libs/localStorage/StorageManager';

import initMatrix from '../../../client/initMatrix';

const toggleAction = (dataFolder, valueName, setToggle) => (data) => {
  const content = initMatrix.matrixClient.getAccountData(dataFolder)?.getContent() ?? {};
  content[valueName] = data;

  initMatrix.matrixClient.setAccountData(dataFolder, content);
  setToggle(data === true);
};

const toggleActionLocal = (dataFolder, valueName, setToggle) => (data) => {
  const content = storageManager.getJson(dataFolder, 'obj');
  if (typeof setToggle !== 'undefined') {
    content[valueName] = data;

    storageManager.setJson(dataFolder, content);
    if (typeof setToggle === 'function') setToggle(data === true);
    return;
  }

  if (valueName) {
    return content[valueName];
  }

  return content;
};

export { toggleAction, toggleActionLocal };
