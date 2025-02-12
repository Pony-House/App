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

export const createTimelineCache = (roomId) => {
  timelineCache[roomId] = {
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

export const getTimelineCache = (roomId, forceCreate = false) => {
  if (timelineCache[roomId]) return timelineCache[roomId];
  else if (forceCreate) return createTimelineCache(roomId);
  return null;
};

export const delTimelineCache = (roomId) => {
  if (timelineCache[roomId]) {
    delete timelineCache[roomId];
    return true;
  }
  return false;
};

export const resetTimelineCache = () => {
  for (const roomId in timelineCache) {
    delTimelineCache(roomId);
  }
};
