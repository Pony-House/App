import React, { useState, useEffect } from 'react';
import { CryptoEvent } from 'matrix-js-sdk';

import moment, { momentFormat } from '@src/util/libs/momentjs';
import SettingLoading from '@src/app/molecules/setting-loading/SettingLoading';

import initMatrix from '../../../client/initMatrix';
import { isCrossVerified } from '../../../util/matrixUtil';
import { openReusableDialog, openEmojiVerification } from '../../../client/action/navigation';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import IconButton from '../../atoms/button/IconButton';
import Input from '../../atoms/input/Input';
import Spinner from '../../atoms/spinner/Spinner';
import SettingTile from '../../molecules/setting-tile/SettingTile';

import { authRequest } from './AuthRequest';
import { confirmDialog } from '../../molecules/confirm-dialog/ConfirmDialog';

import { useStore } from '../../hooks/useStore';
import { useDeviceList } from '../../hooks/useDeviceList';
import { useCrossSigningStatus } from '../../hooks/useCrossSigningStatus';
import { accessSecretStorage } from './SecretStorageAccess';

const promptDeviceName = async (deviceName) =>
  new Promise((resolve) => {
    let isCompleted = false;

    const renderContent = (onComplete) => {
      const handleSubmit = (e) => {
        e.preventDefault();
        const name = e.target.session.value;
        if (typeof name !== 'string') onComplete(null);
        onComplete(name);
      };
      return (
        <form className="device-manage__rename" onSubmit={handleSubmit}>
          <div>
            <Input value={deviceName} label="Session name" name="session" />
          </div>
          <div className="device-manage__rename-btn">
            <Button variant="primary" type="submit">
              Save
            </Button>
            <Button onClick={() => onComplete(null)}>Cancel</Button>
          </div>
        </form>
      );
    };

    openReusableDialog(
      <Text variant="s1" weight="medium">
        Edit session name
      </Text>,
      (requestClose) =>
        renderContent((name) => {
          isCompleted = true;
          resolve(name);
          requestClose();
        }),
      () => {
        if (!isCompleted) resolve(null);
      },
    );
  });

function DeviceManage() {
  const TRUNCATED_COUNT = 4;
  const mx = initMatrix.matrixClient;
  const isCSEnabled = useCrossSigningStatus();
  const { deviceList, deviceKeys } = useDeviceList();
  const [processing, setProcessing] = useState([]);
  const [truncated, setTruncated] = useState(true);

  const [devicesChecked, setDevicesChecked] = useState(false);
  const [unverified, setUnverified] = useState([]);
  const [verified, setVerified] = useState([]);
  const [noEncryption, setNotEncryption] = useState([]);

  const mountStore = useStore();
  mountStore.setItem(true);
  const [isMeVerified, setIsMeVerified] = useState(null);

  useEffect(() => {
    if (isMeVerified === null) {
      isCrossVerified(mx.deviceId)
        .then((isVerified) => {
          setIsMeVerified(isVerified);
        })
        .catch((err) => {
          console.error(err);
          alert(err.message);
        });
    }

    if (!devicesChecked && deviceList) {
      setDevicesChecked(true);
      const checkDevices = async () => {
        const tinyVerified = [];
        const tinyUnverified = [];
        const tinyNoEncryption = [];

        for (const item in deviceList) {
          const device = deviceList[item];
          try {
            const isVerified = await isCrossVerified(device.device_id);
            if (isVerified === true) {
              tinyVerified.push(device);
            } else if (isVerified === false) {
              tinyUnverified.push(device);
            } else {
              tinyNoEncryption.push(device);
            }
          } catch {
            tinyNoEncryption.push(device);
          }
        }

        setUnverified(tinyUnverified);
        setVerified(tinyVerified);
        setNotEncryption(tinyNoEncryption);
      };

      checkDevices();
    }

    try {
      const updateList = () => setDevicesChecked(false);
      const crypto = mx.getCrypto();
      crypto.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
      crypto.on(CryptoEvent.UserTrustStatusChanged, updateList);
      crypto.on(CryptoEvent.DevicesUpdated, updateList);
      crypto.on(CryptoEvent.VerificationRequestReceived, updateList);
      return () => {
        crypto.off(CryptoEvent.UserTrustStatusChanged, updateList);
        crypto.off(CryptoEvent.DevicesUpdated, updateList);
        crypto.off(CryptoEvent.VerificationRequestReceived, updateList);
      };
    } catch (err) {
      console.error(err);
    }
  });

  useEffect(() => {
    setProcessing([]);
  }, [deviceList, deviceKeys]);

  const addToProcessing = (device) => {
    const old = [...processing];
    old.push(device.device_id);
    setProcessing(old);
  };

  const removeFromProcessing = () => {
    setProcessing([]);
  };

  if (deviceList === null || deviceKeys === null) {
    return <SettingLoading title="Loading devices..." />;
  }

  const handleRename = async (device) => {
    const newName = await promptDeviceName(device.display_name);
    if (newName === null || newName.trim() === '') return;
    if (newName.trim() === device.display_name) return;
    addToProcessing(device);
    try {
      await mx.setDeviceDetails(device.device_id, {
        display_name: newName,
      });
    } catch {
      if (!mountStore.getItem()) return;
      removeFromProcessing(device);
    }
  };

  const handleRemove = async (device) => {
    const isConfirmed = await confirmDialog(
      `Logout ${device.display_name}`,
      `You are about to logout "${device.display_name}" session.`,
      'Logout',
      'danger',
    );
    if (!isConfirmed) return;
    addToProcessing(device);
    await authRequest(`Logout "${device.display_name}"`, async (auth) => {
      await mx.deleteDevice(device.device_id, auth);
    });

    if (!mountStore.getItem()) return;
    removeFromProcessing(device);
  };

  const verifyWithKey = async (device) => {
    const keyData = await accessSecretStorage('Session verification');
    if (!keyData) return;
    addToProcessing(device);
    await mx.checkOwnCrossSigningTrust();
  };

  const verifyWithEmojis = async (deviceId) => {
    const req = await mx.getCrypto().requestDeviceVerification(mx.getUserId(), deviceId);
    openEmojiVerification(req, { userId: mx.getUserId(), deviceId });
  };

  const verify = (deviceId, isCurrentDevice) => {
    if (isCurrentDevice) {
      verifyWithKey(deviceId);
      return;
    }
    verifyWithEmojis(deviceId);
  };

  const renderDevice = (device, isVerified) => {
    const deviceId = device.device_id;
    const displayName = device.display_name;
    const lastIP = device.last_seen_ip;
    const lastTS = device.last_seen_ts;
    const isCurrentDevice = mx.deviceId === deviceId;
    const canVerify = isVerified === false && (isMeVerified || isCurrentDevice);

    return (
      <SettingTile
        key={deviceId}
        title={
          <div className={`small ${isVerified !== false ? '' : 'text-danger'}`}>
            {displayName}
            <span className="very-small text-gray">{`${displayName ? ' — ' : ''}${deviceId}`}</span>
            {isCurrentDevice && <span className="ms-2 very-small badge bg-secondary">Current</span>}
          </div>
        }
        options={
          processing.includes(deviceId) ? (
            <Spinner className="small" />
          ) : (
            <>
              {isCSEnabled && canVerify && (
                <Button
                  onClick={() => verify(deviceId, isCurrentDevice)}
                  className="mx-1"
                  variant="outline-success"
                >
                  Verify
                </Button>
              )}
              <IconButton
                size="small"
                className="mx-1"
                onClick={() => handleRename(device)}
                fa="fa-solid fa-pencil"
                tooltip="Rename"
              />
              <IconButton
                size="small"
                className="mx-1"
                onClick={() => handleRemove(device)}
                fa="fa-solid fa-trash-can"
                tooltip="Remove session"
              />
            </>
          )
        }
        content={
          <>
            {lastTS && (
              <div className="very-small text-gray">
                Last activity
                <span style={{ color: 'var(--tc-surface-normal)' }}>
                  {moment(new Date(lastTS)).format(
                    ` ${momentFormat.clock()}, ${momentFormat.calendar()}`,
                  )}
                </span>
                {lastIP ? ` at ${lastIP}` : ''}
              </div>
            )}
            {isCurrentDevice && (
              <div className="very-small text-gray">
                {`Session Key: ${deviceKeys.curve25519.match(/.{1,4}/g).join(' ')}`}
              </div>
            )}
          </>
        }
      />
    );
  };

  deviceList.sort((a, b) => b.last_seen_ts - a.last_seen_ts);
  return (
    <div className="card noselect">
      <ul className="list-group list-group-flush">
        <li className="list-group-item very-small text-gray">Unverified sessions</li>

        {!isMeVerified && (
          <li className="list-group-item small text-primary p-3">
            <i className="fa-solid fa-circle-info me-2" />
            Verify this session either with your Security Key/Phrase here or by initiating emoji
            verification from a verified session.
          </li>
        )}
        {isMeVerified && unverified.length > 0 && (
          <li className="list-group-item small text-bg p-3">
            <i className="fa-solid fa-circle-info me-2" />
            Verify other sessions by emoji verification or remove unfamiliar ones.
          </li>
        )}

        {!isCSEnabled && (
          <li className="list-group-item small text-warning p-3">
            <i className="fa-solid fa-circle-info me-2" />
            Setup cross signing in case you lose all your sessions.
          </li>
        )}

        {unverified.length > 0 ? (
          unverified.map((device) => renderDevice(device, false))
        ) : (
          <li className="list-group-item very-small text-gray p-3">No unverified sessions</li>
        )}

        {noEncryption.length > 0 && (
          <li className="list-group-item small text-gray">Sessions without encryption support</li>
        )}

        {noEncryption.length > 0 && noEncryption.map((device) => renderDevice(device, null))}

        <li className="list-group-item very-small text-gray p-3">Verified sessions</li>
        {verified.length > 0 ? (
          verified.map((device, index) => {
            if (truncated && index >= TRUNCATED_COUNT) return null;
            return renderDevice(device, true);
          })
        ) : (
          <li className="list-group-item small">No verified sessions</li>
        )}
        {verified.length > TRUNCATED_COUNT && (
          <Button className="device-manage__info" onClick={() => setTruncated(!truncated)}>
            {truncated ? `View ${verified.length - 4} more` : 'View less'}
          </Button>
        )}
        {deviceList.length > 0 && (
          <li className="list-group-item very-small text-gray p-3">
            Session names are visible to everyone, so do not put any private info here.
          </li>
        )}
      </ul>
    </div>
  );
}

export default DeviceManage;
