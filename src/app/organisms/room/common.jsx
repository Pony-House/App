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

function parseTimelineChange(mEvent) {
  const tJSXMsgs = getTimelineJSXMessages();
  const makeReturnObj = (variant, content) => ({
    variant,
    content,
  });

  const appearanceSettings = getAppearance();
  const mx = initMatrix.matrixClient;

  const eventMoment = moment(mEvent.getDate());
  const eventId = mEvent.getId();

  const type = mEvent.getType();
  const date = eventMoment.isValid() ? eventMoment.valueOf() || 0 : 0;
  const content = mEvent.getContent();
  const prevContent = mEvent.getPrevContent();
  const sender = mEvent.getSender();
  const senderName = getUsername(sender);
  const userName = getUsername(mEvent.getStateKey());

  if (type !== 'm.room.pinned_events') {
    switch (content.membership) {
      case 'invite':
        return makeReturnObj('invite', tJSXMsgs.invite(date, senderName, userName, eventId));
      case 'ban':
        return makeReturnObj(
          'leave',
          tJSXMsgs.ban(date, senderName, userName, content.reason, eventId),
        );

      case 'join':
        if (prevContent.membership === 'join') {
          if (content.displayname !== prevContent.displayname) {
            if (typeof content.displayname === 'undefined')
              return makeReturnObj(
                date,
                'avatar',
                tJSXMsgs.nameRemoved(date, sender, prevContent.displayname, eventId),
              );
            if (typeof prevContent.displayname === 'undefined')
              return makeReturnObj(
                date,
                'avatar',
                tJSXMsgs.nameSets(date, sender, content.displayname, eventId),
              );
            return makeReturnObj(
              'avatar',
              tJSXMsgs.nameChanged(date, prevContent.displayname, content.displayname, eventId),
            );
          }
          if (content.avatar_url !== prevContent.avatar_url) {
            if (typeof content.avatar_url === 'undefined')
              return makeReturnObj(
                'avatar',
                tJSXMsgs.avatarRemoved(date, content.displayname, eventId),
              );
            if (typeof prevContent.avatar_url === 'undefined')
              return makeReturnObj(
                'avatar',
                tJSXMsgs.avatarSets(date, content.displayname, eventId),
              );
            return makeReturnObj(
              'avatar',
              tJSXMsgs.avatarChanged(date, content.displayname, eventId),
            );
          }
          return null;
        }
        return makeReturnObj('join', tJSXMsgs.join(eventMoment, senderName, eventId));

      case 'leave':
        if (sender === mEvent.getStateKey()) {
          switch (prevContent.membership) {
            case 'invite':
              return makeReturnObj(
                'invite-cancel',
                tJSXMsgs.rejectInvite(date, senderName, eventId),
              );
            default:
              return makeReturnObj(
                'leave',
                tJSXMsgs.leave(eventMoment, senderName, content.reason, eventId),
              );
          }
        }
        switch (prevContent.membership) {
          case 'invite':
            return makeReturnObj(
              'invite-cancel',
              tJSXMsgs.cancelInvite(date, senderName, userName, eventId),
            );
          case 'ban':
            return makeReturnObj('other', tJSXMsgs.unban(date, senderName, userName, eventId));
          // sender is not target and made the target leave,
          // if not from invite/ban then this is a kick
          default:
            return makeReturnObj(
              'leave',
              tJSXMsgs.kick(date, senderName, userName, content.reason, eventId),
            );
        }

      default:
        return null;
    }
  }

  // Pin Messages
  if (typeof mEvent.getStateKey() === 'string') {
    const comparedPinMessages = comparePinEvents(content, mEvent.getPrevContent());

    if (
      (comparedPinMessages.added.length > 0 && !appearanceSettings.hidePinMessageEvents) ||
      (comparedPinMessages.removed.length > 0 && !appearanceSettings.hideUnpinMessageEvents)
    ) {
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
