const version15 = async (connection) => {
  // Get messages
  await connection
    .select({
      from: 'messages',
    })
    .then((messages) => {
      if (Array.isArray(messages)) {
        for (const item in messages) {
          // Message migration
          const data = {};

          if (typeof messages[item].event_id !== 'undefined' && messages[item].event_id !== null)
            data.event_id = messages[item].event_id;

          if (messages[item].content) {
            if (
              typeof messages[item].content.msgtype === 'string'
                ? messages[item].content.msgtype
                : null
            )
              data.type = messages[item].content.msgtype;

            if (typeof messages[item].content.body === 'string')
              data.body = messages[item].content.body;

            if (typeof messages[item].content.format === 'string')
              data.format = messages[item].content.format;

            if (typeof messages[item].content.formatted_body === 'string')
              data.formatted_body = messages[item].content.formatted_body;

            if (messages[item].content.file) {
              if (typeof messages[item].content.file.mimetype === 'string')
                data.mimetype = messages[item].content.file.mimetype;

              if (typeof messages[item].content.file.url === 'string')
                data.url = messages[item].content.file.url;
            }
          }

          if (typeof messages[item].sender !== 'undefined' && messages[item].sender !== null)
            data.sender = messages[item].sender;
          if (typeof messages[item].room_id !== 'undefined' && messages[item].room_id !== null)
            data.room_id = messages[item].room_id;
          if (typeof messages[item].thread_id !== 'undefined' && messages[item].thread_id !== null)
            data.thread_id = messages[item].thread_id;

          if (typeof messages[item].redaction !== 'undefined' && messages[item].redaction !== null)
            data.redaction = messages[item].redaction;
          if (
            typeof messages[item].origin_server_ts !== 'undefined' &&
            messages[item].origin_server_ts !== null
          )
            data.origin_server_ts = messages[item].origin_server_ts;

          connection.insert({
            into: 'messages_search',
            upsert: true,
            values: [data],
          });
        }
      }
    });
};

export default version15;
