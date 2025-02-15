import { getRelateToId } from '@src/client/state/Timeline/functions';
import tinyConsole from '../../console';
import storageManager from '../StorageManager';
import TimelineCachePagination from './TimelineCachePagination';

class TimelineCacheReactions extends TimelineCachePagination {
  async insertReactions(roomId, threadId, newEvent) {
    // Get event list
    const queryEvents = [];
    const queryEvents2 = [];
    if (!Array.isArray(newEvent)) {
      queryEvents.push(newEvent.getId());
      queryEvents2.push(newEvent);
    } else
      for (const item in newEvent) {
        queryEvents.push(newEvent[item].getId());
        queryEvents2.push(newEvent[item]);
      }

    // Get reaction events
    const reactions = await storageManager.getReactions(
      this.buildPagination(roomId, threadId, { limit: NaN, targetId: queryEvents }),
    );

    // Insert reactions
    const result = [];
    for (const item in reactions) {
      result.push({
        data: this.insertReaction(roomId, threadId, reactions[item]),
        mEvent: reactions[item],
      });
    }
    return result;
  }

  // Get Reaction Timeline
  getReactionTimeline(roomId, threadId, mEvent) {
    const tmCache = this.getData(roomId, threadId);
    // Get relate to id
    const relateToId = getRelateToId(mEvent);

    // Nothing
    if (relateToId === null) return { mEvents: null, mEventId: null, tsId: null };

    // Create data
    if (!tmCache.reactionTimeline.has(relateToId)) tmCache.reactionTimeline.set(relateToId, []);

    // Complete
    const mEvents = tmCache.reactionTimeline.get(relateToId);
    return { mEvents, relateToId, tsId: `${relateToId}:${mEvent.getId()}` };
  }

  // Insert Reaction
  insertReaction(roomId, threadId, mEvent) {
    const tmCache = this.getData(roomId, threadId);
    // Is Redacted
    const isRedacted = mEvent.isRedacted();
    if (!isRedacted) {
      // Get data
      const { mEvents, tsId } = this.getReactionTimeline(roomId, threadId, mEvent);
      const ts = mEvent.getTs();
      if (
        mEvents &&
        (typeof tmCache.reactionTimelineTs[tsId] !== 'number' ||
          ts > tmCache.reactionTimelineTs[tsId])
      ) {
        // Exist event
        if (mEvents.find((ev) => ev.getId() === mEvent.getId())) return;

        // Complete
        tinyConsole.log(`${this.consoleTag(roomId, threadId)} New reaction: ${mEvent.getId()}`, ts);
        mEvents.push(mEvent);
        tmCache.reactionTimelineTs[tsId] = ts;

        // Callback
        return { inserted: true, deleted: false };
      }
    } else return this.removeReaction(roomId, threadId, mEvent);
    return null;
  }

  // Remove Reaction
  removeReaction(roomId, threadId, mEvent) {
    const tmCache = this.getData(roomId, threadId);
    // Is Redacted
    const isRedacted = mEvent.isRedacted();
    if (isRedacted) {
      // Get Data
      const { mEvents, relateToId, tsId } = this.getReactionTimeline(roomId, threadId, mEvent);
      const ts = mEvent.getTs();
      if (
        mEvents &&
        (typeof tmCache.reactionTimelineTs[tsId] !== 'number' ||
          ts > tmCache.reactionTimelineTs[tsId])
      ) {
        // Exist event
        const index = mEvents.find((ev) => ev.getId() === mEvent.getId());
        if (index > -1) {
          mEvent.forceRedaction();

          // Complete
          tinyConsole.log(
            `${this.consoleTag(roomId, threadId)} Reaction removed (2): ${mEvent.getId()}`,
            ts,
          );
          mEvents.splice(index, 1);
          if (mEvents.length < 1) tmCache.reactionTimeline.delete(relateToId);

          tmCache.reactionTimelineTs[tsId] = ts;

          // Callback
          return { inserted: false, deleted: true };
        }
      }
    }
    return null;
  }
}

export default TimelineCacheReactions;
