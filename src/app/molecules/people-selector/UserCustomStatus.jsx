import React from 'react';
import PropTypes from 'prop-types';

import { objType } from 'for-promise/utils/lib.mjs';
import { twemojifyReact } from '@src/util/twemojify';
import Img from '@src/app/atoms/image/Image';
import userPresenceEffect from '@src/util/libs/userPresenceEffect';

export const existsUserStatus = (accountContent) =>
  objType(accountContent, 'object') &&
  objType(accountContent.presenceStatusMsg, 'object') &&
  accountContent.presence !== 'offline' &&
  accountContent.presence !== 'unavailable' &&
  ((accountContent.presenceStatusMsg.msg === 'string' &&
    accountContent.presenceStatusMsg.msg.length > 0) ||
    (typeof accountContent.presenceStatusMsg.msgIcon === 'string' &&
      accountContent.presenceStatusMsg.msgIcon.length > 0));

const UserCustomStatus = React.forwardRef(
  (
    {
      user = null,
      animParentsCount = 0,
      className = null,
      forceShow = false,
      emojiFix = 'emoji-size-fix',
      useHoverAnim = false,
      disableEmojiOnly = false,
      altContent = null,
    },
    ref,
  ) => {
    const { accountContent } = userPresenceEffect(user);

    const existPresenceObject =
      accountContent && objType(accountContent.presenceStatusMsg, 'object');
    const presenceIsPureText =
      accountContent &&
      typeof accountContent.presenceStatusMsg === 'string' &&
      accountContent.presenceStatusMsg.length > 0;

    const existMsgPresence =
      existPresenceObject &&
      typeof accountContent.presenceStatusMsg.msg === 'string' &&
      accountContent.presenceStatusMsg.msg.length > 0;

    const existIconPresence =
      existPresenceObject &&
      typeof accountContent.presenceStatusMsg.msgIcon === 'string' &&
      accountContent.presenceStatusMsg.msgIcon.length > 0;

    const canShowPresence =
      forceShow ||
      ((existPresenceObject || presenceIsPureText) &&
        accountContent.presence !== 'offline' &&
        accountContent.presence !== 'invisible' &&
        accountContent.presence !== 'unavailable');

    const tinyClass = `${existMsgPresence ? `${emojiFix} ` : ''}user-custom-status${!existMsgPresence && !disableEmojiOnly ? ' custom-status-emoji-only' : ''}${className ? ` ${className}` : ''}`;

    if (canShowPresence && (existIconPresence || existMsgPresence || presenceIsPureText))
      return (
        <div ref={ref} className={tinyClass}>
          {existIconPresence ? (
            <Img
              queueId="emoji"
              animParentsCount={animParentsCount}
              className="emoji me-1"
              alt="icon"
              src={
                useHoverAnim
                  ? accountContent.presenceStatusMsg.msgIconThumb
                  : accountContent.presenceStatusMsg.msgIcon
              }
              animSrc={useHoverAnim ? accountContent.presenceStatusMsg.msgIcon : null}
            />
          ) : null}
          {existMsgPresence ? (
            <span className="text-truncate cs-text">
              {twemojifyReact(
                !presenceIsPureText
                  ? accountContent.presenceStatusMsg.msg.substring(0, 100)
                  : accountContent.presenceStatusMsg.substring(0, 100),
              )}
            </span>
          ) : null}
        </div>
      );

    return !altContent ? null : (
      <div ref={ref} className={tinyClass}>
        <span className="text-truncate cs-text">{altContent}</span>
      </div>
    );
  },
);

UserCustomStatus.propTypes = {
  user: PropTypes.object,
  animParentsCount: PropTypes.number,
  emojiFix: PropTypes.string,
  className: PropTypes.string,
  useHoverAnim: PropTypes.bool,
  disableEmojiOnly: PropTypes.bool,
  altContent: PropTypes.node,
  forceShow: PropTypes.bool,
};

export default UserCustomStatus;
