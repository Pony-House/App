import EventEmitter from 'events';
import { Direction, MatrixEvent } from 'matrix-js-sdk';
import { objType, countObj } from 'for-promise/utils/lib.mjs';

class EventManager extends EventEmitter {
  constructor(matrixClient) {
    super();
    this.matrixClient = matrixClient;
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
  }

  // Decrypt messages (if necessary)
  _decryptEvents(chunk) {
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
              this.emit('decryptedEvent', mEvent, decrypted);
              return { mEvent, decrypt: decrypted };
            }
            // Fail
            else {
              this.emit('event', mEvent);
              return { mEvent };
            }
          } catch (err) {
            // Error
            this.emit('errorDecryptedEvent', mEvent, err);
            return { mEvent, err };
          }
        }

        // Normal Event
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
    },
  ) {
    // Request parameters
    const params = {
      dir: typeof ops.dir === 'string' ? ops.dir : Direction.Backward, // "b" = backward (old events), "f" = forward
      limit: typeof ops.limit === 'number' ? ops.limit : 10, // Number of events per page
    };

    // Add Filter items
    const filter = {};
    if (objType(ops.filter, 'object'))
      for (const item in ops.filter) filter[item] = ops.filter[item];

    // Files Only
    if (ops.filesOnly) {
      filter.contains_url = true;
      if (!Array.isArray(filter.types)) filter.types = ['m.room.message'];
    }

    // Add Values
    if (typeof ops.fromToken === 'string') params.from = ops.fromToken;
    if (countObj(filter) > 0) params.filter = JSON.stringify(filter);

    // Relation Type
    const relType = typeof ops.relType === 'string' ? ops.relType : null;
    const eventId = typeof ops.eventId === 'string' ? ops.eventId : null;

    // API Request
    const method = 'GET';
    const apiPath = `/rooms/${String(ops.roomId)}${
      typeof eventId !== 'string' || typeof relType !== 'string'
        ? `/messages`
        : `/relations/${eventId}/${relType}`
    }`;

    const requestConfig = { prefix: '/_matrix/client/v3' };

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
    const decryptedMessages = await this._decryptEvents(response.chunk);

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
