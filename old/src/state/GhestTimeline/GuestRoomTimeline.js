export const buildRoomTimeline = (tinyThis) => {
  // Load Guest timeline
  tinyThis.loadGuestTimeline = () => {
    tinyThis.room.refreshLiveTimeline().then(() => {
      // Insert guest timeline
      tinyThis.liveTimeline = tinyThis.room.getLiveTimeline();
      tinyThis.activeTimeline = tinyThis.liveTimeline;

      // Update room info to RoomViewHeader.jsx
      updateRoomInfo();

      // Read Timeline
      if (objType(tinyThis.liveTimeline, 'object') && Array.isArray(tinyThis.liveTimeline.events)) {
        for (const item in tinyThis.liveTimeline.events) {
          // Anti Repeat
          let repeated = false;
          if (
            tinyThis.timeline.find(
              (event) =>
                typeof event.getId === 'function' &&
                typeof tinyThis.liveTimeline.events[item].getId === 'function' &&
                event.getId() === tinyThis.liveTimeline.events[item].getId(),
            )
          ) {
            repeated = true;
          }

          // Send events
          if (!repeated) {
            const event = tinyThis.liveTimeline.events[item];
            tinyThis.matrixClient.emit(RoomEvent.Timeline, event, tinyThis.room, true, false, {
              liveEvent: true,
              timeline: tinyThis.liveTimeline,
            });
          }
        }
      }
    });
  };

  // First load
  tinyThis._reset().then(() => {
    tinyThis.loadGuestTimeline();
  });
};

export const startRoomTimelineRefresh = (tinyThis) => {
  if (tinyThis.isGuest && typeof tinyThis.refreshTime === 'number' && tinyThis.refreshTime > 0) {
    tinyThis.refreshTimelineInterval = setInterval(
      () => tinyThis.loadGuestTimeline(),
      60000 * tinyThis.refreshTime,
    );
  }
};
