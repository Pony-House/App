import { Direction, MatrixEvent } from 'matrix-js-sdk';

class EventManager {
  constructor(matrixClient) {
    this.matrixClient = matrixClient;
  }

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

    // Search API messages
    const response = await this.matrixClient.http.authedRequest(
      'GET',
      `/rooms/${String(ops.roomId)}${
        typeof eventId !== 'string' || typeof relType !== 'string'
          ? `/messages`
          : `/relations/${eventId}/${relType}`
      }`,
      params,
      null,
      { prefix: '/_matrix/client/v3' },
    );

    // Decrypt messages (if necessary)
    const decryptedMessages = await Promise.all(
      response.chunk.map(async (event) => {
        const mEvent = new MatrixEvent(event);
        if (mEvent.getType() === 'm.room.encrypted') {
          try {
            const decrypted = await this.matrixClient.getCrypto().decryptEvent(mEvent);
            if (objType(decrypted, 'object')) {
              if (objType(decrypted.clearEvent, 'object')) mEvent.clearEvent = decrypted.clearEvent;
              return { mEvent, decrypt: decrypted };
            } else return { mEvent };
          } catch (err) {
            return { mEvent, err };
          }
        }
        return { mEvent };
      }),
    );

    // Anti repeat token
    const isNewToken = (responseToken) =>
      typeof ops.fromToken !== 'string' || ops.fromToken !== responseToken;

    // Return messages and token to next page
    return {
      events: decryptedMessages.reverse(),
      nextToken:
        decryptedMessages.length > 0 &&
        typeof response.end === 'string' &&
        (ops.dir !== Direction.Backward || isNewToken(response.end))
          ? response.end
          : null, // Token to the next page
      prevToken:
        decryptedMessages.length > 0 &&
        typeof response.start === 'string' &&
        (ops.dir !== Direction.Forward || isNewToken(response.start))
          ? response.start
          : null, // Token to the prev page
    };
  }
}

export default EventManager;
