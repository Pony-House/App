import React from 'react';

import { twemojifyReact } from '../../../util/twemojify';
import { getAppearance } from '../../../util/libs/appearance';

import initMatrix from '../../../client/initMatrix';
import { getUsername, getUsernameOfRoomMember } from '../../../util/matrixUtil';

import { comparePinEvents } from './chat-messages/PinnedEventsMessage';
import moment from '@src/util/libs/momentjs';

import { getTimelineJSXMessages, makeReturnObj, memberEventsMessage } from './MemberEvents';
import getMemberEventType from './getMemberEventType';

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
  const appearanceSettings = getAppearance();
  const mx = initMatrix.matrixClient;
  const type = mEvent.getType();

  if (type !== 'm.room.pinned_events') {
    const memberEventType = getMemberEventType(mEvent);
    if (typeof memberEventsMessage[memberEventType] === 'function')
      return memberEventsMessage[memberEventType](mEvent);
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

export { getUsersActionJsx, parseTimelineChange };
