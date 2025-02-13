import TimelineCacheBase from './TimelineCache/TimelineCacheBase';

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
export const timelineCache = new TimelineCacheBase();
