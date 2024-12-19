// Checker
import { fetchFn } from '@src/client/initMatrix';
import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';

// Lang Cache
const langs = {
  loading: false,

  default: 'en',
  selected: null,

  list: {
    en: 'English',
  },

  data: {},
};

// Load Text
export function i18GetRoot() {
  return clone(langs);
}
export function i18GetData() {
  return clone(langs.data);
}
export function i18Get(item) {
  return clone(langs.data[item]);
}
export function i18IsLoading() {
  return langs.loading === true;
}

export function i18Await() {
  return new Promise((resolve, reject) => {
    if (!langs.loading) resolve(true);
    else setTimeout(() => i18Await().then(resolve).catch(reject), 100);
  });
}

// Refresh Lang
export function refreshLang() {
  langs.loading = true;
  if (__ENV_APP__.MODE === 'development') {
    global.i18 = {
      refreshLang,
      get: i18Get,
      isLoading: i18IsLoading,
      getData: i18GetData,
      getRoot: i18GetRoot,
      wait: i18Await,
    };
  }
  return new Promise((resolve, reject) => {
    // Fix Default
    try {
      if (!langs.selected || !langs.list[langs.selected]) langs.selected = langs.default;
    } catch (err) {
      langs.loading = false;
      reject(err);
    }

    // Get Default Data
    fetchFn(`./i18/${langs.default}.json`, {
      headers: {
        Accept: 'application/json',
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (objType(data, 'object')) {
          // Insert Default Items
          for (const item in data) {
            if (typeof data[item] === 'string') langs.data[item] = data[item];
          }

          // Insert Custom Lang
          if (langs.selected !== langs.default) {
            fetchFn(`./i18/${langs.selected}.json`, {
              headers: {
                Accept: 'application/json',
              },
            })
              .then((res) => res.json())
              .then((data2) => {
                if (objType(data2, 'object')) {
                  // Insert Items
                  for (const item in data2) {
                    if (typeof data2[item] === 'string') langs.data[item] = data2[item];
                  }

                  // Complete
                  langs.loading = false;
                  resolve(true);
                } else {
                  langs.loading = false;
                  console.error(
                    new Error(
                      `[${langs.selected}] INVALID LANG JSON! THIS NEED TO BE OBJECT WITH STRINGS! USING DEFAULT LANG FOR NOW. (${langs.default})`,
                    ),
                  );
                  resolve(false);
                }
              })
              .catch((err) => {
                langs.loading = false;
                reject(err);
              });
          } else {
            langs.loading = false;
            resolve(true);
          }
        } else {
          langs.data = {};
          langs.loading = false;
          reject(
            new Error(
              `[${langs.default}] INVALID DEFAULT LANG JSON! THIS NEED TO BE OBJECT WITH STRINGS!`,
            ),
          );
        }
      })
      .catch((err) => {
        langs.loading = false;
        reject(err);
      });
  });
}
