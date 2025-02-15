import TimelineCacheTmItem from './TimelineCacheTmItem';

class TimelineCacheBase extends TimelineCacheTmItem {
  constructor() {
    super();
    this.cache = {};
  }

  // Get cache id
  getCacheId(roomId, threadId) {
    return `${roomId}${threadId ? `:${threadId}` : ''}`;
  }

  consoleTag(roomId, threadId) {
    return `[timeline] [${roomId}]${threadId ? ` [${threadId}]` : ''}`;
  }

  // Page
  getPage(roomId, threadId) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) return this.cache[valueId].page;
    return null;
  }

  setPage(roomId, threadId, value) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) this.cache[valueId].page = typeof value === 'number' ? value : NaN;
  }

  getPages(roomId, threadId) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) this.cache[valueId].pages;
    return null;
  }

  setPages(roomId, threadId, value) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) this.cache[valueId].pages = typeof value === 'number' ? value : NaN;
  }

  addPageValue(roomId, threadId, value) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) {
      if (typeof value === 'undefined' || value === null) this.cache[valueId].page++;
      else if (!Number.isNaN(value)) this.cache[valueId].page += value;
      else this.cache[valueId].page = NaN;
    }
  }

  subPageValue(roomId, threadId, value) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) {
      if (typeof value === 'undefined' || value === null) this.cache[valueId].page--;
      else if (!Number.isNaN(value)) this.cache[valueId].page -= value;
      else this.cache[valueId].page = NaN;
    }
  }

  // Create
  createData(roomId, threadId) {
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
      eventsQueue: { data: [], busy: 0 },
    };
    return this.cache[roomId];
  }

  // Get
  getData(roomId, threadId, forceCreate = false) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) return this.cache[valueId];
    else if (forceCreate) return this.createData(roomId, threadId);
    return null;
  }

  deleteData(roomId, threadId) {
    const valueId = this.getCacheId(roomId, threadId);
    if (this.cache[valueId]) {
      delete this.cache[valueId];
      return true;
    }
    return false;
  }

  // Reset
  resetData() {
    for (const valueId in this.cache) {
      this.deleteData(valueId);
    }
  }
}

export default TimelineCacheBase;
