import React, { useState, useEffect, useRef } from 'react';

import FileSaver from 'file-saver';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import { encryptMegolmKeyFile } from '../../../util/cryptE2ERoomKeys';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import Input from '../../atoms/input/Input';
import Spinner from '../../atoms/spinner/Spinner';

import { useStore } from '../../hooks/useStore';

function ExportE2ERoomKeys() {
  const isMountStore = useStore();
  const [status, setStatus] = useState({
    isOngoing: false,
    msg: null,
    type: cons.status.PRE_FLIGHT,
  });
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const exportE2ERoomKeys = async () => {
    const password = passwordRef.current.value;
    if (password !== confirmPasswordRef.current.value) {
      setStatus({
        isOngoing: false,
        msg: 'Password does not match.',
        type: cons.status.ERROR,
      });
      return;
    }
    setStatus({
      isOngoing: true,
      msg: 'Getting keys...',
      type: cons.status.IN_FLIGHT,
    });
    try {
      const keys = await initMatrix.matrixClient.getCrypto().exportRoomKeys();
      if (isMountStore.getItem()) {
        setStatus({
          isOngoing: true,
          msg: 'Encrypting keys...',
          type: cons.status.IN_FLIGHT,
        });
      }
      const encKeys = await encryptMegolmKeyFile(JSON.stringify(keys), password);
      const blob = new Blob([encKeys], {
        type: 'text/plain;charset=us-ascii',
      });
      FileSaver.saveAs(blob, 'pony-house-keys.txt');
      if (isMountStore.getItem()) {
        setStatus({
          isOngoing: false,
          msg: 'Successfully exported all keys.',
          type: cons.status.SUCCESS,
        });
      }
    } catch (e) {
      if (isMountStore.getItem()) {
        setStatus({
          isOngoing: false,
          msg: e.friendlyText || 'Failed to export keys. Please try again.',
          type: cons.status.ERROR,
        });
      }
    }
  };

  useEffect(() => {
    isMountStore.setItem(true);
    return () => {
      isMountStore.setItem(false);
    };
  }, []);

  return (
    <div className="export-e2e-room-keys">
      <form
        className="export-e2e-room-keys__form"
        onSubmit={(e) => {
          e.preventDefault();
          exportE2ERoomKeys();
        }}
      >
        <div>
          <Input forwardRef={passwordRef} type="password" placeholder="Password" required />
        </div>
        <div>
          <Input
            forwardRef={confirmPasswordRef}
            type="password"
            placeholder="Confirm password"
            required
          />
        </div>
        <Button disabled={status.isOngoing} variant="primary" type="submit">
          Export
        </Button>
      </form>
      {status.type === cons.status.IN_FLIGHT && (
        <div className="import-e2e-room-keys__process">
          <Spinner className="small" />
          <Text variant="b2">{status.msg}</Text>
        </div>
      )}
      {status.type === cons.status.SUCCESS && (
        <Text className="import-e2e-room-keys__success" variant="b2">
          {status.msg}
        </Text>
      )}
      {status.type === cons.status.ERROR && (
        <Text className="import-e2e-room-keys__error" variant="b2">
          {status.msg}
        </Text>
      )}
    </div>
  );
}

export default ExportE2ERoomKeys;
