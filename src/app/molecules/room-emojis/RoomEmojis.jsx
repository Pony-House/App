import React, { useReducer, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { RoomStateEvent } from 'matrix-js-sdk';

import tinyConsole from '@src/util/libs/console';
import { getEmojiImport, supportedEmojiImportFiles } from '@src/util/libs/emoji/emojiUtil';
import EmojiEvents from '@src/util/libs/emoji/EmojiEvents';
import emojiEditor from '@src/util/libs/emoji/EmojiEditor';

import { setLoadingPage } from '@src/app/templates/client/Loading';

import initMatrix from '../../../client/initMatrix';

import Text from '../../atoms/text/Text';
import Input from '../../atoms/input/Input';
import Button from '../../atoms/button/Button';
import ImagePack from '../image-pack/ImagePack';
import { updateEmojiList } from '../../../client/action/navigation';
import { getCurrentState } from '../../../util/matrixUtil';
import FileInput, { fileInputClick, fileInputValue } from '../file-input/FileInput';

function useRoomPacks(room) {
  const mx = initMatrix.matrixClient;
  const [, forceUpdate] = useReducer((count) => count + 1, 0);

  const { usablePacks } = emojiEditor.getPackState(room);

  useEffect(() => {
    const handleEvent = (event, state, prevEvent) => {
      if (room && event.getRoomId() !== room.roomId) return;
      if (event.getType() !== EmojiEvents.RoomEmotes) return;
      if (!prevEvent?.getContent()?.images || !event.getContent().images) {
        forceUpdate();
      }
    };

    mx.on(RoomStateEvent.Events, handleEvent);
    return () => {
      mx.removeListener(RoomStateEvent.Events, handleEvent);
    };
  }, [room, mx]);

  const createPack = async (name) => {
    const result = await emojiEditor.createPack(room.roomId, name).catch((err) => {
      tinyConsole.error(err);
      alert(err.message, 'Create Pack Error');
    });
    updateEmojiList(room.roomId);
    return result;
  };

  const deletePack = async (stateKey) => {
    setLoadingPage('Deleting image pack...');
    await emojiEditor.deletePack(room.roomId, stateKey).catch((err) => {
      tinyConsole.error(err);
      alert(err.message, 'Create Pack Error');
    });
    updateEmojiList(room.roomId);
    setLoadingPage(false);
  };

  return {
    usablePacks,
    createPack,
    deletePack,
  };
}

function RoomEmojis({ roomId }) {
  const mx = initMatrix.matrixClient;
  const room = mx.getRoom(roomId);

  const emojiImportRef = useRef(null);
  const { usablePacks, createPack, deletePack } = useRoomPacks(room);
  const canChange = getCurrentState(room).maySendStateEvent(EmojiEvents.EmoteRooms, mx.getUserId());

  const createPackBase = (name, nameInput) => {
    if (name === '') return new Promise((resolve) => resolve(null));
    if (nameInput) nameInput.value = '';
    return createPack(name);
  };

  const handlePackCreate = (e) => {
    e.preventDefault();
    const { nameInput } = e.target;
    setLoadingPage('Creating image pack...');
    createPackBase(nameInput.value.trim(), nameInput)
      .then(() => setLoadingPage(false))
      .catch((err) => {
        tinyConsole.error(err);
        alert(err.message, 'Image pack creation error');
        setLoadingPage(false);
      });
  };

  const handleEmojisFileChange = (target, getFile) => {
    const zipFile = getFile(0);
    if (zipFile === null) return;
    const errorFile = (err) => {
      alert(err.message, 'Import Emojis Error');
      tinyConsole.error(err);
      setLoadingPage(false);
    };

    setLoadingPage('Importing image pack...');
    getEmojiImport(zipFile)
      .then((data) => {
        if (data.title && data.client === 'pony-house') {
          createPackBase(data.title)
            .then((result) => emojiEditor.addEmojiPack(data, roomId, result.stateKey))
            .then(() => setLoadingPage(false))
            .catch(errorFile);
        }
      })
      .catch(errorFile);

    fileInputValue(emojiImportRef, null);
  };

  return (
    <div className="card mb-3">
      <ul className="list-group list-group-flush">
        {canChange && (
          <>
            <li className="list-group-item very-small text-gray noselect">Create Pack</li>

            <li className="list-group-item">
              <form className="row" onSubmit={handlePackCreate}>
                <div className="col-10">
                  <div>
                    <Input name="nameInput" placeholder="Pack Name" required />
                  </div>
                </div>
                <div className="col-2 noselect">
                  <center className="h-100 align-items-center d-flex">
                    <Button className="m-1" variant="primary" type="submit">
                      Create pack
                    </Button>
                    <FileInput
                      ref={emojiImportRef}
                      onChange={handleEmojisFileChange}
                      accept={supportedEmojiImportFiles}
                    />
                    <Button
                      className="m-1"
                      variant="primary"
                      onClick={() => fileInputClick(emojiImportRef, handleEmojisFileChange)}
                    >
                      Import pack
                    </Button>
                  </center>
                </div>
              </form>
            </li>
          </>
        )}

        {usablePacks.length > 0 ? (
          usablePacks
            .reverse()
            .map((mEvent) => (
              <ImagePack
                key={mEvent.getId()}
                roomId={roomId}
                stateKey={mEvent.getStateKey()}
                handlePackDelete={canChange ? deletePack : undefined}
              />
            ))
        ) : (
          <div className="room-emojis__empty noselect">
            <Text>No emoji or sticker pack.</Text>
          </div>
        )}
      </ul>
    </div>
  );
}

RoomEmojis.propTypes = {
  roomId: PropTypes.string.isRequired,
};

export default RoomEmojis;
