const threadsCache = {};

export const createThreadsCache = (roomId, newData) => {
  threadsCache[roomId] = newData;
};

export const getThreadsCache = (roomId) => {
  if (threadsCache[roomId]) return threadsCache[roomId];
  return null;
};

export const delThreadsCache = (roomId) => {
  if (threadsCache[roomId]) {
    delete threadsCache[roomId];
    return true;
  }
  return false;
};

export const resetThreadsCache = () => {
  for (const roomId in threadsCache) {
    delThreadsCache(roomId);
  }
};

const timelineCache = {};

export const createTimelineCache = (roomId, threadId) => {
  timelineCache[`${roomId}${threadId ? `:${threadId}` : ''}`] = {
    timeline: [],
    page: 0,
    pages: 0,
    lastEvent: null,
    threadId,
    roomId,
    editedTimeline: new Map(),
    reactionTimeline: new Map(),
    reactionTimelineTs: {},
  };
  return timelineCache[roomId];
};

export const getTimelineCache = (valueId, forceCreate = false, roomId = null, threadId = null) => {
  if (timelineCache[valueId]) return timelineCache[valueId];
  else if (forceCreate) return createTimelineCache(roomId, threadId);
  return null;
};

export const delTimelineCache = (valueId) => {
  if (timelineCache[valueId]) {
    delete timelineCache[valueId];
    return true;
  }
  return false;
};

export const resetTimelineCache = () => {
  for (const valueId in timelineCache) {
    delTimelineCache(valueId);
  }
};
