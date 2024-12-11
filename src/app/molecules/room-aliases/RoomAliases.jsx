import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import tinyClipboard from '@src/util/libs/Clipboard';
import { getShareUrl } from '@src/util/tools';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import { Debounce } from '../../../util/common';
import { isRoomAliasAvailable, getCurrentState } from '../../../util/matrixUtil';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import Input from '../../atoms/input/Input';
import Checkbox from '../../atoms/button/Checkbox';
import Toggle from '../../atoms/button/Toggle';
import SettingTile from '../setting-tile/SettingTile';

import { useStore } from '../../hooks/useStore';

function useValidate(hsString) {
  const [debounce] = useState(new Debounce());
  const [validate, setValidate] = useState({ alias: null, status: cons.status.PRE_FLIGHT });

  const setValidateToDefault = () => {
    setValidate({
      alias: null,
      status: cons.status.PRE_FLIGHT,
    });
  };

  const checkValueOK = (value) => {
    if (value.trim() === '') {
      setValidateToDefault();
      return false;
    }
    if (!value.match(/^[a-zA-Z0-9_-]+$/)) {
      setValidate({
        alias: null,
        status: cons.status.ERROR,
        msg: 'Invalid character: only letter, numbers and _- are allowed.',
      });
      return false;
    }
    return true;
  };

  const handleAliasChange = (e) => {
    const input = e.target;
    if (validate.status !== cons.status.PRE_FLIGHT) {
      setValidateToDefault();
    }
    if (checkValueOK(input.value) === false) return;

    debounce._(async () => {
      const { value } = input;
      const alias = `#${value}:${hsString}`;
      if (checkValueOK(value) === false) return;

      setValidate({
        alias,
        status: cons.status.IN_FLIGHT,
        msg: `validating ${alias}...`,
      });

      const isValid = await isRoomAliasAvailable(alias);
      setValidate(() => {
        if (e.target.value !== value) {
          return { alias: null, status: cons.status.PRE_FLIGHT };
        }
        return {
          alias,
          status: isValid ? cons.status.SUCCESS : cons.status.ERROR,
          msg: isValid ? `${alias} is available.` : `${alias} is already in use.`,
        };
      });
    }, 600)();
  };

  return [validate, setValidateToDefault, handleAliasChange];
}

function getAliases(roomId) {
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId);
  if (room) {
    const main = room.getCanonicalAlias();
    const published = room.getAltAliases();
    if (main && !published.includes(main)) published.splice(0, 0, main);

    return {
      main,
      published: [...new Set(published)],
      local: [],
    };
  } else {
    return {
      main: null,
      published: [],
      local: [],
    };
  }
}

function RoomAliases({ roomId }) {
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId);
  const userId = mx.getUserId();
  const hsString = userId.slice(userId.indexOf(':') + 1);

  const isMountedStore = useStore();
  const [isPublic, setIsPublic] = useState(false);
  const [isLocalVisible, setIsLocalVisible] = useState(false);
  const [aliases, setAliases] = useState(getAliases(roomId));
  const [selectedAlias, setSelectedAlias] = useState(null);
  const [deleteAlias, setDeleteAlias] = useState(null);
  const [validate, setValidateToDefault, handleAliasChange] = useValidate(hsString);

  const canPublishAlias = getCurrentState(room).maySendStateEvent('m.room.canonical_alias', userId);

  useEffect(() => {
    isMountedStore.setItem(true);
  }, []);

  useEffect(() => {
    let isUnmounted = false;

    const loadLocalAliases = async () => {
      let local = [];
      try {
        const result = await mx.getLocalAliases(roomId);
        local = result.aliases.filter((alias) => !aliases.published.includes(alias));
      } catch {
        local = [];
      }
      aliases.local = [...new Set(local.reverse())];

      if (isUnmounted) return;
      setAliases({ ...aliases });
    };
    const loadVisibility = async () => {
      const result = await mx.getRoomDirectoryVisibility(roomId);
      if (isUnmounted) return;
      setIsPublic(result.visibility === 'public');
    };
    loadLocalAliases();
    loadVisibility();
    return () => {
      isUnmounted = true;
    };
  }, [roomId]);

  const toggleDirectoryVisibility = () => {
    mx.setRoomDirectoryVisibility(roomId, isPublic ? 'private' : 'public');
    setIsPublic(!isPublic);
  };

  const handleAliasSubmit = async (e) => {
    e.preventDefault();
    if (validate.status === cons.status.ERROR) return;
    if (!validate.alias) return;

    const { alias } = validate;
    const aliasInput = e.target.elements['alias-input'];
    aliasInput.value = '';
    setValidateToDefault();

    try {
      aliases.local.push(alias);
      setAliases({ ...aliases });
      await mx.createAlias(alias, roomId);
    } catch {
      if (isMountedStore.getItem()) {
        const lIndex = alias.local.indexOf(alias);
        if (lIndex === -1) return;
        aliases.local.splice(lIndex, 1);
        setAliases({ ...aliases });
      }
    }
  };

  const handleAliasSelect = (alias) => {
    setSelectedAlias(alias === selectedAlias ? null : alias);
  };

  const handlePublishAlias = (alias) => {
    const { main, published } = aliases;
    let { local } = aliases;

    if (!published.includes(aliases)) {
      published.push(alias);
      local = local.filter((al) => al !== alias);
      mx.sendStateEvent(roomId, 'm.room.canonical_alias', {
        alias: main,
        alt_aliases: published.filter((al) => al !== main),
      });
      setAliases({ main, published, local });
      setSelectedAlias(null);
    }
  };

  const handleUnPublishAlias = (alias) => {
    let { main, published } = aliases;
    const { local } = aliases;

    if (published.includes(alias) || main === alias) {
      if (main === alias) main = null;
      published = published.filter((al) => al !== alias);
      local.push(alias);
      mx.sendStateEvent(roomId, 'm.room.canonical_alias', {
        alias: main,
        alt_aliases: published.filter((al) => al !== main),
      });
      setAliases({ main, published, local });
      setSelectedAlias(null);
    }
  };

  const handleSetMainAlias = (alias) => {
    let { main, local } = aliases;
    const { published } = aliases;

    if (main !== alias) {
      main = alias;
      if (!published.includes(alias)) published.splice(0, 0, alias);
      local = local.filter((al) => al !== alias);
      mx.sendStateEvent(roomId, 'm.room.canonical_alias', {
        alias: main,
        alt_aliases: published.filter((al) => al !== main),
      });
      setAliases({ main, published, local });
      setSelectedAlias(null);
    }
  };

  const handleDeleteAlias = async (alias) => {
    try {
      setDeleteAlias({ alias, status: cons.status.IN_FLIGHT, msg: 'deleting...' });
      await mx.deleteAlias(alias);
      let { main, published, local } = aliases;
      if (published.includes(alias)) {
        handleUnPublishAlias(alias);
        if (main === alias) main = null;
        published = published.filter((al) => al !== alias);
      }

      local = local.filter((al) => al !== alias);
      setAliases({ main, published, local });
      setDeleteAlias(null);
      setSelectedAlias(null);
    } catch (err) {
      setDeleteAlias({ alias, status: cons.status.ERROR, msg: err.message });
    }
  };

  const renderAliasBtns = (alias) => {
    const isPublished = aliases.published.includes(alias);
    const isMain = aliases.main === alias;
    if (deleteAlias?.alias === alias) {
      const isError = deleteAlias.status === cons.status.ERROR;
      return (
        <div className="room-aliases__item-btns noselect">
          <Text variant="b2">
            <span style={{ color: isError ? 'var(--tc-danger-high' : 'inherit' }}>
              {deleteAlias.msg}
            </span>
          </Text>
        </div>
      );
    }

    return (
      <>
        {canPublishAlias && !isMain && (
          <Button className="m-2" onClick={() => handleSetMainAlias(alias)} variant="primary">
            Set as Main
          </Button>
        )}
        {!isPublished && canPublishAlias && (
          <Button className="m-2" onClick={() => handlePublishAlias(alias)} variant="success">
            Publish
          </Button>
        )}
        {isPublished && canPublishAlias && (
          <Button className="m-2" onClick={() => handleUnPublishAlias(alias)} variant="warning">
            Un-Publish
          </Button>
        )}
        <Button className="m-2" onClick={() => handleDeleteAlias(alias)} variant="danger">
          Delete
        </Button>
      </>
    );
  };

  const renderAlias = (alias) => {
    const isActive = selectedAlias === alias;
    const disabled = !canPublishAlias && aliases.published.includes(alias);
    const isMain = aliases.main === alias;

    return (
      <React.Fragment key={`${alias}-wrapper`}>
        <div className="room-aliases__alias-item" key={alias}>
          <Checkbox
            variant="success"
            disabled={disabled}
            isActive={isActive}
            onToggle={() => handleAliasSelect(alias)}
          />
          <div className="ms-3">
            {alias}
            {isMain && <span className="ms-1 badge bg-secondary noselect">Main</span>}
            {__ENV_APP__.SHARE_URL && (
              <a
                className="ms-1 badge bg-primary text-bg-force noselect"
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  tinyClipboard.copyText(getShareUrl(alias));
                  alert('The share link was successfully copied!', 'Room Viewer');
                }}
              >
                Share
              </a>
            )}
          </div>
        </div>
        {isActive && renderAliasBtns(alias)}
      </React.Fragment>
    );
  };

  let inputState = 'normal';
  if (validate.status === cons.status.ERROR) inputState = 'error';
  if (validate.status === cons.status.SUCCESS) inputState = 'success';
  return (
    <>
      <SettingTile
        className="noselect"
        title="Publish to room directory"
        content={
          <div className="very-small text-gray">{`Publish this ${room.isSpaceRoom() ? 'space' : 'room'} to the ${hsString}'s public room directory?`}</div>
        }
        options={
          <Toggle
            className="d-inline-flex"
            isActive={isPublic}
            onToggle={toggleDirectoryVisibility}
            disabled={!canPublishAlias}
          />
        }
      />

      <li className="list-group-item very-small text-gray noselect">Published addresses</li>

      <li className="list-group-item very-small">
        {aliases.published.length === 0 && (
          <Text className="room-aliases__message noselect">No published addresses</Text>
        )}
        {aliases.published.length > 0 && !aliases.main && (
          <Text className="room-aliases__message noselect">
            No Main address (select one from below)
          </Text>
        )}
        {aliases.published.map(renderAlias)}
        <Text className="room-aliases__message noselect" variant="b3">
          {`Published addresses can be used by anyone on any server to join your ${room.isSpaceRoom() ? 'space' : 'room'}. To publish an address, it needs to be set as a local address first.`}
        </Text>
      </li>

      {isLocalVisible && (
        <>
          <li className="list-group-item very-small text-gray noselect">Local addresses</li>

          <li className="list-group-item very-small">
            {aliases.local.length === 0 && (
              <Text className="room-aliases__message noselect">No local addresses</Text>
            )}
            {aliases.local.map(renderAlias)}

            <Text className="room-aliases__message noselect" variant="b3">
              {`Set local addresses for this ${room.isSpaceRoom() ? 'space' : 'room'} so users can find this ${room.isSpaceRoom() ? 'space' : 'room'} through your homeserver.`}
            </Text>

            <Text className="room-aliases__form-label noselect" variant="b2">
              Add local address
            </Text>
            <form className="room-aliases__form noselect" onSubmit={handleAliasSubmit}>
              <div className="room-aliases__input-wrapper">
                <div>
                  <Input
                    name="alias-input"
                    state={inputState}
                    onChange={handleAliasChange}
                    placeholder={`my_${room.isSpaceRoom() ? 'space' : 'room'}_address`}
                    required
                  />
                </div>
              </div>
              <Button variant="primary" type="submit">
                Add
              </Button>
            </form>

            <div className="room-aliases__input-status noselect">
              {validate.status === cons.status.SUCCESS && (
                <Text className="room-aliases__valid" variant="b2">
                  {validate.msg}
                </Text>
              )}
              {validate.status === cons.status.ERROR && (
                <Text className="room-aliases__invalid" variant="b2">
                  {validate.msg}
                </Text>
              )}
            </div>
          </li>
        </>
      )}

      <li className="list-group-item very-small noselect">
        <Button onClick={() => setIsLocalVisible(!isLocalVisible)}>
          {`${isLocalVisible ? 'Hide' : 'Add / View'} local address`}
        </Button>
      </li>

      <li className="list-group-item very-small text-gray noselect">Room data</li>

      <SettingTile title="Room id" content={<div className="very-small text-gray">{roomId}</div>} />

      <SettingTile
        title="Name"
        content={
          <>
            <div className="very-small text-gray">{room.name}</div>
            {room.nameCinny ? (
              <div className="very-small text-gray">{room.nameCinny.original}</div>
            ) : null}
          </>
        }
      />

      <SettingTile
        title="Normalized name"
        content={<div className="very-small text-gray">{room.normalizedName}</div>}
      />
    </>
  );
}

RoomAliases.propTypes = {
  roomId: PropTypes.string.isRequired,
};

export default RoomAliases;
