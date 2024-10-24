import storageManager from '@src/util/libs/Localstorage';

async function sendReaction(roomId, toEventId, reaction, shortcode) {
  const content = {
    'm.relates_to': {
      event_id: toEventId,
      key: reaction,
      rel_type: 'm.annotation',
    },
  };
  if (typeof shortcode === 'string') content.shortcode = shortcode;
  try {
    await storageManager.sendEvent(roomId, 'm.reaction', content);
  } catch (e) {
    throw new Error(e);
  }
}

export { sendReaction };
