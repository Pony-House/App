import React, { useState, useReducer, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { ClientEvent } from 'matrix-js-sdk';

import tinyConsole from '@src/util/libs/console';

import {
  emojiExport,
  getEmojiImport,
  supportedEmojiImportFiles,
} from '@src/util/libs/emoji/emojiUtil';
import emojiEditor from '@src/util/libs/emoji/EmojiEditor';
import EmojiEvents from '@src/util/libs/emoji/EmojiEvents';
import { setLoadingPage } from '@src/app/templates/client/Loading';

import initMatrix from '../../../client/initMatrix';
import { openReusableDialog, updateEmojiList } from '../../../client/action/navigation';

import Button from '../../atoms/button/Button';
import Text from '../../atoms/text/Text';
import Input from '../../atoms/input/Input';
import Checkbox from '../../atoms/button/Checkbox';

import { ImagePack as ImagePackBuilder } from '../../organisms/emoji-board/custom-emoji';
import { confirmDialog } from '../confirm-dialog/ConfirmDialog';
import ImagePackProfile from './ImagePackProfile';
import ImagePackItem from './ImagePackItem';
import ImagePackUpload from './ImagePackUpload';
import { getSelectRoom } from '../../../util/selectedRoom';
import { dfAvatarSize, getCurrentState } from '../../../util/matrixUtil';
import FileInput, { fileInputClick, fileInputValue } from '../file-input/FileInput';

const renameImagePackItem = (shortcode) =>
  new Promise((resolve) => {
    let isCompleted = false;

    openReusableDialog(
      <Text variant="s1" weight="medium">
        Rename
      </Text>,
      (requestClose) => (
        <div style={{ padding: 'var(--sp-normal)' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const sc = e.target.shortcode.value;
              if (sc.trim() === '') return;

              isCompleted = true;
              resolve(sc.trim());
              requestClose();
            }}
          >
            <div>
              <Input value={shortcode} name="shortcode" label="Shortcode" autoFocus required />
            </div>
            <div style={{ height: 'var(--sp-normal)' }} />
            <Button variant="primary" type="submit">
              Rename
            </Button>
          </form>
        </div>
      ),
      () => {
        if (!isCompleted) resolve(null);
      },
    );
  });

function useImagePackHandles(forceUpdate, roomId, stateKey) {
  const tinyComplete = () => {
    forceUpdate();
    setLoadingPage(false);
  };
  const tinyError = (err) => {
    tinyConsole.error(err);
    alert(err.message, 'Emoji Editor Error');
    setLoadingPage(false);
  };

  const handleAvatarChange = (url) => {
    setLoadingPage('Changing pack avatar...');
    emojiEditor
      .avatarChange(url, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  const handleEditProfile = (name, attribution) => {
    setLoadingPage('Changing pack profile...');
    emojiEditor
      .editProfile(name, attribution, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  const handleUsageChange = (newUsage) => {
    setLoadingPage('Changing pack usage...');
    emojiEditor
      .usageChange(newUsage, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  const handleRenameItem = async (key) => {
    const newKeyValue = await renameImagePackItem(key);
    setLoadingPage('Changing pack name...');
    emojiEditor
      .rename(key, newKeyValue, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  const handleDeleteItem = async (key) => {
    const isConfirmed = await confirmDialog(
      'Delete',
      `Are you sure that you want to delete "${key}"?`,
      'Delete',
      'danger',
    );
    if (!isConfirmed) return;
    setLoadingPage('Deleting item pack...');
    emojiEditor
      .delete(key, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  const handleUsageItem = (key, newUsage) => {
    setLoadingPage('Changing pack usage...');
    emojiEditor
      .usage(key, newUsage, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  const handleAddItem = (key, url) => {
    setLoadingPage('Adding image into the pack...');
    emojiEditor
      .add(key, url, roomId, stateKey)
      .then(() => tinyComplete())
      .catch(tinyError);
  };

  return {
    handleAvatarChange,
    handleEditProfile,
    handleUsageChange,
    handleRenameItem,
    handleDeleteItem,
    handleUsageItem,
    handleAddItem,
  };
}

const emojiEventListen = (forceUpdate) => () => {
  const tinyUpdate = () => forceUpdate();
  emojiEditor.on('personalUpdated', tinyUpdate);
  emojiEditor.on('roomUpdated', tinyUpdate);
  emojiEditor.on('roomDeleted', tinyUpdate);
  return () => {
    emojiEditor.off('personalUpdated', tinyUpdate);
    emojiEditor.off('roomUpdated', tinyUpdate);
    emojiEditor.off('roomDeleted', tinyUpdate);
  };
};

function ImagePack({ roomId, stateKey, handlePackDelete = null }) {
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const room = mx.getRoom(roomId);
  const [viewMore, setViewMore] = useState(false);
  const [isGlobal, setIsGlobal] = useState(emojiEditor.isGlobalPack(roomId, stateKey));
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const { pack } = emojiEditor.getRoom(roomId, stateKey);

  const {
    handleAvatarChange,
    handleEditProfile,
    handleUsageChange,
    handleRenameItem,
    handleDeleteItem,
    handleUsageItem,
    handleAddItem,
  } = useImagePackHandles(forceUpdate, roomId, stateKey);

  const handleGlobalChange = (isG) => {
    setIsGlobal(isG);
    if (isG) emojiEditor.addGlobalPack(roomId, stateKey);
    else emojiEditor.removeGlobalPack(roomId, stateKey);
  };

  const canChange = getCurrentState(room).maySendStateEvent(EmojiEvents.RoomEmotes, mx.getUserId());

  const handleDeletePack = async () => {
    const isConfirmed = await confirmDialog(
      'Delete Pack',
      `Are you sure that you want to delete "${pack.displayName}"?`,
      'Delete',
      'danger',
    );
    if (!isConfirmed) return;

    handlePackDelete(stateKey);
  };

  const images = [...pack.images].slice(0, viewMore ? pack.images.size : 2);
  useEffect(emojiEventListen(forceUpdate));

  const exportData = {
    displayName: pack.displayName || 'Unknown',
    avatarUrl: pack.avatarUrl,
    attribution: pack.attribution,
    usage: emojiEditor.getUsage(pack.usage),
    stateKey,
    roomId,
  };

  return (
    <li className="list-group-item image-pack">
      <ImagePackProfile
        avatarUrl={mxcUrl.toHttp(pack.avatarUrl, dfAvatarSize, dfAvatarSize)}
        avatarAnimUrl={mxcUrl.toHttp(pack.avatarUrl)}
        displayName={pack.displayName ?? 'Unknown'}
        attribution={pack.attribution}
        usage={emojiEditor.getUsage(pack.usage)}
        onUsageChange={canChange ? handleUsageChange : null}
        onAvatarChange={canChange ? handleAvatarChange : null}
        onEditProfile={canChange ? handleEditProfile : null}
      />
      {canChange && <ImagePackUpload onUpload={handleAddItem} roomId={roomId} />}

      {images.length === 0 ? null : (
        <div>
          <div className="image-pack__header noselect">
            <div className="very-small text-gray">Image</div>
            <div className="very-small text-gray">Shortcode</div>
            <div className="very-small text-gray">Usage</div>
          </div>
          {images.map(([shortcode, image]) => (
            <ImagePackItem
              key={shortcode}
              url={mxcUrl.toHttp(image.mxc)}
              shortcode={shortcode}
              usage={emojiEditor.getUsage(image.usage)}
              onUsageChange={canChange ? handleUsageItem : undefined}
              onDelete={canChange ? handleDeleteItem : undefined}
              onRename={canChange ? handleRenameItem : undefined}
            />
          ))}
        </div>
      )}

      <div className="image-pack__footer">
        {pack.images.size > 2 || handlePackDelete ? (
          <>
            {pack.images.size > 2 && (
              <Button onClick={() => setViewMore(!viewMore)}>
                {viewMore ? 'View less' : `View ${pack.images.size - 2} more`}
              </Button>
            )}
            <Button onClick={() => emojiExport(exportData, [...pack.images])}>Export</Button>
            {handlePackDelete && (
              <Button variant="danger" onClick={handleDeletePack}>
                Delete Pack
              </Button>
            )}
          </>
        ) : (
          <Button onClick={() => emojiExport(exportData, [...pack.images])}>Export</Button>
        )}
      </div>

      <div className="image-pack__global">
        <Checkbox variant="success" onToggle={handleGlobalChange} isActive={isGlobal} />
        <div>
          <Text variant="b2">Use globally</Text>
          <div className="very-small text-gray noselect">
            Add this pack to your account to use in all rooms.
          </div>
        </div>
      </div>
    </li>
  );
}

ImagePack.propTypes = {
  roomId: PropTypes.string.isRequired,
  stateKey: PropTypes.string.isRequired,
  handlePackDelete: PropTypes.func,
};

function ImagePackUser() {
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const [viewMore, setViewMore] = useState(false);
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const { pack } = emojiEditor.getPersonal();

  const emojiImportRef = useRef(null);

  const {
    handleAvatarChange,
    handleEditProfile,
    handleUsageChange,
    handleRenameItem,
    handleDeleteItem,
    handleUsageItem,
    handleAddItem,
  } = useImagePackHandles(forceUpdate);

  const images = [...pack.images].slice(0, viewMore ? pack.images.size : 2);
  useEffect(emojiEventListen(forceUpdate));

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
          emojiEditor
            .addEmojiPack(data)
            .then(() => setLoadingPage(false))
            .catch(errorFile);
        }
      })
      .catch(errorFile);

    fileInputValue(emojiImportRef, null);
  };

  return (
    <div className="card">
      <ul className="list-group list-group-flush">
        <ImagePackProfile
          avatarUrl={mxcUrl.toHttp(pack.avatarUrl, dfAvatarSize, dfAvatarSize)}
          avatarAnimUrl={mxcUrl.toHttp(pack.avatarUrl)}
          displayName={pack.displayName ?? 'Personal'}
          attribution={pack.attribution}
          usage={emojiEditor.getUsage(pack.usage)}
          onUsageChange={handleUsageChange}
          onAvatarChange={handleAvatarChange}
          onEditProfile={handleEditProfile}
        />

        <ImagePackUpload
          buttons={
            <>
              <FileInput
                ref={emojiImportRef}
                onChange={handleEmojisFileChange}
                accept={supportedEmojiImportFiles}
              />
              <Button
                className="m-1 noselect"
                variant="primary"
                onClick={() => fileInputClick(emojiImportRef, handleEmojisFileChange)}
              >
                Import pack
              </Button>
            </>
          }
          onUpload={handleAddItem}
        />

        {images.length === 0 ? null : (
          <div>
            <div className="image-pack__header noselect">
              <div className="very-small text-gray">Image</div>
              <div className="very-small text-gray">Shortcode</div>
              <div className="very-small text-gray">Usage</div>
            </div>
            {images.map(([shortcode, image]) => (
              <ImagePackItem
                key={shortcode}
                url={mxcUrl.toHttp(image.mxc)}
                shortcode={shortcode}
                usage={emojiEditor.getUsage(image.usage)}
                onUsageChange={handleUsageItem}
                onDelete={handleDeleteItem}
                onRename={handleRenameItem}
              />
            ))}
          </div>
        )}

        <li className="list-group-item noselect">
          <center>
            {pack.images.size > 2 && (
              <>
                <Button onClick={() => setViewMore(!viewMore)}>
                  {viewMore ? 'View less' : `View ${pack.images.size - 2} more`}
                </Button>
                <br />
              </>
            )}
            <Button
              onClick={() =>
                emojiExport(
                  {
                    displayName: pack.displayName || 'Personal Pack',
                    attribution: pack.attribution,
                    avatarUrl: pack.avatarUrl,
                    usage: emojiEditor.getUsage(pack.usage),
                    stateKey: null,
                    roomId: null,
                  },
                  [...pack.images],
                )
              }
            >
              Export Personal Emojis
            </Button>
          </center>
        </li>
      </ul>
    </div>
  );
}

function useGlobalImagePack() {
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const mx = initMatrix.matrixClient;

  const roomIdToStateKeys = new Map();
  const globalContent = mx.getAccountData(EmojiEvents.EmoteRooms)?.getContent() ?? { rooms: {} };
  const { rooms } = globalContent;

  Object.keys(rooms).forEach((roomId) => {
    if (typeof rooms[roomId] !== 'object') return;
    const room = mx.getRoom(roomId);
    const stateKeys = Object.keys(rooms[roomId]);
    if (!room || stateKeys.length === 0) return;
    roomIdToStateKeys.set(roomId, stateKeys);
  });

  useEffect(() => {
    const handleEvent = (event) => {
      if (event.getType() === EmojiEvents.EmoteRooms) forceUpdate();
    };
    mx.addListener(ClientEvent.AccountData, handleEvent);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleEvent);
    };
  }, []);

  return roomIdToStateKeys;
}

function ImagePackGlobal() {
  const mx = initMatrix.matrixClient;
  const roomIdToStateKeys = useGlobalImagePack();

  const handleChange = (roomId, stateKey) => {
    emojiEditor.removeGlobalPack(roomId, stateKey);
  };

  return (
    <div className="card mt-3">
      <ul className="list-group list-group-flush">
        <li className="list-group-item very-small text-gray noselect">Global packs</li>

        <div>
          {roomIdToStateKeys.size > 0 ? (
            [...roomIdToStateKeys].map(([roomId, stateKeys]) => {
              const room = mx.getRoom(roomId);

              return stateKeys.map((stateKey) => {
                const data = getCurrentState(room).getStateEvents(EmojiEvents.RoomEmotes, stateKey);
                const pack = ImagePackBuilder.parsePack(data?.getId(), data?.getContent());
                if (!pack) return null;
                return (
                  <li className="list-group-item" key={pack.id}>
                    <div className="row">
                      <div className="col-md-1 noselect">
                        <center>
                          <Checkbox
                            variant="success"
                            onToggle={() => handleChange(roomId, stateKey)}
                            isActive
                          />
                        </center>
                      </div>

                      <div className="col-md-11 ps-0">
                        <div className="small">{pack.displayName ?? 'Unknown'}</div>
                        <div className="very-small text-gray">{room.name}</div>
                      </div>
                    </div>
                  </li>
                );
              });
            })
          ) : (
            <li className="list-group-item small text-gray noselect">
              <center>No global packs</center>
            </li>
          )}
        </div>
      </ul>
    </div>
  );
}

export default ImagePack;

export { ImagePackUser, ImagePackGlobal };
