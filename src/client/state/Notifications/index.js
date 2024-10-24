import { LocalNotifications } from '@capacitor/local-notifications';
import $ from 'jquery';
import { ClientEvent, NotificationCountType, RoomEvent } from 'matrix-js-sdk';
import EventEmitter from 'events';
import { objType } from 'for-promise/utils/lib.mjs';

import storageManager from '@src/util/libs/Localstorage';

import { isMobile } from '@src/util/libs/mobile';
import { cyrb128 } from '@src/util/tools';
import { getAppearance } from '@src/util/libs/appearance';
import attemptDecryption from '@src/util/libs/attemptDecryption';
import soundFiles from '@src/util/soundFiles';
import { canSupport, dfAvatarSize } from '@src/util/matrixUtil';
import initMatrix from '@src/client/initMatrix';

import renderAvatar from '../../../app/atoms/avatar/render';
import { cssColorMXID } from '../../../util/colorMXID';
import { selectRoom } from '../../action/navigation';
import cons from '../cons';
import navigation from '../navigation';
import settings from '../settings';
import { updateName } from '../../../util/roomName';

import { html, plain } from '../../../util/markdown';
import { getAccountStatus } from '../../../app/organisms/navigation/ProfileAvatarMenu';
import favIconManager from '../../../util/libs/favicon';
import { getPrivacyRefuseRoom } from '../../../app/organisms/navigation/Sidebar/InviteSidebar';
import waitDecrypt from './waitDecrypt';
// import { insertEvent } from '../eventsDelay';

function isNotifEvent(mEvent) {
  const eType = mEvent.getType();
  if (!cons.supportEventTypes.includes(eType)) return false;
  if (eType === 'm.room.member') return false;

  if (mEvent.isRedacted()) return false;
  if (mEvent.getRelation()?.rel_type === 'm.replace') return false;

  return true;
}

function isMutedRule(rule) {
  return rule.actions[0] === 'dont_notify' && rule.conditions[0].kind === 'event_match';
}

function findMutedRule(overrideRules, roomId) {
  return overrideRules.find((rule) => rule.rule_id === roomId && isMutedRule(rule));
}

export const getRoomTitle = (room, sender, thread) => {
  let title;
  const threadTitle = !thread ? '' : (thread.rootEvent?.getContent()?.body ?? 'Unknown thread');
  if (!sender || room.name === sender.name) {
    title = `${room.name}${threadTitle.length > 0 ? ` - ${threadTitle}` : ''}`;
  } else if (sender) {
    title = `${sender.name} (${room.name})${threadTitle.length > 0 ? ` - (${threadTitle})` : ''} `;
  }

  if (room.nameCinny) {
    if (typeof room.nameCinny.category === 'string') {
      title = `(${room.nameCinny.category}) - ${title}`;
    }
  }

  return title;
};

class Notifications extends EventEmitter {
  constructor(roomList) {
    super();

    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.initialized = false;
    this.matrixClient = roomList.matrixClient;
    this.roomList = roomList;

    this.roomIdToNoti = new Map();
    this.roomIdToPopupNotis = new Map();
    this.eventIdToPopupNoti = new Map();

    // this._initNoti();
    this._listenEvents();
  }

  async _initNoti() {
    this.initialized = false;
    this.roomIdToNoti = new Map();

    const addNoti = (roomId) => {
      const room = this.matrixClient.getRoom(roomId);
      if (this.getNotiType(room.roomId) === cons.notifs.MUTE) return;
      if (this.doesRoomHaveUnread(room) === false) return;

      const total = room.getRoomUnreadNotificationCount(NotificationCountType.Total);
      const highlight = room.getRoomUnreadNotificationCount(NotificationCountType.Highlight);
      this._setNoti(room.roomId, null, total ?? 0, highlight ?? 0);
    };
    [...this.roomList.rooms].forEach(addNoti);
    [...this.roomList.directs].forEach(addNoti);

    this.initialized = true;
    favIconManager.checkerFavIcon();
  }

  doesRoomHaveUnread(room) {
    const userId = this.matrixClient.getUserId();
    const readUpToId = room.getEventReadUpTo(userId);
    const liveEvents = room.getLiveTimeline().getEvents();

    if (liveEvents[liveEvents.length - 1]?.getSender() === userId) {
      return false;
    }

    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      const event = liveEvents[i];
      if (event.getId() === readUpToId) return false;
      if (isNotifEvent(event)) return true;
    }

    return true;
  }

  getNotiType(roomId, threadId) {
    const mx = this.matrixClient;
    let pushRule;

    try {
      pushRule = mx.getRoomPushRule('global', roomId);
    } catch {
      pushRule = undefined;
    }

    if (pushRule === undefined) {
      const overrideRules = mx.getAccountData('m.push_rules')?.getContent()?.global?.override;
      if (overrideRules === undefined) return cons.notifs.DEFAULT;

      const isMuted = findMutedRule(overrideRules, roomId, threadId);

      return isMuted ? cons.notifs.MUTE : cons.notifs.DEFAULT;
    }

    if (pushRule.actions[0] === 'notify') return cons.notifs.ALL_MESSAGES;
    return cons.notifs.MENTIONS_AND_KEYWORDS;
  }

  getNoti(roomId, threadId) {
    return (
      this.roomIdToNoti.get(!threadId ? roomId : `${roomId}:${threadId}`) || {
        total: 0,
        highlight: 0,
        from: null,
      }
    );
  }

  getTotalNoti(roomId, threadId) {
    const { total } = this.getNoti(roomId, threadId);
    return total;
  }

  getHighlightNoti(roomId, threadId) {
    const { highlight } = this.getNoti(roomId, threadId);
    return highlight;
  }

  getFromNoti(roomId, threadId) {
    const { from } = this.getNoti(roomId, threadId);
    return from;
  }

  hasNoti(roomId, threadId) {
    return this.roomIdToNoti.has(!threadId ? roomId : `${roomId}:${threadId}`);
  }

  deleteNoti(roomId, threadId) {
    if (this.hasNoti(roomId, threadId)) {
      const noti = this.getNoti(roomId, threadId);
      this._deleteNoti(roomId, threadId, noti.total, noti.highlight);
    }
  }

  _setNoti(roomId, threadId, total, highlight) {
    const addNoti = (id, rid, tid, t, h, fromId) => {
      const prevTotal = this.roomIdToNoti.get(id)?.total ?? null;
      const noti = this.getNoti(rid, tid);

      noti.total += t;
      noti.highlight += h;

      if (fromId) {
        if (noti.from === null) noti.from = new Set();
        noti.from.add(fromId);
      }
      this.roomIdToNoti.set(id, noti);
      this.emit(cons.events.notifications.NOTI_CHANGED, rid, tid, noti.total, prevTotal);
    };

    const noti = this.getNoti(roomId);
    const addT = (highlight > total ? highlight : total) - noti.total;
    const addH = highlight - noti.highlight;
    if (addT < 0 || addH < 0) return;

    addNoti(!threadId ? roomId : `${roomId}:${threadId}`, roomId, threadId, addT, addH);
    const allParentSpaces = this.roomList.getAllParentSpaces(roomId);
    allParentSpaces.forEach((spaceId) => {
      addNoti(spaceId, spaceId, threadId, addT, addH, roomId);
    });

    favIconManager.checkerFavIcon();
  }

  _deleteNoti(roomId, threadId, total, highlight) {
    const removeNoti = (id, t, h, fromId) => {
      if (this.roomIdToNoti.has(id) === false) return;

      const noti = this.getNoti(id);
      const prevTotal = noti.total;
      noti.total -= t;
      noti.highlight -= h;

      if (noti.total < 0) {
        noti.total = 0;
        noti.highlight = 0;
      }

      if (fromId && noti.from !== null) {
        if (!this.hasNoti(fromId)) noti.from.delete(fromId);
      }

      if (noti.from === null || noti.from.size === 0) {
        this.roomIdToNoti.delete(id);
        this.emit(cons.events.notifications.FULL_READ, roomId, threadId);
        this.emit(cons.events.notifications.NOTI_CHANGED, roomId, threadId, null, prevTotal);
      } else {
        this.roomIdToNoti.set(id, noti);
        this.emit(cons.events.notifications.NOTI_CHANGED, roomId, threadId, noti.total, prevTotal);
      }
    };

    removeNoti(!threadId ? roomId : `${roomId}:${threadId}`, total, highlight);
    const allParentSpaces = this.roomList.getAllParentSpaces(roomId);
    allParentSpaces.forEach((spaceId) => {
      removeNoti(spaceId, total, highlight, roomId);
    });

    favIconManager.checkerFavIcon();
  }

  async sendNotification(data) {
    try {
      // Android Mode
      if (isMobile(true)) {
        const notiData = {
          // schedule: { at: new Date(Date.now() + 1000 * 5) },
          // sound: './sound/notification.ogg',
          // smallIcon: data.icon,
          // largeIcon: data.icon,
          sound: null,
          attachments: null,
          actionTypeId: '',
          id: cyrb128(data.tag)[0],
          extra: null,
        };

        if (typeof data.title === 'string') notiData.title = data.title;

        if (typeof data.body === 'string') {
          notiData.body = data.body.length < 100 ? data.body : `${data.body.substring(0, 100)} ...`;
          notiData.largeBody = data.body;
        }

        await LocalNotifications.schedule({
          notifications: [notiData],
        });
      }

      // Browser and Desktop
      else {
        // Prepare Data
        const notiData = {
          tag: data.tag,
        };

        if (data.icon) notiData.icon = data.icon;
        if (typeof data.body === 'string') notiData.body = data.body;
        if (typeof data.title === 'string') notiData.title = data.title;

        // Silent Mode
        let noti;
        if (__ENV_APP__.ELECTRON_MODE) {
          notiData.silent = true;
          noti = await window.desktopNotification(notiData);
        } else {
          notiData.silent = settings.isNotificationSounds;
          noti = new window.Notification(data.title, notiData);
        }

        // Play Notification
        if (__ENV_APP__.ELECTRON_MODE) {
          if (settings.isNotificationSounds) {
            noti.on('show', () => this._playNotiSound());
          }

          if (typeof data.onClick === 'function') noti.on('click', data.onClick);
          else if (data.onClick && typeof data.onClick.desktop === 'function')
            noti.on('click', data.onClick.desktop);
        } else {
          if (settings.isNotificationSounds) {
            noti.onshow = () => this._playNotiSound();
          }

          if (typeof data.onClick === 'function') noti.onclick = data.onClick;
          else if (data.onClick && typeof data.onClick.browser === 'function')
            noti.onclick = data.onClick.browser;
        }

        // Complete
        if (typeof data.onComplete === 'function') await data.onComplete(noti);

        // Send Notification
        if (__ENV_APP__.ELECTRON_MODE) {
          noti.show();
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async _sendDisplayPopupNoti(mEvent, content, room) {
    // Data Prepare
    const userStatus = getAccountStatus('status');
    if (!settings.showNotifications && !settings.isNotificationSounds) {
      return;
    }

    // Actions
    const actions = this.matrixClient.getPushActionsForEvent(mEvent);
    if (!actions?.notify) {
      return;
    }

    // Check Window
    if (
      (!__ENV_APP__.ELECTRON_MODE ||
        typeof global.electronWindow.getShowStatus !== 'function' ||
        global.electronWindow.getShowStatus()) &&
      !$('body').hasClass('modal-open') &&
      ((!mEvent.thread && navigation.selectedRoomId === room.roomId) ||
        (mEvent.thread && navigation.selectedThreadId === mEvent.thread.id)) &&
      document.visibilityState === 'visible' &&
      !$('body').hasClass('windowHidden')
    ) {
      return;
    }

    if (userStatus === 'dnd' || userStatus === '🔴') {
      return;
    }

    if (mEvent.getType() === 'm.sticker' && !getAppearance('showStickers')) {
      return;
    }

    // Show Notification
    if (settings.showNotifications) {
      const mxcUrl = initMatrix.mxcUrl;
      const title = getRoomTitle(room, mEvent.sender, mEvent.thread);
      updateName(room);

      const icon = await renderAvatar({
        text: mEvent.sender.name,
        bgColor: cssColorMXID(mEvent.getSender()),
        imageSrc: mxcUrl.getAvatarUrl(mEvent.sender, dfAvatarSize, dfAvatarSize),
        size: dfAvatarSize,
        borderRadius: 8,
        scale: 8,
      });

      const state = { kind: 'notification', onlyPlain: true };
      let body;
      if (content.format === 'org.matrix.custom.html') {
        body = html(
          content.formatted_body,
          room.roomId,
          mEvent.thread ? mEvent.thread.id : null,
          state,
        );
      } else {
        body = plain(content.body, room.roomId, mEvent.thread ? mEvent.thread.id : null, state);
      }

      const tinyThis = this;
      await this.sendNotification({
        tag: mEvent.getId(),
        title,
        body: body.plain,
        icon,

        onClick: {
          desktop: () => {
            selectRoom(room.roomId, mEvent.getId(), !mEvent.thread ? null : mEvent.thread.id, true);
            global.electronWindow.forceFocus();
          },

          browser: () =>
            selectRoom(room.roomId, mEvent.getId(), !mEvent.thread ? null : mEvent.thread.id, true),
        },

        onComplete: (noti) => {
          // Set Event
          tinyThis.eventIdToPopupNoti.set(mEvent.getId(), noti);
          if (tinyThis.roomIdToPopupNotis.has(room.roomId)) {
            tinyThis.roomIdToPopupNotis.get(room.roomId).push(noti);
          } else {
            tinyThis.roomIdToPopupNotis.set(room.roomId, [noti]);
          }
        },
      });
    }

    // Notification Sound Play
    else {
      this._playNotiSound();
    }
  }

  _deletePopupNoti(eventId) {
    this.eventIdToPopupNoti.get(eventId)?.close();
    this.eventIdToPopupNoti.delete(eventId);
  }

  _deletePopupRoomNotis(roomId) {
    this.roomIdToPopupNotis.get(roomId)?.forEach((n) => {
      this.eventIdToPopupNoti.delete(n.tag);
      n.close();
    });

    this.roomIdToPopupNotis.delete(roomId);
  }

  _playNotiSound() {
    soundFiles.play('notification');
  }

  _playInviteSound() {
    soundFiles.play('invite');
  }

  _listenEvents() {
    this._listenRoomTimeline = async (mEvent, room, forceStopNotification = false) => {
      if (mEvent.isRedaction()) this._deletePopupNoti(mEvent.event.redacts);

      // Total Data
      let total = 0;
      let highlight = 0;
      let stopNotification = forceStopNotification;

      // Is Space
      if (!stopNotification && room && room.isSpaceRoom()) {
        stopNotification = true;
      }

      // Noti Event
      if (!stopNotification && !isNotifEvent(mEvent)) {
        stopNotification = true;
      }

      // Continue check
      if (!stopNotification) {
        const liveEvents = !mEvent.thread
          ? room.getLiveTimeline().getEvents()
          : mEvent.thread.timeline;

        // Last Id
        const lastTimelineEvent = liveEvents[liveEvents.length - 1];
        if (lastTimelineEvent.getId() !== mEvent.getId()) {
          stopNotification = true;
          // console.log(`[matrix-noti] Event blocked by last id validator: ${mEvent.getId()}`);
        }

        // Sender check
        if (!stopNotification && mEvent.getSender() === this.matrixClient.getUserId()) {
          stopNotification = true;
          // console.log(`[matrix-noti] Event blocked by is same user: ${mEvent.getId()}`);
        }

        // Prepare values
        if (!stopNotification) {
          // Get new numbers
          total = !mEvent.thread
            ? room.getRoomUnreadNotificationCount(NotificationCountType.Total)
            : canSupport('ThreadUnreadNotifications')
              ? room.getThreadUnreadNotificationCount(mEvent.thread.id, NotificationCountType.Total)
              : 0;

          highlight = !mEvent.thread
            ? room.getRoomUnreadNotificationCount(NotificationCountType.Highlight)
            : canSupport('ThreadUnreadNotifications')
              ? room.getThreadUnreadNotificationCount(
                  mEvent.thread.id,
                  NotificationCountType.Highlight,
                )
              : 0;

          // Is Muted
          if (
            this.getNotiType(room.roomId, mEvent.thread ? mEvent.thread.id : null) ===
            cons.notifs.MUTE
          ) {
            this.deleteNoti(
              room.roomId,
              mEvent.thread ? mEvent.thread.id : null,
              total ?? 0,
              highlight ?? 0,
            );
            stopNotification = true;
            console.log(`[matrix-noti] Event blocked by mute: ${mEvent.getId()}`);
          }

          // Continue
          if (!stopNotification) {
            // Set Notification
            this._setNoti(
              room.roomId,
              mEvent.thread ? mEvent.thread.id : null,
              total ?? 0,
              highlight ?? 0,
            );
            if (mEvent.thread)
              this.emit(cons.events.notifications.THREAD_NOTIFICATION, mEvent.thread);
          }

          // Nothing
          if (mEvent.thread && total < 1 && highlight < 1) {
            stopNotification = true;
            console.log(`[matrix-noti] Event blocked by no counter: ${mEvent.getId()}`);
          }
        }
      }

      // Encrypted
      if (mEvent.isEncrypted()) {
        await attemptDecryption.exec(mEvent, null, true);
      }

      if (this.matrixClient.getSyncState() !== 'SYNCING') stopNotification = true;

      // Favicon
      favIconManager.checkerFavIcon();

      // Tiny API
      const notificationAllowed =
        !stopNotification &&
        room &&
        this.hasNoti(room.roomId, mEvent.thread ? mEvent.thread.id : null);

      // Complete
      if (room)
        waitDecrypt(mEvent).then((mEvent2) => {
          storageManager.addToTimeline(mEvent2);
          if (notificationAllowed) this._sendDisplayPopupNoti(mEvent2, mEvent2.getContent(), room);
        });
      else storageManager.addToTimeline(mEvent);
    };

    this.matrixClient.on(ClientEvent.Event, (mEvent) => {
      if (mEvent.getId() && mEvent.getRoomId())
        this._listenRoomTimeline(mEvent, initMatrix.matrixClient.getRoom(mEvent.getRoomId()));
    });

    this.matrixClient.on(RoomEvent.Receipt, (mEvent) => {
      const type = mEvent.getType();
      if (type === 'm.receipt') {
        const roomId = mEvent.getRoomId();
        if (typeof roomId === 'string' && roomId.length > 0) {
          const content = mEvent.getContent();
          if (content) {
            for (const eventId in content) {
              if (objType(content[eventId]['m.read'], 'object'))
                for (const userId in content[eventId]['m.read']) {
                  const ts = content[eventId]['m.read'][userId].ts;
                  if (typeof ts === 'number' && !Number.isNaN(ts) && Number.isFinite(ts)) {
                    storageManager.setReceipt(roomId, userId, ts);
                  }
                }
            }
          }
        }
      }
    });

    const mx = this.matrixClient;
    mx.on(RoomEvent.Redaction, (mEvent) => {
      storageManager.addToTimeline(mEvent);
    });

    mx.on(RoomEvent.Tags, (event) => {
      console.log('[tags]', event);
    });

    mx.on(RoomEvent.UnreadNotifications, (event) => {
      console.log('[UnreadNotifications]', event);
    });

    mx.on(ClientEvent.AccountData, (mEvent, oldMEvent) => {
      if (mEvent.getType() === 'm.push_rules') {
        const override = mEvent?.getContent()?.global?.override;
        const oldOverride = oldMEvent?.getContent()?.global?.override;
        if (!override || !oldOverride) return;

        const isMuteToggled = (rule, otherOverride) => {
          const roomId = rule.rule_id;
          const room = this.matrixClient.getRoom(roomId);
          if (room === null) return false;
          if (room.isSpaceRoom()) return false;

          const isMuted = isMutedRule(rule);
          if (!isMuted) return false;
          const isOtherMuted = findMutedRule(otherOverride, roomId);
          if (isOtherMuted) return false;
          return true;
        };

        const mutedRules = override.filter((rule) => isMuteToggled(rule, oldOverride));
        const unMutedRules = oldOverride.filter((rule) => isMuteToggled(rule, override));

        mutedRules.forEach((rule) => {
          this.emit(cons.events.notifications.MUTE_TOGGLED, rule.rule_id, true);
          this.deleteNoti(rule.rule_id);
        });

        unMutedRules.forEach((rule) => {
          this.emit(cons.events.notifications.MUTE_TOGGLED, rule.rule_id, false);
          const room = this.matrixClient.getRoom(rule.rule_id);
          if (!this.doesRoomHaveUnread(room)) return;
          const total = room.getRoomUnreadNotificationCount(NotificationCountType.Total);
          const highlight = room.getRoomUnreadNotificationCount(NotificationCountType.Highlight);
          this._setNoti(room.roomId, null, total ?? 0, highlight ?? 0);
        });
      }
    });

    mx.on(RoomEvent.Receipt, (mEvent, room) => {
      if (mEvent.getType() !== 'm.receipt' || room.isSpaceRoom()) return;
      const content = mEvent.getContent();
      const userId = this.matrixClient.getUserId();

      Object.keys(content).forEach((eventId) => {
        Object.entries(content[eventId]).forEach(([receiptType, receipt]) => {
          if (!cons.supportReceiptTypes.includes(receiptType)) return;
          if (Object.keys(receipt || {}).includes(userId)) {
            this.deleteNoti(room.roomId);
            this._deletePopupRoomNotis(room.roomId);
          }
        });
      });
    });

    mx.on(RoomEvent.MyMembership, (room, membership) => {
      if (membership === 'leave' && this.hasNoti(room.roomId)) {
        this.deleteNoti(room.roomId);
      }

      if (membership === 'invite' && !getPrivacyRefuseRoom(null, room)) {
        this._playInviteSound();
      }
    });
  }
}

export default Notifications;
