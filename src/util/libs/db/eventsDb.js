const eventsDb = [
  'reactions',
  'messages_search',
  'messages_edit',
  'crdt',
  { name: 'timeline', existMemberType: true },
  {
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
  },
];

export default eventsDb;
