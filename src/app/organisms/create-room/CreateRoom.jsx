import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import { twemojifyReact } from '../../../util/twemojify';
import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import {
  selectRoom,
  openReusableContextMenu,
  selectRoomMode,
} from '../../../client/action/navigation';
import * as roomActions from '../../../client/action/room';
import { isRoomAliasAvailable, getIdServer } from '../../../util/matrixUtil';
import { getEventCords } from '../../../util/common';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import Toggle from '../../atoms/button/Toggle';
import { MenuHeader, MenuItem } from '../../atoms/context-menu/ContextMenu';
import Input from '../../atoms/input/Input';
import Spinner from '../../atoms/spinner/Spinner';
import SegmentControl from '../../atoms/segmented-controls/SegmentedControls';
import Dialog from '../../molecules/dialog/Dialog';
import SettingTile from '../../molecules/setting-tile/SettingTile';

const HashPlusIC = './img/ic/outlined/hash-plus.svg';
const SpacePlusIC = './img/ic/outlined/space-plus.svg';
const HashIC = './img/ic/outlined/hash.svg';
const HashLockIC = './img/ic/outlined/hash-lock.svg';
const HashGlobeIC = './img/ic/outlined/hash-globe.svg';
const SpaceIC = './img/ic/outlined/space.svg';
const SpaceLockIC = './img/ic/outlined/space-lock.svg';
const SpaceGlobeIC = './img/ic/outlined/space-globe.svg';

function CreateRoomContent({ isSpace, parentId = null, onRequestClose }) {
  const [joinRule, setJoinRule] = useState(parentId ? 'restricted' : 'invite');
  const [isEncrypted, setIsEncrypted] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [creatingError, setCreatingError] = useState(null);

  const [isValidAddress, setIsValidAddress] = useState(null);
  const [addressValue, setAddressValue] = useState(undefined);
  const [roleIndex, setRoleIndex] = useState(1);

  const addressRef = useRef(null);

  const mx = initMatrix.matrixClient;
  const userHs = getIdServer(mx.getUserId());

  useEffect(() => {
    const { roomList } = initMatrix;
    const onCreated = (roomId) => {
      setIsCreatingRoom(false);
      setCreatingError(null);
      setIsValidAddress(null);
      setAddressValue(undefined);

      if (!mx.getRoom(roomId)?.isSpaceRoom()) {
        selectRoomMode('room');
        selectRoom(roomId);
      }
      onRequestClose();
    };
    roomList.on(cons.events.roomList.ROOM_CREATED, onCreated);
    return () => {
      roomList.removeListener(cons.events.roomList.ROOM_CREATED, onCreated);
    };
  }, []);

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    const { target } = evt;

    if (isCreatingRoom) return;
    setIsCreatingRoom(true);
    setCreatingError(null);

    const name = target.name.value;
    let topic = target.topic.value;
    if (topic.trim() === '') topic = undefined;
    let roomAlias;
    if (joinRule === 'public') {
      roomAlias = addressRef?.current?.value;
      if (roomAlias.trim() === '') roomAlias = undefined;
    }

    const powerLevel = roleIndex === 1 ? 101 : undefined;

    try {
      await roomActions.createRoom({
        name,
        topic,
        joinRule,
        alias: roomAlias,
        isEncrypted:
          isSpace || joinRule === 'public' || __ENV_APP__.DISABLE_ENCRYPT_SETTINGS
            ? false
            : isEncrypted,
        powerLevel,
        isSpace,
        parentId,
      });
    } catch (e) {
      if (e.message === 'M_UNKNOWN: Invalid characters in room alias') {
        setCreatingError('ERROR: Invalid characters in address');
        setIsValidAddress(false);
      } else if (e.message === 'M_ROOM_IN_USE: Room alias already taken') {
        setCreatingError('ERROR: This address is already in use');
        setIsValidAddress(false);
      } else setCreatingError(e.message);
      setIsCreatingRoom(false);
    }
  };

  const validateAddress = (e) => {
    const myAddress = e.target.value;
    setIsValidAddress(null);
    setAddressValue(e.target.value);
    setCreatingError(null);

    setTimeout(async () => {
      if (myAddress !== addressRef.current.value) return;
      const roomAlias = addressRef.current.value;
      if (roomAlias === '') return;
      const roomAddress = `#${roomAlias}:${userHs}`;

      if (await isRoomAliasAvailable(roomAddress)) {
        setIsValidAddress(true);
      } else {
        setIsValidAddress(false);
      }
    }, 1000);
  };

  const joinRules = ['invite', 'restricted', 'public'];
  const joinRuleShortText = ['Private', 'Restricted', 'Public'];
  const joinRuleText = [
    'Private (invite only)',
    'Restricted (space member can join)',
    'Public (anyone can join)',
  ];
  const jrRoomIC = [HashLockIC, HashIC, HashGlobeIC];
  const jrSpaceIC = [SpaceLockIC, SpaceIC, SpaceGlobeIC];
  const handleJoinRule = (evt) => {
    openReusableContextMenu('bottom', getEventCords(evt, '.btn-link'), (closeMenu) => (
      <>
        <MenuHeader>Visibility (who can join)</MenuHeader>
        {joinRules.map((rule) => (
          <MenuItem
            key={rule}
            variant={rule === joinRule ? 'success' : 'link btn-bg'}
            iconSrc={
              isSpace ? jrSpaceIC[joinRules.indexOf(rule)] : jrRoomIC[joinRules.indexOf(rule)]
            }
            onClick={() => {
              closeMenu();
              setJoinRule(rule);
            }}
            disabled={!parentId && rule === 'restricted'}
          >
            {joinRuleText[joinRules.indexOf(rule)]}
          </MenuItem>
        ))}
      </>
    ));
  };

  return (
    <div className="create-room">
      <form className="create-room__form" onSubmit={handleSubmit}>
        <SettingTile
          title="Visibility"
          options={
            <Button onClick={handleJoinRule} faSrc="fa-solid fa-check">
              {joinRuleShortText[joinRules.indexOf(joinRule)]}
            </Button>
          }
          content={
            <div className="very-small text-gray">{`Select who can join this ${isSpace ? 'space' : 'room'}.`}</div>
          }
        />
        {joinRule === 'public' && (
          <div>
            <Text className="create-room__address__label" variant="b2">
              {isSpace ? 'Space address' : 'Room address'}
            </Text>
            <div className="create-room__address">
              <Text variant="b1">#</Text>
              <div>
                <Input
                  value={addressValue}
                  onChange={validateAddress}
                  state={isValidAddress === false ? 'error' : 'normal'}
                  forwardRef={addressRef}
                  placeholder="my_address"
                  required
                />
              </div>
              <Text variant="b1">{`:${userHs}`}</Text>
            </div>
            {isValidAddress === false && (
              <Text className="create-room__address__tip" variant="b3">
                <span
                  style={{ color: 'var(--bg-danger)' }}
                >{`#${addressValue}:${userHs} is already in use`}</span>
              </Text>
            )}
          </div>
        )}
        {!isSpace && joinRule !== 'public' && !__ENV_APP__.DISABLE_ENCRYPT_SETTINGS && (
          <SettingTile
            title="Enable end-to-end encryption"
            options={<Toggle isActive={isEncrypted} onToggle={setIsEncrypted} />}
            content={
              <div className="very-small text-gray">
                You can’t disable this later. Bridges & most bots won’t work yet.
              </div>
            }
          />
        )}
        <SettingTile
          title="Select your role"
          options={
            <SegmentControl
              selected={roleIndex}
              segments={[{ text: 'Admin' }, { text: 'Founder' }]}
              onSelect={setRoleIndex}
            />
          }
          content={
            <div className="very-small text-gray">
              Selecting Admin sets 100 power level whereas Founder sets 101.
            </div>
          }
        />
        <div>
          <Input name="topic" minHeight={174} resizable label="Topic (optional)" />
        </div>
        <div className="create-room__name-wrapper">
          <div>
            <Input name="name" label={`${isSpace ? 'Space' : 'Room'} name`} required />
          </div>
          <Button
            disabled={isValidAddress === false || isCreatingRoom}
            iconSrc={isSpace ? SpacePlusIC : HashPlusIC}
            type="submit"
            variant="primary"
          >
            Create
          </Button>
        </div>
        {isCreatingRoom && (
          <div className="create-room__loading">
            <Spinner className="small" />
            <Text>{`Creating ${isSpace ? 'space' : 'room'}...`}</Text>
          </div>
        )}
        {typeof creatingError === 'string' && (
          <Text className="create-room__error" variant="b3">
            {creatingError}
          </Text>
        )}
      </form>
    </div>
  );
}

CreateRoomContent.propTypes = {
  isSpace: PropTypes.bool.isRequired,
  parentId: PropTypes.string,
  onRequestClose: PropTypes.func.isRequired,
};

function useWindowToggle() {
  const [create, setCreate] = useState(null);

  useEffect(() => {
    const handleOpen = (isSpace, parentId) => {
      setCreate({
        isSpace,
        parentId,
      });
    };
    navigation.on(cons.events.navigation.CREATE_ROOM_OPENED, handleOpen);
    return () => {
      navigation.removeListener(cons.events.navigation.CREATE_ROOM_OPENED, handleOpen);
    };
  }, []);

  const onRequestClose = () => setCreate(null);

  return [create, onRequestClose];
}

function CreateRoom() {
  const [create, onRequestClose] = useWindowToggle();
  const { isSpace, parentId } = create ?? {};
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(parentId);

  return (
    <Dialog
      className="modal-dialog-centered modal-lg noselect"
      isOpen={create !== null}
      title={
        <Text variant="s1" weight="medium" primary>
          {parentId ? twemojifyReact(room.name) : 'Home'}
          <span className="text-bg-low">{` — create ${isSpace ? 'space' : 'room'}`}</span>
        </Text>
      }
      onRequestClose={onRequestClose}
    >
      {create ? (
        <CreateRoomContent isSpace={isSpace} parentId={parentId} onRequestClose={onRequestClose} />
      ) : (
        <div />
      )}
    </Dialog>
  );
}

export default CreateRoom;
