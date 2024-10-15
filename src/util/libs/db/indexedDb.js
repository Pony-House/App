import { Connection } from 'jsstore';
import version10 from './versions/10';
import version6 from './versions/6';

const versionUpdate = {
  6: version6,
  10: version10,
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
