import EventEmitter from 'events';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import storageManager from './Localstorage';
import localeNames from '@mods/locale/names';
import localeCodes from '@mods/locale/codes';

const valuesCache = {};

// Emitter
class TinyLocale extends EventEmitter {
  constructor() {
    super();
    // Base data
    this.names = localeNames;
    this.defaultLocale = localeCodes.default;
    this.locales = localeCodes.list;

    // Local value
    const locale = storageManager.getString('client-locale');
    if (typeof locale === 'string' && this.locales.indexOf(locale) > -1) this.locale = locale;
    // Browser default value
    else if (
      typeof navigator.language === 'string' &&
      this.locales.indexOf(navigator.language) > -1
    )
      this.locale = navigator.language;
    // Other values from browser
    else {
      let languageSelected = false;
      if (Array.isArray(navigator.languages))
        for (const item in navigator.languages)
          if (
            typeof navigator.languages[item] === 'string' &&
            this.locales.indexOf(navigator.languages[item]) > -1
          ) {
            this.locale = navigator.languages[item];
            languageSelected = true;
            break;
          }

      // Default value
      if (!languageSelected) this.locale = this.defaultLocale;
    }
  }

  // Install language
  install(locale, data) {
    if (typeof locale === 'string' && objType(data, 'object')) {
      if (!valuesCache[locale]) valuesCache[locale] = {};
      for (const item in data) {
        if (typeof data[item] === 'string') valuesCache[locale][item] = data[item];
        else
          tinyConsole.error(
            new Error(`Invalid locale data in the language "${locale}"!\n${String(data)}`),
          );
      }

      this.emit('localeInstalled', locale, valuesCache[locale]);
      return;
    }
    throw new Error('Invalid locale data!');
  }

  // Get value
  val(id) {
    if (valuesCache[this.locale] && typeof valuesCache[this.locale][id] === 'string')
      return valuesCache[this.locale][id];
    else if (
      valuesCache[this.defaultLocale] &&
      typeof valuesCache[this.defaultLocale][id] === 'string'
    )
      return valuesCache[this.defaultLocale];
    return '';
  }

  localeVal(locale = null, id = null) {
    if (valuesCache[locale] && typeof valuesCache[locale][id] === 'string')
      return valuesCache[locale][id];
    return null;
  }

  // Get default locale
  getDefaultLocale() {
    return this.defaultLocale;
  }

  // Get locale data
  getLocaleData(locale = null) {
    return valuesCache[typeof locale !== 'string' ? this.locale : locale] || null;
  }

  // Get locale
  getLocale() {
    return this.locale;
  }

  // Get locale name
  getLocaleName(locale = null) {
    return (
      this.names[
        typeof locale !== 'string' ? this.locale.replace(/\-/g, '_') : locale.replace(/\-/g, '_')
      ] || null
    );
  }

  // Set locale
  setLocale(value) {
    if (this.locales.indexOf(value)) {
      this.locale = value;
      storageManager.setString('client-locale', value);
      this.emit('localeChanged', value);
      return true;
    }
    return false;
  }

  // Get browser locale
  appLocale() {
    if (navigator && navigator.language === 'string' && navigator.language.length > 0)
      return navigator.language;
    else return this.defaultLocale;
  }
}

// Functions and class
const i18 = new TinyLocale();
i18.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default i18;

if (__ENV_APP__.MODE === 'development') {
  global.i18 = i18;
}
