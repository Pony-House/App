import cons from '@src/client/state/cons';
import { getAppearance } from '../appearance';

// Thread Cache
class ThreadsCache {
  constructor() {
    this.cache = {};
  }

  // Create
  create(roomId, newData) {
    this.cache[roomId] = newData;
  }

  // Get
  get(roomId) {
    if (this.cache[roomId]) return this.cache[roomId];
    return null;
  }

  // Delete
  delete(roomId) {
    if (this.cache[roomId]) {
      delete this.cache[roomId];
      return true;
    }
    return false;
  }

  // Reset
  reset() {
    for (const roomId in threadsCache) {
      this.delete(roomId);
    }
  }
}

export const threadsCache = new ThreadsCache();

// Timeline cache
class TimelineCache {
  constructor() {
    this.cache = {};
  }

  getCacheId(roomId, threadId) {
    return `${roomId}${threadId ? `:${threadId}` : ''}`;
  }

  // Create
  create(roomId, threadId) {
    this.cache[this.getCacheId(roomId, threadId)] = {
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
    return this.cache[roomId];
  }

  // Get
  get(roomId, threadId, forceCreate = false) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) return this.cache[valueId];
    else if (forceCreate) return this.create(roomId, threadId);
    return null;
  }

  // Update Item
  async updateItem(mEvent, tmc, removeEventCallback, forceAdd) {
    // Get info
    const pageLimit = getAppearance('pageLimit');
    const eventTs = mEvent.getTs();
    if (
      // Is page 1
      (tmc.page < 2 || forceAdd) &&
      // Exist?
      !mEvent.isRedacted() &&
      // More validation
      cons.supportEventTypes.indexOf(mEvent.getType()) > -1 &&
      // Timeline limit or by event time?
      (tmc.timeline.length < pageLimit || eventTs > tmc.timeline[0].getTs())
    ) {
      // Update last event
      const eventId = mEvent.getId();
      if (!tmc.lastEvent || eventTs > tmc.lastEvent.getTs()) tmc.lastEvent = mEvent;

      // Insert event
      const msgIndex = tmc.timeline.findIndex((item) => item.getId() === eventId);
      if (msgIndex < 0) {
        // Check thread
        if (
          mEvent.thread &&
          typeof mEvent.thread.fetch === 'function' &&
          !mEvent.thread.initialized
        )
          await mEvent.thread.fetch();

        // Add event
        //////////////////////////////////////////
        tmc.timeline.push(mEvent);
        if (tmc.timeline.length > pageLimit) {
          // Remove event
          const removedEvent = tmc.timeline.shift();
          if (typeof removeEventCallback === 'function') await removeEventCallback(removedEvent);
        }

        // Sort list
        tmc.timeline.sort((a, b) => a.getTs() - b.getTs());
      } else tmc.timeline[msgIndex] = mEvent;

      // Complete
      return true;
    } else return false;
  }

  // Delete
  deleteItem(roomId, threadId, eventId) {
    const valueId = this.getCacheId(roomId, threadId);
    const timelineCache = this.get(valueId);
    if (timelineCache) {
      const i = timelineCache.timeline.findIndex((mEvent) => mEvent.getId() === eventId);
      if (i < 0) return undefined;
      return timelineCache.timeline.splice(i, 1)[0];
    }
    return undefined;
  }

  delete(roomId, threadId) {
    const valueId = this.getCacheId(roomId, threadId);
    if (timelineCache[valueId]) {
      delete timelineCache[valueId];
      return true;
    }
    return false;
  }

  // Reset
  reset() {
    for (const valueId in timelineCache) {
      this.delete(valueId);
    }
  }
}

export const timelineCache = new TimelineCache();
