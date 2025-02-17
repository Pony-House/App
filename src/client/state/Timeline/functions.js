import { EventTimeline } from 'matrix-js-sdk';
import attemptDecryption from '@src/util/libs/attemptDecryption';
import cons from '../cons';

import settings from '../settings';

export const setEventTimeline = async (roomTimeline, eId) => {
  if (typeof eId === 'string') {
    if (!roomTimeline.initialized) {
      roomTimeline.syncTimeline();
      await roomTimeline.waitFirstSync();
    }

    const isLoaded = await roomTimeline.loadEventTimeline(eId);
    if (isLoaded) return;
    // if eventTimeline failed to load,
    // we will load live timeline as fallback.
  }
  roomTimeline.loadLiveTimeline();
};

export function isEdited(mEvent) {
  return mEvent.getRelation()?.rel_type === 'm.replace';
}

export function isReaction(mEvent) {
  return mEvent.getType() === 'm.reaction';
}

// Decrypt Timeline Events
export function decryptAllEventsOfTimeline(eventTimeline) {
  const decryptionPromises = eventTimeline
    .getEvents()
    // .filter((event) => event.shouldAttemptDecryption())
    .filter((event) => event.isEncrypted() && !event.clearEvent)
    .reverse()
    .map((event) => attemptDecryption.exec(event, { isRetry: true }));

  return Promise.allSettled(decryptionPromises);
}

export function clearTimeline(tm, keepLastEvent = false) {
  const events = tm.getEvents();
  const eventsId = [];
  for (const item in events) {
    const i = Number(item);
    if ((i > 0 && i < events.length - 1) || !keepLastEvent) eventsId.push(events[item].getId());
  }

  for (const item in eventsId) {
    tm.removeEvent(eventsId[item]);
  }
}

export function hideMemberEvents(mEvent) {
  const content = mEvent.getContent();
  const prevContent = mEvent.getPrevContent();
  const { membership } = content;
  if (settings.hideMembershipEvents) {
    if (membership === 'invite' || membership === 'ban' || membership === 'leave') return true;
    if (prevContent.membership !== 'join') return true;
  }
  if (settings.hideNickAvatarEvents) {
    if (membership === 'join' && prevContent.membership === 'join') return true;
  }
  return false;
}

export function getRelateToId(mEvent) {
  const relation = mEvent.getRelation();
  return relation && (relation.event_id ?? null);
}

export function getFirstLinkedTimeline(timeline) {
  let prevTimeline = timeline;
  let tm = prevTimeline;
  while (prevTimeline) {
    tm = prevTimeline;
    prevTimeline = prevTimeline.getNeighbouringTimeline(EventTimeline.BACKWARDS);
  }
  return tm;
}
export function getLastLinkedTimeline(timeline) {
  let nextTimeline = timeline;
  let tm = nextTimeline;
  while (nextTimeline) {
    tm = nextTimeline;
    nextTimeline = nextTimeline.getNeighbouringTimeline(EventTimeline.FORWARDS);
  }
  return tm;
}

export const getClientYjs = (updateInfo, callback) => {
  if (Array.isArray(updateInfo.structs) && updateInfo.structs.length > 0) {
    for (const item in updateInfo.structs) {
      const struct = updateInfo.structs[item];
      callback({ value: struct, key: struct.id.client }, 'structs');
    }
  }

  if (updateInfo.ds && objType(updateInfo.ds.clients, 'map')) {
    updateInfo.ds.clients.forEach((value, key) => {
      callback({ value, key }, 'deleted');
    });
  }
};

export const enableyJsItem = {
  convertToString: (update) => btoa(update.toString()),

  action: (ydoc, type, parent) => {
    if (typeof enableyJsItem.types[type] === 'function') {
      return enableyJsItem.types[type](ydoc, parent);
    }
  },

  constructorToString: (parent) =>
    String(
      parent.constructor.name.startsWith('_')
        ? parent.constructor.name.substring(1)
        : parent.constructor.name,
    ).toLocaleLowerCase(),

  types: {
    ymap: (ydoc, parent) => ydoc.getMap(parent),
    ytext: (ydoc, parent) => ydoc.getText(parent),
    yarray: (ydoc, parent) => ydoc.getArray(parent),
  },

  convertToJson: {
    ymap: (data) => data.toJSON(),
    ytext: (data) => data.toString(),
    yarray: (data) => data.toArray(),
  },
};

// Get User renders
export const getEventReaders = (room, liveTimeline, theEvent) => {
  const lTime = liveTimeline || room.getLiveTimeline();
  const liveEvents = lTime.getEvents();
  const mEvent = room.findEventById(theEvent.getId()) || theEvent;

  const readers = [];
  if (!mEvent) return [];

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    readers.splice(readers.length, 0, ...room.getUsersReadUpTo(liveEvents[i]));
    if (mEvent === liveEvents[i]) break;
  }

  return [...new Set(readers)];
};

export const getLiveReaders = (room, liveTimeline) => {
  const lTime = liveTimeline || room.getLiveTimeline();

  const liveEvents = lTime.getEvents();
  const getLatestVisibleEvent = () => {
    for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
      const mEvent = liveEvents[i];
      if (mEvent.getType() === 'm.room.member' && hideMemberEvents(mEvent)) {
        continue;
      }

      if (
        !mEvent.isRedacted() &&
        !isReaction(mEvent) &&
        !isEdited(mEvent) &&
        cons.supportEventTypes.includes(mEvent.getType())
      ) {
        return mEvent;
      }
    }

    return liveEvents[liveEvents.length - 1];
  };

  return getEventReaders(room, lTime, getLatestVisibleEvent());
};
