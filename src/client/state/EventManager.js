import EventEmitter from 'events';
import { Direction, MatrixEvent } from 'matrix-js-sdk';
import { objType, countObj } from 'for-promise/utils/lib.mjs';

class EventManager extends EventEmitter {
  constructor(matrixClient) {
    super();
    this.matrixClient = matrixClient;
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.cache = { room: {} };
  }

  // Get
  _getEvent(tinyPath, placeId, eventId, where) {
    if (this.cache[tinyPath][placeId] && this.cache[tinyPath][placeId][where])
      return this.cache[tinyPath][placeId][where].find((event) => event.getId() === eventId);
    return null;
  }

  /* async _getEventAsync(tinyPath, placeId, eventId, where) {
    if (this.cache[tinyPath][placeId] && this.cache[tinyPath][placeId][where]) {
      const mEvent = this.cache[tinyPath][placeId][where].find((event) => event.getId() === eventId);
      if (mEvent) return mEvent;
    }
    return null;
  } */

  _getEvents(tinyPath, placeId, where) {
    if (this.cache[tinyPath][placeId] && this.cache[tinyPath][placeId][where])
      return this.cache[tinyPath][placeId][where];
    return null;
  }

  // Get Room
  getRoomEvent(roomId, eventId, where = 'main') {
    return this._getEvent('room', roomId, eventId, where);
  }

  getRoomEvents(roomId, where = 'main') {
    return this._getEvents('room', roomId, where);
  }

  // Decrypt messages (if necessary)
  _decryptEvents(chunk, ignoreCache = false) {
    // Add into cache
    const addIntoCache = (mEvent) => {
      if (!ignoreCache) {
        const roomId = mEvent.getRoomId();
        const eventId = mEvent.getId();
        if (typeof roomId === 'string' && typeof eventId === 'string') {
          // Add cache values
          if (!this.cache.room[roomId]) this.cache.room[roomId] = {};

          const where = 'main';
          if (!Array.isArray(this.cache.room[roomId][where])) this.cache.room[roomId][where] = [];

          // Add value
          if (this.cache.room[roomId][where].findIndex((event) => event.getId() === eventId) < 0) {
            this.cache.room[roomId][where].push(mEvent);
            this.cache.room[roomId][where].sort((a, b) => b.getTs() - a.getTs());
          }
        }
      }
    };

    // Read events
    return Promise.all(
      chunk.map(async (event) => {
        // New Matrix Event
        const mEvent = new MatrixEvent(event);

        // Is Encrypted
        if (mEvent.getType() === 'm.room.encrypted') {
          try {
            // Decrypt
            const decrypted = await this.matrixClient.getCrypto().decryptEvent(mEvent);
            if (objType(decrypted, 'object')) {
              if (objType(decrypted.clearEvent, 'object')) mEvent.clearEvent = decrypted.clearEvent;
              addIntoCache(mEvent);
              this.emit('decryptedEvent', mEvent, decrypted);
              return { mEvent, decrypt: decrypted };
            }
            // Fail
            else {
              addIntoCache(mEvent);
              this.emit('event', mEvent);
              return { mEvent };
            }
          } catch (err) {
            // Error
            addIntoCache(mEvent);
            this.emit('errorDecryptedEvent', mEvent, err);
            return { mEvent, err };
          }
        }

        // Normal Event
        addIntoCache(mEvent);
        this.emit('event', mEvent);
        return { mEvent };
      }),
    );
  }

  // Fetch events
  async fetchEvents(
    ops = {
      dir: Direction.Backward,
      limit: 10,
      filter: null,
      fromToken: null,
      roomId: null,
      relType: null,
      eventId: null,
      filesOnly: false,
      ignoreCache: false,
    },
  ) {
    // Request parameters
    const params = {
      dir: typeof ops.dir === 'string' ? ops.dir : Direction.Backward, // "b" = backward (old events), "f" = forward
      limit: typeof ops.limit === 'number' ? ops.limit : 10, // Number of events per page
    };
    const filter = {};

    // Add Room Filter
    const filterRoomTimeline = {};

    // Files Only
    if (ops.filesOnly) {
      filterRoomTimeline.contains_url = true;
      if (!Array.isArray(filterRoomTimeline.types)) filterRoomTimeline.types = ['m.room.message'];
    }

    // Add Custom filter
    if (objType(ops.filter, 'object'))
      for (const item in ops.filter) filter[item] = ops.filter[item];

    // Is Room
    if (typeof roomId === 'string')
      for (const item in filterRoomTimeline) filter[item] = filterRoomTimeline[item];
    // Is Sync
    else {
      // Fix Values
      if (!objType(filter.room, 'object')) filter.room = {};
      if (!objType(filter.room.timeline, 'object')) filter.room.timeline = {};
      for (const item in filterRoomTimeline) filter.room.timeline[item] = filterRoomTimeline[item];
    }

    // Add Values
    if (typeof ops.fromToken === 'string') params.from = ops.fromToken;
    if (countObj(filter) > 0) params.filter = JSON.stringify(filter);

    // Relation Type
    const relType = typeof ops.relType === 'string' ? ops.relType : null;
    const eventId = typeof ops.eventId === 'string' ? ops.eventId : null;

    // API Request
    const method = 'GET';
    const requestConfig = { prefix: '/_matrix/client/v3' };

    const apiPath =
      // Room Request
      typeof ops.roomId === 'string'
        ? `/rooms/${ops.roomId}${
            // Normal Request
            typeof eventId !== 'string' || typeof relType !== 'string'
              ? `/messages`
              : // Relations
                `/relations/${eventId}/${relType}`
          }`
        : // Sync request (not tested)
          '/sync';

    this.emit('debug', {
      method,
      apiPath,
      params,
      requestConfig,
    });

    const response = await this.matrixClient.http.authedRequest(
      method,
      apiPath,
      params,
      null,
      requestConfig,
    );

    // Decrypt messages (if necessary)
    const decryptedMessages = await this._decryptEvents(response.chunk, ops.ignoreCache);

    // Anti repeat token
    const isNewToken = (responseToken) =>
      typeof ops.fromToken !== 'string' || ops.fromToken !== responseToken;

    // Return messages and token to next page
    return {
      // Event list
      events: decryptedMessages.reverse(),

      // Token to the next page
      nextToken:
        decryptedMessages.length > 0 &&
        typeof response.end === 'string' &&
        (ops.dir !== Direction.Backward || isNewToken(response.end))
          ? response.end
          : null,

      // Token to the prev page
      prevToken:
        decryptedMessages.length > 0 &&
        typeof response.start === 'string' &&
        (ops.dir !== Direction.Forward || isNewToken(response.start))
          ? response.start
          : null,
    };
  }
}

// The class
export default EventManager;
