import React, { useEffect, useReducer, useState } from 'react';
import PropTypes from 'prop-types';

import tinyConsole from '@src/util/libs/console';
import muteUserManager from '@src/util/libs/muteUserManager';

import {
  ReactionImgReact,
  getCustomEmojiUrl,
  getEventReactions,
} from '@src/app/molecules/reactions/Reactions';

import storageManager from '@src/util/libs/Localstorage';

import { toast } from '../../../util/tools';
import { twemojifyReact } from '../../../util/twemojify';
import initMatrix from '../../../client/initMatrix';

import { getUsername, getCurrentState } from '../../../util/matrixUtil';

import { getEventCords } from '../../../util/common';
import { sendReaction } from '../../../client/action/roomTimeline';
import { openEmojiBoard } from '../../../client/action/navigation';

import { shiftNuller } from '../../../util/shortcut';
import Tooltip from '../../atoms/tooltip/Tooltip';
import IconButton from '../../atoms/button/IconButton';
import tinyFixScrollChat from '../media/mediaFix';

function toggleEmoji(roomId, eventId, emojiKey, shortcode, roomTimeline) {
  return new Promise((resolve, reject) => {
    const myAlreadyReactEvent = getMyEmojiEvent(emojiKey, eventId, roomTimeline);
    if (myAlreadyReactEvent) {
      const rId = myAlreadyReactEvent.getId();
      if (rId.startsWith('~')) return;
      tinyConsole.log(`[reaction-sender] [${roomId}] Redact the event: ${rId}`);
      storageManager.redactEvent(roomId, myAlreadyReactEvent).then(resolve).catch(reject);
      return;
    }
    tinyConsole.log(`[reaction-sender] [${roomId}] Sending the event: ${eventId}`);
    sendReaction(roomId, eventId, emojiKey, shortcode).then(resolve).catch(reject);
  });
}

// Get Emoji
function getMyEmojiEvent(emojiKey, eventId, roomTimeline) {
  const mx = initMatrix.matrixClient;
  const rEvents = roomTimeline.reactionTimeline.get(eventId);
  let rEvent = null;
  rEvents?.find((rE) => {
    if (rE.getRelation() === null) return false;
    if (rE.getRelation().key === emojiKey && rE.getSender() === mx.getUserId()) {
      rEvent = rE;
      return true;
    }
    return false;
  });
  return rEvent;
}

// Reaction script
const reactionScript = {
  resolve: (data, setIsReaction) => {
    if (typeof setIsReaction === 'function') setIsReaction(false);
  },
  reject: (err, setIsReaction) => {
    tinyConsole.error(err);
    alert(err.message, 'Reaction button error');
    if (typeof setIsReaction === 'function') setIsReaction(false);
  },
};

// Pick Emoji Modal
const reactionLimit = 20;
export function pickEmoji(
  e,
  roomId,
  eventId,
  roomTimeline,
  extraX = 0,
  extraX2 = 0,
  reacts = null,
  setIsReaction = null,
) {
  // Get Cords
  let reactsLength = Array.isArray(reacts) ? reacts.length : null;
  const cords = getEventCords(e);

  // Mobile Screen - Viewport
  cords.y -= 170;
  if (window.matchMedia('screen and (max-width: 479px)').matches) {
    cords.x -= 230 + extraX2;
  }

  // Normal Screen
  else {
    cords.x -= 430 + extraX;
  }

  if (Math.round(cords.y) >= document.body.offsetHeight - 340) {
    cords.y -= 260;
  }

  // Open the Emoji Board
  openEmojiBoard(roomId, cords, 'emoji', (emoji) => {
    if (reactsLength === null || reactsLength < reactionLimit) {
      if (reactsLength !== null) reactsLength++;
      if (typeof setIsReaction === 'function') setIsReaction(true);
      toggleEmoji(roomId, eventId, emoji.mxc ?? emoji.unicode, emoji.shortcodes[0], roomTimeline)
        .then((data) => reactionScript.resolve(data, setIsReaction))
        .catch((err) => reactionScript.reject(err, setIsReaction));
    } else {
      e.target.click();
    }
    shiftNuller(() => e.target.click());
  });
}

// Reaction Generator
function genReactionMsg(userIds, reaction, shortcode, customEmojiUrl) {
  const usersReaction = [];
  let userLimit = 3;
  let extraUserLimit = 0;
  for (const item in userIds) {
    if (usersReaction.length < userLimit) {
      usersReaction.push(userIds[item]);
    } else {
      extraUserLimit++;
    }
  }
  return (
    <>
      <div className="img">
        <center>
          <ReactionImgReact
            reaction={reaction}
            shortcode={shortcode}
            customEmojiUrl={customEmojiUrl}
          />
        </center>
      </div>
      <div className="info">
        {usersReaction.map((userId, index) => (
          <React.Fragment key={userId}>
            <span className="emoji-size-fix-2">{twemojifyReact(getUsername(userId))}</span>
            {index < usersReaction.length - 1 && (
              <span style={{ opacity: '.6' }}>
                {index === usersReaction.length - 2 ? ' and ' : ', '}
              </span>
            )}
          </React.Fragment>
        ))}
        <React.Fragment key={`reactionUserMessage${String(extraUserLimit)}`}>
          {extraUserLimit > 0 && (
            <span
              style={{ opacity: '.6' }}
            >{`, and ${extraUserLimit < 2 ? `${String(extraUserLimit)} other` : `${String(extraUserLimit)} others`}`}</span>
          )}
        </React.Fragment>
        <span style={{ opacity: '.6' }}>{' reacted with '}</span>
        <span className="emoji-size-fix-2">
          {twemojifyReact(shortcode ? `:${shortcode}:` : reaction, { className: 'react-emoji' })}
        </span>
      </div>
    </>
  );
}

// Reaction Manager
function MessageReaction({ reaction, shortcode, count, users, isActive, onClick }) {
  const customEmojiUrl = getCustomEmojiUrl(reaction);
  return (
    <Tooltip
      className="msg__reaction-tooltip"
      content={
        <div className="small">
          {users.length > 0
            ? genReactionMsg(users, reaction, shortcode, customEmojiUrl)
            : 'Unable to load who has reacted'}
        </div>
      }
    >
      <button
        onClick={onClick}
        type="button"
        className={`msg__reaction${isActive ? ' msg__reaction--active' : ''}${customEmojiUrl ? ' custom-emoji' : ' default-emoji'}`}
      >
        <ReactionImgReact
          reaction={reaction}
          shortcode={shortcode}
          customEmojiUrl={customEmojiUrl}
        />
        <div className="very-small text-gray msg__reaction-count">{count}</div>
      </button>
    </Tooltip>
  );
}

MessageReaction.propTypes = {
  reaction: PropTypes.node.isRequired,
  shortcode: PropTypes.string,
  count: PropTypes.number.isRequired,
  users: PropTypes.arrayOf(PropTypes.string).isRequired,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

function MessageReactionGroup({ roomTimeline, mEvent }) {
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const [isReacting, setIsReaction] = useState(false);

  const { roomId, room, reactionTimeline } = roomTimeline;
  const mx = initMatrix.matrixClient;
  const canSendReaction = getCurrentState(room).maySendEvent('m.reaction', mx.getUserId());

  const eventReactions = reactionTimeline.get(mEvent.getId());

  useEffect(() => {
    const tinyUpdate = () => forceUpdate();
    muteUserManager.on('muteReaction', tinyUpdate);
    return () => {
      muteUserManager.off('muteReaction', tinyUpdate);
    };
  });

  // Create reaction list and limit the amount to 20
  const reacts = getEventReactions(eventReactions, false, reactionLimit);

  useEffect(() => tinyFixScrollChat());

  return (
    <div className="noselect">
      {reacts.order.map((key) => (
        <MessageReaction
          key={key}
          reaction={key}
          shortcode={reacts.data[key].shortcode}
          count={reacts.data[key].count}
          users={reacts.data[key].users}
          isActive={reacts.data[key].isActive}
          onClick={() => {
            setIsReaction(true);
            toggleEmoji(roomId, mEvent.getId(), key, reacts.data[key].shortcode, roomTimeline)
              .then((data) => reactionScript.resolve(data, setIsReaction))
              .catch((err) => reactionScript.reject(err, setIsReaction));
          }}
        />
      ))}

      {canSendReaction && (
        <IconButton
          className="ms-2 btn-sm reaction-message"
          onClick={(e) => {
            if (reacts.order.length < reactionLimit) {
              pickEmoji(e, roomId, mEvent.getId(), roomTimeline, -430, 0, reacts, setIsReaction);
            } else {
              toast(
                'Your reaction was not added because there are too many reactions on this message.',
                'We appreciate the enthusiasm, but...',
              );
            }
          }}
          fa="fa-solid fa-heart-circle-plus"
          size="normal"
          tooltip="Add reaction"
        />
      )}
    </div>
  );
}
MessageReactionGroup.propTypes = {
  roomTimeline: PropTypes.shape({}).isRequired,
  mEvent: PropTypes.shape({}).isRequired,
};

export default MessageReactionGroup;
