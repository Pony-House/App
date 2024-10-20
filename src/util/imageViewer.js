import $ from 'jquery';

import FileSaver from 'file-saver';
import PhotoSwipeLightbox from 'photoswipe';
import ExifReader from 'exifreader';
import initMatrix from '@src/client/initMatrix';

import { btModal, toast } from './tools';
import blobUrlManager from './libs/blobUrlManager';
import { openUrl } from './message/urlProtection';

export default function imageViewer(data) {
  return new Promise(async (resolve, reject) => {
    try {
      // Read Image Tag
      const img = data.imgQuery.get(0);
      if (img) {
        // File Url
        const url = data.imgQuery.attr('src');

        // Get Mime
        let filename = data.name;

        // Insert Mime
        const mime = blobUrlManager.getMime(data.imgQuery.attr('src'));
        if (
          Array.isArray(mime) &&
          mime.length > 1 &&
          typeof mime[1] === 'string' &&
          typeof filename === 'string' &&
          !filename.endsWith(mime[1])
        ) {
          filename += `.${mime[1]}`;
        }

        // Prepare Data
        const imgData = { height: null, width: null };
        if (typeof img.naturalWidth === 'number' && typeof img.naturalHeight === 'number') {
          imgData.height = img.naturalHeight;
          imgData.width = img.naturalWidth;
        }

        // Get Data
        else {
          const { height, width } = await blobUrlManager.forceGetImgSize(data.imgQuery.attr('src'));
          if (typeof height === 'number') imgData.height = height;
          if (typeof width === 'number') imgData.width = width;
        }

        // Create Lightbox
        const options = {
          dataSource: [
            {
              src: url,
              alt: filename,
              width: imgData.width,
              height: imgData.height,
            },
          ],
          padding: { top: 40, bottom: 40, left: 100, right: 100 },
        };

        if (__ENV_APP__.ELECTRON_MODE) {
          options.mainClass = 'root-electron-style';
          options.padding.bottom += 29;
        }

        const pswp = new PhotoSwipeLightbox(options);

        // Register Buttons
        pswp.on('uiRegister', () => {
          if (!__ENV_APP__.ELECTRON_MODE) {
            pswp.ui.registerElement({
              name: 'new-window-button',
              ariaLabel: 'Open Url',
              order: 9,
              isButton: true,
              html: '<i class="fa-solid fa-arrow-up-right-from-square pswp__icn" height="32" width="32"></i>',
              onClick: () => {
                openUrl(url, '_blank').focus();
              },
            });
          }

          pswp.ui.registerElement({
            name: 'download-button',
            ariaLabel: 'Download Image',
            order: 10,
            isButton: true,
            html: '<i class="fa-solid fa-floppy-disk pswp__icn" height="32" width="32"></i>',
            onClick: () => {
              FileSaver.saveAs(url, filename);
            },
          });

          pswp.ui.registerElement({
            name: 'information-button',
            ariaLabel: 'Image Metadata',
            order: 10,
            isButton: true,
            html: '<i class="fa-solid fa-circle-info pswp__icn" height="32" width="32"></i>',
            onClick: () => {
              initMatrix.mxcUrl
                .fetch(url, 'image')
                .then((res) => res.arrayBuffer())
                .then(async (body) => {
                  const newTags = await ExifReader.load(body, {
                    async: true,
                    includeUnknown: true,
                  });
                  const table = $('<table>', {
                    class: 'table border-bg table-hover align-middle m-0',
                  });
                  const thead = $('<thead>').append(
                    $('<tr>').append(
                      $('<th>', { scope: 'col' }).text('Name'),
                      $('<th>', { scope: 'col' }).text('Description'),
                      $('<th>', { scope: 'col' }).text('Value'),
                    ),
                  );
                  table.append(thead);
                  const tbody = $('<tbody>');

                  console.log('[image] [metadata]', newTags);
                  const addTags = (tags, oldTile = '') => {
                    for (const item in tags) {
                      if (
                        tags[item] &&
                        (typeof tags[item].description === 'string' ||
                          typeof tags[item].description === 'number') &&
                        (typeof tags[item].value === 'string' ||
                          typeof tags[item].value === 'number' ||
                          Array.isArray(tags[item].value))
                      ) {
                        const tr = $('<tr>');

                        tr.append($('<td>').text(`${oldTile}${item}`));
                        if (tags[item].description !== tags[item].value) {
                          tr.append($('<td>').text(tags[item].description));

                          if (!Array.isArray(tags[item].value)) {
                            tr.append($('<td>', { colspan: 2 }).text(tags[item].value));
                          } else {
                            for (const item2 in tags[item].value) {
                              addTags(tags[item].value[item2], `${item} - ${oldTile}`);
                            }
                          }
                        } else {
                          tr.append($('<td>', { colspan: 2 }).text(tags[item].description));
                        }

                        tbody.append(tr);
                      }
                    }
                  };

                  addTags(newTags);
                  table.append(tbody);
                  btModal({
                    title: 'Image Metadata',
                    id: 'image-metadata',
                    dialog: 'modal-lg modal-dialog-centered',
                    body: table,
                  });
                })
                .catch((err) => {
                  console.error(err);
                  alert(err.message, 'Image Metadata Error');
                });
            },
          });
        });

        pswp.on('close', () => {
          if (typeof data.onClose === 'function') data.onClose();
          setTimeout(() => {
            pswp.destroy();
          }, 5000);
        });

        pswp.on('destroy', () => {
          if (typeof data.onDestroyonDestroy === 'function') data.onDestroy();
        });

        // Init lightbox now
        resolve(pswp);

        pswp.init();
        if (data.lightbox && data.lightbox.loadAndOpen) data.lightbox.loadAndOpen(0);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
      reject(err);
    }
  });
}
