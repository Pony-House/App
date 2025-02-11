import storageManager from './localStorage/StorageManager';

export function getOsSettings(folder, getDefault = true) {
  const content = storageManager.getJson('ponyHouse-os-settings', 'obj');

  if (getDefault) {
    content.startMinimized =
      typeof content.startMinimized === 'boolean' ? content.startMinimized : false;
  }

  if (typeof folder === 'string' && folder.length > 0) {
    if (typeof content[folder] !== 'undefined') return content[folder];
    return null;
  }

  return content;
}

export function setOsSettings(folder, value) {
  const content = getOsSettings(null, false);
  content[folder] = value;
  storageManager.setJson('ponyHouse-os-settings', content);
}

const toggleOsSettingsAction = (dataFolder, setToggle) => (data) => {
  setOsSettings(dataFolder, data);
  setToggle(data === true);
};
export { toggleOsSettingsAction };

if (__ENV_APP__.MODE === 'development') {
  global.OsSettingsApi = {
    getCfg: getOsSettings,
    setCfg: setOsSettings,
  };
}
