import $ from 'jquery';
import { Browser } from '@capacitor/browser';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import { btModal } from '../tools';
import tinyAPI from '../mods';
import convertProtocols from '../libs/convertProtocols';
import { setLoadingPage } from '../../app/templates/client/Loading';
import storageManager from '../libs/Localstorage';
import { isMobile } from '../libs/mobile';

export const openUrl = (url) =>
  new Promise((resolve, reject) => {
    // Mobile
    if (isMobile(true)) {
      Browser.open({ url }).then(resolve).catch(reject);
    }

    // Browser
    else {
      resolve(global.open(url, '_blank'));
    }
  });

export default async (url, vanillaUrl) => {
  try {
    // Prepare Whitelist
    const whiteList = storageManager.getJson('pony-house-urls-whitelist', 'array');
    let urlAllowed = false;

    // Checker Value
    const tinyUrl = convertProtocols(url, vanillaUrl);

    let tinyValue = tinyUrl.origin;
    if (typeof tinyValue !== 'string' || tinyValue === 'null') {
      tinyValue = tinyUrl.protocol;
    }

    // Start loading
    setLoadingPage();
    let scammerCache;

    try {
      scammerCache = await tinyAPI.emitAsync(
        'openUrlChecker',
        tinyUrl.hostname || tinyUrl.host,
        tinyUrl.protocol,
      );
    } catch (err) {
      scammerCache = null;
      tinyConsole.error(err);
    }

    const isScammer = objType(scammerCache, 'object') && scammerCache.isScammer;

    // Read Whitelist
    if (whiteList.indexOf(tinyValue) > -1) urlAllowed = true;
    if (!urlAllowed) {
      const body = $('<center>', { class: 'small' }).append(
        $('<p>', { class: isScammer ? 'text-danger' : null }).text(
          isScammer
            ? 'The domain was detected in a scammer database! Are you sure you want to continue? Proceed at your own risk!'
            : 'This link is taking you to the following website',
        ),

        $('<div>', { class: 'card' }).append(
          $('<div>', { class: `card-body text-break${isScammer ? ' text-warning' : ''}` }).text(
            url,
          ),
        ),

        typeof tinyValue === 'string' &&
          tinyValue !== 'null' &&
          $('<div>', { class: 'form-check mt-2 text-start' }).append(
            $('<input>', {
              type: 'checkbox',
              class: 'form-check-input',
              id: 'whitelist-the-domain',
            }),
            $('<label>', { class: 'form-check-label small', for: 'whitelist-the-domain' }).html(
              `Trust <strong>${typeof tinyUrl.hostname === 'string' && tinyUrl.hostname.length > 0 && tinyUrl.hostname !== 'null' ? tinyUrl.hostname : 'protocol'}</strong> links from now on`,
            ),
          ),
      );

      const tinyModal = btModal({
        id: 'trust-tiny-url',
        title: `Leaving ${__ENV_APP__.INFO.name}`,

        dialog: 'modal-dialog-centered modal-lg',
        body,

        footer: [
          $('<button>', { class: 'btn btn-bg mx-2' })
            .text('Go Back')
            .on('click', () => tinyModal.hide()),
          $('<button>', { class: `btn ${isScammer ? ' btn-danger' : 'btn-primary'} mx-2` })
            .text('Visit Site')
            .prepend(isScammer ? $('<i>', { class: 'fa-solid fa-circle-radiation me-2' }) : null)
            .on('click', () => {
              if (
                typeof tinyValue === 'string' &&
                tinyValue !== 'null' &&
                $('#whitelist-the-domain').is(':checked')
              ) {
                whiteList.push(tinyValue);
                storageManager.setJson('pony-house-urls-whitelist', whiteList);
              }

              openUrl(tinyUrl.href)
                .then(() => {
                  tinyModal.hide();
                  setLoadingPage(false);
                })
                .catch((err) => {
                  tinyConsole.error(err);
                  alert(err.message, 'Open Url Error 1');
                  tinyModal.hide();
                  setLoadingPage(false);
                });
            }),
        ],
      });

      setLoadingPage(false);
    } else if (urlAllowed) {
      openUrl(tinyUrl.href)
        .then(() => {
          setLoadingPage(false);
        })
        .catch((err) => {
          tinyConsole.error(err);
          alert(err.message, 'Open Url Error 2');
          setLoadingPage(false);
        });
    }
  } catch (err) {
    alert(err.message, 'Error - Open External url');
    tinyConsole.error(err);
  }
};
