import React, { useState, useEffect, useRef, useReducer } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';
import { objType } from 'for-promise/utils/lib.mjs';

import { RoomMemberEvent, UserEvent } from 'matrix-js-sdk';

import clone from 'clone';
import envAPI from '@src/util/libs/env';
import { defaultAvatar } from '@src/app/atoms/avatar/defaultAvatar';
import matrixAppearance from '@src/util/libs/appearance';
import UserCustomStatus from '@src/app/molecules/people-selector/UserCustomStatus';
import Tooltip from '@src/app/atoms/tooltip/Tooltip';

import Clock from '@src/app/atoms/time/Clock';
import UserStatusIcon from '@src/app/atoms/user-status/UserStatusIcon';

import { twemojifyReact } from '../../../util/twemojify';
import { canUsePresence } from '../../../util/onlineStatus';

import imageViewer from '../../../util/imageViewer';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import {
  selectRoom,
  openReusableContextMenu,
  selectRoomMode,
  openProfileViewer,
} from '../../../client/action/navigation';
import * as roomActions from '../../../client/action/room';

import {
  getUsername,
  getUsernameOfRoomMember,
  getPowerLabel,
  hasDMWith,
  hasDevices,
  getCurrentState,
  convertUserId,
} from '../../../util/matrixUtil';
import { getEventCords } from '../../../util/common';
import { colorMXID, cssColorMXID } from '../../../util/colorMXID';

import Text from '../../atoms/text/Text';
import Chip from '../../atoms/chip/Chip';
import Input from '../../atoms/input/Input';
import Avatar, { avatarDefaultColor, AvatarJquery } from '../../atoms/avatar/Avatar';
import Button from '../../atoms/button/Button';
import { MenuItem } from '../../atoms/context-menu/ContextMenu';
import PowerLevelSelector from '../../molecules/power-level-selector/PowerLevelSelector';
import Dialog from '../../molecules/dialog/Dialog';

import { useForceUpdate } from '../../hooks/useForceUpdate';
import { confirmDialog } from '../../molecules/confirm-dialog/ConfirmDialog';
import { addToDataFolder, getDataList } from '../../../util/selectedRoom';
import { getUserWeb3Account, getWeb3Cfg } from '@mods/web3/ethers/base';

import copyText from './copyText';
import tinyAPI from '../../../util/mods';

import EthereumProfileTab from './tabs/Ethereum';
import MutualServersTab from './tabs/MutualServers';
import userPresenceEffect from '@src/util/libs/userPresenceEffect';

function ModerationTools({ roomId, userId }) {
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId);
  const roomMember = room.getMember(userId);

  const myPowerLevel = room.getMember(mx.getUserId())?.powerLevel || 0;
  const powerLevel = roomMember?.powerLevel || 0;
  const canIKick =
    roomMember?.membership === 'join' &&
    getCurrentState(room).hasSufficientPowerLevelFor('kick', myPowerLevel) &&
    powerLevel < myPowerLevel;
  const canIBan =
    ['join', 'leave'].includes(roomMember?.membership) &&
    getCurrentState(room).hasSufficientPowerLevelFor('ban', myPowerLevel) &&
    powerLevel < myPowerLevel;

  const handleKick = (e) => {
    e.preventDefault();
    const kickReason = e.target.elements['kick-reason']?.value.trim();
    roomActions.kick(roomId, userId, kickReason !== '' ? kickReason : undefined);
  };

  const handleBan = (e) => {
    e.preventDefault();
    const banReason = e.target.elements['ban-reason']?.value.trim();
    roomActions.ban(roomId, userId, banReason !== '' ? banReason : undefined);
  };

  useEffect(() => {
    const tinyUpdate = () => forceUpdate();
    matrixAppearance.off('simplerHashtagSameHomeServer', tinyUpdate);
    return () => {
      matrixAppearance.off('simplerHashtagSameHomeServer', tinyUpdate);
    };
  });

  return (
    !initMatrix.isGuest &&
    (canIKick || canIBan) && (
      <div className="card-body">
        {canIKick && (
          <form onSubmit={handleKick}>
            <div className="input-group mb-3">
              <Input placeholder="Kick reason" name="kick-reason" />
              <Button className="border-bg" variant="outline-secondary" type="submit">
                Kick
              </Button>
            </div>
          </form>
        )}
        {canIBan && (
          <form onSubmit={handleBan}>
            <div className="input-group mb-3">
              <Input placeholder="Ban reason" name="ban-reason" />
              <Button className="border-bg" variant="outline-secondary" type="submit">
                Ban
              </Button>
            </div>
          </form>
        )}
      </div>
    )
  );
}
ModerationTools.propTypes = {
  roomId: PropTypes.string.isRequired,
  userId: PropTypes.string.isRequired,
};

function SessionInfo({ userId }) {
  const [devices, setDevices] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const Crypto = initMatrix.matrixClient.getCrypto();

  useEffect(() => {
    let isUnmounted = false;

    async function loadDevices() {
      try {
        let input = await Crypto.getUserDeviceInfo([userId]);
        input = input.get(userId);

        const myDevices = [];
        input.forEach((value) => {
          myDevices.push(value);
        });

        if (isUnmounted) return;

        setDevices(myDevices);
      } catch {
        setDevices([]);
      }
    }
    loadDevices();

    return () => {
      isUnmounted = true;
    };
  }, [userId]);

  function renderSessionChips() {
    if (!isVisible) return null;
    return (
      <li className="list-group-item bg-bg text-center">
        {devices === null && <Text variant="b2">Loading sessions...</Text>}
        {devices?.length === 0 && <Text variant="b2">No session found.</Text>}
        {devices !== null &&
          devices.map((device) => (
            <Chip
              key={device.deviceId}
              faSrc="fa-solid fa-shield"
              text={device.displayName || device.deviceId}
            />
          ))}
      </li>
    );
  }

  return (
    <ul className="list-group list-group-flush mt-3 border border-bg">
      <MenuItem
        onClick={() => setIsVisible(!isVisible)}
        faSrc={isVisible ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'}
      >
        {`View ${devices?.length > 0 ? `${devices.length} ` : ''}sessions`}
      </MenuItem>
      {renderSessionChips()}
    </ul>
  );
}

SessionInfo.propTypes = {
  userId: PropTypes.string.isRequired,
};

function ProfileFooter({ roomId, userId, onRequestClose }) {
  const [isCreatingDM, setIsCreatingDM] = useState(false);
  const [isIgnoring, setIsIgnoring] = useState(false);
  const [isUserIgnored, setIsUserIgnored] = useState(initMatrix.matrixClient.isUserIgnored(userId));

  const isMountedRef = useRef(true);
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId) || {};
  const member = (room && room.getMember && room.getMember(userId)) || {};
  const isInvitable = member?.membership !== 'join' && member?.membership !== 'ban';

  const [isInviting, setIsInviting] = useState(false);
  const [isInvited, setIsInvited] = useState(member?.membership === 'invite');

  const myPowerlevel = (room && room.getMember && room.getMember(mx.getUserId())?.powerLevel) || 0;
  const userPL = (room && room.getMember && room.getMember(userId)?.powerLevel) || 0;
  const canIKick =
    room?.getLiveTimeline &&
    getCurrentState(room)?.hasSufficientPowerLevelFor('kick', myPowerlevel) &&
    userPL < myPowerlevel;

  const isBanned = member?.membership === 'ban';

  const onCreated = (dmRoomId) => {
    if (isMountedRef.current === false) return;
    setIsCreatingDM(false);
    selectRoomMode('room');
    selectRoom(dmRoomId);
    onRequestClose();
  };

  useEffect(() => {
    const { roomList } = initMatrix;
    roomList.on(cons.events.roomList.ROOM_CREATED, onCreated);
    return () => {
      isMountedRef.current = false;
      roomList.removeListener(cons.events.roomList.ROOM_CREATED, onCreated);
    };
  }, []);
  useEffect(() => {
    setIsUserIgnored(initMatrix.matrixClient.isUserIgnored(userId));
    setIsIgnoring(false);
    setIsInviting(false);
  }, [userId]);

  const openDM = async () => {
    // Check and open if user already have a DM with userId.
    const dmRoomId = hasDMWith(userId);
    if (dmRoomId) {
      selectRoomMode('room');
      selectRoom(dmRoomId);
      onRequestClose();
      return;
    }

    // Create new DM
    try {
      setIsCreatingDM(true);
      await roomActions.createDM(userId, await hasDevices(userId));
    } catch (err) {
      if (isMountedRef.current === false) return;
      setIsCreatingDM(false);
      console.error(err);
      alert(err.message, 'Creating DM Error');
    }
  };

  const toggleIgnore = async () => {
    const isIgnored = mx.getIgnoredUsers().includes(userId);

    try {
      setIsIgnoring(true);
      if (isIgnored) {
        await roomActions.unignore([userId]);
      } else {
        await roomActions.ignore([userId]);
      }

      if (isMountedRef.current === false) return;
      setIsUserIgnored(!isIgnored);
      setIsIgnoring(false);
    } catch {
      setIsIgnoring(false);
    }
  };

  const toggleInvite = async () => {
    try {
      setIsInviting(true);
      let isInviteSent = false;
      if (isInvited) await roomActions.kick(roomId, userId);
      else {
        await roomActions.invite(roomId, userId);
        isInviteSent = true;
      }
      if (isMountedRef.current === false) return;
      setIsInvited(isInviteSent);
      setIsInviting(false);
    } catch {
      setIsInviting(false);
    }
  };

  return (
    <>
      <Button className="me-2" variant="primary" onClick={openDM} disabled={isCreatingDM}>
        {isCreatingDM ? 'Creating room...' : 'Message'}
      </Button>

      {isBanned && canIKick && (
        <Button
          className="mx-2"
          variant="success"
          onClick={() => roomActions.unban(roomId, userId)}
        >
          Unban
        </Button>
      )}

      {(isInvited ? canIKick : room && room.canInvite && room.canInvite(mx.getUserId())) &&
        isInvitable && (
          <Button className="mx-2" variant="secondary" onClick={toggleInvite} disabled={isInviting}>
            {isInvited
              ? `${isInviting ? 'Disinviting...' : 'Disinvite'}`
              : `${isInviting ? 'Inviting...' : 'Invite'}`}
          </Button>
        )}

      <Button
        className="ms-2"
        variant={isUserIgnored ? 'success' : 'danger'}
        onClick={toggleIgnore}
        disabled={isIgnoring}
      >
        {isUserIgnored
          ? `${isIgnoring ? 'Unignoring...' : 'Unignore'}`
          : `${isIgnoring ? 'Ignoring...' : 'Ignore'}`}
      </Button>
    </>
  );
}
ProfileFooter.propTypes = {
  roomId: PropTypes.string.isRequired,
  userId: PropTypes.string.isRequired,
  onRequestClose: PropTypes.func.isRequired,
};

function useToggleDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [selectedMenu, setSelectedMenu] = useState(0);

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [username, setUsername] = useState(null);
  const [bannerSrc, setBannerSrc] = useState(null);
  const [loadingBanner, setLoadingBanner] = useState(false);

  const mx = initMatrix.matrixClient;
  const { accountContent } = userPresenceEffect(userId ? mx.getUser(userId) : null);

  useEffect(() => {
    const loadProfile = (uId, rId) => {
      setIsOpen(true);
      setUserId(uId);
      setRoomId(rId);
    };
    navigation.on(cons.events.navigation.PROFILE_VIEWER_OPENED, loadProfile);
    return () => {
      navigation.removeListener(cons.events.navigation.PROFILE_VIEWER_OPENED, loadProfile);
    };
  }, []);

  const closeDialog = () => setIsOpen(false);

  const afterClose = () => {
    setUserId(null);
    setRoomId(null);
    setSelectedMenu(0);
    setBannerSrc(null);
    setLoadingBanner(false);
    setUsername(null);
    setAvatarUrl(null);
  };

  return [
    isOpen,
    roomId,
    userId,
    closeDialog,
    afterClose,
    selectedMenu,
    setSelectedMenu,
    bannerSrc,
    setBannerSrc,
    avatarUrl,
    setAvatarUrl,
    username,
    setUsername,
    loadingBanner,
    setLoadingBanner,
    accountContent,
  ];
}

function useRerenderOnProfileChange(roomId, userId) {
  const mx = initMatrix.matrixClient;
  const [, forceUpdate] = useForceUpdate();
  useEffect(() => {
    const handleProfileChange = (mEvent, member) => {
      if (
        mEvent.getRoomId() === roomId &&
        (member.userId === userId || member.userId === mx.getUserId())
      ) {
        forceUpdate();
      }
    };
    mx.on(RoomMemberEvent.PowerLevel, handleProfileChange);
    mx.on(RoomMemberEvent.Membership, handleProfileChange);
    return () => {
      mx.removeListener(RoomMemberEvent.PowerLevel, handleProfileChange);
      mx.removeListener(RoomMemberEvent.Membership, handleProfileChange);
    };
  }, [roomId, userId]);
}

// Read Profile
let tinyMenuId = 'default';
function ProfileViewer() {
  // Prepare
  const noteRef = useRef(null);
  const profileAvatar = useRef(null);

  const [
    isOpen,
    roomId,
    userId,
    closeDialog,
    afterClose,
    selectedMenu,
    setSelectedMenu,
    bannerSrc,
    setBannerSrc,
    avatarUrl,
    setAvatarUrl,
    username,
    setUsername,
    loadingBanner,
    setLoadingBanner,
    accountContent,
  ] = useToggleDialog();

  const [lightbox, setLightbox] = useState(false);

  const userNameRef = useRef(null);
  const displayNameRef = useRef(null);
  useRerenderOnProfileChange(roomId, userId);

  // Get Data
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;

  const user = mx.getUser(userId);
  const room = mx.getRoom(roomId) || {};
  const roomMember = room && room.getMember ? room.getMember(userId) : null;

  const getTheUsername = () => {
    if (userId) {
      const newUsername = getUsername(userId);
      if (newUsername) return newUsername;
    }
    return null;
  };

  if (!isOpen) tinyMenuId = 'default';
  // Re-Open Profile
  const reopenProfile = () => {
    if (userId) openProfileViewer(userId, roomId);
  };

  // Basic User profile updated
  useEffect(() => {
    // Avatar Preview
    let newAvatar;
    const avatarPreviewBase = (name) => {
      const img = $(profileAvatar.current).find('> img');
      imageViewer({
        lightbox,
        onClose: reopenProfile,
        imgQuery: img,
        name,
        originalUrl: newAvatar || avatarUrl,
      });
    };

    // User
    if (user) {
      // Avatar and username data
      const avatarMxc = roomMember
        ? roomMember?.getMxcAvatarUrl?.()
        : user
          ? user?.avatarUrl
          : null;

      const newAvatar =
        avatarMxc && avatarMxc !== 'null' && avatarMxc !== null
          ? mxcUrl.toHttp(avatarMxc)
          : avatarDefaultColor(colorMXID(userId));

      setAvatarUrl(newAvatar);
      setUsername(roomMember ? getUsernameOfRoomMember(roomMember) : getTheUsername());

      // Avatar Preview
      const tinyAvatarPreview = () => avatarPreviewBase(username);

      // Copy Profile Username
      const copyUsername = {
        tag: (event) => copyText(event, 'Username successfully copied to the clipboard.'),
        display: (event) => copyText(event, 'Display name successfully copied to the clipboard.'),
      };

      $(profileAvatar.current).on('click', tinyAvatarPreview);
      $(displayNameRef.current).find('> .button').on('click', copyUsername.display);
      $(userNameRef.current).find('> .button').on('click', copyUsername.tag);

      // Update Note
      const tinyNoteUpdate = (event) => {
        addToDataFolder('user_cache', 'note', userId, $(event.target).val(), 200);
      };

      const tinyNoteSpacing = (event) => {
        const element = event.target;
        element.style.height = '5px';
        element.style.height = `${Number(element.scrollHeight)}px`;
      };

      // Read Events
      const tinyNote = getDataList('user_cache', 'note', userId);

      // Note
      $(noteRef.current)
        .on('change', tinyNoteUpdate)
        .on('keypress keyup keydown', tinyNoteSpacing)
        .val(tinyNote);

      if (noteRef.current) tinyNoteSpacing({ target: noteRef.current });

      return () => {
        $(noteRef.current)
          .off('change', tinyNoteUpdate)
          .off('keypress keyup keydown', tinyNoteSpacing);

        $(displayNameRef.current).find('> .button').off('click', copyUsername.display);
        $(userNameRef.current).find('> .button').off('click', copyUsername.tag);
        $(profileAvatar.current).off('click', tinyAvatarPreview);
      };
    }

    // User not found
    else if (!userId) {
      setAvatarUrl(defaultAvatar(0));
      setUsername(null);
      setBannerSrc(null);
    }

    // Unknown User
    if (username === null && avatarUrl === defaultAvatar(0)) {
      // Avatar Preview
      const tinyAvatarPreview = () => avatarPreviewBase(userId);

      $(profileAvatar.current).on('click', tinyAvatarPreview);
      mx.getProfileInfo(userId)
        .then((userProfile) => {
          newAvatar =
            userProfile.avatar_url &&
            userProfile.avatar_url !== 'null' &&
            userProfile.avatar_url !== null
              ? mxcUrl.toHttp(userProfile.avatar_url)
              : null;

          setUsername(userProfile.displayname);
          setAvatarUrl(newAvatar);
        })
        .catch((err) => {
          console.error(err);
          alert(err.message, 'Get Profile Error');
        });

      return () => {
        $(profileAvatar.current).off('click', tinyAvatarPreview);
      };
    }
  }, [user]);

  // Render Profile
  const renderProfile = () => {
    const powerLevel = roomMember?.powerLevel || 0;
    const myPowerLevel = (room.getMember && room.getMember(mx.getUserId())?.powerLevel) || 0;

    const canChangeRole =
      room.getLiveTimeline &&
      getCurrentState(room)?.maySendEvent('m.room.power_levels', mx.getUserId()) &&
      (powerLevel < myPowerLevel || userId === mx.getUserId());

    const handleChangePowerLevel = async (newPowerLevel) => {
      if (newPowerLevel === powerLevel) return;
      const SHARED_POWER_MSG =
        'You will not be able to undo this change as you are promoting the user to have the same power level as yourself. Are you sure?';
      const DEMOTING_MYSELF_MSG =
        'You will not be able to undo this change as you are demoting yourself. Are you sure?';

      const isSharedPower = newPowerLevel === myPowerLevel;
      const isDemotingMyself = userId === mx.getUserId();
      if (isSharedPower || isDemotingMyself) {
        const isConfirmed = await confirmDialog(
          'Change power level',
          isSharedPower ? SHARED_POWER_MSG : DEMOTING_MYSELF_MSG,
          'Change',
          'warning',
        );
        if (!isConfirmed) return;
        roomActions.setPowerLevel(roomId, userId, newPowerLevel);
      } else {
        roomActions.setPowerLevel(roomId, userId, newPowerLevel);
      }
    };

    const handlePowerSelector = (e) => {
      openReusableContextMenu('bottom', getEventCords(e, '.btn-link'), (closeMenu) => (
        <PowerLevelSelector
          value={powerLevel}
          max={myPowerLevel}
          onSelect={(pl) => {
            closeMenu();
            handleChangePowerLevel(pl);
          }}
        />
      ));
    };

    const toggleLightbox = () => {
      if (!avatarUrl) return;
      closeDialog();
      setLightbox(!lightbox);
    };

    // Exist Presence
    const existPresenceObject =
      accountContent && objType(accountContent.presenceStatusMsg, 'object');

    // Ethereum Config
    const ethConfig = getWeb3Cfg();
    const existEthereum =
      envAPI.get('WEB3') &&
      ethConfig.web3Enabled &&
      existPresenceObject &&
      accountContent.ethereum &&
      accountContent.ethereum.valid;

    // Exist banner
    const existBanner =
      existPresenceObject &&
      typeof accountContent.presenceStatusMsg.bannerThumb === 'string' &&
      accountContent.presenceStatusMsg.bannerThumb.length > 0 &&
      typeof accountContent.presenceStatusMsg.banner === 'string' &&
      accountContent.presenceStatusMsg.banner.length > 0;

    // Menu bar items
    const menuBarItems = [];

    // User List tab
    MutualServersTab(menuBarItems, accountContent, existEthereum, userId, roomId);

    // Ethereum
    EthereumProfileTab(menuBarItems, accountContent, existEthereum, userId, roomId);

    // Profile Tabs Spawn
    tinyAPI.emit('profileTabsSpawn', menuBarItems, accountContent, existEthereum, userId, roomId);

    // Add default page
    if (menuBarItems.length > 0) {
      menuBarItems.unshift({
        menu: () => 'User info',
      });
    }

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

    return (
      <>
        <div
          className={`profile-banner profile-bg${cssColorMXID(userId)}${existBanner ? ' exist-banner' : ''}`}
          style={{ backgroundImage: bannerSrc ? `url("${bannerSrc}")` : null }}
        />

        <div className="p-4">
          <div className="row pb-3">
            <div
              className="col-lg-3 text-center d-flex justify-content-center modal-user-profile-avatar"
              onClick={toggleLightbox}
              onKeyDown={toggleLightbox}
            >
              <Avatar
                imgClass="profile-image-container"
                className="profile-image-container"
                ref={profileAvatar}
                imageSrc={avatarUrl}
                text={username}
                bgColor={colorMXID(userId)}
                size="large"
                isDefaultImage
              />
              {canUsePresence() && <UserStatusIcon className="pe-2" user={user} />}
            </div>

            <div className="col-md-9">
              <div className="float-end">
                {userId !== mx.getUserId() && (
                  <ProfileFooter roomId={roomId} userId={userId} onRequestClose={closeDialog} />
                )}
              </div>
            </div>
          </div>

          <div className="card bg-bg">
            <div className="card-body">
              {roomId ? (
                <div className="profile-viewer__user__role float-end noselect">
                  <div className="very-small text-gray">Role</div>
                  <Button
                    onClick={canChangeRole ? handlePowerSelector : null}
                    faSrc={canChangeRole ? 'fa-solid fa-check' : null}
                  >
                    {`${getPowerLabel(powerLevel) || 'Member'} - ${powerLevel}`}
                  </Button>
                </div>
              ) : null}

              <h6 ref={displayNameRef} className="emoji-size-fix m-0 mb-1 fw-bold display-name">
                <span className="button">{twemojifyReact(username)}</span>
                {existEthereum ? (
                  <Tooltip content={accountContent.ethereum.address}>
                    <span
                      className="ms-2 ethereum-icon"
                      onClick={() => {
                        copyText(
                          accountContent.ethereum.address,
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
                <span className="button">{twemojifyReact(convertUserId(userId))}</span>
              </small>

              {existPresenceObject ? (
                <>
                  {typeof accountContent.presenceStatusMsg.pronouns === 'string' &&
                  accountContent.presenceStatusMsg.pronouns.length > 0 ? (
                    <div className="text-gray emoji-size-fix pronouns small">
                      {twemojifyReact(accountContent.presenceStatusMsg.pronouns.substring(0, 20))}
                    </div>
                  ) : null}

                  <UserCustomStatus className="mt-2 small profile-modal " user={user} />
                </>
              ) : null}

              {menuBarItems.length > 0 ? (
                <ul className="usertabs nav nav-underline mt-2 small">
                  {menuBarItems.map((item, index) => (
                    <li key={`profileViewer_menubar_${index}`} className="nav-item">
                      <a
                        className={`nav-link text-bg-force${index !== menuBarItems.length - 1 ? ' me-3' : ''}${index !== selectedMenu ? '' : ' active'}`}
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          setSelectedMenu(index);
                        }}
                      >
                        {item.menu({
                          roomId,
                          userId,
                          accountContent,
                          roomMember,
                          avatarUrl,
                          username,
                        })}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {menuBarItems[selectedMenu] &&
              typeof menuBarItems[selectedMenu].render === 'function' ? (
                <>
                  <hr />
                  {menuBarItems[selectedMenu].render({
                    roomId,
                    userId,
                    closeDialog,
                    accountContent,
                    roomMember,
                    avatarUrl,
                    username,
                    imagePreview: (name, imgQuery, originalUrl) =>
                      imageViewer({
                        lightbox,
                        onClose: reopenProfile,
                        imgQuery: imgQuery,
                        name,
                        originalUrl: originalUrl,
                      }),
                  })}
                </>
              ) : null}

              {selectedMenu === 0 ? (
                <>
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
                      <UserCustomStatus className="mt-2 small profile-modal " user={user} />
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
                </>
              ) : null}
            </div>

            {roomId ? <ModerationTools roomId={roomId} userId={userId} /> : null}
          </div>

          <SessionInfo userId={userId} />
        </div>
      </>
    );
  };

  // Read Modal
  return (
    <Dialog
      bodyClass="bg-bg2 p-0"
      className="modal-dialog-centered modal-lg noselect modal-dialog-user-profile"
      isOpen={isOpen}
      title="User Profile"
      onAfterClose={afterClose}
      onRequestClose={closeDialog}
    >
      {userId ? renderProfile() : null}
    </Dialog>
  );
}

export default ProfileViewer;
