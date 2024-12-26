import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { objType } from 'for-promise/utils/lib.mjs';
import tinyConsole from '@src/util/libs/console';

import tinyClipboard from '@src/util/libs/Clipboard';
import { getShareUrl } from '@src/util/tools';

import { defaultAvatar } from '@src/app/atoms/avatar/defaultAvatar';
import { setLoadingPage } from '@src/app/templates/client/Loading';
import { twemojifyReact } from '../../../util/twemojify';
import imageViewer from '../../../util/imageViewer';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import {
  openRoomViewer,
  selectRoom,
  selectRoomMode,
  selectTab,
} from '../../../client/action/navigation';
import * as roomActions from '../../../client/action/room';

import { getCurrentState, hasDMWith, hasDevices } from '../../../util/matrixUtil';
import { colorMXID } from '../../../util/colorMXID';

import Avatar, { avatarDefaultColor } from '../../atoms/avatar/Avatar';
import Button from '../../atoms/button/Button';
import Dialog from '../../molecules/dialog/Dialog';

import copyText from './copyText';
import tinyAPI from '../../../util/mods';

function RoomFooter({ roomId, originalRoomId, publicData, onRequestClose }) {
  const mx = initMatrix.matrixClient;

  const onCreated = (dmRoomId) => {
    setIsCreatingDM(false);
    selectRoomMode('room');
    selectRoom(dmRoomId);
    onRequestClose();
  };

  useEffect(() => {
    const { roomList } = initMatrix;
    roomList.on(cons.events.roomList.ROOM_CREATED, onCreated);
    return () => {
      roomList.removeListener(cons.events.roomList.ROOM_CREATED, onCreated);
    };
  }, []);

  const isJoined = roomId
    ? initMatrix.matrixClient.getRoom(roomId)?.getMyMembership() === 'join'
    : null;

  const openRoom = () => {
    const room = initMatrix.matrixClient.getRoom(roomId);
    if (room.isSpaceRoom()) selectTab(roomId, true);
    else {
      selectRoomMode('room');
      selectRoom(roomId);
    }
  };
  function handleViewRoom() {
    openRoom();
    onRequestClose();
  }

  async function joinRoom() {
    onRequestClose();
    setLoadingPage('Joining room...');
    await roomActions.join(roomId, false).catch((err) => alert(err.message, 'Join room error'));
    setLoadingPage(false);
    openRoom();
  }

  return roomId ? (
    <>
      {__ENV_APP__.SHARE_URL && originalRoomId ? (
        <Button
          onClick={() => {
            tinyClipboard.copyText(getShareUrl(originalRoomId));
            alert('The share link was successfully copied!', 'Room Viewer');
          }}
          variant="secondary"
          className="me-2"
        >
          Share Url
        </Button>
      ) : null}
      {isJoined && (
        <Button onClick={handleViewRoom} variant="secondary">
          Open
        </Button>
      )}
      {!isJoined && (
        <Button onClick={joinRoom} variant="primary">
          Join
        </Button>
      )}
    </>
  ) : null;
}
RoomFooter.propTypes = {
  roomId: PropTypes.string.isRequired,
  room: PropTypes.object.isRequired,
  publicData: PropTypes.object.isRequire,
  onRequestClose: PropTypes.func.isRequired,
};

function useToggleDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [aliasId, setAliasId] = useState(null);
  const [originalRoomId, setOriginalRoomId] = useState(null);
  const [publicData, setPublicData] = useState(null);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [isLoadingId, setIsLoadingId] = useState(null);

  useEffect(() => {
    const loadRoom = (rId, oId) => {
      setIsLoadingPublic(true);
      setIsOpen(true);
      setRoomId(rId);
      setAliasId(null);
      setOriginalRoomId(oId);
      setPublicData(null);
      setIsLoadingPublic(false);
    };
    navigation.on(cons.events.navigation.ROOM_VIEWER_OPENED, loadRoom);
    return () => {
      navigation.removeListener(cons.events.navigation.ROOM_VIEWER_OPENED, loadRoom);
    };
  }, []);

  useEffect(() => {
    if (roomId) {
      if (publicData === null && (!isLoadingPublic || isLoadingId !== originalRoomId)) {
        setIsLoadingPublic(true);
        setIsLoadingId(originalRoomId);

        const tinyError = (err) => {
          tinyConsole.error(err);
          alert(err.message, 'Room Viewer Error');
          setPublicData({});
          setIsLoadingPublic(false);
          setIsLoadingId(null);
        };

        const finalResult = (result, aliasId) => {
          if (isLoadingId === null) {
            setAliasId(aliasId);
            if (
              objType(result, 'object') &&
              Array.isArray(result.chunk) &&
              objType(result.chunk[0], 'object')
            )
              setPublicData(result.chunk[0]);
            else setPublicData({});
            setIsLoadingPublic(false);
            setIsLoadingId(null);
          }
        };

        const getAlias = (result) => {
          initMatrix.matrixClient
            .getRoomIdForAlias(originalRoomId)
            .then((data) => {
              finalResult(result, data?.room_id);
            })
            .catch(tinyError);
        };

        initMatrix.matrixClient
          .publicRooms({
            server: originalRoomId.split(':')[1],
            limit: 1,
            include_all_networks: true,
            filter: {
              generic_search_term: originalRoomId.split(':')[0],
            },
          })
          .then((result) => getAlias(result))
          .catch(tinyError);
      }
    }
  });

  const closeDialog = () => {
    setIsLoadingPublic(true);
    setIsOpen(false);
  };

  const afterClose = () => {
    setRoomId(null);
    setAliasId(null);
    setOriginalRoomId(null);
    setPublicData(null);
    setIsLoadingId(null);
  };

  return [isOpen, originalRoomId, roomId, aliasId, publicData, closeDialog, afterClose];
}

// Read Profile
function RoomViewer() {
  // Prepare
  const profileAvatar = useRef(null);

  const [isOpen, originalRoomId, roomId, aliasId, publicData, closeDialog, handleAfterClose] =
    useToggleDialog();
  const [lightbox, setLightbox] = useState(false);

  const userNameRef = useRef(null);
  const displayNameRef = useRef(null);

  // Get Data
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;

  const room = mx.getRoom(aliasId);
  let isSpace = room ? room.isSpaceRoom() : null;

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [isDefaultAvatar, setIsDefaultAvatar] = useState(true);
  const [username, setUsername] = useState(null);

  useEffect(() => {
    if (room) {
      const reopenProfile = () => {
        if (originalRoomId) openRoomViewer(originalRoomId, originalRoomId, true);
      };
      const theAvatar = mxcUrl.getAvatarUrl(room);
      const newAvatar = theAvatar ? theAvatar : avatarDefaultColor(colorMXID(roomId));

      setIsDefaultAvatar(!theAvatar);
      setAvatarUrl(newAvatar);
      setUsername(room.name || roomId);

      // Avatar Preview
      const tinyAvatarPreview = () => {
        if (newAvatar) {
          const img = $(profileAvatar.current).find('> img');
          imageViewer({
            onClose: reopenProfile,
            lightbox,
            imgQuery: img,
            name: username,
            originalUrl: newAvatar,
          });
        }
      };

      // Copy Profile Username
      const copyUsername = {
        tag: (event) => copyText(event, 'Username successfully copied to the clipboard.'),
        display: (event) => copyText(event, 'Display name successfully copied to the clipboard.'),
      };

      // Read Events
      $(displayNameRef.current).find('> .button').on('click', copyUsername.display);
      $(userNameRef.current).find('> .button').on('click', copyUsername.tag);
      $(profileAvatar.current).on('click', tinyAvatarPreview);

      return () => {
        $(displayNameRef.current).find('> .button').off('click', copyUsername.display);
        $(userNameRef.current).find('> .button').off('click', copyUsername.tag);
        $(profileAvatar.current).off('click', tinyAvatarPreview);
      };
    } else if (!roomId) {
      setIsDefaultAvatar(true);
      setAvatarUrl(
        originalRoomId ? avatarDefaultColor(colorMXID(originalRoomId)) : defaultAvatar(0),
      );
      setUsername(null);
    }
  }, [room]);

  // Get avatar
  let imageSrc;
  if (!isDefaultAvatar || publicData === null || typeof publicData.avatar_url !== 'string') {
    imageSrc = avatarUrl;
  } else {
    imageSrc = mxcUrl.toHttp(publicData.avatar_url);
  }

  // Get username
  let roomName;
  if (publicData === null || typeof publicData.name !== 'string') {
    roomName = username;
  } else {
    roomName = publicData.name;
  }

  // Is Space
  if (isSpace === null && publicData !== null && typeof publicData.room_type === 'string') {
    isSpace = publicData.room_type === 'm.space';
  }

  // Get data
  const profileData = {};
  if (publicData) {
    profileData.topic = publicData.topic;
    profileData.alias =
      typeof publicData.canonical_alias === 'string'
        ? publicData.canonical_alias
        : publicData.room_id;
    profileData.joinedMembersCount = publicData.num_joined_members;

    if (room) {
      const currentState = getCurrentState(room);
      profileData.topic = currentState.getStateEvents('m.room.topic')[0]?.getContent().topic;
    }
  } else if (room) {
    const currentState = getCurrentState(room);
    profileData.topic = currentState.getStateEvents('m.room.topic')[0]?.getContent().topic;
    profileData.alias = originalRoomId;
  }

  // Render Profile
  const renderProfile = () => {
    const toggleLightbox = () => {
      if (!avatarUrl) return;
      closeDialog();
      setLightbox(!lightbox);
    };

    return (
      <>
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
                imageSrc={imageSrc}
                text={username}
                bgColor={colorMXID(roomId)}
                size="large"
                isDefaultImage
              />
            </div>

            <div className="col-md-9 buttons-list">
              <div className="float-end">
                <RoomFooter
                  publicData={publicData}
                  roomId={aliasId}
                  originalRoomId={originalRoomId}
                  room={room}
                  onRequestClose={closeDialog}
                />
              </div>
            </div>
          </div>

          <div className="card bg-bg">
            <div className="card-body">
              {roomName ? (
                <h6 ref={displayNameRef} className="emoji-size-fix m-0 mb-1 fw-bold display-name">
                  <span className="button">{twemojifyReact(roomName)}</span>
                </h6>
              ) : null}
              <small ref={userNameRef} className="text-gray emoji-size-fix username">
                <span className="button">{twemojifyReact(originalRoomId)}</span>
              </small>

              {typeof profileData.topic === 'string' && profileData.topic.length > 0 ? (
                <>
                  <hr />
                  <div className="text-gray text-uppercase fw-bold very-small mb-2">About</div>
                  <p className="card-text p-y-1 text-freedom text-size-box very-small emoji-size-fix">
                    {twemojifyReact(profileData.topic, undefined, true)}
                  </p>
                </>
              ) : null}

              {publicData &&
              (profileData.topic === 'string' ||
                typeof profileData.alias === 'string' ||
                typeof profileData.joinedMembersCount !== 'undefined') ? (
                <p className="card-text p-y-1 very-small text-gray">
                  {profileData.alias !== originalRoomId ? profileData.alias : ''}
                  {typeof profileData.joinedMembersCount !== 'number'
                    ? ''
                    : `${profileData.alias !== originalRoomId ? ' •' : ''} ${profileData.joinedMembersCount} members`}
                </p>
              ) : !publicData ? (
                <>
                  <br />
                  <strong className="small">
                    <div
                      role="status"
                      className="me-2 spinner-border spinner-border-sm d-inline-block"
                    >
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    Loading data...
                  </strong>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );
  };

  // Read Modal
  return (
    <Dialog
      bodyClass="bg-bg2 p-0"
      className=" modal-dialog-centered modal-lg noselect modal-dialog-user-profile modal-dialog-room-profile"
      isOpen={isOpen}
      title={`${!isSpace ? 'Room' : 'Space'} Profile`}
      onAfterClose={handleAfterClose}
      onRequestClose={closeDialog}
    >
      {roomId ? renderProfile() : <div />}
    </Dialog>
  );
}

export default RoomViewer;
