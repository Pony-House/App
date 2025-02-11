import EventEmitter from 'events';
import * as linkify from 'linkifyjs';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import { fetchFn } from '@src/client/initMatrix';
import i18 from './locale';
import storageManager from './localStorage/StorageManager';

// Emitter
class LibreTranslate extends EventEmitter {
  constructor() {
    super();
    this.Initialized = false;
  }

  testUrl(value) {
    return (
      (!value.startsWith('https://') &&
        !value.startsWith('http://') &&
        linkify.test(`https://${value}`)) ||
      linkify.test(value)
    );
  }

  checkHostUrl() {
    return (
      this.content &&
      typeof this.content.host === 'string' &&
      this.content.host.length > 0 &&
      this.testUrl(this.content.host)
    );
  }

  canUse() {
    return this.content.enabled && this.checkHostUrl();
  }

  getUrl() {
    return `${this.content.host.startsWith('https://') || this.content.host.startsWith('http://') ? this.content.host : `https://${this.content.host}`}${!this.content.host.endsWith('/') ? '/' : ''}`;
  }

  start() {
    if (!this.Initialized) {
      this.Initialized = true;

      // Get Content
      this.content = storageManager.getJson('ponyHouse-libre-translate', 'obj');

      // Data
      this.content.enabled =
        typeof this.content.enabled === 'boolean'
          ? this.content.enabled
          : !!__ENV_APP__.LIBRE_TRANSLATE.ENABLED;

      this.content.visible =
        typeof this.content.visible === 'boolean'
          ? this.content.visible
          : !!__ENV_APP__.LIBRE_TRANSLATE.VISIBLE;

      this.defaultHost =
        typeof __ENV_APP__.LIBRE_TRANSLATE.DEFAULT_HOST === 'string' &&
        __ENV_APP__.LIBRE_TRANSLATE.DEFAULT_HOST.length > 0 &&
        this.testUrl(__ENV_APP__.LIBRE_TRANSLATE.DEFAULT_HOST)
          ? __ENV_APP__.LIBRE_TRANSLATE.DEFAULT_HOST
          : null;

      this.content.apiKey =
        typeof this.content.apiKey === 'string' && this.content.apiKey.length > 0
          ? this.content.apiKey
          : __ENV_APP__.LIBRE_TRANSLATE.API_KEY;

      this.content.host =
        typeof this.content.host === 'string' &&
        this.content.host.length > 0 &&
        this.testUrl(this.content.host)
          ? this.content.host
          : this.defaultHost;

      this.content.source =
        typeof this.content.source === 'string' && this.content.source.length > 0
          ? this.content.source
          : 'auto';

      this.content.target =
        typeof this.content.target === 'string' && this.content.target.length > 0
          ? this.content.target
          : i18.getLocale();
    }
  }

  async getLanguages() {
    if (this.checkHostUrl()) {
      try {
        const res = await fetchFn(`${this.getUrl()}languages`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await res.json();
        if (objType(result, 'object') || Array.isArray(result)) {
          if (!result.error) {
            return result;
          } else {
            tinyConsole.error(result.error);
            if (typeof result.error === 'string') alert(result.error, 'Libre Translate Error');
          }
        } else if (typeof result === 'string') {
          tinyConsole.log('[LibreTranslate] [Unknown]', result);
        }
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Libre Translate - Languages Error');
        return null;
      }
    }
    return null;
  }

  async detect(text, coptions = {}, isDebug = false) {
    if (isDebug) tinyConsole.log('[LibreTranslate] [settings]', this.content);
    if (typeof text === 'string' && this.checkHostUrl()) {
      const body = {
        q: text,
        api_key: this.content.apiKey,
      };

      if (typeof coptions.apiKey === 'string') options.apiKey = coptions.apiKey;

      const url = `${this.getUrl()}detect`;
      const options = {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      };

      if (isDebug) tinyConsole.log('[LibreTranslate] [url]', url);
      if (isDebug) tinyConsole.log('[LibreTranslate] [body]', body);
      if (isDebug) tinyConsole.log('[LibreTranslate] [options]', options);

      try {
        const res = await fetchFn(url, options);
        const result = await res.json();
        if (isDebug) tinyConsole.log('[LibreTranslate] [result]', result);

        if (objType(result, 'object') || Array.isArray(result)) {
          if (!result.error) {
            return result;
          } else {
            tinyConsole.error(result.error);
            if (typeof result.error === 'string') alert(result.error, 'Libre Translate Error');
          }
        } else if (typeof result === 'string') {
          tinyConsole.log('[LibreTranslate] [Unknown]', result);
        }
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Libre Translate Detector Error');
        return null;
      }
    }
    return null;
  }

  async translate(text, coptions = {}, isDebug = false) {
    if (isDebug) tinyConsole.log('[LibreTranslate] [settings]', this.content);
    if (typeof text === 'string' && this.checkHostUrl()) {
      const body = {
        q: text,
        source: this.content.source,
        target: this.content.target,
        api_key: this.content.apiKey,
        format: 'text',
      };

      let isJson = false;
      if (typeof coptions.isJson === 'boolean') isJson = coptions.isJson;

      if (typeof coptions.source === 'string') options.source = coptions.source;

      if (typeof coptions.target === 'string') options.target = coptions.target;

      if (typeof coptions.apiKey === 'string') options.apiKey = coptions.apiKey;

      const url = `${this.getUrl()}translate`;
      const options = {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      };

      if (isDebug) tinyConsole.log('[LibreTranslate] [url]', url);
      if (isDebug) tinyConsole.log('[LibreTranslate] [body]', body);
      if (isDebug) tinyConsole.log('[LibreTranslate] [options]', options);

      try {
        const res = await fetchFn(url, options);
        const result = await res.json();
        if (isDebug) tinyConsole.log('[LibreTranslate] [result]', result);

        if (objType(result, 'object')) {
          if (!result.error) {
            if (typeof result.translatedText === 'string')
              return !isJson ? result.translatedText : result;
          } else {
            tinyConsole.error(result.error);
            if (typeof result.error === 'string') alert(result.error, 'Libre Translate Error');
          }
        } else if (typeof result === 'string') {
          tinyConsole.log('[LibreTranslate] [Unknown]', result);
        }
      } catch (err) {
        tinyConsole.error(err);
        alert(err.message, 'Libre Translate Error');
        return null;
      }
    }
    return null;
  }

  getDefaultHost() {
    return this.defaultHost;
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
      storageManager.setJson('ponyHouse-libre-translate', this.content);
      this.emit(folder, value);
    }
  }
}

// Functions and class
const libreTranslate = new LibreTranslate();
libreTranslate.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default libreTranslate;

if (__ENV_APP__.MODE === 'development') {
  global.libreTranslate = libreTranslate;
}
