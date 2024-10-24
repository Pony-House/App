import $ from 'jquery';
import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';

import { AvatarJquery } from '@src/app/atoms/avatar/Avatar';

import initMatrix from '../../../client/initMatrix';
import { dfAvatarSize, getCurrentState } from '../../matrixUtil';
import { btModal } from '../../tools';

import { setLoadingPage } from '../../../app/templates/client/Loading';
import { twemojify } from '../../twemojify';
import { getRoomInfo } from '../../../app/organisms/room/Room';

import { openProfileViewer, selectRoom } from '../../../client/action/navigation';
import { colorMXID } from '../../colorMXID';
import { createMessageData } from '../../../app/molecules/message/Message';
import { jqueryTime } from '../../../app/atoms/time/Time';

import { getEventById } from './cache';
import storageManager from '../Localstorage';

// Info
const PIN_LIMIT = 50;
const eventName = 'm.room.pinned_events';

// Get Messages
export function getPinnedMessagesRaw(room, filterLimit = true) {
  // Base
  let result = [];
  const mx = initMatrix.matrixClient;

  try {
    // Get Status
    const pinEvent =
      typeof room !== 'string'
        ? getCurrentState(room).getStateEvents(eventName)
        : (getCurrentState(mx.getRoom(room)).getStateEvents(eventName) ?? []);

    // Get Content
    if (Array.isArray(pinEvent) && pinEvent[0]) {
      const pinData = pinEvent[0].getContent();
      if (objType(pinData, 'object') && Array.isArray(pinData.pinned)) {
        result = clone(pinData.pinned);
      }
    }

    // Filter event amount
    if (filterLimit && result.length > PIN_LIMIT) {
      while (result.length > PIN_LIMIT) {
        result.shift();
      }
    }
  } catch (err) {
    // Error
    console.error(err);
    alert(err.message, 'Get Pinned Messages Raw Error');
    result = [];
  }

  // Complete
  return result;
}

// Perm checker
export function canPinMessage(room, userId) {
  return getCurrentState(room).maySendStateEvent(eventName, userId);
}

// Get pin messages list
export async function getPinnedMessages(room, filterLimit = true) {
  // Get List
  const pinnedEventsId = getPinnedMessagesRaw(room, filterLimit);
  try {
    // Get events
    for (const item in pinnedEventsId) {
      try {
        if (typeof pinnedEventsId[item] === 'string') {
          const eventId = clone(pinnedEventsId[item]);
          pinnedEventsId[item] = await getEventById(room, eventId);
          if (pinnedEventsId[item] === null) pinnedEventsId[item] = eventId;
          // const tinyTimeline = room.getTimelineForEvent
          // tinyTimeline.getEvents();
        }
      } catch (err) {
        console.error(err);
      }
    }
  } catch (err) {
    // Error warn
    console.error(err);
    alert(err.message, ' Get Pinned Messages Error');
    return [];
  }

  // Complete
  return pinnedEventsId;
}

// Get pinned messages
export function isPinnedMessage(room, eventId, filterLimit = true) {
  const data = getPinnedMessagesRaw(room, filterLimit);
  return Array.isArray(data) && data.length > 0 && data.indexOf(eventId) > -1;
}

export function getPinnedMessage(room, eventId, filterLimit = true) {
  return new Promise((resolve, reject) => {
    if (isPinnedMessage(room, eventId, filterLimit)) {
      room.findEventById(eventId).then(resolve).catch(reject);
    } else {
      resolve(null);
    }
  });
}

// Set Pin to message
export function setPinMessage(room, newEventsId, isPinned = true) {
  return new Promise(async (resolve, reject) => {
    // Base
    const mx = initMatrix.matrixClient;

    // Perm validator
    if (canPinMessage(room, mx.getUserId())) {
      try {
        // Get List
        const eventsId = getPinnedMessagesRaw(room);
        const eventsIdOld = getPinnedMessagesRaw(room);
        if (typeof newEventsId === 'string' && newEventsId.length > 0) {
          // Add data
          if (isPinned) {
            const event = await room.findEventById(newEventsId);
            if (event) {
              eventsId.push(newEventsId);
            }
          }

          // Remove data
          else {
            const index = eventsId.indexOf(newEventsId);
            if (index > -1) {
              eventsId.splice(index, 1);
            }
          }
        }

        // Validator
        if (
          ((isPinned && eventsId.length > eventsIdOld.length) ||
            (!isPinned && eventsId.length < eventsIdOld.length)) &&
          eventsId.length <= PIN_LIMIT
        ) {
          // Prepare event
          const data = { pinned: eventsId };

          // Send Event
          mx.sendStateEvent(room.roomId, eventName, data)
            .then((event) => {
              storageManager
                .sendEvent(room.roomId, eventName, data)
                .then((msg) => {
                  resolve({ event, msg });
                })
                .catch(reject);
            })
            .catch(reject);
        }

        // Nope
        else {
          resolve(null);
        }
      } catch (err) {
        // Error
        reject(err);
      }
    }

    // No Permission
    else {
      reject(new Error('No pin message permission!'));
    }
  });
}

// Open Modal
export function openPinMessageModal(room) {
  setLoadingPage();
  getPinnedMessages(room)
    .then((events) => {
      // Prepare
      const body = [];
      const mx = initMatrix.matrixClient;
      const mxcUrl = initMatrix.mxcUrl;

      const isCustomHTML = true;
      let modal = null;

      for (const item in events) {
        try {
          if (objType(events[item], 'object')) {
            // is Redacted
            const eventId = events[item].getId();
            if (!events[item].isRedacted()) {
              // Prepare Data
              const userId = events[item].getSender();
              const userColor = colorMXID(userId);
              const user = mx.getUser(userId);

              const thread = events[item].getThread();
              const roomId = room.roomId;
              const threadId = thread && typeof thread.id === 'string' ? thread.id : null;

              const tinyUsername = twemojify(user.userId);

              const imageSrc = user
                ? mxcUrl.toHttp(user.avatarUrl, dfAvatarSize, dfAvatarSize)
                : null;
              const imageAnimSrc = user ? mxcUrl.toHttp(user.avatarUrl) : null;

              const content = events[item].getContent();
              const msgBody =
                typeof content.formatted_body === 'string' ? content.formatted_body : content.body;

              let msgData = !events[item].isEncrypted()
                ? createMessageData(content, msgBody, isCustomHTML, false, true)
                : $(
                    `<i class="bi bi-key-fill text-warning"></i> <strong>Unable to decrypt message.</strong>`,
                  );
              // const msgDataReact = createMessageData(content, msgBody, isCustomHTML, false);
              // const emojiOnly = isEmojiOnly(msgDataReact);

              const emojiOnly = false;

              if (!isCustomHTML) {
                // If this is a plaintext message, wrap it in a <p> element (automatically applying
                // white-space: pre-wrap) in order to preserve newlines
                msgData = $('<p>', { class: 'm-0' }).append(msgData);
              } else {
                msgData = $('<span>', { class: 'custom-html' }).append(msgData);
              }

              const td = $('<td>', {
                class:
                  'p-0 ps-2 ps-md-4 py-1 pe-md-2 align-top text-center chat-base profile-image-container',
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
                    .on('click', () => {
                      try {
                        const roomTimeline = getRoomInfo().roomTimeline;

                        if (typeof threadId === 'string') {
                          if (threadId !== roomTimeline.threadId)
                            selectRoom(thread.roomId, eventId, thread.rootEvent?.getId());
                        } else if (roomTimeline.room.roomId !== roomId || roomTimeline.threadId) {
                          selectRoom(roomId, eventId);
                        }

                        setTimeout(() => roomTimeline.loadEventTimeline(eventId), 500);
                      } catch (err) {
                        console.error(err);
                        alert(err.message);
                      }
                      if (modal) modal.hide();
                    })
                    .append(
                      $('<div>', { class: 'mb-1' }).append(
                        $('<span>', { class: 'username-base emoji-size-fix' })
                          .css('color', userColor)
                          .append($('<span>', { class: 'user-id' }).append(tinyUsername)),

                        $('<span>', { class: 'ms-2 very-small text-gray' }).append(
                          jqueryTime(events[item].getTs()),
                        ),
                      ),
                      $('<div>', {
                        class: `text-freedom message-body small text-bg${!emojiOnly ? ' emoji-size-fix' : ''}`,
                      }).append(msgData),
                    ),
                ),
              );
            } else {
              setPinMessage(room, eventId, false);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }

      // Empty List
      if (body.length < 1) {
        body.push(
          $('<tr>', {
            class: 'message message--body-only user-you-message chatbox-portable',
          }).append(
            $('<td>', { class: 'p-0 pe-3 py-1 text-center text-bg-force small', colspan: 2 }).text(
              "This room doesn't have any pinned message... yet.",
            ),
          ),
        );
      }

      // Send Modal
      modal = btModal({
        title: 'Pinned Messages',

        id: 'room-pinned-messages',
        dialog: 'modal-lg modal-dialog-scrollable modal-dialog-centered',
        body: [
          $('<table>', {
            class: `table table-borderless table-hover align-middle m-0`,
          }).append($('<tbody>').append(body)),

          $('<center>', { class: 'mt-3 small' }).text(
            `${events.length}/${PIN_LIMIT} pinned ${events.length > 1 ? 'messages' : 'message'}`,
          ),
        ],
      });

      // Complete
      setLoadingPage(false);
    })
    .catch(() => setLoadingPage(false));
}

// DEV
if (__ENV_APP__.MODE === 'development') {
  global.pinManager = {
    openModal: openPinMessageModal,
    getRaw: getPinnedMessagesRaw,
    getAll: getPinnedMessages,
    get: getPinnedMessage,
    isPinned: isPinnedMessage,
    set: setPinMessage,
  };
}
