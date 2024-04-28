import { objType } from 'for-promise/utils/lib.mjs';
import tinyAPI from '@src/util/mods';
import { fetchFn } from '@src/client/initMatrix';

export default function sinkingYachts() {
  // Welcome
  console.log(`[Sinking Yachts] Scammers protection mod activated! https://sinking.yachts/`);

  // Function
  tinyAPI.on(
    'openUrlChecker',
    (data, host, protocol) =>
      new Promise((resolve, reject) => {
        if (
          (protocol === 'https:' || protocol === 'http:') &&
          (!objType(data, 'object') || !data.isScammer)
        ) {
          const newTinyData = { isScammer: false };
          fetchFn(`https://phish.sinking.yachts/v2/check/${host}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
            .then((res) => res.json())
            .then((result) => {
              newTinyData.isScammer = result;
              resolve(newTinyData);
            })
            .catch(reject);
        } else {
          resolve(data);
        }
      }),
  );
}
