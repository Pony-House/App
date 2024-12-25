import clone from 'clone';

// Simple values
const eventsDb = [
  'messages_search',
  'messages_edit',
  'crdt',
  { name: 'reactions', existMemberType: true, forceTransaction: true },
  { name: 'timeline', existMemberType: true },
];

// Messages
const messages = {
  name: 'messages',
  existMemberType: true,
  join: [
    {
      where: {
        room_id: '{room_id}',
      },
      type: 'left',
      with: 'threads',
      on: `threads.event_id=messages.event_id`,
      as: {
        event_id: 'is_thread_root',
        room_id: 'is_thread_room_root',
      },
    },
    {
      with: 'messages_primary_edit',
      on: `messages_primary_edit.event_id=messages.event_id`,
      type: 'left',
      where: {
        room_id: '{room_id}',
      },
      as: {
        event_id: 'primary_replace_event_id',
        room_id: 'primary_replace_room_id',
        thread_id: 'primary_replace_thread_id',
        replace_id: 'primary_replace_to_id',
        content: 'primary_replace_to',
        origin_server_ts: 'primary_replace_to_ts',
      },
    },
  ],
};

// Threads
const threads = clone(messages);
threads.name = 'threads';

threads.join[0].with = 'messages';
threads.join[0].on = 'messages.event_id=threads.event_id';

threads.join[1].on = 'messages_primary_edit.event_id=threads.event_id';
threads.orderWhere = 'messages';

threads.existMemberType = false;
threads.forceTransaction = true;

// Insert all
eventsDb.push(messages);
eventsDb.push(threads);

// Export now
export default eventsDb;
