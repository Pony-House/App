import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { RoomEvent } from 'matrix-js-sdk';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import { openReadReceipts } from '../../../client/action/navigation';

import RawIcon from '../../atoms/system-icons/RawIcon';

import { getUsersActionJsx } from '../../organisms/room/common';

function FollowingMembers({ roomTimeline }) {
  const [followingMembers, setFollowingMembers] = useState([]);
  const { roomId } = roomTimeline;
  const mx = initMatrix.matrixClient;
  const { roomsInput } = initMatrix;
  const myUserId = mx.getUserId();

  const handleOnMessageSent = () => setFollowingMembers([]);

  useEffect(() => {
    const updateFollowingMembers = () => {
      setFollowingMembers(roomTimeline.getLiveReaders());
    };
    updateFollowingMembers();

    const listenReciptEvent = (event, room) => {
      // we only process receipt for latest message here.
      if (room.roomId !== roomId) return;
      const receiptContent = event.getContent();

      const mEvents = roomTimeline.getEvents();
      const lastMEvent = mEvents[mEvents.length - 1];

      if (lastMEvent) {
        const lastEventId = lastMEvent.getId();
        const lastEventRecipt = receiptContent[lastEventId];

        if (typeof lastEventRecipt === 'undefined') return;
        if (lastEventRecipt['m.read']) {
          updateFollowingMembers();
        }
      }
    };

    mx.on(RoomEvent.Receipt, listenReciptEvent);
    if (roomsInput) roomsInput.on(cons.events.roomsInput.MESSAGE_SENT, handleOnMessageSent);
    return () => {
      mx.off(RoomEvent.Receipt, listenReciptEvent);
      if (roomsInput)
        roomsInput.removeListener(cons.events.roomsInput.MESSAGE_SENT, handleOnMessageSent);
    };
  }, [roomTimeline]);

  const filteredM = followingMembers.filter((userId) => userId !== myUserId);

  return (
    filteredM.length !== 0 && (
      <button
        className="following-members emoji-size-fix"
        onClick={() => openReadReceipts(roomId, followingMembers)}
        type="button"
      >
        <RawIcon fa="bi bi-check-all" />
        <small className="text-bg-low text-truncate">
          {getUsersActionJsx(roomId, filteredM, 'following the conversation.')}
        </small>
      </button>
    )
  );
}

FollowingMembers.propTypes = {
  roomTimeline: PropTypes.shape({}).isRequired,
};

export default FollowingMembers;
