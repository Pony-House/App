const TimelineCacheEvents = {};

TimelineCacheEvents.EventRedaction = 'Event.Redaction';
TimelineCacheEvents.Event = 'Event';

TimelineCacheEvents.insertId = (eventName, roomId, threadId) =>
  `${typeof TimelineCacheEvents[eventName] === 'string' ? TimelineCacheEvents[eventName] : 'NULL'}:${roomId}${threadId ? `:${threadId}` : ''}`;

export default TimelineCacheEvents;
