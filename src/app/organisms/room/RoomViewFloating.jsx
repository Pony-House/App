import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';
import { RoomMemberEvent } from 'matrix-js-sdk';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import { markAsRead } from '../../../client/action/notifications';

import Button from '../../atoms/button/Button';

import { getUsersActionJsx } from './common';
import urlParams from '../../../util/libs/urlParams';

function useJumpToEvent(roomTimeline) {
  const [eventId, setEventId] = useState(null);

  const jumpToEvent = () => {
    roomTimeline.loadEventTimeline(eventId);
  };

  const cancelJumpToEvent = () => {
    markAsRead(roomTimeline.roomId, roomTimeline.threadId);
    setEventId(null);
  };

  useEffect(() => {
    const readEventId = roomTimeline.getReadUpToEventId();
    // we only show "Jump to unread" btn only if the event is not in timeline.
    // if event is in timeline
    // we will automatically open the timeline from that event position
    if (!readEventId?.startsWith('~') && !roomTimeline.hasEventInTimeline(readEventId)) {
      setEventId(readEventId);
    }

    const { notifications } = initMatrix;
    const handleMarkAsRead = () => setEventId(null);
    if (notifications) notifications.on(cons.events.notifications.FULL_READ, handleMarkAsRead);

    return () => {
      if (notifications)
        notifications.removeListener(cons.events.notifications.FULL_READ, handleMarkAsRead);
      setEventId(null);
    };
  }, [roomTimeline]);

  return [!!eventId, jumpToEvent, cancelJumpToEvent];
}

function useTypingMembers(roomTimeline) {
  const [typingMembers, setTypingMembers] = useState(new Set());
  const mx = initMatrix.matrixClient;

  const updateTyping = (members) => {
    members.delete(mx.getUserId());
    setTypingMembers(members);
  };

  useEffect(() => {
    setTypingMembers(new Set());
    const listenTypingEvent = (event, member) => {
      if (member.roomId !== this.roomId) return;
      // const isTyping = member.typing;
      // if (isTyping) typingMembers.add(member.userId);
      // else typingMembers.delete(member.userId);
      updateTyping(new Set([...this.typingMembers]));
    };

    mx.on(RoomMemberEvent.Typing, listenTypingEvent);
    return () => {
      mx.off(RoomMemberEvent.Typing, listenTypingEvent);
    };
  }, [roomTimeline]);

  return [typingMembers];
}

function useScrollToBottom(roomTimeline) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const handleAtBottom = (atBottom) => setIsAtBottom(atBottom);

  useEffect(() => {
    setIsAtBottom(true);
    roomTimeline.on(cons.events.roomTimeline.AT_BOTTOM, handleAtBottom);
    return () => roomTimeline.removeListener(cons.events.roomTimeline.AT_BOTTOM, handleAtBottom);
  }, [roomTimeline]);

  return [isAtBottom, setIsAtBottom];
}

function RoomViewFloating({ roomId, roomTimeline, refRoomInput, refcmdInput }) {
  const [isJumpToEvent, jumpToEvent, cancelJumpToEvent] = useJumpToEvent(roomTimeline);
  const [typingMembers] = useTypingMembers(roomTimeline);
  const [isAtBottom, setIsAtBottom] = useScrollToBottom(roomTimeline);

  const handleScrollToBottom = () => {
    roomTimeline.emit(cons.events.roomTimeline.SCROLL_TO_LIVE);
    urlParams.delete('event_id');
    setIsAtBottom(true);
  };

  const roomInput = $(refRoomInput.current);
  const cmdInput = $(refcmdInput.current);

  roomInput.removeClass('textarea-user-typing');
  cmdInput.removeClass('cmd-user-typing');

  if (typingMembers.size > 0) {
    roomInput.addClass('textarea-user-typing');
    cmdInput.addClass('cmd-user-typing');
  }

  return (
    <>
      <div
        className={`room-view__unread ${isJumpToEvent ? 'room-view__unread--open' : ''}${typeof roomTimeline.threadId === 'string' && roomTimeline.threadId.length > 0 && roomTimeline.timeline.length <= 1 ? ' d-none' : ''}`}
      >
        <Button faSrc="bi bi-chat-left-text-fill" onClick={jumpToEvent} variant="primary">
          <div className="very-small text-gray text-medium">Jump to unread messages</div>
        </Button>
        <Button faSrc="fa-solid fa-check-double" onClick={cancelJumpToEvent} variant="primary">
          <div className="very-small text-gray">
            <strong>Mark as read</strong>
          </div>
        </Button>
      </div>
      <div
        className={`room-view__typing${typingMembers.size > 0 ? ' room-view__typing--open' : ''}`}
      >
        <div className="ms-3 bouncing-loader">
          <div />
        </div>
        <div className="ms-2 mt-1 mb-2 small emoji-size-fix">
          {getUsersActionJsx(roomId, [...typingMembers], 'typing...')}
        </div>
      </div>
      <div className={`room-view__STB${isAtBottom ? '' : ' room-view__STB--open'}`}>
        <Button faSrc="bi bi-chat-left-fill" onClick={handleScrollToBottom}>
          <div className="very-small text-gray text-medium">Jump to latest</div>
        </Button>
      </div>
    </>
  );
}
RoomViewFloating.propTypes = {
  roomId: PropTypes.string.isRequired,
  roomTimeline: PropTypes.shape({}).isRequired,
};

export default RoomViewFloating;
