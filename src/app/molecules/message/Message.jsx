/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect, useCallback, useRef, useReducer } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { MatrixEventEvent, RoomEvent, THREAD_RELATION_TYPE } from 'matrix-js-sdk';
import { objType } from 'for-promise/utils/lib.mjs';

import clone from 'clone';
import hljs from 'highlight.js';
import * as linkify from 'linkifyjs';
import forPromise from 'for-promise';

import { defaultAvatar } from '@src/app/atoms/avatar/defaultAvatar';
import cons from '@src/client/state/cons';
import { isMobile } from '@src/util/libs/mobile';
import muteUserManager from '@src/util/libs/muteUserManager';
import attemptDecryption from '@src/util/libs/attemptDecryption';

import libreTranslate from '@src/util/libs/libreTranslate';
import { setLoadingPage } from '@src/app/templates/client/Loading';

import {
  ReactionImgReact,
  getCustomEmojiUrl,
  getEventReactions,
  reactionImgjQuery,
} from '@src/app/molecules/reactions/Reactions';
import tinyClipboard from '@src/util/libs/Clipboard';

import storageManager from '@src/util/libs/Localstorage';

import Text from '../../atoms/text/Text';
import { btModal, resizeWindowChecker, toast } from '../../../util/tools';
import { twemojify, twemojifyReact } from '../../../util/twemojify';
import initMatrix from '../../../client/initMatrix';

import {
  getUsername,
  getUsernameOfRoomMember,
  parseReply,
  trimHTMLReply,
  getCurrentState,
  canSupport,
  dfAvatarSize,
} from '../../../util/matrixUtil';

import { colorMXID, backgroundColorMXID } from '../../../util/colorMXID';
import { getEventCords } from '../../../util/common';
import { sendReaction } from '../../../client/action/roomTimeline';
import {
  openEmojiBoard,
  openProfileViewer,
  openReadReceipts,
  openViewSource,
  replyTo,
  selectRoom,
  openReusableContextMenu,
} from '../../../client/action/navigation';
import { sanitizeCustomHtml } from '../../../util/sanitize';

import { shiftNuller } from '../../../util/shortcut';
import RawIcon from '../../atoms/system-icons/RawIcon';
import Button from '../../atoms/button/Button';
import Tooltip from '../../atoms/tooltip/Tooltip';
import Input from '../../atoms/input/Input';
import Avatar, { AvatarJquery } from '../../atoms/avatar/Avatar';
import IconButton from '../../atoms/button/IconButton';
import Time from '../../atoms/time/Time';
import ContextMenu, {
  MenuHeader,
  MenuItem,
  MenuBorder,
} from '../../atoms/context-menu/ContextMenu';
import * as Media from '../media/Media';

import { confirmDialog } from '../confirm-dialog/ConfirmDialog';
import { getBlobSafeMimeType } from '../../../util/mimetypes';
import { html, plain } from '../../../util/markdown';
import getUrlPreview from '../../../util/libs/getUrlPreview';

import Embed from './Embed';
import tinyAPI from '../../../util/mods';
import matrixAppearance, {
  getAnimatedImageUrl,
  getAppearance,
} from '../../../util/libs/appearance';
import UserOptions from '../user-options/UserOptions';
import { getDataList } from '../../../util/selectedRoom';
import { tinyLinkifyFixer } from '../../../util/clear-urls/clearUrls';
import { canPinMessage, isPinnedMessage, setPinMessage } from '../../../util/libs/pinMessage';
import tinyFixScrollChat from '../media/mediaFix';
import { everyoneTags } from '../global-notification/KeywordNotification';

function PlaceholderMessage({
  // loadingPage = false,
  showAvatar = false,
}) {
  const renderPlaceHolder = () => (
    <p className="placeholder-glow">
      <span className="placeholder col-12" />
    </p>
  );

  const renderPlaceHolder2 = () => (
    <tr className="ph-msg">
      <td className="p-0 ps-2 ps-md-4 py-1 pe-md-2 align-top text-center chat-base">
        <center>
          <div className="avatar-container profile-image-container" />
        </center>
      </td>
      <td className="p-0 pe-3 py-1">
        {renderPlaceHolder()}
        {renderPlaceHolder()}
        {renderPlaceHolder()}
      </td>
    </tr>
  );

  return !showAvatar ? (
    <tr className="ph-msg">
      <td colSpan="2">
        {renderPlaceHolder()}
        {renderPlaceHolder()}
        {renderPlaceHolder()}
        {renderPlaceHolder()}
        {renderPlaceHolder()}
        {renderPlaceHolder()}
      </td>
    </tr>
  ) : (
    <>
      {renderPlaceHolder2()}
      {renderPlaceHolder2()}
      {renderPlaceHolder2()}
    </>
  );
}

PlaceholderMessage.propTypes = {
  loadingPage: PropTypes.bool,
  showAvatar: PropTypes.bool,
};

// Avatar Generator
const MessageAvatar = React.memo(
  ({ roomId, avatarSrc, avatarAnimSrc, userId, username, contextMenu, bgColor }) => (
    <button
      type="button"
      onContextMenu={contextMenu}
      onClick={() => openProfileViewer(userId, roomId)}
    >
      <Avatar
        imgClass="profile-image-container"
        className="profile-image-container"
        imageAnimSrc={avatarAnimSrc}
        imageSrc={avatarSrc}
        text={username}
        bgColor={bgColor}
        isDefaultImage
      />
    </button>
  ),
);

// Message Header
const MessageHeader = React.memo(({ userId, username, usernameHover, roomId }) => {
  const appAppearance = getAppearance();
  const tinyUsername = twemojifyReact(username);
  let isUNhoverEnabled = appAppearance.isUNhoverEnabled;

  const forceUsername =
    typeof usernameHover === 'string' && usernameHover.length > 0
      ? usernameHover === 'on'
        ? 1
        : 0
      : -1;
  if (forceUsername === 1) {
    isUNhoverEnabled = true;
  } else if (forceUsername === 0) {
    isUNhoverEnabled = false;
  }

  const usernameClick = (e) => {
    e.preventDefault();
    openProfileViewer(userId, roomId);
  };

  return (
    <span
      onClick={usernameClick}
      onContextMenu={(e) => {
        if (!initMatrix.isGuest)
          openReusableContextMenu('bottom', getEventCords(e, '.ic-btn'), (closeMenu) => (
            <UserOptions userId={userId} afterOptionSelect={closeMenu} />
          ));

        e.preventDefault();
      }}
      className="username-base emoji-size-fix"
      style={{ color: colorMXID(userId) }}
    >
      <span className={`username${isUNhoverEnabled ? '' : ' disable-username'}`}>
        {tinyUsername}
      </span>
      <span
        onClick={usernameClick}
        className={`user-id${isUNhoverEnabled ? '' : ' disable-username'}`}
      >
        {isUNhoverEnabled ? twemojifyReact(userId) : tinyUsername}
      </span>
    </span>
  );
});

MessageHeader.propTypes = {
  usernameHover: PropTypes.string,
  userId: PropTypes.string.isRequired,
  roomId: PropTypes.string.isRequired,
  username: PropTypes.string.isRequired,
};

const MessageTime = React.memo(({ timestamp, fullTime = false, className = '' }) => (
  <span className={`${className} very-small text-gray`}>
    <Time timestamp={timestamp} fullTime={fullTime} />
  </span>
));

MessageTime.propTypes = {
  timestamp: PropTypes.number.isRequired,
  fullTime: PropTypes.bool,
  className: PropTypes.string,
};

// Message Reply
function MessageReply({ name, color, body }) {
  tinyFixScrollChat();
  return (
    <div className="emoji-size-fix small text-reply">
      <RawIcon color={color} size="normal" fa="fa-solid fa-reply" />{' '}
      <span className="ms-2 username-title emoji-size-fix" style={{ color }}>
        {twemojifyReact(name)}
      </span>{' '}
      {body.length > 200 ? twemojifyReact(`${body.substring(0, 200)}......`) : twemojifyReact(body)}
    </div>
  );
}

MessageReply.propTypes = {
  name: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
};

const MessageReplyWrapper = React.memo(({ roomTimeline, eventId }) => {
  const [reply, setReply] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    const mx = initMatrix.matrixClient;
    const timelineSet = roomTimeline.getUnfilteredTimelineSet();
    const loadReply = async () => {
      try {
        const mEvent = roomTimeline.findEventById(eventId);
        const editedContent = mEvent.getEditedContent();

        const rawBody = mEvent.getContent().body;
        const username = getUsernameOfRoomMember(mEvent.sender);

        if (isMountedRef.current === false) return;
        const fallbackBody = mEvent.isRedacted()
          ? '*** This message has been deleted ***'
          : '*** Unable to load reply ***';
        let parsedBody;
        if (
          editedContent &&
          typeof editedContent.body === 'string' &&
          editedContent.body.startsWith(' * ')
        ) {
          parsedBody = parseReply(editedContent.body)?.body ?? editedContent.body ?? fallbackBody;
          parsedBody = parsedBody.slice(3);
        } else {
          parsedBody = parseReply(rawBody)?.body ?? rawBody ?? fallbackBody;
        }

        setReply({
          to: username,
          color: colorMXID(mEvent.getSender() ?? ''),
          body: parsedBody,
          event: mEvent,
        });
      } catch {
        setReply({
          to: '** Unknown user **',
          color: 'var(--tc-danger-normal)',
          body: '*** Unable to load reply ***',
          event: null,
        });
      }
    };
    loadReply();

    return () => {
      isMountedRef.current = false;
    };
  }, [eventId, roomTimeline]);

  const focusReply = (ev) => {
    if (!ev.key || ev.key === ' ' || ev.key === 'Enter') {
      if (ev.key) ev.preventDefault();
      if (reply?.event === null) return;
      if (reply?.event.isRedacted()) return;
      roomTimeline.loadEventTimeline(eventId);
    }
  };

  return (
    <div
      className="message__reply-wrapper"
      onClick={focusReply}
      onKeyDown={focusReply}
      role="button"
      tabIndex={0}
    >
      {reply !== null && <MessageReply name={reply.to} color={reply.color} body={reply.body} />}
    </div>
  );
});

MessageReplyWrapper.propTypes = {
  roomTimeline: PropTypes.shape({}).isRequired,
  eventId: PropTypes.string.isRequired,
};

// Is Emoji only
const isEmojiOnly = (msgContent) => {
  // Determine if this message should render with large emojis
  // Criteria:
  // - Contains only emoji
  // - Contains no more than 10 emoji
  let emojiOnly = false;
  if (msgContent) {
    if (
      msgContent.type === 'img' ||
      (msgContent.props &&
        (typeof msgContent.props.dataMxEmoticon === 'string' ||
          msgContent.props.className === 'emoji'))
    ) {
      // If this messages contains only a single (inline) image
      emojiOnly = true;
    } else if (msgContent.constructor.name === 'Array') {
      // Otherwise, it might be an array of images / text

      // Count the number of emojis
      const nEmojis = msgContent.filter(
        (e) =>
          e.type === 'img' ||
          (e.props &&
            (typeof e.props.dataMxEmoticon === 'string' || e.props.className === 'emoji')),
      ).length;

      // Make sure there's no text besides whitespace and variation selector U+FE0F
      if (
        nEmojis <= 10 &&
        msgContent.every(
          (element) =>
            (typeof element === 'object' &&
              (element.type === 'img' ||
                (element.props &&
                  (typeof element.props.dataMxEmoticon === 'string' ||
                    element.props.className === 'emoji')))) ||
            (typeof element === 'string' && /^[\s\ufe0f]*$/g.test(element)),
        )
      ) {
        emojiOnly = true;
      }
    }
  }

  return emojiOnly;
};

const createMessageData = (
  content,
  body,
  isCustomHTML = false,
  isSystem = false,
  isJquery = false,
  roomId = null,
  senderId = null,
  eventId = null,
  threadId = null,
) => {
  let msgData = null;
  if (isCustomHTML) {
    try {
      const insertMsg = () => {
        const messageHtml = sanitizeCustomHtml(initMatrix.matrixClient, body, senderId);
        return !isJquery
          ? twemojifyReact(messageHtml, undefined, true, false, true)
          : twemojify(messageHtml, undefined, true, false, true);
      };
      const msgOptions = tinyAPI.emit(
        'messageBody',
        content,
        { roomId, threadId, senderId, eventId },
        insertMsg,
      );

      if (typeof msgOptions.custom === 'undefined') {
        msgData = insertMsg();
      } else {
        msgData = msgOptions.custom;
      }
    } catch {
      console.error(`[matrix] [msg] Malformed custom html: `, body);
      msgData = !isJquery ? twemojifyReact(body, undefined) : twemojify(body, undefined);
    }
  } else if (!isSystem) {
    msgData = !isJquery ? twemojifyReact(body, undefined, true) : twemojify(body, undefined, true);
  } else {
    msgData = !isJquery
      ? twemojifyReact(body, undefined, true, false, true)
      : twemojify(body, undefined, true, false, true);
  }

  return msgData;
};

export { createMessageData, isEmojiOnly };

// Message Body
const MessageBody = React.memo(
  ({
    roomId,
    senderId,
    eventId,
    threadId = null,
    content = {},
    className = '',
    senderName,
    body,
    isCustomHTML = false,
    isSystem = false,
    isEdited = false,
    msgType = null,
    translateText,
    messageStatus,
  }) => {
    const messageBody = useRef(null);

    // if body is not string it is a React element.
    if (typeof body !== 'string') return <div className="message__body">{body}</div>;

    // Message Data
    let msgData = !translateText
      ? createMessageData(
          content,
          body,
          isCustomHTML,
          isSystem,
          false,
          roomId,
          senderId,
          eventId,
          threadId,
        )
      : translateText;

    // Emoji Only
    const emojiOnly = isEmojiOnly(msgData?.props?.children?.props?.children);

    if (!isCustomHTML) {
      // If this is a plaintext message, wrap it in a <p> element (automatically applying
      // white-space: pre-wrap) in order to preserve newlines
      msgData = (
        <p ref={messageBody} className="m-0">
          {msgData}
        </p>
      );
    } else {
      msgData = (
        <span ref={messageBody} className="custom-html">
          {msgData}
        </span>
      );
    }

    return (
      <div
        className={`text-freedom message-body small text-bg${!emojiOnly ? ' emoji-size-fix' : ''} ${className}${messageStatus ? ` message-body-status-${messageStatus}` : ''}`}
      >
        {msgType === 'm.emote' && (
          <>
            {'* '}
            {twemojifyReact(senderName)}{' '}
          </>
        )}
        {msgData}
        {isEdited && <div className="very-small text-gray noselect">(edited)</div>}
        {typeof translateText === 'string' ? (
          <>
            <div className="very-small text-gray noselect">(translation)</div>
          </>
        ) : null}
      </div>
    );
  },
);

MessageBody.propTypes = {
  translateText: PropTypes.string,
  content: PropTypes.object,
  senderName: PropTypes.string.isRequired,
  roomId: PropTypes.string.isRequired,
  senderId: PropTypes.string.isRequired,
  eventId: PropTypes.string.isRequired,
  threadId: PropTypes.string,
  body: PropTypes.node.isRequired,
  isSystem: PropTypes.bool,
  isCustomHTML: PropTypes.bool,
  isEdited: PropTypes.bool,
  msgType: PropTypes.string,
  className: PropTypes.string,
};

// Message Edit
function MessageEdit({ body, onSave, onCancel, refRoomInput, roomId, eventId }) {
  const editInputRef = useRef(null);

  useEffect(() => {
    // makes the cursor end up at the end of the line instead of the beginning
    editInputRef.current.value = '';
    editInputRef.current.value = body;
  }, [body]);

  const deleteMessage = async () => {
    const isConfirmed = await confirmDialog(
      'Delete message',
      'Are you sure that you want to delete this message?',
      'Delete',
      'danger',
    );

    if (!isConfirmed) return;
    storageManager.redactEvent(roomId, eventId);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }

    if (e.key === 'Enter' && e.shiftKey === false) {
      e.preventDefault();
      $(refRoomInput.current).find('#message-textarea').focus();
      if (editInputRef.current.value.trim().length > 0) {
        onSave(editInputRef.current.value, body);
      } else {
        deleteMessage();
      }
    }
  };

  return (
    <form
      className="message__edit"
      onSubmit={(e) => {
        e.preventDefault();
        $(refRoomInput.current).find('#message-textarea').focus();

        if (editInputRef.current.value.trim().length > 0) {
          onSave(editInputRef.current.value, body);
        } else {
          deleteMessage();
        }
      }}
    >
      <Input
        forwardRef={editInputRef}
        onKeyDown={handleKeyDown}
        value={body}
        placeholder="Edit message"
        required
        resizable
        autoFocus
      />
      <div className="message__edit-btns">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

MessageEdit.propTypes = {
  roomId: PropTypes.string.isRequired,
  eventId: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

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

function toggleEmoji(roomId, eventId, emojiKey, shortcode, roomTimeline) {
  const myAlreadyReactEvent = getMyEmojiEvent(emojiKey, eventId, roomTimeline);
  if (myAlreadyReactEvent) {
    const rId = myAlreadyReactEvent.getId();
    if (rId.startsWith('~')) return;
    storageManager.redactEvent(roomId, rId);
    return;
  }
  sendReaction(roomId, eventId, emojiKey, shortcode);
}

// Pick Emoji Modal
const reactionLimit = 20;
function pickEmoji(e, roomId, eventId, roomTimeline, extraX = 0, extraX2 = 0, reacts = null) {
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
      toggleEmoji(roomId, eventId, emoji.mxc ?? emoji.unicode, emoji.shortcodes[0], roomTimeline);
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
            toggleEmoji(roomId, mEvent.getId(), key, reacts.data[key].shortcode, roomTimeline);
          }}
        />
      ))}

      {canSendReaction && (
        <IconButton
          className="ms-2 btn-sm reaction-message"
          onClick={(e) => {
            if (reacts.order.length < reactionLimit) {
              pickEmoji(e, roomId, mEvent.getId(), roomTimeline, -430, 0, reacts);
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

// Detect Media
function isMedia(mE) {
  return (
    mE.getContent()?.msgtype === 'm.file' ||
    mE.getContent()?.msgtype === 'm.image' ||
    mE.getContent()?.msgtype === 'm.audio' ||
    mE.getContent()?.msgtype === 'm.video' ||
    mE.getType() === 'm.sticker'
  );
}

function shouldShowThreadSummary(mEvent, roomTimeline) {
  if (mEvent.isThreadRoot) {
    const thread = mEvent.getThread();
    return (
      // there must be events in the threadW
      (thread?.length ?? 0) > 0 &&
      Array.isArray(roomTimeline.timeline) &&
      roomTimeline.timeline.length > 0 &&
      // thread.lastEvent &&
      // don't show the thread summary if we're in a thread
      roomTimeline.thread === undefined
    );
  }
  return false;
}

const MessageOptions = React.memo(
  ({
    allowTranslate = false,
    haveReactions = false,
    translateText,
    setTranslateText,
    refRoomInput,
    roomTimeline,
    mEvent,
    edit,
    reply,
    roomid,
    threadId,
    senderid,
    eventid,
    msgtype,
    body,
    customHTML,
  }) => {
    const [isForceThreadVisible, setIsForceThreadVisible] = useState(
      matrixAppearance.get('forceThreadButton'),
    );
    const { roomId, room } = roomTimeline;
    const mx = initMatrix.matrixClient;
    const mxcUrl = initMatrix.mxcUrl;
    const senderId = mEvent.getSender();
    const eventId = mEvent.getId();
    if (!eventId) {
      console.warn('Message without id', mEvent);
      return null;
    }

    const myUserId = mx.getUserId();
    if (!myUserId) {
      console.warn('No user id in MessageOptions, this should not be possible');
      return null;
    }

    const myPowerlevel = room.getMember(myUserId)?.powerLevel;
    const canIRedact = room.currentState.hasSufficientPowerLevelFor('redact', myPowerlevel);
    const canSendReaction = room.currentState.maySendEvent('m.reaction', myUserId);
    const canCreateThread =
      room.currentState.maySendEvent('m.thread', myUserId) &&
      // this message is already a thread
      !shouldShowThreadSummary(mEvent, roomTimeline) &&
      // can't create threads in threads
      roomTimeline.thread === undefined;

    const createThread = () => {
      room.createThread(eventId, mEvent, [mEvent], true);
      selectRoom(roomId, eventId, eventId);
    };

    useEffect(() => {
      const newForceThread = (value) => setIsForceThreadVisible(value);
      matrixAppearance.on('forceThreadButton', newForceThread);
      return () => {
        matrixAppearance.off('forceThreadButton', newForceThread);
      };
    });

    const translateMessage =
      (hideMenu = () => {}) =>
      () => {
        hideMenu();
        let sourceText = '';
        try {
          sourceText = customHTML
            ? html(customHTML, roomId, threadId, { kind: 'edit', onlyPlain: true }).plain
            : plain(body, roomId, threadId, { kind: 'edit', onlyPlain: true }).plain;
          if (typeof sourceText !== 'string') sourceText = '';
        } catch (err) {
          console.error(err);
          alert(err.message, 'Translate get text error');
          sourceText = '';
        }

        if (sourceText.length > 0) {
          setLoadingPage('Translating message...');
          libreTranslate
            .translate(sourceText)
            .then((text) => {
              setLoadingPage(false);
              if (typeof text === 'string') {
                setTranslateText(text);
              }
            })
            .catch((err) => {
              setLoadingPage(false);
              console.error(err);
              alert(err.message, 'Libre Translate Progress Error');
            });
        } else {
          alert('There is no text to translate here.', 'Libre Translate Progress Error');
        }
      };

    const removeTranslateMessage =
      (hideMenu = () => {}) =>
      () => {
        hideMenu();
        setTranslateText(null);
      };

    return (
      <div className="message__options">
        {canSendReaction && (
          <IconButton
            onClick={(e) => pickEmoji(e, roomId, eventId, roomTimeline)}
            fa="fa-solid fa-heart-circle-plus"
            size="normal"
            tooltip="Add reaction"
          />
        )}
        <IconButton onClick={() => reply()} fa="fa-solid fa-reply" size="normal" tooltip="Reply" />

        {canSupport('Thread') &&
          canCreateThread &&
          (isForceThreadVisible || !roomTimeline.isEncrypted()) && (
            <IconButton
              onClick={() => createThread()}
              fa="bi bi-layers"
              size="normal"
              tooltip="Create thread"
            />
          )}

        {senderId === mx.getUserId() && !isMedia(mEvent) && (
          <IconButton
            onClick={() => edit(true)}
            fa="fa-solid fa-pencil"
            size="normal"
            tooltip="Edit"
          />
        )}

        {(canIRedact || senderId === mx.getUserId()) && (
          <IconButton
            className="need-shift"
            onClick={() => storageManager.redactEvent(roomId, mEvent.getId())}
            fa="fa-solid fa-trash-can btn-text-danger"
            size="normal"
            tooltip="Delete"
          />
        )}

        {libreTranslate.get('visible') ? (
          allowTranslate ? (
            <IconButton
              className="need-shift"
              onClick={translateMessage()}
              fa="fa-solid fa-language btn-text-info"
              size="normal"
              tooltip="Translate message"
            />
          ) : typeof translateText === 'string' ? (
            <IconButton
              className="need-shift"
              onClick={removeTranslateMessage()}
              fa="fa-solid fa-language btn-text-warning"
              size="normal"
              tooltip="Original message"
            />
          ) : null
        ) : null}

        <ContextMenu
          content={(hideMenu) => (
            <>
              <MenuHeader>Options</MenuHeader>

              {haveReactions ? (
                <MenuItem
                  className="text-start"
                  faSrc="fa-solid fa-face-smile"
                  onClick={() => {
                    const body = $('<div>', { class: 'd-flex' });
                    const ul = $('<ul>', { class: 'nav nav-pills nav flex-column react-list' });
                    const content = $('<div>', { class: 'tab-content react-content' });

                    const { reactionTimeline } = roomTimeline;
                    const eventReactions = reactionTimeline.get(mEvent.getId());
                    const reacts = getEventReactions(eventReactions);
                    const appearanceSettings = getAppearance();
                    let modal;

                    let i = 0;
                    for (const key in reacts.data) {
                      const id = `reactions_${eventId}_${i}`;

                      const users = [];
                      for (const item in reacts.data[key].users) {
                        const userId = reacts.data[key].users[item];
                        const user = mx.getUser(userId);
                        const color = colorMXID(userId);

                        const username = user ? muteUserManager.getSelectorName(user) : userId;
                        const avatarAnimSrc = user ? mxcUrl.toHttp(user.avatarUrl) : null;
                        const avatarSrc = user
                          ? mxcUrl.toHttp(user.avatarUrl, dfAvatarSize, dfAvatarSize)
                          : null;

                        const ct = $('<div>', {
                          class: 'align-top text-center chat-base d-inline-block',
                        });

                        users.push(
                          $('<div>', { class: 'my-2 user-react rounded p-1' })
                            .append(
                              ct.append(
                                AvatarJquery({
                                  animParentsCount: 3,
                                  className: 'profile-image-container',
                                  imgClass: 'profile-image-container',
                                  imageSrc: avatarSrc,
                                  imageAnimSrc: avatarAnimSrc,
                                  isDefaultImage: true,
                                }),
                              ),

                              $('<span>', { class: 'small react-username' }).text(username),
                            )
                            .on('click', () => {
                              modal.hide();
                              openProfileViewer(userId, roomId);
                            }),
                        );
                      }

                      content.append(
                        $('<div>', {
                          class: `tab-pane container ${i !== 0 ? 'fade' : 'active'}`,
                          id,
                        }).append(users),
                      );

                      ul.append(
                        $('<li>', { class: 'nav-item' }).append(
                          $('<a>', {
                            class: `nav-link${i !== 0 ? '' : ' active'}`,
                            'data-bs-toggle': 'tab',
                            href: `#${id}`,
                          }).append(
                            reactionImgjQuery(
                              key,
                              reacts.data[key].shortcode,
                              getCustomEmojiUrl(key),
                            ),
                            $('<span>', { class: 'react-count' }).text(reacts.data[key].count),
                          ),
                        ),
                      );
                      i++;
                    }

                    // Empty List
                    if (i < 1) {
                      body.append(
                        $('<center>', {
                          class: 'p-0 pe-3 py-1 small',
                        }).text("This message doesn't have any reactions... yet."),
                      );
                    } else {
                      body.append(ul);
                      body.append(content);
                    }

                    modal = btModal({
                      title: 'Reactions',

                      id: 'message-reactions',
                      dialog: 'modal-lg modal-dialog-scrollable modal-dialog-centered',
                      body,
                    });
                    hideMenu();
                  }}
                >
                  View reactions
                </MenuItem>
              ) : null}

              <MenuItem
                className="text-start"
                faSrc="fa-solid fa-copy"
                onClick={() => {
                  const messageBody = $(
                    `[roomid='${roomid}'][senderid='${senderid}'][eventid='${eventid}'][msgtype='${msgtype}'] .message-body`,
                  );
                  if (messageBody.length > 0) {
                    tinyClipboard.copyText(
                      customHTML
                        ? html(customHTML, roomId, threadId, { kind: 'edit', onlyPlain: true })
                            .plain
                        : plain(body, roomId, threadId, { kind: 'edit', onlyPlain: true }).plain,
                    );
                    toast('Text successfully copied to the clipboard.');
                    hideMenu();
                  } else {
                    toast('No text was found in this message.');
                    hideMenu();
                  }
                }}
              >
                Copy text
              </MenuItem>

              {allowTranslate ? (
                <MenuItem
                  className="text-start"
                  faSrc="fa-solid fa-language"
                  onClick={translateMessage(hideMenu)}
                >
                  Translate message
                </MenuItem>
              ) : typeof translateText === 'string' ? (
                <MenuItem
                  className="text-start btn-text-warning"
                  faSrc="fa-solid fa-language"
                  onClick={removeTranslateMessage(hideMenu)}
                >
                  <strong className="text-warning">Original message</strong>
                </MenuItem>
              ) : null}

              {!room.hasEncryptionStateEvent() && canPinMessage(room, myUserId) ? (
                <MenuItem
                  className="text-start"
                  faSrc={`bi bi-pin-angle${!isPinnedMessage(room, eventid) ? '-fill' : ''}`}
                  onClick={() => {
                    setPinMessage(room, eventid, !isPinnedMessage(room, eventid));
                    if (!isMobile()) $(refRoomInput.current).find('#message-textarea').focus();
                    hideMenu();
                  }}
                >
                  {!isPinnedMessage(room, eventid) ? 'Pin message' : 'Unpin message'}
                </MenuItem>
              ) : null}

              <MenuItem
                className="text-start"
                faSrc="fa-solid fa-check-double"
                onClick={() => openReadReceipts(roomId, roomTimeline.getEventReaders(mEvent))}
              >
                Read receipts
              </MenuItem>

              <MenuItem
                className="text-start"
                faSrc="fa-solid fa-code"
                onClick={() => openViewSource(mEvent)}
              >
                View source
              </MenuItem>

              {(canIRedact || senderId === mx.getUserId()) && (
                <>
                  <MenuBorder />
                  <MenuItem
                    className="text-start btn-text-danger"
                    faSrc="fa-solid fa-trash-can"
                    onClick={async () => {
                      const isConfirmed = await confirmDialog(
                        'Delete message',
                        'Are you sure that you want to delete this message?',
                        'Delete',
                        'danger',
                      );
                      if (!isConfirmed) return;
                      storageManager.redactEvent(roomId, mEvent.getId());
                    }}
                  >
                    Delete
                  </MenuItem>
                </>
              )}
            </>
          )}
          render={(toggleMenu) => (
            <IconButton
              onClick={toggleMenu}
              fa="bi bi-three-dots-vertical"
              size="normal"
              tooltip="Options"
            />
          )}
        />
      </div>
    );
  },
);

// Options Default
MessageOptions.propTypes = {
  allowTranslate: PropTypes.bool,
  translateText: PropTypes.string,
  setTranslateText: PropTypes.func,
  haveReactions: PropTypes.bool,
  roomid: PropTypes.string,
  threadId: PropTypes.string,
  senderid: PropTypes.string,
  eventid: PropTypes.string,
  msgtype: PropTypes.string,
  roomTimeline: PropTypes.shape({}).isRequired,
  mEvent: PropTypes.shape({}).isRequired,
  edit: PropTypes.func.isRequired,
  reply: PropTypes.func.isRequired,
};

// Thread
const MessageThreadSummary = React.memo(({ thread, useManualCheck = false }) => {
  const [lastReply, setLastReply] = useState(thread.lastReply());
  const [manualCheck, setManualCheck] = useState(false);
  const [show, setShow] = useState(false);
  thread.setMaxListeners(__ENV_APP__.MAX_LISTENERS);

  const appearanceSettings = getAppearance();

  // can't have empty threads
  if (thread.length === 0) return null;

  // Matrix
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;

  // Sender
  const lastSender =
    typeof lastReply?.sender === 'string' ? mx.getUser(lastReply?.sender) : lastReply?.sender;

  // Color
  const color =
    lastSender && typeof lastSender?.userId === 'string' ? colorMXID(lastSender?.userId) : null;

  // Avatar
  const avatarSrc =
    mxcUrl.getAvatarUrl(lastSender, dfAvatarSize, dfAvatarSize, undefined, true, false) ?? null;
  const avatarAnimSrc = mxcUrl.getAvatarUrl(lastSender);

  // Select Thread
  function selectThread() {
    selectRoom(thread.roomId, undefined, thread.rootEvent?.getId());
  }

  // Stuff
  useEffect(() => {
    const threadTimelineUpdate = (event, room, toStartOfTimeline, removed, data) => {
      setShow(
        typeof event.thread.liveTimeline !== 'undefined' && event.thread.liveTimeline !== null,
      );
      setLastReply(thread.lastReply());
    };
    const threadTimelineUpdate2 = () => {
      setShow(typeof thread.liveTimeline !== 'undefined' && thread.liveTimeline !== null);
      setLastReply(thread.lastReply());
    };

    if (useManualCheck && !manualCheck) {
      setManualCheck(true);
      setShow(thread.liveTimeline !== 'undefined' && thread.liveTimeline !== null);
    }

    thread.on(RoomEvent.Timeline, threadTimelineUpdate);
    thread.on(RoomEvent.TimelineRefresh, threadTimelineUpdate2);
    thread.on(RoomEvent.TimelineReset, threadTimelineUpdate2);
    return () => {
      thread.off(RoomEvent.Timeline, threadTimelineUpdate);
      thread.off(RoomEvent.TimelineRefresh, threadTimelineUpdate2);
      thread.off(RoomEvent.TimelineReset, threadTimelineUpdate2);
    };
  });

  // Complete
  // Couldn&apos;t load latest message
  return (
    <button
      disabled={!show}
      className={`message__threadSummary p-2 small${!show ? ' disabled' : ''}`}
      onClick={selectThread}
      type="button"
    >
      <div className="message__threadSummary-count">
        <Text>
          {thread.length} message{thread.length > 1 ? 's' : ''} ›
        </Text>
      </div>
      <div className="message__threadSummary-lastReply text-truncate text-bg">
        {lastReply ? (
          <>
            {lastSender ? (
              <>
                <Avatar
                  animParentsCount={2}
                  isDefaultImage
                  className="profile-image-container"
                  imageSrc={avatarSrc}
                  imageAnimSrc={avatarAnimSrc}
                  text={lastSender?.name}
                  bgColor={backgroundColorMXID(lastSender?.userId)}
                  size="small"
                />
                <span className="message__threadSummary-lastReply-sender very-small text-truncate">
                  {lastSender?.name}{' '}
                </span>
              </>
            ) : (
              <span className="message__threadSummary-lastReply-sender very-small text-truncate">
                Unknown user{' '}
              </span>
            )}
            <span className="message__threadSummary-lastReply-body very-small text-truncate">
              {show ? (
                lastReply.getContent().body
              ) : (
                <>
                  <div className="d-flex justify-content-center align-items-center spinner">
                    <div className="spinner-border" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>{' '}
                    Loading...
                  </div>
                </>
              )}
            </span>
          </>
        ) : (
          <>
            <div className="d-flex justify-content-center align-items-center spinner">
              <span className="message__threadSummary-lastReply-sender very-small text-truncate">
                <i className="fa-solid fa-circle-exclamation me-1" />
                Couldn't load the last message.
              </span>
            </div>
          </>
        )}
      </div>
    </button>
  );
});

// Media Generator
function genMediaContent(mE, seeHiddenData, setSeeHiddenData) {
  // Client
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const mContent = mE.getContent();
  if (!mContent || !mContent.body)
    return <span style={{ color: 'var(--bg-danger)' }}>Malformed event</span>;

  // Content URL
  let mediaMXC = mContent?.url;
  const isEncryptedFile = typeof mediaMXC === 'undefined';
  if (isEncryptedFile) mediaMXC = mContent?.file?.url;

  // Thumbnail
  let thumbnailMXC = mContent?.info?.thumbnail_url;

  // Bad Event Again
  if (typeof mediaMXC === 'undefined' || mediaMXC === '')
    return <span style={{ color: 'var(--bg-danger)' }}>Malformed event</span>;

  // Content Type
  let msgType = mE.getContent()?.msgtype;
  const safeMimetype = getBlobSafeMimeType(mContent.info?.mimetype);

  // Sticker
  if (mE.getType() === 'm.sticker') {
    msgType = 'm.sticker';
  }

  // File
  else if (safeMimetype === 'application/octet-stream') {
    msgType = 'm.file';
  }

  const blurhash = mContent?.info?.['xyz.amorgan.blurhash'];
  const senderId = mE.getSender();

  switch (msgType) {
    // File
    case 'm.file':
      return (
        <Media.File
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          content={mContent}
          link={mxcUrl.toHttp(mediaMXC)}
          file={mContent.file || null}
        />
      );

    // Image
    case 'm.image':
      return !muteUserManager.isImageMuted(senderId) || seeHiddenData ? (
        <Media.Image
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          width={typeof mContent.info?.w === 'number' ? mContent.info?.w : null}
          height={typeof mContent.info?.h === 'number' ? mContent.info?.h : null}
          link={mxcUrl.toHttp(mediaMXC)}
          file={isEncryptedFile ? mContent.file : null}
          content={mContent}
          blurhash={blurhash}
        />
      ) : (
        <a
          href="#"
          className="text-warning"
          onClick={(e) => {
            e.preventDefault();
            setSeeHiddenData(true);
          }}
        >
          <i className="fa-solid fa-eye-slash me-1" />
          Hidden Image. Click here to view.
        </a>
      );

    // Sticker
    case 'm.sticker':
      const enableAnimParams = getAppearance('enableAnimParams');
      return !muteUserManager.isStickerMuted(senderId) || seeHiddenData ? (
        <Media.Sticker
          content={mContent}
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          width={
            typeof mContent.info?.w === 'number' && !Number.isNaN(mContent.info?.w)
              ? mContent.info?.w
              : null
          }
          height={
            typeof mContent.info?.h === 'number' && !Number.isNaN(mContent.info?.h)
              ? mContent.info?.h
              : null
          }
          link={
            !enableAnimParams
              ? mxcUrl.toHttp(mediaMXC)
              : getAnimatedImageUrl(mxcUrl.toHttp(mediaMXC, 170, 170))
          }
          file={isEncryptedFile ? mContent.file : null}
        />
      ) : (
        <a
          href="#"
          className="text-warning"
          onClick={(e) => {
            e.preventDefault();
            setSeeHiddenData(true);
          }}
        >
          <i className="fa-solid fa-eye-slash me-1" />
          Hidden Sticker. Click here to view.
        </a>
      );

    // Audio
    case 'm.audio':
      return (
        <Media.Audio
          content={mContent}
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          link={mxcUrl.toHttp(mediaMXC)}
          file={mContent.file || null}
        />
      );

    // Video
    case 'm.video':
      if (typeof thumbnailMXC === 'undefined') {
        thumbnailMXC = mContent.info?.thumbnail_file?.url || null;
      }
      return !muteUserManager.isVideoMuted(senderId) || seeHiddenData ? (
        <Media.Video
          content={mContent}
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          link={mxcUrl.toHttp(mediaMXC)}
          thumbnail={thumbnailMXC === null ? null : mxcUrl.toHttp(thumbnailMXC)}
          thumbnailFile={isEncryptedFile ? mContent.info?.thumbnail_file : null}
          thumbnailType={mContent.info?.thumbnail_info?.mimetype || null}
          width={typeof mContent.info?.w === 'number' ? mContent.info?.w : null}
          height={typeof mContent.info?.h === 'number' ? mContent.info?.h : null}
          file={isEncryptedFile ? mContent.file : null}
          blurhash={blurhash}
        />
      ) : (
        <a
          href="#"
          className="text-warning"
          onClick={(e) => {
            e.preventDefault();
            setSeeHiddenData(true);
          }}
        >
          <i className="fa-solid fa-eye-slash me-1" />
          Hidden Video. Click here to view.
        </a>
      );

    // Bad Event Again?
    default:
      return <span style={{ color: 'var(--bg-danger)' }}>Malformed event</span>;
  }
}

function getEditedBody(editedMEvent) {
  const newContent = editedMEvent['m.new_content'];
  if (typeof newContent === 'undefined') return [null, false, null];

  const isCustomHTML = newContent.format === 'org.matrix.custom.html';
  const parsedContent = parseReply(newContent.body);
  if (parsedContent === null) {
    return [newContent.body, isCustomHTML, newContent.formatted_body ?? null];
  }
  return [parsedContent.body, isCustomHTML, newContent.formatted_body ?? null];
}

function Message({
  mEvent,
  isBodyOnly = false,
  roomTimeline = null,
  focus = false,
  focusTime = 10,
  fullTime = false,
  isEdit = false,
  setEdit = null,
  cancelEdit = null,
  children,
  className = null,
  classNameMessage = null,
  timelineSVRef,
  isDM,
  isGuest = false,
  disableActions = false,
  usernameHover,
  refRoomInput,
  useManualCheck = false,
}) {
  // Get Room Data
  const { notifications } = initMatrix;
  const appearanceSettings = getAppearance();
  $(timelineSVRef?.current).trigger('scroll');
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const roomId = mEvent.getRoomId();
  const threadId = mEvent.getThread()?.id;
  const { editedTimeline, reactionTimeline } = roomTimeline ?? {};

  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const [seeHiddenData, setSeeHiddenData] = useState(false);
  const [existThread, updateExistThread] = useState(typeof threadId === 'string');
  const [embeds, setEmbeds] = useState([]);
  const [isFocus, setIsFocus] = useState(null);
  const [translateText, setTranslateText] = useState(null);
  const messageElement = useRef(null);

  const [isStickersVisible, setIsStickersVisible] = useState(matrixAppearance.get('showStickers'));

  // Content Body
  const classList = ['message', isBodyOnly ? 'message--body-only' : 'message--full'];
  const content = mEvent.getContent();
  const eventId = mEvent.getId();
  const msgType = content?.msgtype;
  const senderId = mEvent.getSender();
  const yourId = mx.getUserId();

  if (yourId === senderId) classList.push('user-you-message');
  else classList.push('user-other-message');

  let { body } = content;
  const [bodyData, setBodyData] = useState(body);

  // make the message transparent while sending and red if it failed sending
  const [messageStatus, setMessageStatus] = useState(mEvent.status);

  mEvent.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
  const onMsgStatus = (e) => {
    console.log(`[your-message] [status] [${e.getId()}]`, e.status);
    setMessageStatus(e.status);
  };

  const onMsgRefresh = (e) => {
    forceUpdate();
    storageManager.addToTimeline(e);
  };

  mEvent.once(MatrixEventEvent.Status, onMsgStatus);
  mEvent.once(MatrixEventEvent.Decrypted, onMsgRefresh);
  mEvent.once(MatrixEventEvent.Replaced, onMsgRefresh);

  const color = colorMXID(senderId);
  const username = muteUserManager.getMessageName(mEvent, isDM);
  const avatarSrc = mxcUrl.getAvatarUrl(mEvent.sender, dfAvatarSize, dfAvatarSize);
  const avatarAnimSrc = mxcUrl.getAvatarUrl(mEvent.sender);

  // Content Data
  let isCustomHTML = content.format === 'org.matrix.custom.html';
  let customHTML = isCustomHTML ? content.formatted_body : null;

  // Edit Data
  const edit = useCallback(() => {
    if (eventId && setEdit) setEdit(eventId);
    tinyFixScrollChat();
  }, [setEdit, eventId]);

  // Reply Data
  const reply = useCallback(() => {
    if (eventId && senderId) replyTo(senderId, eventId, body, customHTML);
    tinyFixScrollChat();
  }, [body, customHTML, eventId, senderId]);

  if (!eventId) {
    // if the message doesn't have an id then there's nothing to do
    console.warn('Message without id', mEvent);
    return null;
  }

  if (msgType === 'm.emote') classList.push('message--type-emote');

  // Emoji Type
  const isEdited = editedTimeline ? editedTimeline.has(eventId) : false;
  const haveReactions = reactionTimeline
    ? reactionTimeline.has(eventId) || !!mEvent.getServerAggregatedRelation('m.annotation')
    : false;
  const eventRelation = mEvent.getRelation();

  // Is Reply
  const isReply =
    !!mEvent.replyEventId &&
    // don't render thread fallback replies
    !(eventRelation?.rel_type === THREAD_RELATION_TYPE.name && eventRelation?.is_falling_back);

  // Is Edit
  if (isEdited) {
    const editedList = editedTimeline.get(eventId);
    const editedMEvent = editedList[editedList.length - 1];
    [body, isCustomHTML, customHTML] = getEditedBody(editedMEvent);
  }

  // Is Reply
  if (isReply) {
    body = parseReply(body)?.body ?? body;
    customHTML = trimHTMLReply(customHTML);
  }

  // Fix Body String
  if (typeof body !== 'string') body = '';

  // Add Class Items
  if (className) {
    const tinyClasses = className.split(' ');
    for (const item in tinyClasses) {
      classList.push(tinyClasses[item]);
    }
  }

  useEffect(() => {
    if (embeds.length < 1 && !muteUserManager.isEmbedMuted(senderId)) {
      const bodyUrls = [];
      if (typeof bodyData === 'string' && bodyData.length > 0) {
        try {
          const newBodyUrls = linkify.find(
            bodyData
              .replace(
                /\> \<\@([\S\s]+?)\> ([\S\s]+?)\n\n|\> \<\@([\S\s]+?)\> ([\S\s]+?)\\n\\n/gm,
                '',
              )
              .replace(
                /^((?:(?:[ ]{4}|\t).*(\R|$))+)|`{3}([\w]*)\n([\S\s]+?)`{3}|`{3}([\S\s]+?)`{3}|`{2}([\S\s]+?)`{2}|`([\S\s]+?)|\[([\S\s]+?)\]|\{([\S\s]+?)\}|\<([\S\s]+?)\>|\(([\S\s]+?)\)/gm,
                '',
              ),
          );

          if (Array.isArray(newBodyUrls)) {
            for (const item in newBodyUrls) {
              if (tinyLinkifyFixer(newBodyUrls[item].type, newBodyUrls[item].value)) {
                bodyUrls.push(newBodyUrls[item]);
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      }

      // Room jQuery base
      const messageFinder = `[roomid='${roomId}'][senderid='${senderId}'][eventid='${eventId}'][msgtype='${msgType}']`;

      // Read Message
      if (msgType === 'm.text') {
        // Check Urls on the message
        const appAppearance = getAppearance();
        if (appAppearance.isEmbedEnabled === true && bodyUrls.length > 0) {
          // Create embed base
          const newEmbeds = [];
          const searchEmbeds = async () => {
            let limit = 5;
            const addEmbedItem = async (item) => {
              if (bodyUrls[item].href && limit > 0 && !bodyUrls[item].href.startsWith('@')) {
                const tinyEmbed = {
                  url: bodyUrls[item],
                  roomId,
                  senderId,
                  eventId,
                };

                if (
                  bodyUrls[item].href.startsWith('http') ||
                  bodyUrls[item].href.startsWith('https')
                ) {
                  try {
                    tinyEmbed.data = await getUrlPreview(bodyUrls[item].href);
                    tinyFixScrollChat();
                  } catch (err) {
                    tinyEmbed.data = null;
                    console.error(err);
                  }
                } else {
                  tinyEmbed.data = null;
                }

                newEmbeds.push(tinyEmbed);
                limit--;
              }
            };

            const embedParallelLoad = getAppearance('embedParallelLoad');
            if (embedParallelLoad) {
              await forPromise({ data: bodyUrls }, async (item, fn) => {
                await addEmbedItem(item);
                fn();
              });
            } else {
              for (const item in bodyUrls) {
                await addEmbedItem(item);
              }
            }

            tinyFixScrollChat();
            setEmbeds(newEmbeds);
          };

          searchEmbeds();
        }
      }

      // Complete
      tinyFixScrollChat();
    } else if (embeds.length > 0 && muteUserManager.isEmbedMuted(senderId)) {
      setEmbeds([]);
    }
  });

  useEffect(() => {
    const threadUpdate = (tth) => {
      const thread = mEvent.getThread();
      if (thread && tth.id === thread.id) {
        if (!existThread) updateExistThread(true);
      }
    };

    notifications.on(cons.events.notifications.THREAD_NOTIFICATION, threadUpdate);
    return () => {
      notifications.off(cons.events.notifications.THREAD_NOTIFICATION, threadUpdate);
    };
  });

  let isMentioned = false;
  const bodyLower = body.toLowerCase();
  for (const item in everyoneTags) {
    if (bodyLower.includes(everyoneTags[item])) {
      isMentioned = true;
    }
  }

  if (
    objType(content['m.mentions'], 'object') &&
    Array.isArray(content['m.mentions'].user_ids) &&
    content['m.mentions'].user_ids.length > 0
  ) {
    for (const item in content['m.mentions'].user_ids) {
      if (
        typeof content['m.mentions'].user_ids[item] === 'string' &&
        content['m.mentions'].user_ids[item] === yourId
      ) {
        isMentioned = true;
      }
    }
  }

  useEffect(() => {
    let removeFocusTimeout = null;
    const msgElement = $(messageElement.current);
    if (isFocus === null) setIsFocus(focus);
    if (isFocus || isMentioned) {
      msgElement.addClass('message-focus');
      if (isMentioned) msgElement.addClass('message-mention');
      if (typeof focusTime === 'number') {
        removeFocusTimeout = setTimeout(() => {
          if (!isMentioned) msgElement.removeClass('message-focus');
        }, 1000 * focusTime);
      }
    }
    return () => {
      if (removeFocusTimeout) clearTimeout(removeFocusTimeout);
      if (!isMentioned) msgElement.removeClass('message-focus');
    };
  });

  useEffect(() => {
    const updateShowStickers = (showStickers) => {
      setIsStickersVisible(showStickers);
    };
    matrixAppearance.on('showStickers', updateShowStickers);
    return () => {
      matrixAppearance.off('showStickers', updateShowStickers);
    };
  });

  useEffect(() => {
    const tinyUpdate = (info) => {
      if (info.userId === senderId) forceUpdate();
    };
    const tinyUpdate2 = (info) => {
      forceUpdate();
    };
    libreTranslate.on('enabled', tinyUpdate2);
    libreTranslate.on('apiKey', tinyUpdate2);
    libreTranslate.on('host', tinyUpdate2);
    muteUserManager.on('mute', tinyUpdate);
    muteUserManager.on('friendNickname', tinyUpdate);
    return () => {
      libreTranslate.off('enabled', tinyUpdate2);
      libreTranslate.off('apiKey', tinyUpdate2);
      libreTranslate.off('host', tinyUpdate2);
      muteUserManager.off('mute', tinyUpdate);
      muteUserManager.off('friendNickname', tinyUpdate);
    };
  });

  const contextMenuClick = (e) => {
    if (!initMatrix.isGuest)
      openReusableContextMenu('bottom', getEventCords(e, '.ic-btn'), (closeMenu) => (
        <UserOptions userId={senderId} afterOptionSelect={closeMenu} />
      ));

    e.preventDefault();
  };

  const allowTranslate = translateText === null && libreTranslate.canUse();

  const avatarHtml = (
    <td className="p-0 ps-2 ps-md-4 py-1 pe-md-2 align-top text-center chat-base">
      {
        // User Avatar
        !isBodyOnly ? (
          <MessageAvatar
            roomId={roomId}
            avatarSrc={avatarSrc}
            avatarAnimSrc={avatarAnimSrc}
            userId={senderId}
            username={username}
            bgColor={color}
            contextMenu={contextMenuClick}
          />
        ) : (
          <MessageTime className="hc-time" timestamp={mEvent.getTs()} fullTime={fullTime} />
        )
      }
    </td>
  );

  const msgOptions = !isGuest && !disableActions && roomTimeline && !isEdit && (
    <MessageOptions
      allowTranslate={allowTranslate}
      setTranslateText={setTranslateText}
      translateText={translateText}
      haveReactions={haveReactions}
      refRoomInput={refRoomInput}
      customHTML={customHTML}
      body={body}
      roomid={roomId}
      threadId={threadId}
      senderid={senderId}
      eventid={eventId}
      msgtype={msgType}
      roomTimeline={roomTimeline}
      mEvent={mEvent}
      edit={edit}
      reply={reply}
    />
  );

  const msgItems = (
    <>
      {!isBodyOnly && (
        <div className="mb-1">
          <MessageHeader
            usernameHover={usernameHover}
            userId={senderId}
            username={username}
            roomId={roomId}
          />

          <MessageTime className="ms-2" timestamp={mEvent.getTs()} fullTime={fullTime} />
        </div>
      )}

      {roomTimeline && isReply && (
        <MessageReplyWrapper roomTimeline={roomTimeline} eventId={mEvent.replyEventId} />
      )}
    </>
  );

  const msgItems2 = (
    <>
      {haveReactions && <MessageReactionGroup roomTimeline={roomTimeline} mEvent={mEvent} />}

      {roomTimeline && shouldShowThreadSummary(mEvent, roomTimeline) && (
        <MessageThreadSummary useManualCheck={useManualCheck} thread={mEvent.thread} />
      )}
    </>
  );

  const editItemBase = isEdit && (
    <MessageEdit
      roomId={roomId}
      eventId={mEvent.getId()}
      refRoomInput={refRoomInput}
      body={
        customHTML
          ? html(customHTML, roomId, threadId, { kind: 'edit', onlyPlain: true }).plain
          : plain(body, roomId, threadId, { kind: 'edit', onlyPlain: true }).plain
      }
      onSave={(newBody, oldBody) => {
        if (newBody !== oldBody) {
          setBodyData(newBody);
          setEmbeds([]);
          initMatrix.roomsInput.sendEditedMessage(roomId, threadId, mEvent, newBody);
        }
        cancelEdit();
      }}
      onCancel={cancelEdit}
    />
  );

  // Normal Message
  if (msgType !== 'm.bad.encrypted') {
    if (mEvent.getType() !== 'm.sticker' || isStickersVisible) {
      // Return Data
      return (
        <tr
          ref={messageElement}
          roomid={roomId}
          senderid={senderId}
          eventid={eventId}
          msgtype={msgType}
          className={classList.join(' ')}
        >
          {avatarHtml}
          <td className="p-0 pe-3 py-1" colSpan={!children ? '2' : ''}>
            {msgOptions}
            {msgItems}
            {!isEdit && (
              <>
                <MessageBody
                  roomId={roomId}
                  senderId={senderId}
                  eventId={eventId}
                  threadId={threadId}
                  className={classNameMessage}
                  senderName={username}
                  isCustomHTML={isCustomHTML}
                  translateText={translateText}
                  body={
                    isMedia(mEvent)
                      ? genMediaContent(mEvent, seeHiddenData, setSeeHiddenData)
                      : (customHTML ?? body)
                  }
                  content={content}
                  msgType={msgType}
                  isEdited={isEdited}
                  messageStatus={messageStatus}
                />

                {embeds.length > 0 ? (
                  <div className="message-embed message-url-embed">
                    {embeds.map((embed) => {
                      if (embed.data)
                        return (
                          <Embed
                            roomId={roomId}
                            threadId={threadId}
                            key={`msg_embed_${embed.eventId}_${embed.url?.href}`}
                            embed={embed.data}
                            url={embed.url}
                          />
                        );
                    })}
                  </div>
                ) : null}
              </>
            )}
            {editItemBase}
            {msgItems2}
          </td>
          {children && <td className="p-0 pe-3 py-1">{children}</td>}
        </tr>
      );
    }
  }

  // Bad Message
  const errorMessage = `<i class="bi bi-key-fill text-warning"></i> <strong>Unable to decrypt message.</strong>`;
  isCustomHTML = true;
  return (
    <tr
      ref={messageElement}
      roomid={roomId}
      senderid={senderId}
      eventid={eventId}
      msgtype={msgType}
      className={classList.join(' ')}
    >
      {avatarHtml}
      <td className="p-0 pe-3 py-1">
        {msgOptions}
        {msgItems}
        {!isEdit && (
          <MessageBody
            roomId={roomId}
            senderId={senderId}
            eventId={eventId}
            threadId={threadId}
            senderName={username}
            isSystem={isCustomHTML}
            body={errorMessage}
            content={content}
            msgType={msgType}
            isEdited={isEdited}
            messageStatus={messageStatus}
          />
        )}
        {editItemBase}
        {msgItems2}
      </td>
    </tr>
  );
}

// Message Default Data
Message.propTypes = {
  useManualCheck: PropTypes.bool,
  focusTime: PropTypes.number,
  classNameMessage: PropTypes.string,
  className: PropTypes.string,
  mEvent: PropTypes.shape({}).isRequired,
  isBodyOnly: PropTypes.bool,
  roomTimeline: PropTypes.shape({}),
  focus: PropTypes.bool,
  fullTime: PropTypes.bool,
  isEdit: PropTypes.bool,
  isGuest: PropTypes.bool,
  disableActions: PropTypes.bool,
  setEdit: PropTypes.func,
  cancelEdit: PropTypes.func,
};

// Send Export
export { Message, MessageReply, PlaceholderMessage };
