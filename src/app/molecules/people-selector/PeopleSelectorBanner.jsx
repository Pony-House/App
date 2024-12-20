import React, { useEffect, useReducer, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { UserEvent } from 'matrix-js-sdk';
import { objType } from 'for-promise/utils/lib.mjs';

import envAPI from '@src/util/libs/env';
import { openProfileViewer } from '@src/client/action/navigation';
import { convertUserId } from '@src/util/matrixUtil';

import UserStatusIcon from '@src/app/atoms/user-status/UserStatusIcon';
import Clock from '@src/app/atoms/time/Clock';
import Tooltip from '@src/app/atoms/tooltip/Tooltip';
import copyText from '@src/app/organisms/profile-viewer/copyText';

import { getUserWeb3Account, getWeb3Cfg } from '../../../util/web3';

import { twemojifyReact } from '../../../util/twemojify';

import Avatar, { AvatarJquery } from '../../atoms/avatar/Avatar';
import { canUsePresence, getPresence } from '../../../util/onlineStatus';
import initMatrix from '../../../client/initMatrix';
import { cssColorMXID } from '../../../util/colorMXID';
import { addToDataFolder, getDataList } from '../../../util/selectedRoom';
import matrixAppearance from '../../../util/libs/appearance';
import UserCustomStatus from './UserCustomStatus';

function PeopleSelectorBanner({ name, color, user = null, roomId }) {
  const [, forceUpdate] = useReducer((count) => count + 1, 0);

  const userNameRef = useRef(null);
  const displayNameRef = useRef(null);
  const profileAvatar = useRef(null);

  const noteRef = useRef(null);

  const [avatarUrl, setUserAvatar] = useState(user ? user?.avatarUrl : null);
  const [accountContent, setAccountContent] = useState(null);
  const [bannerSrc, setBannerSrc] = useState(null);
  const [loadingBanner, setLoadingBanner] = useState(false);

  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;

  useEffect(() => {
    if (user) {
      // Read Events
      const tinyNote = getDataList('user_cache', 'note', user.userId);

      const tinyNoteSpacing = (event) => {
        const element = event.target;
        element.style.height = '5px';
        element.style.height = `${Number(element.scrollHeight)}px`;
      };

      // Update Note
      const tinyNoteUpdate = (event) => {
        addToDataFolder('user_cache', 'note', user.userId, $(event.target).val(), 200);
      };

      // Open user profile
      const profileViewer = () => {
        openProfileViewer(user.userId, roomId);
      };

      // Read Events
      $(displayNameRef.current).find('> .button').on('click', profileViewer);
      $(userNameRef.current).find('> .button').on('click', profileViewer);
      $(noteRef.current)
        .on('change', tinyNoteUpdate)
        .on('keypress keyup keydown', tinyNoteSpacing)
        .val(tinyNote);
      return () => {
        $(displayNameRef.current).find('> .button').off('click', profileViewer);
        $(userNameRef.current).find('> .button').off('click', profileViewer);
        $(noteRef.current)
          .off('change', tinyNoteUpdate)
          .off('keypress keyup keydown', tinyNoteSpacing);
      };
    }
  }, [user]);

  useEffect(() => {
    const updateClock = () => forceUpdate();
    matrixAppearance.on('simplerHashtagSameHomeServer', updateClock);
    return () => {
      matrixAppearance.off('simplerHashtagSameHomeServer', updateClock);
    };
  });

  // User profile updated
  useEffect(() => {
    if (user) {
      const updateProfileStatus = (mEvent, tinyData, isFirstTime = false) => {
        // Tiny Data
        const tinyUser = tinyData;

        // Is You
        if (tinyUser.userId === mx.getUserId()) {
          const yourData = clone(mx.getAccountData('pony.house.profile')?.getContent() ?? {});
          yourData.ethereum = getUserWeb3Account();
          if (typeof yourData.ethereum.valid !== 'undefined') delete yourData.ethereum.valid;
          tinyUser.presenceStatusMsg = JSON.stringify(yourData);
        }

        // Update Status Icon
        setAccountContent(getPresence(tinyUser));
        setUserAvatar(tinyUser?.avatarUrl);
      };

      user.on(UserEvent.CurrentlyActive, updateProfileStatus);
      user.on(UserEvent.LastPresenceTs, updateProfileStatus);
      user.on(UserEvent.Presence, updateProfileStatus);
      user.on(UserEvent.AvatarUrl, updateProfileStatus);
      user.on(UserEvent.DisplayName, updateProfileStatus);
      if (!accountContent) updateProfileStatus(null, user);
      return () => {
        if (user) user.removeListener(UserEvent.CurrentlyActive, updateProfileStatus);
        if (user) user.removeListener(UserEvent.LastPresenceTs, updateProfileStatus);
        if (user) user.removeListener(UserEvent.Presence, updateProfileStatus);
        if (user) user.removeListener(UserEvent.AvatarUrl, updateProfileStatus);
        if (user) user.removeListener(UserEvent.DisplayName, updateProfileStatus);
      };
    }
  }, [user]);

  // Exist Presence
  const existPresenceObject = accountContent && objType(accountContent.presenceStatusMsg, 'object');

  // Ethereum Config
  const ethConfig = getWeb3Cfg();
  const existEthereum =
    envAPI.get('WEB3') &&
    ethConfig.web3Enabled &&
    existPresenceObject &&
    accountContent.presenceStatusMsg.ethereum &&
    accountContent.presenceStatusMsg.ethereum.valid;

  // Exist banner
  const existBanner =
    existPresenceObject &&
    typeof accountContent.presenceStatusMsg.bannerThumb === 'string' &&
    accountContent.presenceStatusMsg.bannerThumb.length > 0 &&
    typeof accountContent.presenceStatusMsg.banner === 'string' &&
    accountContent.presenceStatusMsg.banner.length > 0;

  if (existPresenceObject && existBanner && !bannerSrc && !loadingBanner) {
    setLoadingBanner(true);
    const bannerData = AvatarJquery({
      isObj: true,
      imageSrc: accountContent.presenceStatusMsg.bannerThumb,
      imageAnimSrc: accountContent.presenceStatusMsg.banner,
      onLoadingChange: () => {
        if (typeof bannerData.blobAnimSrc === 'string' && bannerData.blobAnimSrc.length > 0) {
          setBannerSrc(bannerData.blobAnimSrc);
          setLoadingBanner(false);
        }
      },
    });
  }

  if (user) {
    return (
      <>
        <div
          className={`profile-banner profile-bg${cssColorMXID(user ? user.userId : null)}${existBanner ? ' exist-banner' : ''}`}
          style={{ backgroundImage: bannerSrc ? `url("${bannerSrc}")` : null }}
        />

        <div className="text-center profile-user-profile-avatar">
          <Avatar
            animParentsCount={2}
            imgClass="profile-image-container"
            className="profile-image-container"
            ref={profileAvatar}
            imageSrc={mxcUrl.toHttp(avatarUrl, 100, 100)}
            imageAnimSrc={mxcUrl.toHttp(avatarUrl)}
            text={name}
            bgColor={color}
            size="large"
            isDefaultImage
          />
          {canUsePresence() && <UserStatusIcon className="pe-2" user={user} />}
        </div>

        <div className="card bg-bg mx-3 text-start">
          <div className="card-body">
            <h6 ref={displayNameRef} className="emoji-size-fix m-0 mb-1 fw-bold display-name">
              <span className="button">{twemojifyReact(name)}</span>
              {existEthereum ? (
                <Tooltip content={accountContent.presenceStatusMsg.ethereum.address}>
                  <span
                    className="ms-2 ethereum-icon"
                    onClick={() => {
                      copyText(
                        accountContent.presenceStatusMsg.ethereum.address,
                        'Ethereum address successfully copied to the clipboard.',
                      );
                    }}
                  >
                    <i className="fa-brands fa-ethereum" />
                  </span>
                </Tooltip>
              ) : null}
            </h6>
            <small ref={userNameRef} className="text-gray emoji-size-fix username">
              <span className="button">{twemojifyReact(convertUserId(user.userId))}</span>
            </small>

            {existPresenceObject ? (
              <>
                {typeof accountContent.presenceStatusMsg.pronouns === 'string' &&
                accountContent.presenceStatusMsg.pronouns.length > 0 ? (
                  <div className="text-gray emoji-size-fix pronouns small">
                    {twemojifyReact(accountContent.presenceStatusMsg.pronouns.substring(0, 20))}
                  </div>
                ) : null}

                <UserCustomStatus
                  className="mt-2 small"
                  presenceData={accountContent}
                  animParentsCount={2}
                  useHoverAnim
                />
              </>
            ) : null}

            {accountContent ? (
              // Object presence status
              existPresenceObject ? (
                <>
                  {typeof accountContent.presenceStatusMsg.timezone === 'string' &&
                  accountContent.presenceStatusMsg.timezone.length > 0 ? (
                    <>
                      <hr />

                      <div className="text-gray text-uppercase fw-bold very-small mb-2">
                        Timezone
                      </div>
                      <div className="emoji-size-fix small text-freedom">
                        <Clock
                          timezone={accountContent.presenceStatusMsg.timezone}
                          calendarFormat="MMMM Do YYYY, {time}"
                        />
                      </div>
                    </>
                  ) : null}

                  {typeof accountContent.presenceStatusMsg.bio === 'string' &&
                  accountContent.presenceStatusMsg.bio.length > 0 ? (
                    <>
                      <hr />
                      <div className="text-gray text-uppercase fw-bold very-small mb-2">
                        About me
                      </div>
                      <div className="emoji-size-fix small text-freedom">
                        {twemojifyReact(
                          accountContent.presenceStatusMsg.bio.substring(0, 190),
                          undefined,
                          true,
                          false,
                        )}
                      </div>
                    </>
                  ) : null}
                </>
              ) : // Text presence status
              typeof accountContent.presenceStatusMsg === 'string' &&
                accountContent.presenceStatusMsg.length > 0 ? (
                <div className="mt-2 emoji-size-fix small user-custom-status">
                  <span className="text-truncate cs-text">
                    {twemojifyReact(accountContent.presenceStatusMsg.substring(0, 100))}
                  </span>
                </div>
              ) : null
            ) : null}

            <hr />

            <label
              htmlFor="tiny-note"
              className="form-label text-gray text-uppercase fw-bold very-small mb-2"
            >
              Note
            </label>
            <textarea
              ref={noteRef}
              spellCheck="false"
              className="form-control form-control-bg emoji-size-fix small"
              id="tiny-note"
              placeholder="Insert a note here"
            />
          </div>
        </div>
      </>
    );
  }

  return null;
}

PeopleSelectorBanner.propTypes = {
  user: PropTypes.object,
  name: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
};

export default PeopleSelectorBanner;
