import moment from '@src/util/libs/momentjs';
import { getUsername } from '../../../util/matrixUtil';

import PinnedEventsMessage from './chat-messages/PinnedEventsMessage';

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

export function getTimelineJSXMessages() {
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

// User Events
export const makeReturnObj = (variant, content) => ({
  variant,
  content,
});

export const memberEventsMessage = {
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
