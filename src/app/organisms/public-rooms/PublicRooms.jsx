import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { dfAvatarSize, getHomeServer } from '@src/util/matrixUtil';
import Img from '@src/app/atoms/image/Image';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import { selectRoom, selectTab, selectRoomMode } from '../../../client/action/navigation';
import * as roomActions from '../../../client/action/room';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import Spinner from '../../atoms/spinner/Spinner';
import Input from '../../atoms/input/Input';
import PopupWindow from '../../molecules/popup-window/PopupWindow';
import Avatar from '../../atoms/avatar/Avatar';
import { colorMXID } from '../../../util/colorMXID';
import { twemojifyReact } from '../../../util/twemojify';

const HashSearchIC = './img/ic/outlined/hash-search.svg';

const SEARCH_LIMIT = 20;

function TryJoinWithAlias({ alias, onRequestClose }) {
  const [status, setStatus] = useState({
    isJoining: false,
    error: null,
    roomId: null,
    tempRoomId: null,
  });
  function handleOnRoomAdded(roomId) {
    if (status.tempRoomId !== null && status.tempRoomId !== roomId) return;
    setStatus({
      isJoining: false,
      error: null,
      roomId,
      tempRoomId: null,
    });
  }

  useEffect(() => {
    initMatrix.roomList.on(cons.events.roomList.ROOM_JOINED, handleOnRoomAdded);
    return () => {
      initMatrix.roomList.removeListener(cons.events.roomList.ROOM_JOINED, handleOnRoomAdded);
    };
  }, [status]);

  async function joinWithAlias() {
    setStatus({
      isJoining: true,
      error: null,
      roomId: null,
      tempRoomId: null,
    });
    try {
      const roomId = await roomActions
        .join(alias, false)
        .catch((err) => alert(err.message, 'Join room error'));
      setStatus({
        isJoining: true,
        error: null,
        roomId: null,
        tempRoomId: roomId,
      });
    } catch (e) {
      setStatus({
        isJoining: false,
        error: `Unable to join ${alias}. Either room is private or doesn't exist.`,
        roomId: null,
        tempRoomId: null,
      });
    }
  }

  return (
    <div className="try-join-with-alias">
      {status.roomId === null && !status.isJoining && status.error === null && (
        <Button onClick={() => joinWithAlias()}>{`Try joining ${alias}`}</Button>
      )}
      {status.isJoining && (
        <>
          <Spinner className="small" />
          <Text>{`Joining ${alias}...`}</Text>
        </>
      )}
      {status.roomId !== null && (
        <Button
          onClick={() => {
            onRequestClose();
            selectRoomMode('room');
            selectRoom(status.roomId);
          }}
        >
          Open
        </Button>
      )}
      {status.error !== null && (
        <div className="small">
          <span style={{ color: 'var(--bg-danger)' }}>{status.error}</span>
        </div>
      )}
    </div>
  );
}

TryJoinWithAlias.propTypes = {
  alias: PropTypes.string.isRequired,
  onRequestClose: PropTypes.func.isRequired,
};

function PublicRooms({ isOpen, searchTerm, onRequestClose }) {
  const [isSearching, updateIsSearching] = useState(false);
  const [isViewMore, updateIsViewMore] = useState(false);
  const [publicRooms, updatePublicRooms] = useState([]);
  const [nextBatch, updateNextBatch] = useState(undefined);
  const [searchQuery, updateSearchQuery] = useState({});
  const [joiningRooms, updateJoiningRooms] = useState(new Set());

  const roomNameRef = useRef(null);
  const hsRef = useRef(null);
  const userId = initMatrix.matrixClient.getUserId();
  const mxcUrl = initMatrix.mxcUrl;

  async function searchRooms(viewMore) {
    let inputRoomName = roomNameRef?.current?.value || searchTerm;
    let isInputAlias = false;
    if (typeof inputRoomName === 'string') {
      isInputAlias = inputRoomName[0] === '#' && inputRoomName.indexOf(':') > 1;
    }
    const hsFromAlias = isInputAlias ? inputRoomName.slice(inputRoomName.indexOf(':') + 1) : null;
    let inputHs = hsFromAlias || hsRef?.current?.value;

    if (typeof inputHs !== 'string') inputHs = userId.slice(userId.indexOf(':') + 1);
    if (typeof inputRoomName !== 'string') inputRoomName = '';

    if (isSearching) return;
    if (
      viewMore !== true &&
      inputRoomName === searchQuery.name &&
      inputHs === searchQuery.homeserver
    )
      return;

    updateSearchQuery({
      name: inputRoomName,
      homeserver: inputHs,
    });
    if (isViewMore !== viewMore) updateIsViewMore(viewMore);
    updateIsSearching(true);

    try {
      const result = await initMatrix.matrixClient.publicRooms({
        server: inputHs,
        limit: SEARCH_LIMIT,
        since: viewMore ? nextBatch : undefined,
        include_all_networks: true,
        filter: {
          generic_search_term: inputRoomName,
        },
      });

      const totalRooms = viewMore ? publicRooms.concat(result.chunk) : result.chunk;
      updatePublicRooms(totalRooms);
      updateNextBatch(result.next_batch);
      updateIsSearching(false);
      updateIsViewMore(false);
      if (totalRooms.length === 0) {
        updateSearchQuery({
          error:
            inputRoomName === ''
              ? `No public rooms on ${inputHs}`
              : `No result found for "${inputRoomName}" on ${inputHs}`,
          alias: isInputAlias ? inputRoomName : null,
        });
      }
    } catch (e) {
      updatePublicRooms([]);
      let err = 'Something went wrong!';
      if (e?.httpStatus >= 400 && e?.httpStatus < 500) {
        err = e.message;
      }
      updateSearchQuery({
        error: err,
        alias: isInputAlias ? inputRoomName : null,
      });
      updateIsSearching(false);
      updateNextBatch(undefined);
      updateIsViewMore(false);
    }
  }

  useEffect(() => {
    if (isOpen) searchRooms();
  }, [isOpen]);

  function handleOnRoomAdded(roomId) {
    if (joiningRooms.has(roomId)) {
      joiningRooms.delete(roomId);
      updateJoiningRooms(new Set(Array.from(joiningRooms)));
    }
  }
  useEffect(() => {
    initMatrix.roomList.on(cons.events.roomList.ROOM_JOINED, handleOnRoomAdded);
    return () => {
      initMatrix.roomList.removeListener(cons.events.roomList.ROOM_JOINED, handleOnRoomAdded);
    };
  }, [joiningRooms]);

  function handleViewRoom(roomId) {
    const room = initMatrix.matrixClient.getRoom(roomId);
    if (room.isSpaceRoom()) selectTab(roomId, true);
    else {
      selectRoomMode('room');
      selectRoom(roomId);
    }
    onRequestClose();
  }

  function joinRoom(roomIdOrAlias) {
    joiningRooms.add(roomIdOrAlias);
    updateJoiningRooms(new Set(Array.from(joiningRooms)));
    roomActions.join(roomIdOrAlias, false).catch((err) => {
      console.error(err);
      alert(err.message, 'Join Public Room Error');
      joiningRooms.delete(roomIdOrAlias);
      updateJoiningRooms(new Set(Array.from(joiningRooms)));
    });
  }

  function renderRoomList(rooms) {
    return rooms.map((room, index) => {
      const alias = typeof room.canonical_alias === 'string' ? room.canonical_alias : room.room_id;
      const name = typeof room.name === 'string' ? room.name : alias;
      const isJoined = initMatrix.matrixClient.getRoom(room.room_id)?.getMyMembership() === 'join';
      const desc = typeof room.topic === 'string' ? room.topic : null;

      return (
        <div key={`publicRooms_renderRoomList_${index}`} className="col-md-4">
          <div className="card p-3 m-2" style={{ height: '350px' }}>
            <h4 className="card-title">
              <Avatar
                animParentsCount={0}
                imgClass="profile-image-container"
                className="profile-image-container"
                imageSrc={mxcUrl.toHttp(room.avatar_url, dfAvatarSize, dfAvatarSize)}
                imageAnimSrc={mxcUrl.toHttp(room.avatar_url)}
                bgColor={colorMXID(alias)}
                text={name}
                isDefaultImage
              />
            </h4>

            <h4 className="card-title small emoji-size-fix">{twemojifyReact(name)}</h4>

            <p
              className="card-text p-y-1 text-freedom text-size-box very-small emoji-size-fix"
              style={{ height: '150px', maxHeight: '150px' }}
            >
              {desc !== null && typeof desc === 'string'
                ? twemojifyReact(desc, undefined, true)
                : desc}
            </p>

            <p className="card-text p-y-1 very-small text-gray">
              {alias +
                (room.num_joined_members === null ? '' : ` • ${room.num_joined_members} members`)}
            </p>

            {isJoined && (
              <Button onClick={() => handleViewRoom(room.room_id)} variant="secondary">
                Open
              </Button>
            )}
            {!isJoined &&
              (joiningRooms.has(room.room_id) ? (
                <Spinner className="small" />
              ) : (
                <Button
                  onClick={() => joinRoom(room.aliases?.[0] || room.room_id)}
                  variant="primary"
                >
                  Join
                </Button>
              ))}
          </div>
        </div>
      );
    });
  }

  return (
    <PopupWindow
      isOpen={isOpen}
      size="modal-xl discover-spaces"
      title="Public rooms"
      onRequestClose={onRequestClose}
    >
      <div className="container">
        <form
          className="p-3 border-0 rounded d-flex justify-content-center w-100 discover-banner noselect"
          onSubmit={(e) => {
            e.preventDefault();
            searchRooms();
          }}
        >
          <center>
            <h4>Find your community in Matrix</h4>
            <h6>There will always be a place that is trying to teach you new things.</h6>

            <div className="m-3">
              <Input
                value={searchTerm}
                forwardRef={roomNameRef}
                className="text-center"
                placeholder="Enter the name of your community here"
              />
            </div>

            <div className="mb-3">
              <Input
                forwardRef={hsRef}
                value={getHomeServer(userId)}
                className2="mb-3"
                className="text-center"
                required
              />
            </div>
            <Button disabled={isSearching} iconSrc={HashSearchIC} variant="primary" type="submit">
              Search
            </Button>
          </center>

          <Img src="./img/page/discover.jpg" alt="banner" />
        </form>

        <center className="py-3 noselect">
          {typeof searchQuery.name !== 'undefined' &&
            isSearching &&
            (searchQuery.name === '' ? (
              <>
                <Spinner className="small" />
                <div className="small">{`Loading public rooms from ${searchQuery.homeserver}...`}</div>
              </>
            ) : (
              <>
                <Spinner className="small" />
                <div className="small">{`Searching for "${searchQuery.name}" on ${searchQuery.homeserver}...`}</div>
              </>
            ))}

          {typeof searchQuery.name !== 'undefined' &&
            !isSearching &&
            (searchQuery.name === '' ? (
              <div className="small">{`Public rooms on ${searchQuery.homeserver}.`}</div>
            ) : (
              <div className="small">{`Search result for "${searchQuery.name}" on ${searchQuery.homeserver}.`}</div>
            ))}

          {searchQuery.error && (
            <>
              <Text className="public-rooms__search-error" variant="b2">
                {searchQuery.error}
              </Text>
              {typeof searchQuery.alias === 'string' && (
                <TryJoinWithAlias onRequestClose={onRequestClose} alias={searchQuery.alias} />
              )}
            </>
          )}
        </center>

        {publicRooms.length !== 0 && (
          <div className="row hidden-md-up">{renderRoomList(publicRooms)}</div>
        )}

        {publicRooms.length !== 0 && publicRooms.length % SEARCH_LIMIT === 0 && (
          <center className="d-grid gap-2 mt-3 noselect">
            {isViewMore !== true && (
              <Button variant="primary" onClick={() => searchRooms(true)}>
                View more
              </Button>
            )}
            {isViewMore && <Spinner />}
          </center>
        )}
      </div>
    </PopupWindow>
  );
}

PublicRooms.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  searchTerm: PropTypes.string,
  onRequestClose: PropTypes.func.isRequired,
};

export default PublicRooms;
