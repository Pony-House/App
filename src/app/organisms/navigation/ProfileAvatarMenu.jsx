import React, { useState, useEffect, useRef, useReducer } from 'react';
import $ from 'jquery';

import { UserEvent } from 'matrix-js-sdk';
import clone from 'clone';

import soundFiles from '@src/util/soundFiles';
import { convertUserId, dfAvatarSize } from '@src/util/matrixUtil';
import UserStatusIcon from '@src/app/atoms/user-status/UserStatusIcon';

import IconButton from '../../atoms/button/IconButton';
import { twemojifyReact } from '../../../util/twemojify';
import navigation from '../../../client/state/navigation';
import Avatar from '../../atoms/avatar/Avatar';
import cons from '../../../client/state/cons';

import { colorMXID } from '../../../util/colorMXID';

import initMatrix from '../../../client/initMatrix';
import { tabText as settingTabText } from '../settings/Settings';
import { canUsePresence, getPresence } from '../../../util/onlineStatus';

import { openSettings } from '../../../client/action/navigation';
import tinyAPI from '../../../util/mods';
import { getUserWeb3Account } from '../../../util/web3';

import matrixAppearance from '../../../util/libs/appearance';
import UserCustomStatus from '@src/app/molecules/people-selector/UserCustomStatus';

// Account Status
const accountStatus = { status: null, data: null };
export function getAccountStatus(where) {
  if (typeof where === 'string' && accountStatus.data) {
    if (where !== 'status') {
      return clone(accountStatus.status);
    }

    return clone(accountStatus.data[where]);
  }

  return null;
}

// Profile Avatar Menu
function ProfileAvatarMenu() {
  // Data
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const voiceChat = initMatrix.voiceChat;

  const user = mx.getUser(mx.getUserId());
  const [, forceUpdate] = useReducer((count) => count + 1, 0);

  const [firstLoad, setFirstLoad] = useState(true);
  const [accountContent, setAccountContent] = useState(null);
  const [microphoneMuted, setMicrophoneMuted] = useState(voiceChat.getMicrophoneMute());
  const [audioMuted, setAudioMuted] = useState(voiceChat.getAudioMute());

  // Get Display
  const [profile, setProfile] = useState({
    userId: user.userId,
    avatarUrl: null,
    displayName: user.displayName,
  });

  // Effect
  useEffect(() => {
    // Get User and update data
    const setNewProfile = (avatarUrl, displayName, userId) =>
      setProfile({
        avatarUrl: avatarUrl || null,
        displayName: displayName || profile.displayName,
        userId: userId || profile.userId,
      });

    // Set New User Status
    const onProfileUpdate = (event = {}) => {
      // Exist
      if (event && canUsePresence()) {
        // Clone Event
        const tinyEvent = event;
        const tinyClone = clone(event);

        // Afk Fix
        tinyClone.ethereum = getUserWeb3Account();
        if (typeof tinyClone.ethereum.valid !== 'undefined') delete tinyClone.ethereum.valid;

        // String Version
        const eventJSON = JSON.stringify(tinyClone);
        if (eventJSON.length > 0) {
          // Status Fix
          let presenceStatus = 'online';
          if (typeof tinyEvent.status === 'string') {
            tinyEvent.status = tinyEvent.status.trim();
            if (tinyEvent.status === '🔘') presenceStatus = 'offline';
          }

          // Set Presence
          if (!initMatrix.isGuest)
            mx.setPresence({
              presence: presenceStatus,
              status_msg: eventJSON,
            });
        }

        // Custom Status data
        const content = getPresence({ presenceStatusMsg: eventJSON });
        if (
          (typeof event.msg === 'string' && event.msg.length > 0) ||
          (typeof event.msgIcon === 'string' && event.msgIcon.length > 0)
        ) {
          // Get Presence
          accountStatus.data = content.presenceStatusMsg;
          accountStatus.status = event.status;
        }

        // Nope
        else {
          accountStatus.data = null;
          accountStatus.status = null;
        }

        // JSON Status
        if (typeof event.status === 'string' && event.status.length > 0) {
          const tinyUser = mx.getUser(mx.getUserId());
          tinyUser.presenceStatusMsg = JSON.stringify(event);
        }

        // Update Content
        setAccountContent(content);
      }

      // Nope
      else {
        accountStatus.data = null;
        accountStatus.status = null;
      }

      // Status update
      tinyAPI.emit('userStatusUpdate', accountStatus);
    };

    setFirstLoad(false);
    if (firstLoad) onProfileUpdate(mx.getAccountData('pony.house.profile')?.getContent() ?? {});

    const onAvatarChange = (event, myUser) => {
      setNewProfile(myUser.avatarUrl, myUser.displayName, myUser.userId);
    };

    if (firstLoad)
      mx.getProfileInfo(mx.getUserId()).then((info) => {
        setNewProfile(info.avatar_url, info.displayname, info.userId);
      });

    const playMuteSound = (muted) => soundFiles.playNow(muted ? 'micro_off' : 'micro_on');
    const updateAudioMute = (muted) => {
      playMuteSound(muted);
      setAudioMuted(muted);
    };
    const updateMicrophoneMute = (muted) => {
      playMuteSound(muted);
      setMicrophoneMuted(muted);
    };

    // Socket
    if (user) user.on(UserEvent.AvatarUrl, onAvatarChange);
    if (user) user.on(UserEvent.DisplayName, onAvatarChange);
    navigation.on(cons.events.navigation.PROFILE_UPDATED, onProfileUpdate);
    voiceChat.on('pony_house_muted_audio', updateAudioMute);
    voiceChat.on('pony_house_muted_microphone', updateMicrophoneMute);
    return () => {
      if (user) user.removeListener(UserEvent.AvatarUrl, onAvatarChange);
      if (user) user.removeListener(UserEvent.DisplayName, onAvatarChange);
      voiceChat.off('pony_house_muted_audio', updateAudioMute);
      voiceChat.off('pony_house_muted_microphone', updateMicrophoneMute);
      navigation.removeListener(cons.events.navigation.PROFILE_UPDATED, onProfileUpdate);
    };
  });

  useEffect(() => {
    if (user) {
      // Update Status Profile
      const updateProfileStatus = (mEvent, tinyUser, isFirstTime = false) => {
        setAccountContent(getPresence(tinyUser));
      };
      user.on(UserEvent.AvatarUrl, updateProfileStatus);
      user.on(UserEvent.CurrentlyActive, updateProfileStatus);
      user.on(UserEvent.LastPresenceTs, updateProfileStatus);
      user.on(UserEvent.Presence, updateProfileStatus);
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
  });

  useEffect(() => {
    const tinyUpdate = () => forceUpdate();
    matrixAppearance.off('simplerHashtagSameHomeServer', tinyUpdate);
    return () => {
      matrixAppearance.off('simplerHashtagSameHomeServer', tinyUpdate);
    };
  });

  // Complete
  return (
    <table className="table table-borderless align-middle m-0" id="user-menu">
      <tbody>
        <tr>
          <td className="sidebar-photo p-0">
            <button
              className="btn btn-bg btn-link btn-sm ms-1 text-truncate text-start "
              onClick={() => openSettings(settingTabText.PROFILE)}
              type="button"
            >
              <Avatar
                className="d-inline-block float-start profile-image-container"
                imgClass="profile-image-container"
                text={profile.displayName}
                bgColor={colorMXID(mx.getUserId())}
                size="normal"
                imageAnimSrc={mxcUrl.toHttp(profile.avatarUrl)}
                imageSrc={mxcUrl.toHttp(profile.avatarUrl, dfAvatarSize, dfAvatarSize)}
                isDefaultImage
              />
              {canUsePresence() && (
                <UserStatusIcon presenceData={accountContent} user={user} classBase="" />
              )}
              <div className="very-small ps-2 text-truncate emoji-size-fix-2" id="display-name">
                {profile.displayName}
              </div>
              <UserCustomStatus
                emojiFix=""
                className="very-small ps-2 text-truncate emoji-size-fix-2"
                user={user}
                presenceData={accountContent}
                altContent={convertUserId(profile.userId)}
                forceShow
              />
              <div className="very-small ps-2 text-truncate emoji-size-fix-2" id="user-id">
                {convertUserId(profile.userId)}
              </div>
            </button>
          </td>

          <td className="p-0 pe-1 py-1 text-end">
            <IconButton
              tooltip={<span>{microphoneMuted ? 'Unmute' : 'Mute'}</span>}
              tooltipPlacement="top"
              fa="fa-solid fa-microphone"
              className={`action-button${microphoneMuted ? ' muted' : ''}`}
              onClick={() => voiceChat.setMicrophoneMute(!microphoneMuted)}
            />
            {microphoneMuted ? <i className="fa-solid fa-slash tiny-block" /> : null}
          </td>

          <td className="p-0 pe-1 py-1 text-end">
            <IconButton
              tooltip={<span>{audioMuted ? 'Undeafen' : 'Deafen'}</span>}
              tooltipPlacement="top"
              fa="bi bi-headphones"
              className={`action-button-2${audioMuted ? ' muted' : ''}`}
              onClick={() => voiceChat.setAudioMute(!audioMuted)}
            />
            {audioMuted ? <i className="fa-solid fa-slash tiny-block-2" /> : null}
          </td>

          <td className="p-0 pe-1 py-1 text-end">
            <IconButton
              tooltip={<span>User Settings</span>}
              tooltipPlacement="top"
              fa="fa-solid fa-gear"
              className="action-button"
              onClick={openSettings}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default ProfileAvatarMenu;
