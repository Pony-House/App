import React, { useState, useEffect, useRef } from 'react';

import PropTypes from 'prop-types';

import tinyConsole from '@src/util/libs/console';
import envAPI from '@src/util/libs/env';
import hsWellKnown from '@src/util/libs/HsWellKnown';
import storageManager from '@src/util/libs/Localstorage';

import Text from '../../../atoms/text/Text';
import { Debounce } from '../../../../util/common';
import IconButton from '../../../atoms/button/IconButton';
import Input from '../../../atoms/input/Input';
import Spinner from '../../../atoms/spinner/Spinner';
import ContextMenu, { MenuItem, MenuHeader } from '../../../atoms/context-menu/ContextMenu';

function Homeserver({ className }) {
  const [hs, setHs] = useState(null);
  const [checkLocalStorage, setCheckLocalStorage] = useState(0);
  const [debounce] = useState(new Debounce());
  const [process, setProcess] = useState({
    isLoading: true,
    message: 'Loading homeserver list...',
  });
  const hsRef = useRef();

  const setupHsConfig = async (servername) => {
    if (servername !== '') {
      setProcess({ isLoading: true, message: 'Loading local database...' });
      await envAPI.startDB();
      setProcess({ isLoading: true, message: 'Looking for homeserver...' });
      await hsWellKnown.fetch(servername, setProcess);
    } else {
      setProcess({ isLoading: false });
    }
  };

  useEffect(() => {
    hsWellKnown.resetAll();
    if (hs === null) return;
    hsWellKnown.setSearchingHs(hs.selected);
    setupHsConfig(hs.selected);
  }, [hs]);

  useEffect(() => {
    try {
      const ENV = __ENV_APP__.LOGIN ?? {};
      const selectedHs =
        !Number.isNaN(ENV.DEFAULT_HOMESERVER) && Number.isFinite(ENV.DEFAULT_HOMESERVER)
          ? ENV.DEFAULT_HOMESERVER
          : 0;
      const allowCustom = ENV.ALLOW_CUSTOM_HOMESERVERS;
      const hsList = Array.isArray(ENV.HOMESERVER_LIST) ? ENV.HOMESERVER_LIST : [];

      if (!hsList?.length > 0 || selectedHs < 0 || selectedHs >= hsList?.length) {
        throw new Error();
      }

      let selectedServer = hsList[selectedHs];
      if (
        typeof window.location.hash === 'string' &&
        window.location.hash.startsWith('#') &&
        window.location.hash.length > 1
      ) {
        selectedServer = window.location.hash.substring(1);
        if (hsList.indexOf(selectedServer) < 0) hsList.push(selectedServer);
      }

      setHs({ selected: selectedServer, list: hsList, allowCustom });
    } catch {
      setHs({ selected: '', list: [''], allowCustom: true });
    }
  }, []);

  const handleHsInput = (e) => {
    const { value } = e.target;
    setProcess({ isLoading: false });
    debounce._(async () => {
      setHs({ ...hs, selected: value.trim() });
    }, 700)();
  };

  useEffect(() => {
    if (!checkLocalStorage) {
      setCheckLocalStorage(1);
      const errorStorage = (err) => {
        alert(err.message, 'Error Storage Persisted');
        tinyConsole.error(err);
        setCheckLocalStorage(2);
      };

      storageManager
        .checkStoragePersisted()
        .then((isPersisted) => {
          if (!isPersisted) {
            storageManager
              .requestStoragePersisted()
              .then(() => {
                setCheckLocalStorage(2);
              })
              .catch(errorStorage);
          } else setCheckLocalStorage(2);
        })
        .catch(errorStorage);
    }
  });

  const useHomeserverList = Array.isArray(hs?.list) && hs.list.length > 1;
  return (
    <>
      {checkLocalStorage > 1 ? (
        storageManager.localStorageExist() ? (
          <div
            className={`homeserver-form noselect${typeof className === 'string' ? ` ${className}` : ''}`}
          >
            <div className="w-100">
              <Input
                className={!useHomeserverList ? 'no-homeserver-list' : null}
                placeholder="Type the homeserver address here"
                name="homeserver"
                onChange={handleHsInput}
                value={hs?.selected}
                forwardRef={hsRef}
                label="Homeserver"
                disabled={hs === null || !hs.allowCustom}
              />
            </div>
            {useHomeserverList ? (
              <ContextMenu
                placement="right"
                content={(hideMenu) => (
                  <>
                    <MenuHeader>Homeserver list</MenuHeader>
                    {hs?.list.map((hsName) => (
                      <MenuItem
                        key={hsName}
                        onClick={() => {
                          hideMenu();
                          hsRef.current.value = hsName;
                          setHs({ ...hs, selected: hsName });
                        }}
                      >
                        {hsName}
                      </MenuItem>
                    ))}
                  </>
                )}
                render={(toggleMenu) => <IconButton onClick={toggleMenu} fa="fa-solid fa-server" />}
              />
            ) : null}
          </div>
        ) : (
          <Text className="homeserver-form__error noselect" variant="b3">
            Unsupported localstorage!
          </Text>
        )
      ) : (
        <div className="homeserver-form__status flex--center noselect">
          <Spinner className="small" />
          <Text variant="b2">Checking storage settings...</Text>
        </div>
      )}
      {process.error !== undefined && (
        <Text className="homeserver-form__error noselect" variant="b3">
          {process.error}
        </Text>
      )}
      {process.isLoading && (
        <div className="homeserver-form__status flex--center noselect">
          <Spinner className="small" />
          <Text variant="b2">{process.message}</Text>
        </div>
      )}
    </>
  );
}
Homeserver.propTypes = {
  className: PropTypes.string,
};

export default Homeserver;
