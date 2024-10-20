import forPromise from 'for-promise';
import { countObj } from 'for-promise/utils/lib.mjs';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

import initMatrix from '@src/client/initMatrix';
import { setLoadingPage } from '@src/app/templates/client/Loading';
import moment from '../momentjs';
import emojiEditor from './EmojiEditor';

export const supportedEmojiImportFiles = [
  'application/zip',
  'application/octet-stream',
  'application/x-zip-compressed',
  'multipart/x-zip',
];

// Import Emoji
export function getEmojiImport(zipFile) {
  return new Promise((resolve, reject) => {
    try {
      JSZip.loadAsync(zipFile)
        .then(async (zip) => {
          const data = {
            title: null,
            avatarFilename: null,
            avatarUrl: null,
            avatarFile: null,
            stateKey: null,
            usage: null,
            client: null,
            roomId: null,
            time: null,
            items: {},
          };
          await forPromise({ data: zip.files }, async (item, fn, fn_error) => {
            try {
              const zipEntry = zip.files[item];
              if (!zipEntry.dir) {
                // Get Data
                const filePath = zipEntry.name.split('/');
                const fileType = filePath[0];
                const fileName = filePath[1] ? filePath[1].split('.') : ['', ''];

                // Image
                if (fileType === 'images') {
                  // Create obj
                  if (!data.items[fileName[0]]) data.items[fileName[0]] = {};

                  // Insert image
                  if (emojiEditor.allowedExt(fileName[1])) {
                    data.items[fileName[0]].file = await zip.file(zipEntry.name).async('blob');
                    data.items[fileName[0]].filename = fileName.join('.');
                  }
                }

                // Json
                else if (fileType === 'json') {
                  // Create obj
                  if (!data.items[fileName[0]]) data.items[fileName[0]] = {};
                  const file = JSON.parse(await zip.file(zipEntry.name).async('text'));

                  // Insert json
                  data.items[fileName[0]].shortcode =
                    typeof file.shortcode === 'string'
                      ? file.shortcode.trim().replace(/ /g, '')
                      : null;

                  data.items[fileName[0]].usage = emojiEditor.isValidUsage(file.usage)
                    ? file.usage
                    : null;

                  // Insert mxc
                  data.items[fileName[0]].mxc =
                    typeof file.mxc === 'string' && file.mxc.startsWith('mxc://')
                      ? file.mxc.trim().replace(/ /g, '').split('/')
                      : null;

                  if (initMatrix.mxcUrl.validUrl(data.items[fileName[0]].mxc)) {
                    data.items[fileName[0]].mxc = data.items[fileName[0]].mxc.join('/');
                  } else {
                    data.items[fileName[0]].mxc = null;
                  }
                }

                // Metadata
                else if (fileType === 'metadata.json') {
                  const file = JSON.parse(await zip.file(zipEntry.name).async('text'));

                  data.roomId = typeof file.roomId === 'string' ? file.roomId : null;
                  data.stateKey = typeof file.stateKey === 'string' ? file.stateKey : null;
                  data.title = typeof file.title === 'string' ? file.title : null;
                  data.client = typeof file.client === 'string' ? file.client : null;
                  data.time = typeof file.timestamp === 'number' ? moment(data.timestamp) : null;
                  data.usage = emojiEditor.isValidUsage(file.usage) ? file.usage : null;
                  data.avatarUrl = initMatrix.mxcUrl.validUrl(data.avatarUrl)
                    ? data.avatarUrl
                    : null;
                }

                // Avatar
                if (
                  fileType.startsWith('avatar.') &&
                  fileType.split('.').length === 2 &&
                  emojiEditor.allowedExt(fileType)
                ) {
                  data.avatarFilename = fileType;
                  data.avatarFile = await zip.file(zipEntry.name).async('blob');
                }
              }
            } catch (err) {
              // Fail
              data.title = null;
              data.usage = null;
              data.client = null;
              data.avatarFilename = null;
              data.avatarUrl = null;
              data.avatarFile = null;
              data.stateKey = null;
              data.roomId = null;
              data.time = null;
              data.items = {};
              data.err = err;
              return fn_error(err);
            }

            // Complete
            fn();
          });

          // Delete invalid data
          if (typeof data.title === 'string' && data.title.length > 0 && countObj(data.items) > 0) {
            for (const item in data.items) {
              if (
                !data.items[item].file ||
                !data.items[item].filename ||
                !data.items[item].shortcode ||
                !data.items[item].usage
              )
                delete data.items[item];
            }
          } else {
            data.title = null;
            data.usage = null;
            data.client = null;
            data.avatarFilename = null;
            data.avatarUrl = null;
            data.avatarFile = null;
            data.stateKey = null;
            delete data.items;
            data.items = null;
            data.roomId = null;
            data.time = null;
            data.err = new Error('Invalid emoji pack!');
          }

          // Complete
          resolve(data);
        }, reject)
        .catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Export Emoji
export function emojiExport(data, images) {
  if (images.length > 0) {
    setLoadingPage('Exporting emojis...');
    try {
      const zip = new JSZip();
      const img = zip.folder('images');
      const errorFolder = zip.folder('error');
      const jsons = zip.folder('json');
      const fileData = {
        title: typeof data.displayName === 'string' ? data.displayName : null,
        attribution: typeof data.attribution === 'string' ? data.attribution : null,
        stateKey: typeof data.stateKey === 'string' ? data.stateKey : null,
        avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
        timestamp: moment().valueOf(),
        roomId: typeof data.roomId === 'string' ? data.roomId : null,
        usage: emojiEditor.isValidUsage(data.usage) ? data.usage : null,
        client: 'pony-house',
      };

      let count = 0;

      const validatorComplete = () => {
        if (count === images.length) {
          zip.file(`metadata.json`, JSON.stringify(fileData));
          const completeTask = () =>
            zip
              .generateAsync({ type: 'blob' })
              .then((content) => {
                FileSaver.saveAs(content, `emojipack_${encodeURIComponent(fileData.title)}.zip`);
                setLoadingPage(false);
              })
              .catch((err) => {
                console.error(err);
                alert(err.message, 'Emoji Export Save Error');
                setLoadingPage(false);
              });

          if (fileData.avatarUrl) {
            const fileUrl = new URL(initMatrix.mxcUrl.toHttp(fileData.avatarUrl));
            initMatrix.mxcUrl
              .fetch(fileUrl.href, 'image')
              .then((res) => {
                res.blob().then((blob) => {
                  const mime = blob.type.split('/');
                  if (mime[0] === 'image') {
                    if (mime[1] === 'jpeg') mime[1] = 'jpg';
                    zip.file(`avatar.${mime[1]}`, blob);
                  }
                  completeTask();
                });
              })
              .catch((err) => {
                console.error(err);
                zip.file(
                  `avatar_error.json`,
                  JSON.stringify({
                    message: err.message,
                    code: err.code,
                  }),
                );
                completeTask();
              });
          } else {
            completeTask();
          }
        }
      };

      images.map(([shortcode, image]) => {
        const fileUrl = new URL(initMatrix.mxcUrl.toHttp(image.mxc));
        const filename = encodeURIComponent(shortcode);
        initMatrix.mxcUrl
          .fetch(fileUrl.href, 'image')
          .then((res) => {
            res.blob().then((blob) => {
              const mime = blob.type.split('/');
              if (mime[0] === 'image') {
                if (mime[1] === 'jpeg') mime[1] = 'jpg';
                img.file(`${filename}.${mime[1]}`, blob);
                jsons.file(
                  `${filename}.json`,
                  JSON.stringify({
                    mxc: image.mxc,
                    shortcode,
                    usage: emojiEditor.getUsage(image.usage),
                  }),
                );
              }

              count++;
              validatorComplete();
            });
          })
          .catch((err) => {
            console.error(err);
            errorFolder.file(
              `${filename}.json`,
              JSON.stringify({
                message: err.message,
                code: err.code,
                mxc: image.mxc,
                shortcode,
                usage: emojiEditor.getUsage(image.usage),
              }),
            );
            count++;
            validatorComplete();
          });
      });
    } catch (err) {
      console.error(err);
      alert(err.message, 'Emoji Export Error');
      setLoadingPage(false);
    }
  } else {
    alert('Emojis not found to export.', 'Emoji Export Error');
  }
}
