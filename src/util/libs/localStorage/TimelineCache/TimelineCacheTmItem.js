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

  // Delete timeline item
  deleteItem(roomId, threadId, eventId) {
    const timelineCache = this.get(roomId, threadId);
    if (timelineCache) {
      const i = timelineCache.timeline.findIndex((mEvent) => mEvent.getId() === eventId);
      if (i < 0) return undefined;
      return timelineCache.timeline.splice(i, 1)[0];
    }
    return undefined;
  }

  // Deleting places
  deletingEventPlaces(roomId, threadId, redacts) {
    const tmCache = this.get(roomId, threadId);

    // Edited Timeline
    tmCache.editedTimeline.delete(redacts);

    // Reaction Timeline
    tmCache.reactionTimeline.delete(redacts);

    // Get related id
    let relateToId = null;
    for (const item in tmCache.reactionTimelineTs) {
      if (item.endsWith(`:${redacts}`)) {
        relateToId = item.substring(0, item.length - redacts.length - 1);
        break;
      }
    }

    // Exists related id
    if (relateToId) {
      // Clear reaction timeline item
      const mEvents = tmCache.reactionTimeline.get(relateToId);
      if (mEvents) {
        const index = mEvents.findIndex((ev) => ev.getId() === redacts);
        if (index > -1) {
          const rEvent = mEvents[index];
          mEvents.splice(index, 1);
          if (mEvents.length < 1) tmCache.reactionTimeline.delete(relateToId);

          // Get new Ts update
          const ts = rEvent.getTs();
          rEvent.forceRedaction();

          // Complete
          tinyConsole.log(
            `${tmCache.consoleTag(roomId, threadId)} Reaction removed: ${redacts}`,
            ts,
          );
          tmCache.reactionTimelineTs[`${relateToId}:${redacts}`] = ts;

          // Callback
          return rEvent;
        }
      }
    }
    return null;
  }

  // Deleting events
  deletingEvent(roomId, threadId, event) {
    return this.deletingEventById(roomId, threadId, event.getContent()?.redacts);
  }

  deletingEventById(roomId, threadId, redacts) {
    const rEvent = this.deleteItem(roomId, threadId, redacts);
    this.deletingEventPlaces(roomId, threadId, redacts);
    if (rEvent) {
      rEvent.forceRedaction();
      tinyConsole.log(
        `${this.consoleTag(roomId, threadId)} Deleting event: ${rEvent.getId()}`,
        rEvent.getTs(),
      );
      return rEvent;
    }
    return null;
  }
}

export default TimelineCacheTmItem;
