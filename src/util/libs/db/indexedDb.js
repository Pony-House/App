import { Connection } from 'jsstore';

const versionUpdate = {
  // Version 6
  6: async (connection) => {
    // Get messages
    await connection
      .select({
        from: 'timeline',
        where: {
          type: 'm.room.message',
        },
      })
      .then((messages) => {
        if (Array.isArray(messages)) {
          for (const item in messages) {
            // Remove event
            connection.remove({
              from: 'timeline',
              where: {
                event_id: messages[item].event_id,
              },
            });

            // Message migration
            const data = {};

            if (typeof messages[item].event_id !== 'undefined' && messages[item].event_id !== null)
              data.event_id = messages[item].event_id;

            if (typeof messages[item].sender !== 'undefined' && messages[item].sender !== null)
              data.sender = messages[item].sender;
            if (typeof messages[item].room_id !== 'undefined' && messages[item].room_id !== null)
              data.room_id = messages[item].room_id;
            if (
              typeof messages[item].thread_id !== 'undefined' &&
              messages[item].thread_id !== null
            )
              data.thread_id = messages[item].thread_id;

            if (typeof messages[item].content !== 'undefined' && messages[item].content !== null)
              data.content = messages[item].content;
            if (typeof messages[item].unsigned !== 'undefined' && messages[item].unsigned !== null)
              data.unsigned = messages[item].unsigned;
            if (typeof messages[item].embeds !== 'undefined' && messages[item].embeds !== null)
              data.embeds = messages[item].embeds;

            if (
              typeof messages[item].redaction !== 'undefined' &&
              messages[item].redaction !== null
            )
              data.redaction = messages[item].redaction;
            if (
              typeof messages[item].origin_server_ts !== 'undefined' &&
              messages[item].origin_server_ts !== null
            )
              data.origin_server_ts = messages[item].origin_server_ts;

            connection.insert({
              into: 'messages',
              upsert: true,
              values: [data],
            });
          }
        }
      });

    // Get crdt
    await connection
      .select({
        from: 'timeline',
        where: {
          type: 'pony.house.crdt',
        },
      })
      .then((messages) => {
        if (Array.isArray(messages)) {
          for (const item in messages) {
            // Remove event
            connection.remove({
              from: 'timeline',
              where: {
                event_id: messages[item].event_id,
              },
            });

            // Message migration
            const data = {};

            if (typeof messages[item].event_id !== 'undefined' && messages[item].event_id !== null)
              data.event_id = messages[item].event_id;

            if (typeof messages[item].sender !== 'undefined' && messages[item].sender !== null)
              data.sender = messages[item].sender;
            if (typeof messages[item].room_id !== 'undefined' && messages[item].room_id !== null)
              data.room_id = messages[item].room_id;
            if (
              typeof messages[item].thread_id !== 'undefined' &&
              messages[item].thread_id !== null
            )
              data.thread_id = messages[item].thread_id;

            if (typeof messages[item].content !== 'undefined' && messages[item].content !== null)
              data.content = messages[item].content;
            if (typeof messages[item].unsigned !== 'undefined' && messages[item].unsigned !== null)
              data.unsigned = messages[item].unsigned;

            if (
              typeof messages[item].redaction !== 'undefined' &&
              messages[item].redaction !== null
            )
              data.redaction = messages[item].redaction;
            if (
              typeof messages[item].origin_server_ts !== 'undefined' &&
              messages[item].origin_server_ts !== null
            )
              data.origin_server_ts = messages[item].origin_server_ts;

            connection.insert({
              into: 'crdt',
              upsert: true,
              values: [data],
            });
          }
        }
      });

    // Get reactions
    await connection
      .select({
        from: 'timeline',
        where: {
          type: 'm.reaction',
        },
      })
      .then((messages) => {
        if (Array.isArray(messages)) {
          for (const item in messages) {
            // Remove event
            connection.remove({
              from: 'timeline',
              where: {
                event_id: messages[item].event_id,
              },
            });

            // Message migration
            const data = {};

            if (typeof messages[item].event_id !== 'undefined' && messages[item].event_id !== null)
              data.event_id = messages[item].event_id;

            if (typeof messages[item].sender !== 'undefined' && messages[item].sender !== null)
              data.sender = messages[item].sender;
            if (typeof messages[item].room_id !== 'undefined' && messages[item].room_id !== null)
              data.room_id = messages[item].room_id;
            if (
              typeof messages[item].thread_id !== 'undefined' &&
              messages[item].thread_id !== null
            )
              data.thread_id = messages[item].thread_id;

            if (typeof messages[item].content !== 'undefined' && messages[item].content !== null)
              data.content = messages[item].content;
            if (typeof messages[item].unsigned !== 'undefined' && messages[item].unsigned !== null)
              data.unsigned = messages[item].unsigned;

            if (
              typeof messages[item].redaction !== 'undefined' &&
              messages[item].redaction !== null
            )
              data.redaction = messages[item].redaction;
            if (
              typeof messages[item].origin_server_ts !== 'undefined' &&
              messages[item].origin_server_ts !== null
            )
              data.origin_server_ts = messages[item].origin_server_ts;

            connection.insert({
              into: 'reactions',
              upsert: true,
              values: [data],
            });
          }
        }
      });
  },

  // Version 10
  10: async (connection) => {
    await connection.update({
      in: 'messages',
      set: {
        type: 'm.room.message',
      },
    });

    await connection.update({
      in: 'messages_edit',
      set: {
        type: 'm.room.message',
      },
    });

    const insertIntoTimeline = async (type) => {
      // Get messages
      await connection
        .select({
          from: 'timeline',
          where: {
            type: type,
          },
        })
        .then((messages) => {
          if (Array.isArray(messages)) {
            for (const item in messages) {
              // Remove event
              connection.remove({
                from: 'timeline',
                where: {
                  event_id: messages[item].event_id,
                },
              });

              // Message migration
              const data = {};

              if (
                typeof messages[item].event_id !== 'undefined' &&
                messages[item].event_id !== null
              )
                data.event_id = messages[item].event_id;

              if (typeof messages[item].type !== 'undefined' && messages[item].type !== null)
                data.type = messages[item].type;

              if (typeof messages[item].sender !== 'undefined' && messages[item].sender !== null)
                data.sender = messages[item].sender;
              if (typeof messages[item].room_id !== 'undefined' && messages[item].room_id !== null)
                data.room_id = messages[item].room_id;
              if (
                typeof messages[item].thread_id !== 'undefined' &&
                messages[item].thread_id !== null
              )
                data.thread_id = messages[item].thread_id;

              if (typeof messages[item].content !== 'undefined' && messages[item].content !== null)
                data.content = messages[item].content;
              if (
                typeof messages[item].unsigned !== 'undefined' &&
                messages[item].unsigned !== null
              )
                data.unsigned = messages[item].unsigned;
              if (typeof messages[item].embeds !== 'undefined' && messages[item].embeds !== null)
                data.embeds = messages[item].embeds;

              if (
                typeof messages[item].redaction !== 'undefined' &&
                messages[item].redaction !== null
              )
                data.redaction = messages[item].redaction;
              if (
                typeof messages[item].origin_server_ts !== 'undefined' &&
                messages[item].origin_server_ts !== null
              )
                data.origin_server_ts = messages[item].origin_server_ts;

              connection.insert({
                into: 'messages',
                upsert: true,
                values: [data],
              });
            }
          }
        });
    };

    await insertIntoTimeline('m.room.create');
    await insertIntoTimeline('m.room.message');
    await insertIntoTimeline('m.room.pinned_events');
    await insertIntoTimeline('m.sticker');
  },
};

export const startDb = async (tinyThis) => {
  // Prepare script
  tinyThis.storeConnection = new Connection(new Worker('jsstore.worker.min.js'));

  // Complete
  const isDbCreated = await tinyThis.storeConnection.initDb({
    name: tinyThis.dbName,
    version: tinyThis._dbVersion,
    tables: [
      {
        name: 'encrypted',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: 'string' },
          sender: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          thread_id: { notNull: false, dataType: 'string' },

          content: { notNull: false, dataType: 'object' },
          unsigned: { notNull: false, dataType: 'object' },

          redaction: { notNull: true, dataType: 'boolean' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
      },

      {
        name: 'timeline',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: 'string' },
          sender: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          thread_id: { notNull: false, dataType: 'string' },

          content: { notNull: false, dataType: 'object' },
          unsigned: { notNull: false, dataType: 'object' },

          redaction: { notNull: true, dataType: 'boolean' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
        alter: {
          4: {
            drop: {
              embeds: {},
            },
          },
        },
      },

      {
        name: 'crdt',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          sender: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          thread_id: { notNull: false, dataType: 'string' },

          content: { notNull: false, dataType: 'object' },
          unsigned: { notNull: false, dataType: 'object' },

          redaction: { notNull: true, dataType: 'boolean' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
        alter: {
          6: {
            add: {
              thread_id: {
                notNull: false,
                dataType: 'string',
              },
            },
          },
        },
      },

      {
        name: 'messages_edit',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },
          replace_event_id: { notNull: false, dataType: 'string' },

          type: { notNull: false, dataType: 'string' },
          sender: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          thread_id: { notNull: false, dataType: 'string' },

          content: { notNull: false, dataType: 'object' },
          unsigned: { notNull: false, dataType: 'object' },
          embeds: { notNull: false, dataType: 'array' },

          redaction: { notNull: true, dataType: 'boolean' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
        alter: {
          9: {
            add: {
              original_event_id: {
                notNull: false,
                dataType: 'string',
              },
            },
          },
          10: {
            add: {
              type: {
                notNull: false,
                dataType: 'string',
              },
            },
          },
        },
      },

      {
        name: 'messages',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: 'string' },
          sender: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          thread_id: { notNull: false, dataType: 'string' },

          content: { notNull: false, dataType: 'object' },
          unsigned: { notNull: false, dataType: 'object' },
          embeds: { notNull: false, dataType: 'array' },

          redaction: { notNull: true, dataType: 'boolean' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
        alter: {
          10: {
            add: {
              type: {
                notNull: false,
                dataType: 'string',
              },
            },
          },
        },
      },

      {
        name: 'reactions',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          sender: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          thread_id: { notNull: false, dataType: 'string' },

          content: { notNull: false, dataType: 'object' },
          unsigned: { notNull: false, dataType: 'object' },

          redaction: { notNull: true, dataType: 'boolean' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
        alter: {
          6: {
            add: {
              thread_id: {
                notNull: false,
                dataType: 'string',
              },
            },
          },
        },
      },

      {
        name: 'members',
        columns: {
          id: { primaryKey: true, autoIncrement: false },
          type: { notNull: false, dataType: 'string' },

          user_id: { notNull: false, dataType: 'string' },
          room_id: { notNull: false, dataType: 'string' },
          origin_server_ts: { notNull: true, dataType: 'number' },
        },
      },
    ],
  });

  if (isDbCreated) {
    if (tinyThis._oldDbVersion !== 0) {
      for (let i = tinyThis._oldDbVersion; i <= tinyThis._dbVersion; i++) {
        if (typeof versionUpdate[i] === 'function') {
          await versionUpdate[i](tinyThis.storeConnection);
        }
      }
    }
  }

  return isDbCreated;
};
