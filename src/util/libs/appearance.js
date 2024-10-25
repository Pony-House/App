import initMatrix from '@src/client/initMatrix';
import EventEmitter from 'events';
import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';

import moment, { calendarFormat, localeIs12Hours } from './momentjs';
import storageManager from './Localstorage';

// Animated Image Url
export function getAnimatedImageUrl(url) {
  if (typeof url === 'string') return `${url}&animated=true`;
  return null;
}

// Emitter
class MatrixAppearance extends EventEmitter {
  constructor() {
    super();
    this.Initialized = false;
  }

  start() {
    if (!this.Initialized) {
      this.Initialized = true;

      // Get Content
      this.content = storageManager.getJson('ponyHouse-appearance', 'obj');

      // Calendar Format
      let needSetCalendarFormat = true;
      if (
        typeof this.content.calendarFormat === 'string' ||
        typeof this.content.calendarFormat === 'number'
      ) {
        const timeIndex = Number(this.content.calendarFormat);
        if (!Number.isNaN(timeIndex)) {
          const tinyFormat = calendarFormat[Number(this.content.calendarFormat)];
          if (objType(tinyFormat, 'object') && typeof tinyFormat.text === 'string') {
            needSetCalendarFormat = false;
          }
        }
      }

      if (needSetCalendarFormat) {
        const guestCalendarFormat = moment.localeData().longDateFormat('L');
        const index = calendarFormat.findIndex((item) => item.text === guestCalendarFormat);
        if (index > -1) {
          const tinyFormat = calendarFormat[index];
          if (objType(tinyFormat, 'object') && typeof tinyFormat.text === 'string')
            this.content.calendarFormat = String(index);
        }
      }

      // Other data
      this.content.isEmbedEnabled =
        typeof this.content.isEmbedEnabled === 'boolean' ? this.content.isEmbedEnabled : true;
      this.content.isUNhoverEnabled =
        typeof this.content.isUNhoverEnabled === 'boolean' ? this.content.isUNhoverEnabled : false;
      this.content.isAnimateAvatarsEnabled =
        typeof this.content.isAnimateAvatarsEnabled === 'boolean'
          ? this.content.isAnimateAvatarsEnabled
          : true;

      this.content.is24hours =
        typeof this.content.is24hours === 'boolean' ? this.content.is24hours : !localeIs12Hours();

      this.content.showStickers =
        typeof this.content.showStickers === 'boolean'
          ? this.content.showStickers
          : !!__ENV_APP__.SHOW_STICKERS;

      this.content.pageLimit =
        typeof this.content.pageLimit === 'number'
          ? this.content.pageLimit
          : !Number.isNaN(__ENV_APP__.PAG_LIMIT) &&
              Number.isFinite(__ENV_APP__.PAG_LIMIT) &&
              __ENV_APP__.PAG_LIMIT > 0
            ? __ENV_APP__.PAG_LIMIT
            : 50;

      this.content.useCustomEmojis =
        typeof this.content.useCustomEmojis === 'boolean'
          ? this.content.useCustomEmojis
          : !!__ENV_APP__.USE_CUSTOM_EMOJIS;

      this.content.embedParallelLoad =
        typeof this.content.embedParallelLoad === 'boolean'
          ? this.content.embedParallelLoad
          : !!__ENV_APP__.EMBED_PARALLEL_LOAD;

      this.content.hoverSidebar =
        typeof this.content.hoverSidebar === 'boolean'
          ? this.content.hoverSidebar
          : !!__ENV_APP__.HOVER_SIDEBAR;

      this.content.sidebarTransition =
        typeof this.content.sidebarTransition === 'boolean'
          ? this.content.sidebarTransition
          : !!__ENV_APP__.SIDEBAR_TRANSITION;

      this.content.sendFileBefore =
        typeof this.content.sendFileBefore === 'boolean' ? this.content.sendFileBefore : true;

      this.content.orderHomeByActivity =
        typeof this.content.orderHomeByActivity === 'boolean'
          ? this.content.orderHomeByActivity
          : true;

      this.content.forceThreadButton =
        typeof this.content.forceThreadButton === 'boolean'
          ? this.content.forceThreadButton
          : false;

      this.content.showUserDMstatus =
        typeof this.content.showUserDMstatus === 'boolean' ? this.content.showUserDMstatus : true;
      this.content.pinDMmessages =
        typeof this.content.pinDMmessages === 'boolean' ? this.content.pinDMmessages : true;
      this.content.sendMessageEnter =
        typeof this.content.sendMessageEnter === 'boolean' ? this.content.sendMessageEnter : true;

      this.content.enableAnimParams =
        typeof this.content.enableAnimParams === 'boolean'
          ? this.content.enableAnimParams
          : !!__ENV_APP__.USE_ANIM_PARAMS;

      this.content.simplerHashtagSameHomeServer = !__ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG
        ? typeof this.content.simplerHashtagSameHomeServer === 'boolean'
          ? this.content.simplerHashtagSameHomeServer
          : !!__ENV_APP__.SIMPLER_HASHTAG_SAME_HOMESERVER
        : true;

      this.content.isDiscordStyleEnabled =
        typeof this.content.isDiscordStyleEnabled === 'boolean'
          ? this.content.isDiscordStyleEnabled
          : !!__ENV_APP__.DISCORD_STYLE;

      this.content.useFreezePlugin =
        typeof this.content.useFreezePlugin === 'boolean'
          ? this.content.useFreezePlugin
          : !!__ENV_APP__.USE_FREEZE_PLUGIN;

      this.content.hidePinMessageEvents =
        typeof this.content.hidePinMessageEvents === 'boolean'
          ? this.content.hidePinMessageEvents
          : false;
      this.content.hideUnpinMessageEvents =
        typeof this.content.hideUnpinMessageEvents === 'boolean'
          ? this.content.hideUnpinMessageEvents
          : false;

      this.content.showRoomIdInSpacesManager =
        typeof this.content.showRoomIdInSpacesManager === 'boolean'
          ? this.content.showRoomIdInSpacesManager
          : false;

      this.content.advancedUserMode =
        typeof this.content.advancedUserMode === 'boolean' ? this.content.advancedUserMode : false;

      this.content.basicUserMode =
        typeof this.content.basicUserMode === 'boolean' ? this.content.basicUserMode : true;
    }
  }

  saveCloud() {
    initMatrix.matrixClient.setAccountData('pony.house.appearance', clone(this.content));
  }

  loadCloud() {
    const cloudData =
      initMatrix.matrixClient.getAccountData('pony.house.appearance')?.getContent() ?? {};
    for (const configName in cloudData) {
      this.set(configName, cloudData[configName]);
    }
  }

  get(folder) {
    this.start();
    if (typeof folder === 'string' && folder.length > 0) {
      if (typeof this.content[folder] !== 'undefined') return this.content[folder];
      return null;
    }

    return this.content;
  }

  set(folder, value) {
    this.start();
    if (typeof folder === 'string') {
      this.content[folder] = value;
      storageManager.setJson('ponyHouse-appearance', this.content);
      this.emit(folder, value);
    }
  }
}

// Functions and class
const matrixAppearance = new MatrixAppearance();
export function getAppearance(folder) {
  return matrixAppearance.get(folder);
}

export function setAppearance(folder, value) {
  return matrixAppearance.set(folder, value);
}

const toggleAppearanceAction = (dataFolder, setToggle) => (data) => {
  setAppearance(dataFolder, data);
  setToggle(data === true);
};

matrixAppearance.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

export { toggleAppearanceAction };
export default matrixAppearance;

if (__ENV_APP__.MODE === 'development') {
  global.appearanceApi = {
    getCfg: getAppearance,
    setCfg: setAppearance,
  };
}
