import { Connection, DATA_TYPE } from 'jsstore';
import SqlWeb from 'sqlweb';

import version10 from './versions/10';
import version6 from './versions/6';
import version12 from './versions/12';
import version15 from './versions/15';

const versionUpdate = {
  6: version6,
  10: version10,
  12: version12,
  15: version15,
};

export const startDb = async (tinyThis) => {
  // Prepare script
  tinyThis.storeConnection = new Connection(new Worker('jsstore.worker.min.js'));
  tinyThis.storeConnection.addPlugin(SqlWeb);

  // Complete
  const isDbCreated = await tinyThis.storeConnection.initDb({
    name: tinyThis.dbName,
    version: tinyThis._dbVersion,
    tables: [
      {
        name: 'receipt',
        columns: {
          id: { primaryKey: true, autoIncrement: false },
          room_id: { notNull: true, dataType: DATA_TYPE.String },
          user_id: { notNull: true, dataType: DATA_TYPE.String },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
      },

      {
        name: 'encrypted',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: DATA_TYPE.String },
          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
      },

      {
        name: 'timeline',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: DATA_TYPE.String },
          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
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

          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          6: {
            add: {
              thread_id: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'messages_edit',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },
          replace_event_id: { notNull: false, dataType: DATA_TYPE.String },

          type: { notNull: false, dataType: DATA_TYPE.String },
          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },
          embeds: { notNull: false, dataType: DATA_TYPE.Array },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          9: {
            add: {
              original_event_id: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          10: {
            add: {
              type: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'messages',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: DATA_TYPE.String },
          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },
          embeds: { notNull: false, dataType: DATA_TYPE.Array },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          10: {
            add: {
              type: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'messages_search',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: DATA_TYPE.String },
          mimetype: { notNull: false, dataType: DATA_TYPE.String },

          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          body: { notNull: false, dataType: DATA_TYPE.String },
          url: { notNull: false, dataType: DATA_TYPE.String },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          14: {
            add: {
              format: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
              formatted_body: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'reactions',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },

          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          6: {
            add: {
              thread_id: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'members',
        columns: {
          id: { primaryKey: true, autoIncrement: false },
          type: { notNull: false, dataType: DATA_TYPE.String },

          user_id: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
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
