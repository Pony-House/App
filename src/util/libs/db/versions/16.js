const version16 = async (connection) => {
  // Get messages
  await connection
    .select({
      from: 'messages_edit',
    })
    .then((messages) => {
      if (Array.isArray(messages)) {
        for (const item in messages) {
          connection
            .select({
              from: 'messages',
              limit: 1,
              where: { event_id: messages[item].event_id },
            })
            .then((messages2) => {
              if (Array.isArray(messages2) && messages2[0]) {
                // Message migration
                const msgTs = messages2[0].replace_to_ts;
                const data = {};
                data.replace_to_ts = messages[item].origin_server_ts;
                data.replace_to_id = messages[item].event_id;
                data.replace_to = messages[item].content;
                if (
                  typeof msgTs !== 'number' ||
                  Number.isNaN(msgTs) ||
                  !Number.isFinite(msgTs) ||
                  msgTs <= 0 ||
                  data.replace_to_ts >= msgTs
                ) {
                  connection.update({
                    in: 'messages',
                    set: data,
                    where: {
                      event_id: eventId,
                    },
                  });
                }
              }
            });
        }
      }
    });
};

export default version16;
