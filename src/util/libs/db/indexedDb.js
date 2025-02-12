import { Connection, DATA_TYPE } from 'jsstore';
import SqlWeb from 'sqlweb';

import version19 from './versions/19';
import version31 from './versions/31';

const versionUpdate = {
  19: version19,
  31: version31,
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
        name: 'timeline',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },

          type: { notNull: false, dataType: DATA_TYPE.String },
          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },

          state_key: { notNull: false, dataType: DATA_TYPE.String },
          member_type: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },

          is_transaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          e_status: { notNull: false, dataType: DATA_TYPE.String },
          redaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          4: {
            drop: {
              embeds: {},
            },
          },
          22: {
            add: {
              is_transaction: {
                notNull: true,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          23: {
            add: {
              e_status: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          28: {
            add: {
              state_key: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          29: {
            add: {
              member_type: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
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

          is_transaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          e_status: { notNull: false, dataType: DATA_TYPE.String },
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
          22: {
            add: {
              is_transaction: {
                notNull: true,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          23: {
            add: {
              e_status: {
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

          is_transaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          e_status: { notNull: false, dataType: DATA_TYPE.String },
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
          16: {
            drop: {
              embeds: {},
            },
          },
          22: {
            add: {
              is_transaction: {
                notNull: true,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          23: {
            add: {
              e_status: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'messages_primary_edit',
        columns: {
          replace_id: { primaryKey: true, autoIncrement: false },
          event_id: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },
          content: { notNull: false, dataType: DATA_TYPE.Object },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
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

          state_key: { notNull: false, dataType: DATA_TYPE.String },
          member_type: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },
          embeds: { notNull: false, dataType: DATA_TYPE.Array },

          replace_to_ts: { notNull: false, dataType: DATA_TYPE.Number },
          replace_to_id: { notNull: false, dataType: DATA_TYPE.String },
          replace_to: { notNull: false, dataType: DATA_TYPE.Object },

          is_transaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          e_status: { notNull: false, dataType: DATA_TYPE.String },
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
          16: {
            add: {
              replace_to_ts: {
                notNull: false,
                dataType: DATA_TYPE.Number,
              },
              replace_to_id: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
              replace_to: {
                notNull: false,
                dataType: DATA_TYPE.Object,
              },
            },
          },
          20: {
            add: {
              is_thread: {
                notNull: false,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          21: {
            modify: {
              is_thread: {
                notNull: false,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          22: {
            add: {
              is_transaction: {
                notNull: true,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          23: {
            add: {
              e_status: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          24: {
            drop: {
              is_thread: {},
            },
          },
          28: {
            add: {
              state_key: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          29: {
            add: {
              member_type: {
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

          is_transaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          e_status: { notNull: false, dataType: DATA_TYPE.String },
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
          22: {
            add: {
              is_transaction: {
                notNull: true,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          23: {
            add: {
              e_status: {
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

          state_key: { notNull: false, dataType: DATA_TYPE.String },
          member_type: { notNull: false, dataType: DATA_TYPE.String },

          sender: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          thread_id: { notNull: false, dataType: DATA_TYPE.String },
          target_id: { notNull: false, dataType: DATA_TYPE.String },

          content: { notNull: false, dataType: DATA_TYPE.Object },
          unsigned: { notNull: false, dataType: DATA_TYPE.Object },

          is_transaction: { notNull: true, dataType: DATA_TYPE.Boolean },
          e_status: { notNull: false, dataType: DATA_TYPE.String },
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
          22: {
            add: {
              is_transaction: {
                notNull: true,
                dataType: DATA_TYPE.Boolean,
              },
            },
          },
          23: {
            add: {
              e_status: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          28: {
            add: {
              state_key: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          29: {
            add: {
              member_type: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
          30: {
            add: {
              target_id: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
        },
      },

      {
        name: 'threads',
        columns: {
          event_id: { primaryKey: true, autoIncrement: false },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
        },
      },

      {
        name: 'members',
        columns: {
          id: { primaryKey: true, autoIncrement: false },
          type: { notNull: false, dataType: DATA_TYPE.String },
          avatar_url: { notNull: false, dataType: DATA_TYPE.String },
          display_name: { notNull: false, dataType: DATA_TYPE.String },

          user_id: { notNull: false, dataType: DATA_TYPE.String },
          room_id: { notNull: false, dataType: DATA_TYPE.String },
          origin_server_ts: { notNull: true, dataType: DATA_TYPE.Number },
        },
        alter: {
          27: {
            add: {
              avatar_url: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
              display_name: {
                notNull: false,
                dataType: DATA_TYPE.String,
              },
            },
          },
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
