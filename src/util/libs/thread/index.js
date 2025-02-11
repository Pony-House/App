import $ from 'jquery';
import moment from 'moment-timezone';
import EventEmitter from 'events';
import { Direction } from 'matrix-js-sdk';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import { AvatarJquery } from '@src/app/atoms/avatar/Avatar';
import { setLoadingPage } from '@src/app/templates/client/Loading';
import { colorMXID } from '@src/util/colorMXID';
import { twemojify } from '@src/util/twemojify';
import {
  addToDataFolder,
  getDataFolderRaw,
  getDataList,
  removeFromDataFolder,
} from '@src/util/selectedRoom';
import { canSupport, dfAvatarSize } from '@src/util/matrixUtil';

import { openProfileViewer, selectRoom } from '@src/client/action/navigation';
import { createMessageData } from '@src/app/molecules/message/Message';
import { jqueryTime } from '@src/app/atoms/time/Time';

import { btModal } from '../../tools';
import initMatrix, { fetchFn } from '../../../client/initMatrix';
import storageManager from '../Localstorage';

// The class
class ThreadsList extends EventEmitter {
  // Constructor
  constructor(roomId) {
    super();
    this.roomId = typeof roomId === 'string' ? roomId : null;
    this.nextBatch = null;
    this.page = null;
    this.prevs = null;
  }

  // Set Room Id
  setRoomId(roomId) {
    this.mx = initMatrix.matrixClient;
    this.roomId = typeof roomId === 'string' ? roomId : null;
    this.nextBatch = null;
    this.page = null;
    this.prevs = null;
  }

  getNextBatch() {
    return this.nextBatch;
  }

  getPage() {
    return this.page;
  }

  getPrevs() {
    return this.prevs;
  }

  removeActive(roomId, threadId) {
    removeFromDataFolder('thread', 'actives', `${roomId}:${threadId}`);
    this.emit('removedActiveThread', { roomId, threadId });
    this.emit('updatedActiveThreads', { roomId, threadId });
  }

  addActive(roomId, threadId) {
    const newData = { enabled: true };
    addToDataFolder('thread', 'actives', `${roomId}:${threadId}`, newData);
    this.emit('addedActiveThread', { roomId, threadId });
    this.emit('updatedActiveThreads', { roomId, threadId });
    return newData;
  }

  getActives() {
    return getDataFolderRaw('thread', 'actives');
  }

  getActive(roomId, threadId) {
    return getDataList('thread', 'actives', `${roomId}:${threadId}`);
  }

  dbGet({ page = 1 }) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      /* storageManager.getMessages({
        roomId: thread.roomId,
        threadId: thread.id,
        showThreads: true,
        showRedaction: false,
        page,
        limit: getAppearance('pageLimit'),
      }); */
    });
  }

  /**
   * https://spec.matrix.org/v1.9/client-server-api/#get_matrixclientv1roomsroomidthreads
   *
   * @param {string} roomId room id
   * @param {object} config
   * @param {object} config.filter search filter.  default={"lazy_load_members":true}
   * @param {string} config.from A pagination token from a previous result. When not provided, the server starts paginating from the most recent event visible to the user (as per history visibility rules; topologically).
   * @param {'b' | 'f'} config.dir direction to load. default=b
   * @param {'all' | 'participated'} config.include Optional (default all) flag to denote which thread roots are of interest to the caller. When all, all thread roots found in the room are returned. When participated, only thread roots for threads the user has participated in will be returned. default=all
   * @param {number} config.limit Optional limit for the maximum number of thread roots to include per response. Must be an integer greater than zero. Servers should apply a default value, and impose a maximum value to avoid resource exhaustion. default=30
   * @return {Promise<object>} the thread list result.
   *
   */
  get(config = {}) {
    const tinyThis = this;
    return new Promise((resolve, reject) => {
      const params = {
        limit: typeof config.limit === 'number' ? config.limit : 30,
        dir: typeof config.dir === 'string' ? config.dir : Direction.Backward,
        include: typeof config.include === 'string' ? config.include : 'all',
        filter: objType(config.filter, 'object')
          ? JSON.stringify(config.filter)
          : '%7B%22lazy_load_members%22%3Atrue%7D',
      };
      if (typeof config.from === 'string') params.from = config.from;
      tinyThis.mx.http
        .authedRequest('GET', `/rooms/${tinyThis.roomId}/threads`, params, null, {
          prefix: '/_matrix/client/v1',
        })
        .then((data) => {
          const events = [];

          if (typeof tinyThis.page === 'string') {
            tinyThis.prevs = tinyThis.page;
          } else {
            tinyThis.prevs = null;
          }

          if (typeof config.from === 'string') {
            tinyThis.page = config.from;
          } else {
            tinyThis.page = null;
          }

          if (config.insertBatch)
            tinyThis.nextBatch = typeof data.next_batch === 'string' ? data.next_batch : null;

          if (objType(data, 'object' && Array.isArray(data.chunk))) {
            for (const item in data.chunk) {
              try {
                if (objType(data.chunk[item], 'object')) {
                  const ev = data.chunk[item];
                  const tinyItem = {};

                  if (typeof ev.origin_server_ts === 'number') {
                    if (!config.useMoment) {
                      tinyItem.age = ev.origin_server_ts;
                    } else {
                      tinyItem.age = moment(ev.origin_server_ts);
                    }
                  }

                  if (objType(ev.content, 'object')) tinyItem.content = ev.content;
                  if (typeof ev.event_id === 'string') tinyItem.eventId = ev.event_id;
                  if (typeof ev.room_id === 'string') tinyItem.roomId = ev.room_id;
                  if (typeof ev.sender === 'string') tinyItem.senderId = ev.sender;
                  if (typeof ev.type === 'string') tinyItem.type = ev.type;
                  if (objType(ev.unsigned, 'object')) tinyItem.unsigned = ev.unsigned;

                  /* events.push(new MatrixEvent({
                                  origin_server_ts: ev.origin_server_ts,
                                  content: ev.content,
                                  event_id: ev.event_id,
                                  room_id: ev.room_id,
                                  sender: ev.sender,
                                  user_id: ev.user_id,
                                  type: ev.type,
                                  unsigned: ev.unsigned,
                              })); */

                  events.push(tinyItem);
                }
              } catch (err) {
                tinyConsole.error(err);
              }
            }
          }

          resolve(events);
        })
        .catch(reject);
    });
  }
}

// Prepare module
const threadsList = new ThreadsList();
threadsList.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default threadsList;

// Get thread list
export function openThreadsMessageModal(room) {
  if (canSupport('Thread')) {
    threadsList.setRoomId(room.roomId);
    setLoadingPage();
    threadsList
      .get()
      .then((events) => {
        // Prepare
        const body = [];
        const mx = initMatrix.matrixClient;
        const mxcUrl = initMatrix.mxcUrl;

        const isCustomHTML = true;
        let modal = null;

        const nextBatch = threadsList.getNextBatch();
        const prevs = threadsList.getPrevs();
        const page = threadsList.getPage();

        for (const item in events) {
          try {
            if (objType(events[item], 'object')) {
              // is Redacted
              const eventId = events[item].eventId;

              // Prepare Data
              const userId = events[item].senderId;
              const userColor = colorMXID(userId);
              const user = mx.getUser(userId);

              const roomId = room.roomId;
              const tinyUsername = twemojify(user.userId);

              const imageSrc = user
                ? mxcUrl.toHttp(user.avatarUrl, dfAvatarSize, dfAvatarSize)
                : null;
              const imageAnimSrc = user ? mxcUrl.toHttp(user.avatarUrl) : null;

              const content = events[item].content;
              const msgBody =
                typeof content.formatted_body === 'string' ? content.formatted_body : content.body;

              let msgData = createMessageData(content, msgBody, isCustomHTML, false, true);

              const emojiOnly = false;

              if (!isCustomHTML) {
                // If this is a plaintext message, wrap it in a <p> element (automatically applying
                // white-space: pre-wrap) in order to preserve newlines
                msgData = $('<p>', { class: 'm-0' }).append(msgData);
              } else {
                msgData = $('<span>', { class: 'custom-html' }).append(msgData);
              }

              const td = $('<td>', {
                class: 'p-0 ps-2 ps-md-4 py-1 pe-md-2 align-top text-center chat-base',
              });

              // Insert Body
              body.push(
                $('<tr>', {
                  eventid: eventId,
                  class: 'message message--body-only user-you-message chatbox-portable border-bg',
                }).append(
                  // Avatar
                  td.append(
                    $('<button>').append(
                      AvatarJquery({
                        className: 'profile-image-container',
                        imgClass: 'profile-image-container',
                        imageSrc,
                        imageAnimSrc,
                        isDefaultImage: true,
                        animParentsCount: 4,
                        onClick: () => openProfileViewer(userId, roomId),
                      }),
                    ),
                  ),

                  // Message
                  $('<td>', { class: 'p-0 pe-3 py-1 message-open-click' })
                    .on('click', async () => {
                      setLoadingPage();
                      if (modal) modal.hide();
                      try {
                        // Go to timeline
                        selectRoom(roomId, undefined, { threadId: eventId, force: true });
                      } catch (err) {
                        tinyConsole.error(err);
                        alert(err.message);
                      }

                      setLoadingPage(false);
                    })
                    .append(
                      $('<div>', { class: 'mb-1' }).append(
                        $('<span>', { class: 'username-base emoji-size-fix' })
                          .css('color', userColor)
                          .append($('<span>', { class: 'user-id' }).append(tinyUsername)),

                        $('<span>', { class: 'ms-2 very-small text-gray' }).append(
                          jqueryTime(events[item].age),
                        ),
                      ),
                      $('<div>', {
                        class: `text-freedom message-body small text-bg${!emojiOnly ? ' emoji-size-fix' : ''}`,
                      }).append(msgData),
                    ),
                ),
              );
            }
          } catch (err) {
            tinyConsole.error(err);
          }
        }

        // Empty List
        if (body.length < 1) {
          body.push(
            $('<tr>', {
              class: 'message message--body-only user-you-message chatbox-portable',
            }).append(
              $('<td>', {
                class: 'p-0 pe-3 py-1 text-center text-bg-force small',
                colspan: 2,
              }).text("This room doesn't have any threads... yet."),
            ),
          );
        }

        // Send Modal
        modal = btModal({
          title: 'Threads',

          id: 'room-pinned-messages',
          dialog: 'modal-lg modal-dialog-scrollable modal-dialog-centered',
          body: [
            $('<table>', {
              class: `table table-borderless table-hover align-middle m-0`,
            }).append($('<tbody>').append(body)),
            $('<center>').append(
              $('<button>', { class: 'btn btn-secondary mx-3 mt-3' })
                .prop('disabled', typeof prevs !== 'string' && typeof page !== 'string')
                .on('click', () => {
                  threadsList.get({ from: typeof prevs === 'string' ? prevs : null });
                })
                .text('Prev'),
              $('<button>', { class: 'btn btn-secondary mx-3 mt-3' })
                .prop('disabled', typeof nextBatch !== 'string')
                .on('click', () => {
                  threadsList.get({ from: nextBatch });
                })
                .text('Next'),
            ),
          ],
        });

        // Complete
        setLoadingPage(false);
      })
      .catch((err) => {
        tinyConsole.error(err);
        alert(err.message, 'Open Threads Message Modal Error');
      });
  }
}

if (__ENV_APP__.MODE === 'development') {
  global.matrixThreads = threadsList;
}
