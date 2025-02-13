import TimelineCacheReactions from './TimelineCacheReactions';
import cons from '@src/client/state/cons';
import { getAppearance } from '../../appearance';

class TimelineCacheTmItem extends TimelineCacheReactions {
  constructor() {
    super();
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
}

export default TimelineCacheTmItem;
