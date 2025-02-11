import { StatusBar } from '@capacitor/status-bar';
import $ from 'jquery';

import EventEmitter from 'events';
import { objType } from 'for-promise/utils/lib.mjs';

import { isMobile, notificationStatus } from '@src/util/libs/mobile';
import storageManager from '@src/util/libs/localStorage/StorageManager';

import appDispatcher from '../dispatcher';

import cons from './cons';
import tinyAPI from '../../util/mods';
import matrixAppearance from '../../util/libs/appearance';

import blackTheme from '../../scss/theme/black';
import butterTheme from '../../scss/theme/butter';
import darkTheme from '../../scss/theme/dark';
import silverTheme from '../../scss/theme/silver';
import whiteTheme from '../../scss/theme/white';

const themes = {
  black: { data: blackTheme, id: 'black-theme', type: 'dark-solid', coloredIcons: false },
  black_colors: {
    data: blackTheme,
    id: 'black-colors-theme',
    type: 'dark-solid',
    coloredIcons: true,
  },

  butter: { data: butterTheme, id: 'butter-theme', type: 'dark2', coloredIcons: false },
  butter_no_gradient: {
    data: butterTheme,
    id: 'butter-theme-no-gradient',
    type: 'dark2-solid',
    coloredIcons: false,
  },

  dark: { data: darkTheme, id: 'dark-theme', type: 'dark', coloredIcons: false },
  dark_no_gradient: {
    data: darkTheme,
    id: 'dark-theme-no-gradient',
    type: 'dark-solid',
    coloredIcons: false,
  },

  silver: { data: silverTheme, id: 'silver-theme', type: 'silver', coloredIcons: false },
  silver_no_gradient: {
    data: silverTheme,
    id: 'silver-theme-no-gradient',
    type: 'silver-solid',
    coloredIcons: false,
  },

  white: { data: whiteTheme, id: '', type: 'light', coloredIcons: false },
  white_no_gradient: {
    data: whiteTheme,
    id: 'white-theme-no-gradient',
    type: 'light-solid',
    coloredIcons: false,
  },
};

function getSettings() {
  return storageManager.getJson('settings', 'null');
}

function setSettings(key, value) {
  let settings = getSettings();
  if (settings === null) settings = {};
  settings[key] = value;
  storageManager.setJson('settings', settings);
}

class Settings extends EventEmitter {
  constructor() {
    super();
    this.themes = [
      themes.white,
      themes.white_no_gradient,
      themes.silver,
      themes.silver_no_gradient,
      themes.dark,
      themes.dark_no_gradient,
      themes.butter,
      themes.butter_no_gradient,
      themes.black,
      themes.black_colors,
    ];

    this.themesName = [
      { text: 'Light' },
      { text: 'Light (No Gradients)' },
      { text: 'Silver' },
      { text: 'Silver (No Gradients)' },
      { text: 'Dark' },
      { text: 'Dark (No Gradients)' },
      { text: 'Butter' },
      { text: 'Butter (No Gradients)' },
      { text: 'Black (Beta)' },
      { text: 'Black Colors (Beta)' },
    ];

    this.defaultSystemThemeType = {
      light: 'theme-type-light',
      dark: 'theme-type-dark',
    };
  }

  insertTheme(data, type = 'push') {
    if (
      (type === 'push' || type === 'unshift') &&
      (typeof data[0] === 'string' || objType(data[0], 'object'))
    ) {
      this.themesName[type](typeof data[0] === 'string' ? { text: data[0] } : data[0]);
      this.themes[type](data[1]);
    }
  }

  removeTheme(id) {
    if (typeof id === 'string') {
      const index = this.themes.findIndex((theme) => theme.id === id);
      if (index > -1) {
        this.themes.splice(index, 1);
        this.themesName.splice(index, 1);
      }
    }
  }

  startData() {
    this.themeIndex = this.getThemeIndex();
    tinyAPI.emit(
      'loadThemes',
      (data, type = 'push') => this.insertTheme(data, type),
      (id) => this.removeTheme(id),
      (id) => this.getThemeById(id),
      (id) => this.getThemeNameById(id),
      (id, value) => {
        if (typeof this.defaultSystemThemeType[id] === 'string' && typeof value === 'string') {
          this.defaultSystemThemeType[id] = value;
        }
      },
    );

    this.systemIsDark = null;
    this.useSystemTheme = this.getUseSystemTheme();
    this.isMarkdown = this.getIsMarkdown();
    this.isPeopleDrawer = this.getIsPeopleDrawer();
    this.isNavigationSidebarHidden = this.getIsNavigationSidebarHidden();
    this.hideMembershipEvents = this.getHideMembershipEvents();
    this.hideNickAvatarEvents = this.getHideNickAvatarEvents();
    this._showNotifications = this.getShowNotifications();
    this.isNotificationSounds = this.getIsNotificationSounds();

    this.isTouchScreenDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  }

  getSystemTheme() {
    return {
      enabled: this.useSystemTheme,
      isDark: this.systemIsDark,
    };
  }

  getThemeIndex() {
    if (typeof this.themeIndex === 'number') return this.themeIndex;

    const settings = getSettings();
    if (settings === null) return 0;
    if (typeof settings.themeIndex === 'undefined') return 0;
    return parseInt(settings.themeIndex);
  }

  getThemeById(id) {
    if (typeof id === 'string') {
      const result = this.themes.find((theme) => theme.id === id);

      if (result) {
        return result;
      }

      return null;
    }

    return null;
  }

  getThemeIndexById(id) {
    if (typeof id === 'string') {
      const result = this.themes.findIndex((theme) => theme.id === id);

      if (result > -1) {
        return result;
      }

      return null;
    }

    return null;
  }

  getThemeNameById(id) {
    if (typeof id === 'string') {
      const index = this.themes.findIndex((theme) => theme.id === id);

      if (index > -1 && this.themesName[index]) {
        return this.themesName[index];
      }

      return null;
    }

    return null;
  }

  getTheme() {
    return this.themes[this.themeIndex];
  }

  getThemeData() {
    return this.themes[this.themeIndex].data;
  }

  getThemeType() {
    return this.themes[this.themeIndex].type;
  }

  _checkThemeIsColored(theme) {
    return theme && typeof theme.coloredIcons === 'boolean' && theme.coloredIcons ? true : false;
  }

  isSelectedThemeColored() {
    return this._checkThemeIsColored(this.themes[this.themeIndex]);
  }

  isThemeColored(id) {
    return this._checkThemeIsColored(this.getThemeById(id));
  }

  isThemeColoredDetector(useEffect, setIsColored) {
    const tinyThis = this;
    useEffect(() => {
      const isColoredDetector = (index, theme) => {
        setIsColored(tinyThis._checkThemeIsColored(theme));
      };

      tinyThis.on(cons.events.settings.THEME_APPLIED, isColoredDetector);
      return () => {
        tinyThis.off(cons.events.settings.THEME_APPLIED, isColoredDetector);
      };
    });
  }

  changeMobileBackground(/* value = 'default' */) {
    const data = this.themes[this.themeIndex]?.data;
    return new Promise((resolve, reject) => {
      if (isMobile(true)) {
        try {
          StatusBar.setBackgroundColor({ color: data.statusBar.backgroundColor[value] });
          StatusBar.setStyle({ style: data.statusBar.style });
        } catch (err) {
          reject(err);
          return;
        }

        resolve(true);
      } else {
        resolve(null);
      }
    });
  }

  _clearTheme() {
    $('body')
      .removeClass('system-theme')
      .removeClass('discord-style')
      .removeClass('theme-type-dark')
      .removeClass('theme-type-dark-solid')
      .removeClass('theme-type-dark2')
      .removeClass('theme-type-dark2-solid')
      .removeClass('theme-type-silver')
      .removeClass('theme-type-silver-solid')
      .removeClass('theme-type-light')
      .removeClass('theme-type-light-solid');

    if (Array.isArray(this.themes)) {
      this.themes.forEach((theme) => {
        if (typeof theme.id === 'string') {
          if (theme.id === '') {
            $('body').removeClass('default-theme');
            return;
          }

          $('body').removeClass(theme.id);
        }
      });
    }
  }

  applyTheme(index = this.themeIndex, useSystemTheme = this.useSystemTheme) {
    this._clearTheme();
    const body = $('body');

    if (matrixAppearance.get('isDiscordStyleEnabled')) {
      body.addClass('discord-style');
    }

    this.systemIsDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (useSystemTheme) {
      body.addClass('system-theme');

      if (this.systemIsDark) {
        body.addClass(this.defaultSystemThemeType.dark);
      } else {
        body.addClass(this.defaultSystemThemeType.light);
      }

      this.emit(cons.events.settings.THEME_APPLIED, null, null);
    } else if (this.themes[index]) {
      body
        .addClass(this.themes[index].id !== '' ? this.themes[index].id : 'default-theme')
        .addClass(
          this.themes[index]?.type === 'dark' ||
            this.themes[index]?.type === 'dark-solid' ||
            this.themes[index]?.type === 'dark2' ||
            this.themes[index]?.type === 'dark2-solid' ||
            this.themes[index]?.type === 'light' ||
            this.themes[index]?.type === 'light-solid' ||
            this.themes[index]?.type === 'silver' ||
            this.themes[index]?.type === 'silver-solid'
            ? `theme-type-${this.themes[index]?.type}`
            : '',
        );

      this.emit(cons.events.settings.THEME_APPLIED, index, this.themes[index]);
    }

    this.changeMobileBackground('default');
  }

  setTheme(themeIndex) {
    this.themeIndex = themeIndex;
    setSettings('themeIndex', this.themeIndex);
    this.applyTheme();

    this.emit(cons.events.settings.THEME_TOGGLED, this.themeIndex, this.themes[this.themeIndex]);
  }

  toggleUseSystemTheme() {
    this.useSystemTheme = !this.useSystemTheme;
    setSettings('useSystemTheme', this.useSystemTheme);
    this.applyTheme();

    this.emit(cons.events.settings.SYSTEM_THEME_TOGGLED, this.useSystemTheme);
  }

  getUseSystemTheme() {
    if (typeof this.useSystemTheme === 'boolean') return this.useSystemTheme;

    const settings = getSettings();
    if (settings === null) return true;
    if (typeof settings.useSystemTheme === 'undefined') return true;
    return settings.useSystemTheme;
  }

  getIsMarkdown() {
    if (typeof this.isMarkdown === 'boolean') return this.isMarkdown;

    const settings = getSettings();
    if (settings === null) return true;
    if (typeof settings.isMarkdown === 'undefined') return true;
    return settings.isMarkdown;
  }

  getHideMembershipEvents() {
    if (typeof this.hideMembershipEvents === 'boolean') return this.hideMembershipEvents;

    const settings = getSettings();
    if (settings === null) return false;
    if (typeof settings.hideMembershipEvents === 'undefined') return false;
    return settings.hideMembershipEvents;
  }

  getHideNickAvatarEvents() {
    if (typeof this.hideNickAvatarEvents === 'boolean') return this.hideNickAvatarEvents;

    const settings = getSettings();
    if (settings === null) return true;
    if (typeof settings.hideNickAvatarEvents === 'undefined') return true;
    return settings.hideNickAvatarEvents;
  }

  getIsPeopleDrawer() {
    if (typeof this.isPeopleDrawer === 'boolean') return this.isPeopleDrawer;

    const settings = getSettings();
    const defaultValue =
      typeof __ENV_APP__.PEOPLE_DRAWER_HIDDEN === 'boolean'
        ? !__ENV_APP__.PEOPLE_DRAWER_HIDDEN
        : true;

    if (settings === null) return defaultValue;
    if (typeof settings.isPeopleDrawer === 'undefined') return defaultValue;
    return settings.isPeopleDrawer;
  }

  getIsNavigationSidebarHidden() {
    if (typeof this.isNavigationSidebarHidden === 'boolean') return this.isNavigationSidebarHidden;

    const settings = getSettings();
    const defaultValue =
      typeof __ENV_APP__.NAVIGATION_SIDEBAR_HIDDEN === 'boolean'
        ? __ENV_APP__.NAVIGATION_SIDEBAR_HIDDEN
        : true;

    if (settings === null) return defaultValue;
    if (typeof settings.isNavigationSidebarHidden === 'undefined') return defaultValue;
    return settings.isNavigationSidebarHidden;
  }

  get showNotifications() {
    if (notificationStatus() !== 'granted') return false;
    return this._showNotifications;
  }

  getShowNotifications() {
    if (typeof this._showNotifications === 'boolean') return this._showNotifications;

    const settings = getSettings();
    if (settings === null) return true;
    if (typeof settings.showNotifications === 'undefined') return true;
    return settings.showNotifications;
  }

  getIsNotificationSounds() {
    if (typeof this.isNotificationSounds === 'boolean') return this.isNotificationSounds;

    const settings = getSettings();
    if (settings === null) return true;
    if (typeof settings.isNotificationSounds === 'undefined') return true;
    return settings.isNotificationSounds;
  }

  setter(action) {
    const actions = {
      [cons.actions.settings.TOGGLE_SYSTEM_THEME]: () => {
        this.toggleUseSystemTheme();
      },
      [cons.actions.settings.TOGGLE_MARKDOWN]: () => {
        this.isMarkdown = !this.isMarkdown;
        setSettings('isMarkdown', this.isMarkdown);
        this.emit(cons.events.settings.MARKDOWN_TOGGLED, this.isMarkdown);
      },
      [cons.actions.settings.TOGGLE_PEOPLE_DRAWER]: () => {
        this.isPeopleDrawer = !this.isPeopleDrawer;
        setSettings('isPeopleDrawer', this.isPeopleDrawer);
        this.emit(cons.events.settings.PEOPLE_DRAWER_TOGGLED, this.isPeopleDrawer);
      },
      [cons.actions.settings.TOGGLE_NAVIGATION_SIDEBAR_HIDDEN]: () => {
        this.isNavigationSidebarHidden = !this.isNavigationSidebarHidden;
        setSettings('isNavigationSidebarHidden', this.isNavigationSidebarHidden);
        this.emit(
          cons.events.settings.NAVIGATION_SIDEBAR_HIDDEN_TOGGLED,
          this.isNavigationSidebarHidden,
        );
      },
      [cons.actions.settings.TOGGLE_MEMBERSHIP_EVENT]: () => {
        this.hideMembershipEvents = !this.hideMembershipEvents;
        setSettings('hideMembershipEvents', this.hideMembershipEvents);
        this.emit(cons.events.settings.MEMBERSHIP_EVENTS_TOGGLED, this.hideMembershipEvents);
      },
      [cons.actions.settings.TOGGLE_NICKAVATAR_EVENT]: () => {
        this.hideNickAvatarEvents = !this.hideNickAvatarEvents;
        setSettings('hideNickAvatarEvents', this.hideNickAvatarEvents);
        this.emit(cons.events.settings.NICKAVATAR_EVENTS_TOGGLED, this.hideNickAvatarEvents);
      },
      [cons.actions.settings.TOGGLE_NOTIFICATIONS]: async () => {
        if (notificationStatus() !== 'granted') {
          this._showNotifications = false;
        } else {
          this._showNotifications = !this._showNotifications;
        }
        setSettings('showNotifications', this._showNotifications);
        this.emit(cons.events.settings.NOTIFICATIONS_TOGGLED, this._showNotifications);
      },
      [cons.actions.settings.TOGGLE_NOTIFICATION_SOUNDS]: () => {
        this.isNotificationSounds = !this.isNotificationSounds;
        setSettings('isNotificationSounds', this.isNotificationSounds);
        this.emit(cons.events.settings.NOTIFICATION_SOUNDS_TOGGLED, this.isNotificationSounds);
      },
    };

    actions[action.type]?.();
  }
}

const settings = new Settings();
settings.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export function startSettings() {
  settings.startData();
  settings.applyTheme();
}

appDispatcher.register(settings.setter.bind(settings));
export default settings;
