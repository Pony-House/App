import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import tinyClipboard from '@src/util/libs/Clipboard';
import { getShareUrl } from '@src/util/tools';

import { twemojifyReact } from '../../../util/twemojify';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import { colorMXID } from '../../../util/colorMXID';

import RawIcon from '../../atoms/system-icons/RawIcon';
import Avatar from '../../atoms/avatar/Avatar';
import Button from '../../atoms/button/Button';
import Input from '../../atoms/input/Input';
import IconButton from '../../atoms/button/IconButton';
import ImageUpload from '../image-upload/ImageUpload';

import { useStore } from '../../hooks/useStore';
import { useForceUpdate } from '../../hooks/useForceUpdate';
import { confirmDialog } from '../confirm-dialog/ConfirmDialog';
import { getCurrentState } from '../../../util/matrixUtil';

function RoomProfile({ roomId, isSpace }) {
  // First Data
  const isMountStore = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [, forceUpdate] = useForceUpdate();
  const [status, setStatus] = useState({
    msg: null,
    type: cons.status.PRE_FLIGHT,
  });

  // First Values
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const isDM = initMatrix.roomList.directs.has(roomId);

  let avatarSrc = mxcUrl.getAvatarUrl(mx.getRoom(roomId));
  avatarSrc = isDM ? mxcUrl.getAvatarUrl(mx.getRoom(roomId).getAvatarFallbackMember()) : avatarSrc;

  const room = mx.getRoom(roomId);
  const currentState = getCurrentState(room);

  // Strings
  const roomName = room.name;
  const roomTopic = currentState.getStateEvents('m.room.topic')[0]?.getContent().topic;

  const nameCinny = {};
  if (room.nameCinny) {
    if (typeof room.nameCinny.original === 'string') {
      nameCinny.original = room.nameCinny.original;
    } else {
      nameCinny.original = '';
    }

    if (typeof room.nameCinny.category === 'string') {
      nameCinny.category = room.nameCinny.category;
    } else {
      nameCinny.category = '';
    }

    if (typeof room.nameCinny.index === 'number') {
      nameCinny.index = String(room.nameCinny.index);
    } else {
      nameCinny.index = '';
    }
  } else {
    nameCinny.original = '';
    nameCinny.category = '';
    nameCinny.index = '';
  }

  // User Id
  const userId = mx.getUserId();

  // Can?
  const canChangeAvatar = currentState.maySendStateEvent('m.room.avatar', userId);
  const canChangeName = currentState.maySendStateEvent('m.room.name', userId);
  const canChangeTopic = currentState.maySendStateEvent('m.room.topic', userId);

  // Use Effect
  useEffect(() => {
    isMountStore.setItem(true);
    const { roomList } = initMatrix;
    const handleProfileUpdate = (rId) => {
      if (roomId !== rId) return;
      forceUpdate();
    };

    roomList.on(cons.events.roomList.ROOM_PROFILE_UPDATED, handleProfileUpdate);
    return () => {
      roomList.removeListener(cons.events.roomList.ROOM_PROFILE_UPDATED, handleProfileUpdate);
      isMountStore.setItem(false);
      setStatus({
        msg: null,
        type: cons.status.PRE_FLIGHT,
      });
      setIsEditing(false);
    };
  }, [roomId]);

  // Submit
  const handleOnSubmit = async (e) => {
    // Prepare Values
    e.preventDefault();
    const { target } = e;
    const roomNameInput = target.elements['room-name'];
    const roomTopicInput = target.elements['room-topic'];
    const roomIndex = target.elements['room-index'];
    const roomCategory = target.elements['room-category'];

    // Try
    try {
      // Change Name
      if (canChangeName) {
        // New Name
        let newName = `${roomNameInput.value}`;

        if (!isSpace) {
          // Check Index
          if (typeof roomCategory.value === 'string' && roomCategory.value.length > 0) {
            newName = `${roomCategory.value} - ${newName}`;
          }

          if (
            (typeof roomIndex.value === 'string' && roomIndex.value.length > 0) ||
            (typeof roomCategory.value === 'string' && roomCategory.value.length > 0)
          ) {
            if (typeof roomIndex.value === 'string' && roomIndex.value.length > 0) {
              newName = `${roomIndex.value} - ${newName}`;
            } else {
              newName = `0 - ${newName}`;
            }
          }
        }

        // Save Name
        if (newName !== roomName && newName.trim() !== '') {
          setStatus({
            msg: 'Saving room name...',
            type: cons.status.IN_FLIGHT,
          });
          await mx.setRoomName(roomId, newName);
        }
      }

      // Change Topic
      if (canChangeTopic) {
        // New Topic Name
        const newTopic = roomTopicInput.value;

        // Save
        if (newTopic !== roomTopic) {
          if (isMountStore.getItem()) {
            setStatus({
              msg: 'Saving room topic...',
              type: cons.status.IN_FLIGHT,
            });
          }
          await mx.setRoomTopic(roomId, newTopic);
        }
      }

      // Save Complete
      if (!isMountStore.getItem()) return;
      setStatus({
        msg: 'Saved successfully',
        type: cons.status.SUCCESS,
      });
    } catch (err) {
      // Error
      if (!isMountStore.getItem()) return;

      setStatus({
        msg: err.message || 'Unable to save.',
        type: cons.status.ERROR,
      });
    }
  };

  // Cancel Edit
  const handleCancelEditing = () => {
    setStatus({
      msg: null,
      type: cons.status.PRE_FLIGHT,
    });
    setIsEditing(false);
  };

  // Avatar Upload
  const handleAvatarUpload = async (url) => {
    if (url === null) {
      const isConfirmed = await confirmDialog(
        'Remove avatar',
        'Are you sure that you want to remove room avatar?',
        'Remove',
        'warning',
      );
      if (isConfirmed) {
        await mx.sendStateEvent(roomId, 'm.room.avatar', { url }, '');
      }
    } else await mx.sendStateEvent(roomId, 'm.room.avatar', { url }, '');
  };

  // Text Validator
  const inputValidator = (event) => {
    const input = event.target;
    if (input) {
      input.value = input.value.replace(/ - /g, ' ');
    }
  };

  // Render Edit Data
  const renderEditNameAndTopic = () => (
    <form className="room-profile__edit-form" onSubmit={handleOnSubmit}>
      {canChangeName && (
        <div>
          <Input
            className="mb-3"
            onKeyDown={inputValidator}
            onChange={inputValidator}
            value={roomName}
            name="room-name"
            disabled={status.type === cons.status.IN_FLIGHT}
            label="Name"
          />
        </div>
      )}
      {!isSpace && canChangeName && (
        <div>
          <Input
            className="mb-3"
            value={nameCinny.index}
            type="number"
            name="room-index"
            disabled={status.type === cons.status.IN_FLIGHT}
            label="Index"
          />
        </div>
      )}
      {!isSpace && canChangeName && (
        <div>
          <Input
            className="mb-3"
            onKeyDown={inputValidator}
            onChange={inputValidator}
            value={nameCinny.category}
            name="room-category"
            disabled={status.type === cons.status.IN_FLIGHT}
            label="Category"
          />
        </div>
      )}
      {canChangeTopic && (
        <div>
          <Input
            className="mb-3"
            value={roomTopic}
            name="room-topic"
            disabled={status.type === cons.status.IN_FLIGHT}
            minHeight={100}
            resizable
            label="Topic"
          />
        </div>
      )}

      {(!canChangeName || !canChangeTopic) && (
        <div className="very-small text-gray">{`You have permission to change ${room.isSpaceRoom() ? 'space' : 'room'} ${canChangeName ? 'name' : 'topic'} only.`}</div>
      )}

      {status.type === cons.status.IN_FLIGHT && (
        <div className="very-small text-gray">{status.msg}</div>
      )}
      {status.type === cons.status.SUCCESS && (
        <div className="very-small text-success">{status.msg}</div>
      )}
      {status.type === cons.status.ERROR && (
        <div className="very-small text-danger">{status.msg}</div>
      )}

      {status.type !== cons.status.IN_FLIGHT && (
        <div className="mt-3">
          <Button className="mx-1" type="submit" variant="primary">
            Save
          </Button>
          <Button className="mx-1" onClick={handleCancelEditing}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );

  // Render Panel
  const renderNameAndTopic = () => {
    const isAlias = typeof room.getCanonicalAlias() === 'string';
    const roomId = room.getCanonicalAlias() || room.roomId;
    return (
      <div
        className="emoji-size-fix"
        style={{ marginBottom: avatarSrc && canChangeAvatar ? '24px' : '0' }}
      >
        <div>
          <h4 className="d-inline-block m-0 my-1">{twemojifyReact(roomName)}</h4>

          {nameCinny.category.length > 0 && (
            <div className="d-inline-block m-0 my-1">
              <span style={{ marginRight: '8px', marginLeft: '18px' }}>
                <RawIcon fa="fa-solid fa-grip-lines-vertical" />
              </span>
              <span>{twemojifyReact(nameCinny.category)}</span>
            </div>
          )}

          {nameCinny.index.length > 0 && (
            <div className="d-inline-block m-0 my-1">
              <span style={{ marginRight: '8px', marginLeft: '8px' }}>
                <RawIcon fa="fa-solid fa-grip-lines-vertical" />
              </span>
              <span>{twemojifyReact(nameCinny.index)}</span>
            </div>
          )}

          <span> </span>

          {(canChangeName || canChangeTopic) && (
            <IconButton
              fa="fa-solid fa-pencil"
              size="extra-small"
              tooltip="Edit"
              onClick={() => setIsEditing(true)}
            />
          )}
        </div>

        <div className="very-small text-gray">
          {isAlias ? (
            <>
              {roomId}
              <a
                className="ms-1 badge bg-primary text-bg-force noselect"
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  tinyClipboard.copyText(getShareUrl(roomId));
                  alert('The share link was successfully copied!', 'Room Viewer');
                }}
              >
                Share
              </a>
            </>
          ) : null}
        </div>
        {roomTopic && (
          <div className="very-small text-freedom">
            {twemojifyReact(roomTopic, undefined, true)}
          </div>
        )}
      </div>
    );
  };

  // Complete
  return (
    <div className="p-3 room-info">
      <div className="row">
        <div className="col-sm-2 col-md-4 col-lg-2 p-0">
          {!canChangeAvatar && (
            <center>
              <Avatar
                imgClass="profile-image-container"
                className="profile-image-container"
                imageSrc={avatarSrc}
                text={roomName}
                bgColor={colorMXID(roomId)}
                size="large"
                isDefaultImage
              />
            </center>
          )}
          {canChangeAvatar && (
            <ImageUpload
              text={roomName}
              bgColor={colorMXID(roomId)}
              imageSrc={avatarSrc}
              onUpload={handleAvatarUpload}
              onRequestRemove={() => handleAvatarUpload(null)}
            />
          )}
        </div>

        <div className="col-sm-10 col-md-8 col-lg-10">
          {!isEditing && renderNameAndTopic()}
          {isEditing && renderEditNameAndTopic()}
        </div>
      </div>
    </div>
  );
}

RoomProfile.propTypes = {
  roomId: PropTypes.string.isRequired,
  isSpace: PropTypes.bool,
};

export default RoomProfile;
