const TimelineCacheEvents = {};

TimelineCacheEvents.EventRedaction = 'Event.Redaction';
TimelineCacheEvents.Event = 'Event';

TimelineCacheEvents.PagesUpdated = 'Pages.Updated';

TimelineCacheEvents.SelectedEvent = 'Timeline.SelectedEvent';
TimelineCacheEvents.GetThread = 'Timeline.GetThread';

TimelineCacheEvents.TimelineInitialized = 'Timeline.Initialized';
TimelineCacheEvents.TimelineInitUpdated = 'Timeline.InitUpdated';

TimelineCacheEvents.TimelineReady = 'Timeline.Ready';

TimelineCacheEvents.insertId = (eventName, roomId, threadId) =>
  `${typeof TimelineCacheEvents[eventName] === 'string' ? TimelineCacheEvents[eventName] : 'NULL'}:${roomId}${threadId ? `:${threadId}` : ''}`;

export default TimelineCacheEvents;
