import React, { useState, useEffect } from 'react';

import { RoomEvent } from 'matrix-js-sdk';
import Text from '../../../atoms/text/Text';
import initMatrix from '../../../../client/initMatrix';

import { dfAvatarSize } from '../../../../util/matrixUtil';

import { colorMXID, backgroundColorMXID } from '../../../../util/colorMXID';
import { selectRoom } from '../../../../client/action/navigation';
import Avatar from '../../../atoms/avatar/Avatar';
import { getAppearance } from '../../../../util/libs/appearance';

export function shouldShowThreadSummary(mEvent, roomTimeline) {
  if (mEvent.isThreadRoot) {
    const thread = mEvent.getThread();
    return (
      // there must be events in the thread
      (thread?.length ?? 0) > 0 &&
      Array.isArray(roomTimeline.timeline) &&
      roomTimeline.timeline.length > 0 &&
      // don't show the thread summary if we're in a thread
      !roomTimeline.thread
    );
  }
  return false;
}

const MessageThreadSummary = React.memo(({ thread }) => {
  const [lastReply, setLastReply] = useState(thread.lastReply());
  const [show, setShow] = useState(thread.length > 0 ? true : false);
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
    const threadTimelineUpdate = () => {
      setShow(thread.length > 0 ? true : false);
      setLastReply(thread.lastReply());
    };

    thread.on('PonyHouse.ThreadReplaced', threadTimelineUpdate);
    thread.on(RoomEvent.Timeline, threadTimelineUpdate);
    return () => {
      thread.off('PonyHouse.ThreadReplaced', threadTimelineUpdate);
      thread.off(RoomEvent.Timeline, threadTimelineUpdate);
    };
  });

  // Complete
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

export default MessageThreadSummary;
