import React, { useState, useEffect, useRef, useReducer } from 'react';
import PropTypes from 'prop-types';
import matrixAppearance from '@src/util/libs/appearance';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import * as roomActions from '../../../client/action/room';
import { selectRoom } from '../../../client/action/navigation';
import {
  convertUserId,
  convertUserIdReverse,
  dfAvatarSize,
  hasDMWith,
  hasDevices,
} from '../../../util/matrixUtil';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import Spinner from '../../atoms/spinner/Spinner';
import Input from '../../atoms/input/Input';
import PopupWindow from '../../molecules/popup-window/PopupWindow';
import RoomTile from '../../molecules/room-tile/RoomTile';

function InviteUser({ isOpen, roomId, searchTerm, onRequestClose }) {
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const [isSearching, updateIsSearching] = useState(false);
  const [searchQuery, updateSearchQuery] = useState({});
  const [users, updateUsers] = useState([]);

  const [procUsers, updateProcUsers] = useState(new Set()); // proc stands for processing.
  const [procUserError, updateUserProcError] = useState(new Map());

  const [createdDM, updateCreatedDM] = useState(new Map());
  const [roomIdToUserId, updateRoomIdToUserId] = useState(new Map());

  const [invitedUserIds, updateInvitedUserIds] = useState(new Set());

  const usernameRef = useRef(null);

  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;

  function getMapCopy(myMap) {
    const newMap = new Map();
    myMap.forEach((data, key) => {
      newMap.set(key, data);
    });
    return newMap;
  }
  function addUserToProc(userId) {
    procUsers.add(userId);
    updateProcUsers(new Set(Array.from(procUsers)));
  }
  function deleteUserFromProc(userId) {
    procUsers.delete(userId);
    updateProcUsers(new Set(Array.from(procUsers)));
  }

  function onDMCreated(newRoomId) {
    const myDMPartnerId = roomIdToUserId.get(newRoomId);
    if (typeof myDMPartnerId === 'undefined') return;

    createdDM.set(myDMPartnerId, newRoomId);
    roomIdToUserId.delete(newRoomId);

    deleteUserFromProc(myDMPartnerId);
    updateCreatedDM(getMapCopy(createdDM));
    updateRoomIdToUserId(getMapCopy(roomIdToUserId));
  }

  async function searchUser(username) {
    const inputUsername = username.trim();
    if (isSearching || inputUsername === '' || inputUsername === searchQuery.username) return;
    const isInputUserId = inputUsername[0] === '@' && inputUsername.indexOf(':') > 1;
    updateIsSearching(true);
    updateSearchQuery({ username: inputUsername });

    if (isInputUserId) {
      try {
        const result = await mx.getProfileInfo(inputUsername);
        updateUsers([
          {
            user_id: inputUsername,
            display_name: result.displayname,
            avatar_url: result.avatar_url,
          },
        ]);
      } catch (e) {
        updateSearchQuery({ error: `${inputUsername} not found!` });
      }
    } else {
      try {
        const result = await mx.searchUserDirectory({
          term: inputUsername,
          limit: 20,
        });
        if (result.results.length === 0) {
          updateSearchQuery({ error: `No matches found for "${inputUsername}"!` });
          updateIsSearching(false);
          return;
        }
        updateUsers(result.results);
      } catch (e) {
        updateSearchQuery({ error: 'Something went wrong!' });
      }
    }
    updateIsSearching(false);
  }

  async function createDM(userId) {
    if (mx.getUserId() === userId) return;
    const dmRoomId = hasDMWith(userId);
    if (dmRoomId) {
      selectRoom(dmRoomId);
      onRequestClose();
      return;
    }

    try {
      addUserToProc(userId);
      procUserError.delete(userId);
      updateUserProcError(getMapCopy(procUserError));

      const result = await roomActions.createDM(userId, await hasDevices(userId));
      roomIdToUserId.set(result.room_id, userId);
      updateRoomIdToUserId(getMapCopy(roomIdToUserId));
    } catch (e) {
      deleteUserFromProc(userId);
      if (typeof e.message === 'string') procUserError.set(userId, e.message);
      else procUserError.set(userId, 'Something went wrong!');
      updateUserProcError(getMapCopy(procUserError));
    }
  }

  async function inviteToRoom(userId) {
    if (typeof roomId === 'undefined') return;
    try {
      addUserToProc(userId);
      procUserError.delete(userId);
      updateUserProcError(getMapCopy(procUserError));

      await roomActions.invite(roomId, userId);

      invitedUserIds.add(userId);
      updateInvitedUserIds(new Set(Array.from(invitedUserIds)));
      deleteUserFromProc(userId);
    } catch (e) {
      deleteUserFromProc(userId);
      if (typeof e.message === 'string') procUserError.set(userId, e.message);
      else procUserError.set(userId, 'Something went wrong!');
      updateUserProcError(getMapCopy(procUserError));
    }
  }

  function renderUserList() {
    const renderOptions = (userId) => {
      const messageJSX = (message, isPositive) => (
        <Text variant="b2">
          <span style={{ color: isPositive ? 'var(--bg-positive)' : 'var(--bg-negative)' }}>
            {message}
          </span>
        </Text>
      );

      if (mx.getUserId() === userId) return null;
      if (procUsers.has(userId)) {
        return <Spinner className="small" />;
      }
      if (createdDM.has(userId)) {
        // eslint-disable-next-line max-len
        return (
          <Button
            onClick={() => {
              selectRoom(createdDM.get(userId));
              onRequestClose();
            }}
          >
            Open
          </Button>
        );
      }
      if (invitedUserIds.has(userId)) {
        return messageJSX('Invited', true);
      }
      if (typeof roomId === 'string') {
        const member = mx.getRoom(roomId).getMember(userId);
        if (member !== null) {
          const userMembership = member.membership;
          switch (userMembership) {
            case 'join':
              return messageJSX('Already joined', true);
            case 'invite':
              return messageJSX('Already Invited', true);
            case 'ban':
              return messageJSX('Banned', false);
            default:
          }
        }
      }
      return typeof roomId === 'string' ? (
        <Button onClick={() => inviteToRoom(userId)} variant="primary">
          Invite
        </Button>
      ) : (
        <Button onClick={() => createDM(userId)} variant="primary">
          Message
        </Button>
      );
    };
    const renderError = (userId) => {
      if (!procUserError.has(userId)) return null;
      return (
        <Text variant="b2">
          <span style={{ color: 'var(--bg-danger)' }}>{procUserError.get(userId)}</span>
        </Text>
      );
    };

    return users.map((user) => {
      const userId = user.user_id;
      const name = typeof user.display_name === 'string' ? user.display_name : userId;
      return (
        <RoomTile
          key={userId}
          avatarSrc={mxcUrl.toHttp(user.avatar_url, dfAvatarSize, dfAvatarSize)}
          avatarAnimSrc={mxcUrl.toHttp(user.avatar_url)}
          name={name}
          id={userId}
          options={renderOptions(userId)}
          desc={renderError(userId)}
        />
      );
    });
  }

  useEffect(() => {
    if (isOpen && typeof searchTerm === 'string') searchUser(searchTerm);
    return () => {
      updateIsSearching(false);
      updateSearchQuery({});
      updateUsers([]);
      updateProcUsers(new Set());
      updateUserProcError(new Map());
      updateCreatedDM(new Map());
      updateRoomIdToUserId(new Map());
      updateInvitedUserIds(new Set());
    };
  }, [isOpen, searchTerm]);

  useEffect(() => {
    if (initMatrix) {
      initMatrix.roomList.on(cons.events.roomList.ROOM_CREATED, onDMCreated);
      return () => {
        initMatrix.roomList.removeListener(cons.events.roomList.ROOM_CREATED, onDMCreated);
      };
    }
  }, [isOpen, procUsers, createdDM, roomIdToUserId]);

  useEffect(() => {
    const tinyUpdate = () => forceUpdate();
    matrixAppearance.off('simplerHashtagSameHomeServer', tinyUpdate);
    return () => {
      matrixAppearance.off('simplerHashtagSameHomeServer', tinyUpdate);
    };
  });

  return (
    <PopupWindow
      className="modal-lg noselect"
      isOpen={isOpen}
      title={typeof roomId === 'string' ? `Invite to ${mx.getRoom(roomId).name}` : 'Direct message'}
      onRequestClose={onRequestClose}
    >
      <div className="invite-user">
        <form
          className="invite-user__form noselect"
          onSubmit={(e) => {
            e.preventDefault();
            searchUser(convertUserIdReverse(usernameRef.current.value));
          }}
        >
          <div>
            <Input value={searchTerm} forwardRef={usernameRef} label="Name or userId" />
          </div>
          <Button disabled={isSearching} faSrc="fa-solid fa-user" variant="primary" type="submit">
            Search
          </Button>
        </form>
        <div className="invite-user__search-status noselect">
          {typeof searchQuery.username !== 'undefined' && isSearching && (
            <div className="flex--center">
              <Spinner className="small" />
              <small className="ms-3">{`Searching for user "${__ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG ? convertUserId(searchQuery.username) : searchQuery.username}"...`}</small>
            </div>
          )}
          {typeof searchQuery.username !== 'undefined' && !isSearching && (
            <small>{`Search result for user "${__ENV_APP__.FORCE_SIMPLER_SAME_HASHTAG ? convertUserId(searchQuery.username) : searchQuery.username}"`}</small>
          )}
          {searchQuery.error && (
            <Text className="invite-user__search-error" variant="b2">
              {searchQuery.error}
            </Text>
          )}
        </div>
        {users.length !== 0 && <div className="invite-user__content">{renderUserList()}</div>}
      </div>
    </PopupWindow>
  );
}

InviteUser.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  roomId: PropTypes.string,
  searchTerm: PropTypes.string,
  onRequestClose: PropTypes.func.isRequired,
};

export default InviteUser;
