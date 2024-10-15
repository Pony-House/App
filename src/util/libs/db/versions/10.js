const version10 = async (connection) => {
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

            if (typeof messages[item].event_id !== 'undefined' && messages[item].event_id !== null)
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
  };

  await insertIntoTimeline('m.room.create');
  await insertIntoTimeline('m.room.message');
  await insertIntoTimeline('m.room.pinned_events');
  await insertIntoTimeline('m.sticker');
};

export default version10;
