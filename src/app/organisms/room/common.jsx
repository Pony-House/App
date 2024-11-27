import React from 'react';

import { twemojifyReact } from '../../../util/twemojify';
import { getAppearance } from '../../../util/libs/appearance';

import initMatrix from '../../../client/initMatrix';
import { getUsername, getUsernameOfRoomMember } from '../../../util/matrixUtil';

import JoinMessage from './chat-messages/Join';
import LeaveMessage from './chat-messages/Leave';

import InviteMessage from './chat-messages/Invite';
import CancelInviteMessage from './chat-messages/CancelInvite';
import RejectInviteMessage from './chat-messages/RejectInvite';

import BanMessage from './chat-messages/Ban';
import UnbanMessage from './chat-messages/Unban';

import AvatarSetsMessage from './chat-messages/AvatarSets';
import AvatarChangedMessage from './chat-messages/AvatarChanged';
import AvatarRemovedMessage from './chat-messages/AvatarRemoved';

import NameSetsMessage from './chat-messages/NameSets';
import NameChangedMessage from './chat-messages/NameChanged';
import NameRemovedMessage from './chat-messages/NameRemoved';

import PinnedEventsMessage, { comparePinEvents } from './chat-messages/PinnedEventsMessage';
import moment from '@src/util/libs/momentjs';

function getTimelineJSXMessages() {
  return {
    join(date, user, eventId) {
      return <JoinMessage date={date} user={user} eventId={eventId} />;
    },
    leave(date, user, reason, eventId) {
      return <LeaveMessage date={date} user={user} reason={reason} eventId={eventId} />;
    },

    invite(date, inviter, user, eventId) {
      return <InviteMessage date={date} user={user} inviter={inviter} eventId={eventId} />;
    },
    cancelInvite(date, inviter, user, eventId) {
      return <CancelInviteMessage date={date} user={user} inviter={inviter} eventId={eventId} />;
    },
    rejectInvite(date, user, eventId) {
      return <RejectInviteMessage date={date} user={user} eventId={eventId} />;
    },

    kick(date, actor, user, reason, eventId) {
      return (
        <RejectInviteMessage
          date={date}
          actor={actor}
          user={user}
          reason={reason}
          eventId={eventId}
        />
      );
    },
    ban(date, actor, user, reason, eventId) {
      return <BanMessage date={date} actor={actor} user={user} reason={reason} eventId={eventId} />;
    },
    unban(date, actor, user, eventId) {
      return <UnbanMessage date={date} actor={actor} user={user} eventId={eventId} />;
    },

    avatarSets(date, user, eventId) {
      return <AvatarSetsMessage date={date} user={user} eventId={eventId} />;
    },
    avatarChanged(date, user, eventId) {
      return <AvatarChangedMessage date={date} user={user} eventId={eventId} />;
    },
    avatarRemoved(date, user, eventId) {
      return <AvatarRemovedMessage date={date} user={user} eventId={eventId} />;
    },

    nameSets(date, user, newName, eventId) {
      return <NameSetsMessage date={date} newName={newName} user={user} eventId={eventId} />;
    },
    nameChanged(date, user, newName, eventId) {
      return <NameChangedMessage date={date} newName={newName} user={user} eventId={eventId} />;
    },
    nameRemoved(date, user, lastName, eventId) {
      return <NameRemovedMessage date={date} lastName={lastName} user={user} eventId={eventId} />;
    },

    pinnedEvents(date, user, comparedPinMessages, room, eventId) {
      return (
        <PinnedEventsMessage
          date={date}
          comparedPinMessages={comparedPinMessages}
          user={user}
          room={room}
          eventId={eventId}
        />
      );
    },
  };
}

function getUsersActionJsx(roomId, userIds, actionStr) {
  const room = initMatrix.matrixClient.getRoom(roomId);
  const getUserDisplayName = (userId) => {
    if (room?.getMember(userId)) return getUsernameOfRoomMember(room.getMember(userId));
    return getUsername(userId);
  };

  const getUserJSX = (userId) => <strong>{twemojifyReact(getUserDisplayName(userId))}</strong>;
  if (!Array.isArray(userIds)) return 'Idle';
  if (userIds.length === 0) return 'Idle';
  const MAX_VISIBLE_COUNT = 3;

  const u1Jsx = <span className="text-bg">{getUserJSX(userIds[0])}</span>;
  // eslint-disable-next-line react/jsx-one-expression-per-line
  if (userIds.length === 1)
    return (
      <>
        {u1Jsx} is {actionStr}
      </>
    );

  const u2Jsx = <span className="text-bg">{getUserJSX(userIds[1])}</span>;
  // eslint-disable-next-line react/jsx-one-expression-per-line
  if (userIds.length === 2)
    return (
      <>
        {u1Jsx} and {u2Jsx} are {actionStr}
      </>
    );

  const u3Jsx = <span className="text-bg">{getUserJSX(userIds[2])}</span>;
  if (userIds.length === 3) {
    // eslint-disable-next-line react/jsx-one-expression-per-line
    return (
      <>
        {u1Jsx}, {u2Jsx} and {u3Jsx} are {actionStr}
      </>
    );
  }

  const othersCount = userIds.length - MAX_VISIBLE_COUNT;
  // eslint-disable-next-line react/jsx-one-expression-per-line
  return (
    <>
      {u1Jsx}, {u2Jsx}, {u3Jsx} and {othersCount} others are {actionStr}
    </>
  );
}

export function getUserEventType(mEvent) {
  const tJSXMsgs = getTimelineJSXMessages();

  const type = mEvent.getType();
  const content = mEvent.getContent();
  const prevContent = mEvent.getPrevContent();

  const sender = mEvent.getSender();
  const senderName = getUsername(sender);

  if (type !== 'm.room.pinned_events') {
    switch (content.membership) {
      // Invite
      case 'invite':
        return 'invite';
      // Ban
      case 'ban':
        return 'ban';

      // User events
      case 'join':
        if (prevContent.membership === 'join') {
          if (content.displayname !== prevContent.displayname) {
            // Name removed
            if (typeof content.displayname === 'undefined') return 'nameRemoved';
            // New name
            if (typeof prevContent.displayname === 'undefined') return 'nameSets';
            // Name changed
            return 'nameChanged';
          }
          if (content.avatar_url !== prevContent.avatar_url) {
            // Avatar removed
            if (typeof content.avatar_url === 'undefined') return 'avatarRemoved';
            // Avatar set
            if (typeof prevContent.avatar_url === 'undefined') return 'avatarSets';
            // Avatar changed
            return 'avatarChanged';
          }
          // What?
          return null;
        }
        // New join event
        return 'join';

      // Leave Events
      case 'leave':
        // Made by user
        if (sender === mEvent.getStateKey()) {
          switch (prevContent.membership) {
            // Reject Invite
            case 'invite':
              return 'rejectInvite';
            // Leave Message
            default:
              return 'leave';
          }
        }
        // Other
        switch (prevContent.membership) {
          // Cancel Invite
          case 'invite':
            return 'cancelInvite';
          // Ban?
          case 'ban':
            return 'unban';
          // sender is not target and made the target leave,
          // if not from invite/ban then this is a kick
          default:
            return 'kick';
        }

      // Nothing
      default:
        return null;
    }
  }
}

// User Events
const makeReturnObj = (variant, content) => ({
  variant,
  content,
});

export const userEventsMessage = {
  // Invite
  invite: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    const userName = getUsername(mEvent.getStateKey());
    return makeReturnObj(
      'invite',
      getTimelineJSXMessages().invite(date, senderName, userName, eventId),
    );
  },

  // Ban
  ban: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    const userName = getUsername(mEvent.getStateKey());
    return makeReturnObj(
      'leave',
      getTimelineJSXMessages().ban(date, senderName, userName, content.reason, eventId),
    );
  },

  // Name removed
  nameRemoved: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const sender = mEvent.getSender();
    const prevContent = mEvent.getPrevContent();
    return makeReturnObj(
      date,
      'avatar',
      getTimelineJSXMessages().nameRemoved(date, sender, prevContent.displayname, eventId),
    );
  },

  // New name
  nameSets: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    const sender = mEvent.getSender();
    return makeReturnObj(
      date,
      'avatar',
      getTimelineJSXMessages().nameSets(date, sender, content.displayname, eventId),
    );
  },

  // Name changed
  nameChanged: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    const prevContent = mEvent.getPrevContent();
    return makeReturnObj(
      'avatar',
      getTimelineJSXMessages().nameChanged(
        date,
        prevContent.displayname,
        content.displayname,
        eventId,
      ),
    );
  },

  // Avatar removed
  avatarRemoved: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    return makeReturnObj(
      'avatar',
      getTimelineJSXMessages().avatarRemoved(date, content.displayname, eventId),
    );
  },

  // Avatar set
  avatarSets: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    return makeReturnObj(
      'avatar',
      getTimelineJSXMessages().avatarSets(date, content.displayname, eventId),
    );
  },

  // Avatar changed
  avatarChanged: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    return makeReturnObj(
      'avatar',
      getTimelineJSXMessages().avatarChanged(date, content.displayname, eventId),
    );
  },

  // New join event
  join: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    return makeReturnObj('join', getTimelineJSXMessages().join(eventMoment, senderName, eventId));
  },

  // Reject Invite
  rejectInvite: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    return makeReturnObj(
      'invite-cancel',
      getTimelineJSXMessages().rejectInvite(date, senderName, eventId),
    );
  },

  // Leave Message
  leave: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    return makeReturnObj(
      'leave',
      getTimelineJSXMessages().leave(eventMoment, senderName, content.reason, eventId),
    );
  },

  // Cancel Invite
  cancelInvite: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    const userName = getUsername(mEvent.getStateKey());
    return makeReturnObj(
      'invite-cancel',
      getTimelineJSXMessages().cancelInvite(date, senderName, userName, eventId),
    );
  },

  // Uban
  unban: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    const userName = getUsername(mEvent.getStateKey());
    return makeReturnObj(
      'other',
      getTimelineJSXMessages().unban(date, senderName, userName, eventId),
    );
  },

  // Kick
  kick: (mEvent) => {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
    const eventId = mEvent.getId();
    const content = mEvent.getContent();
    const sender = mEvent.getSender();
    const senderName = getUsername(sender);
    const userName = getUsername(mEvent.getStateKey());
    return makeReturnObj(
      'leave',
      getTimelineJSXMessages().kick(date, senderName, userName, content.reason, eventId),
    );
  },
};

function parseTimelineChange(mEvent) {
  const appearanceSettings = getAppearance();
  const mx = initMatrix.matrixClient;
  const type = mEvent.getType();

  if (type !== 'm.room.pinned_events') {
    const userEventType = getUserEventType(mEvent);
    if (typeof userEventsMessage[userEventType] === 'function')
      return userEventsMessage[userEventType](mEvent);
    else return null;
  }

  // Pin Messages
  if (typeof mEvent.getStateKey() === 'string') {
    const eventMoment = moment(mEvent.getDate());
    const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;

    const eventId = mEvent.getId();
    const content = mEvent.getContent();

    const sender = mEvent.getSender();
    const senderName = getUsername(sender);

    const comparedPinMessages = comparePinEvents(content, mEvent.getPrevContent());

    if (
      (comparedPinMessages.added.length > 0 && !appearanceSettings.hidePinMessageEvents) ||
      (comparedPinMessages.removed.length > 0 && !appearanceSettings.hideUnpinMessageEvents)
    ) {
      const tJSXMsgs = getTimelineJSXMessages();
      return makeReturnObj(
        `pinned-events-${comparedPinMessages.added.length > 0 ? 'added' : 'removed'}`,
        tJSXMsgs.pinnedEvents(
          date,
          senderName,
          comparedPinMessages,
          mx.getRoom(mEvent.getRoomId()),
          eventId,
        ),
      );
    }

    return null;
  }

  // Nothing
  return null;
}

export { getTimelineJSXMessages, getUsersActionJsx, parseTimelineChange };
