import React, { useState } from 'react';

import tinyConsole from '@src/util/libs/console';
import storageManager from '@src/util/libs/Localstorage';
import { isMobile } from '@src/util/libs/mobile';
import initMatrix from '@src/client/initMatrix';

import Toggle from '@src/app/atoms/button/Toggle';
import Button from '@src/app/atoms/button/Button';
import envAPI from '@src/util/libs/env';

import SettingTile from '../../../molecules/setting-tile/SettingTile';
import ImportE2ERoomKeys from '../../../molecules/import-export-e2e-room-keys/ImportE2ERoomKeys';
import ExportE2ERoomKeys from '../../../molecules/import-export-e2e-room-keys/ExportE2ERoomKeys';

import CrossSigning from '../CrossSigning';
import KeyBackup from '../KeyBackup';
import DeviceManage from '../DeviceManage';
import matrixAppearance from '@src/util/libs/appearance';

function SecuritySection() {
  const [authMedia, setAuthMedia] = useState(envAPI.get('MXC_AUTHENTICATED_MEDIA'));
  const [storagePersisted, setStoragePersisted] = useState(storageManager.getIsPersisted());
  const [storagePersistedLocal, setStoragePersistedLocal] = useState(
    storageManager.getIsPersistedLocal(),
  );

  const renderOptions = () => {
    if (storagePersisted) {
      return (
        <Toggle
          className="d-inline-flex"
          isActive={storagePersistedLocal}
          disabled={!matrixAppearance.get('advancedUserMode')}
          onToggle={(value) => {
            storageManager.setIsPersistedLocal(value);
            setStoragePersistedLocal(value);
          }}
        />
      );
    }

    return (
      <Button
        variant="primary"
        onClick={() =>
          storageManager
            .requestStoragePersisted()
            .then(setStoragePersisted)
            .catch((err) => {
              tinyConsole.error(err);
              alert(err.message, 'Error Storage Persisted');
            })
        }
      >
        Request permission
      </Button>
    );
  };

  return (
    <div className="noselect">
      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Storage application</li>

          <SettingTile
            title={`Storage persisted`}
            options={renderOptions()}
            content={
              <div className="very-small text-gray">
                {`If the persistent storage permission is granted, the ${isMobile() ? 'app' : __ENV_APP__.ELECTRON_MODE ? 'software' : 'browser'} will not evict data stored.`}{' '}
                If you are already using the application for a long time, the recommendation is to
                keep this setting enabled to avoid glitches. This is not a guarantee that will
                completely shut down all the features that use this permission. If you are in
                advanced mode disabled, this setting cannot be modified for your security.
              </div>
            }
          />
        </ul>
      </div>

      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Authenticated media</li>

          <SettingTile
            title="Enabled"
            options={
              <Toggle
                className="d-inline-flex"
                isActive={authMedia}
                onToggle={(value) => {
                  setAuthMedia(value);
                  envAPI.set('MXC_AUTHENTICATED_MEDIA', value);
                }}
              />
            }
            content={
              <div className="very-small text-gray">
                Some homeservers will require this configuration enabled. The recommendation is that
                you keep this option enabled by default. The results will start to appear in the
                next files loaded. If you want a definitive result, restart the software.
              </div>
            }
          />
        </ul>
      </div>

      {!initMatrix.isGuest && (
        <div className="card noselect mb-3">
          <ul className="list-group list-group-flush">
            <li className="list-group-item very-small text-gray">Cross signing and backup</li>
            <CrossSigning />
            <KeyBackup />
          </ul>
        </div>
      )}

      <DeviceManage />

      {!initMatrix.isGuest && (
        <div className="card noselect mt-3">
          <ul className="list-group list-group-flush mt-3">
            <li className="list-group-item very-small text-gray">Export/Import encryption keys</li>

            <SettingTile
              title="Export E2E room keys"
              content={
                <>
                  <div className="very-small text-gray">
                    Export end-to-end encryption room keys to decrypt old messages in other session.
                    In order to encrypt keys you need to set a password, which will be used while
                    importing.
                  </div>
                  <ExportE2ERoomKeys />
                </>
              }
            />

            <SettingTile
              title="Import E2E room keys"
              content={
                <>
                  <div className="very-small text-gray">
                    {
                      "To decrypt older messages, Export E2EE room keys from Element (Settings > Security & Privacy > Encryption > Cryptography) and import them here. Imported keys are encrypted so you'll have to enter the password you set in order to decrypt it."
                    }
                  </div>
                  <ImportE2ERoomKeys />
                </>
              }
            />
          </ul>
        </div>
      )}
    </div>
  );
}

export default SecuritySection;
