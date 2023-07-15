import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import EventEmitter from 'events';

import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';

import RoomViewHeader from './RoomViewHeader';
import RoomViewContent from './RoomViewContent';
import RoomViewFloating from './RoomViewFloating';
import RoomViewInput from './RoomViewInput';
import RoomViewCmdBar from './RoomViewCmdBar';

const viewEvent = new EventEmitter();

function RoomView({ roomTimeline, eventId }) {
  const roomViewRef = useRef(null);
  const { roomId } = roomTimeline;

  useEffect(() => {
    const settingsToggle = (isVisible) => {

      const roomView = $(roomViewRef.current);
      roomView.toggleClass('room-view--dropped');

      const roomViewContent = roomView.children().eq(1);

      if (isVisible) {
        setTimeout(() => {
          if (!navigation.isRoomSettings) return;
          roomViewContent.css('visibility', 'hidden');
        }, 200);
      } else roomViewContent.css('visibility', 'visible');

    };
    navigation.on(cons.events.navigation.ROOM_SETTINGS_TOGGLED, settingsToggle);
    return () => {
      navigation.removeListener(cons.events.navigation.ROOM_SETTINGS_TOGGLED, settingsToggle);
    };
  }, []);

  return (
    <div className="room-view" ref={roomViewRef}>
      <RoomViewHeader roomId={roomId} />
      <div className="room-view__content-wrapper">
        <div className="room-view__scrollable">
          <RoomViewContent
            eventId={eventId}
            roomTimeline={roomTimeline}
          />
          <RoomViewFloating
            roomId={roomId}
            roomTimeline={roomTimeline}
          />
        </div>
        <div className="room-view__sticky">
          <RoomViewInput
            roomId={roomId}
            roomTimeline={roomTimeline}
            viewEvent={viewEvent}
          />
          <RoomViewCmdBar
            roomId={roomId}
            roomTimeline={roomTimeline}
            viewEvent={viewEvent}
          />
        </div>
      </div>
    </div>
  );
}

RoomView.defaultProps = {
  eventId: null,
};
RoomView.propTypes = {
  roomTimeline: PropTypes.shape({}).isRequired,
  eventId: PropTypes.string,
};

export default RoomView;
