import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Crypto } from 'matrix-js-sdk';
import { CrossSigningKey, VerificationPhase } from 'matrix-js-sdk/lib/crypto-api';

import tinyConsole from '@src/util/libs/console';

import { twemojifyReact } from '../../../util/twemojify';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import { hasPrivateKey } from '../../../client/state/secretStorageKeys';
import { getDefaultSSKey, isCrossVerified } from '../../../util/matrixUtil';

import Text from '../../atoms/text/Text';
import Button from '../../atoms/button/Button';
import Spinner from '../../atoms/spinner/Spinner';
import Dialog from '../../molecules/dialog/Dialog';

import { useStore } from '../../hooks/useStore';
import { accessSecretStorage } from '../settings/SecretStorageAccess';

// Render message status
const renderWait = (phase) => {
  let body;
  switch (phase) {
    case VerificationPhase.Unsent:
      body = 'Starting the verification...';
      break;
    case VerificationPhase.Requested:
      body = 'An request has been sent or received from other device...';
      break;
    case VerificationPhase.Ready:
      body = 'Validating devices...';
      break;
    case VerificationPhase.Started:
      body = 'The verification is in flight. Waiting for the verification...';
      break;
  }

  return (
    <>
      <Spinner className="small" />
      <Text>{body}</Text>
    </>
  );
};

// Content
function SessionVerificationContent({ data, requestClose, type, title }) {
  const [sas, setSas] = useState(null);
  const [process, setProcess] = useState(false);

  const mx = initMatrix.matrixClient;
  const mountStore = useStore();
  const beginStore = useStore();

  const { request, targetDevice } = data;
  const [phase, setPhase] = useState(request.phase);
  const [lastPhase, setLastPhase] = useState(null);

  // Set phase progress
  tinyConsole.log(
    `[session-verification] Phase ${phase} made by ${request.initiatedByMe ? 'you' : 'other device'} using "${type}" mode.`,
  );
  tinyConsole.log(`[session-verification] Request`, request);

  if (targetDevice) tinyConsole.log(`[session-verification] Target Device`, targetDevice);
  if (sas) tinyConsole.log(`[session-verification] sas data`, sas);

  // Close request. This is tiny okay now
  const canCancelRequest =
    phase === VerificationPhase.Cancelled || phase === VerificationPhase.Done;
  if (canCancelRequest) requestClose();
  // Wait request changes
  else if (request) request.once('change', () => setPhase(request.phase));

  // Being Verification Script
  const startVerification = async (verifier) => {
    if (canCancelRequest) return;
    await verifier.verify();
  };

  const insertVerification = (verifier) => {
    // Show the SAS now
    if (type === 'sas') {
      tinyConsole.log(
        `[session-verification] Preparing "show_sas" event to receive the next step...`,
      );
      const handleVerifier = async (sasData) => {
        verifier.off('show_sas', handleVerifier);
        if (!mountStore.getItem()) return;
        setSas(sasData);
      };
      setProcess(false);
      verifier.on('show_sas', handleVerifier);
      tinyConsole.log(`[session-verification] The "show_sas" event is ready!`);
    }
  };

  const beginVerification = async () => {
    tinyConsole.log(`[session-verification] Starting the "beingVerification" progress...`);
    if (canCancelRequest) return;
    tinyConsole.log(`[session-verification] "beingVerification" started!`);
    // Get crypto and start now
    const crypto = mx.getCrypto();
    try {
      // Get key id and check it
      const keyId = (crypto && (await crypto.getCrossSigningKeyId())) || null;
      if (
        (await isCrossVerified(mx.deviceId)) &&
        (keyId === null || keyId !== CrossSigningKey.SelfSigning)
      ) {
        tinyConsole.log(`[session-verification] Accessing your secret storage...`);
        if (canCancelRequest) return;
        if (!hasPrivateKey(getDefaultSSKey())) {
          const keyData = await accessSecretStorage(title);
          if (canCancelRequest) return;
          if (!keyData) {
            request.cancel();
            return;
          }
          tinyConsole.log(`[session-verification] Secret storage is ok!`);
          if (canCancelRequest) return;
        }
        await mx.checkOwnCrossSigningTrust();
        if (canCancelRequest) return;
      }
      // Start loading page
      tinyConsole.log(`[session-verification] Beging verification...`);
      setProcess(true);

      // Accept new request
      if (phase === VerificationPhase.Ready) {
        tinyConsole.log(`[session-verification] Your device is ready to the verification...`);
        // Accept request
        await request.accept();

        // Start verification
        const verifier = await request.startVerification('m.sas.v1');
        tinyConsole.log(`[session-verification] Preparing to send the verification...`);
        if (canCancelRequest) return;

        // Send verification data
        insertVerification(verifier);
        tinyConsole.log(`[session-verification] Verification sent!`);
        await startVerification(verifier);
      }
    } catch (err) {
      // Oh no
      tinyConsole.error(err);
      alert(err.message, `${title} - error`);

      // Cancel progress
      setSas(null);
      setProcess(false);
    }
  };

  // Sas confirmation
  const sasMismatch = () => {
    if (canCancelRequest) return;
    sas.mismatch();
    setProcess(true);
  };

  const sasConfirm = () => {
    if (canCancelRequest) return;
    sas.confirm().catch((err) => {
      alert(err.message, 'SAS Confirm error!');
      tinyConsole.error(err);
      setProcess(false);
    });
    setProcess(true);
  };

  // Checking phases here
  useEffect(() => {
    tinyConsole.log(`[session-verification] canCancelRequest ${String(canCancelRequest)}.`);
    if (canCancelRequest) return;
    mountStore.setItem(true);
    if (request === null) return undefined;

    // The Request Function
    const req = request;
    const reqCancel = () => {
      if (req.phase !== VerificationPhase.Cancelled && req.phase !== VerificationPhase.Done) {
        req.cancel();
      }
    };

    // Is me
    if (request.initiatedByMe) {
      if (
        (req.phase === VerificationPhase.Ready || req.phase === VerificationPhase.Requested) &&
        targetDevice &&
        !beginStore.getItem()
      ) {
        beginStore.setItem(true);
        beginVerification();
      }
      return () => {
        reqCancel();
      };
    }

    // Nope
    else if (
      targetDevice &&
      request.otherUserId &&
      request.otherDeviceId &&
      phase === VerificationPhase.Requested
    ) {
      tinyConsole.log(`[session-verification] Preparing to receive the verification...`);
      request
        .accept()
        .then(async () => {
          tinyConsole.log(
            `[session-verification] Your device is ready to sync the verification...`,
          );
          const verifier = await request.startVerification('m.sas.v1');
          tinyConsole.log(`[session-verification] Preparing to sync the verification...`);
          insertVerification(verifier);
          tinyConsole.log(`[session-verification] Verification synced!`);
          await startVerification(verifier);
        })
        .catch((err) => {
          tinyConsole.error(err);
          alert(err.message, 'Request device verification error');
          reqCancel();
        });
    }
  }, [request]);

  // Exist sas data
  if (sas !== null) {
    return (
      <div className="emoji-verification__content">
        <Text>Confirm the emoji below are displayed on both devices, in the same order:</Text>
        <div className="emoji-verification__emojis">
          {sas.emoji.map((emoji, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div className="emoji-verification__emoji-block" key={`${emoji[1]}-${i}`}>
              <Text variant="h1">{twemojifyReact(emoji[0])}</Text>
              <Text>{emoji[1]}</Text>
            </div>
          ))}
        </div>
        <div className="emoji-verification__buttons">
          {process ? (
            renderWait(phase)
          ) : (
            <>
              <Button variant="primary" onClick={sasConfirm}>
                They match
              </Button>
              <Button onClick={sasMismatch}>No match</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Send wait message
  if (targetDevice) {
    return (
      <div className="emoji-verification__content">
        <Text>Please accept the request from other device.</Text>
        <div className="emoji-verification__buttons">{renderWait(phase)}</div>
      </div>
    );
  }

  // Button to start verification progress
  return (
    <div className="emoji-verification__content">
      <Text>Click accept to start the verification process.</Text>
      <div className="emoji-verification__buttons">
        {process ? (
          renderWait(phase)
        ) : (
          <Button variant="primary" onClick={beginVerification}>
            Accept
          </Button>
        )}
      </div>
    </div>
  );
}
SessionVerificationContent.propTypes = {
  data: PropTypes.shape({}).isRequired,
  requestClose: PropTypes.func.isRequired,
  type: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
};

// Request data manager
function useVisibilityToggle() {
  const [data, setData] = useState(null);
  const mx = initMatrix.matrixClient;

  useEffect(() => {
    const handleOpen = (request, targetDevice) => {
      if (
        !data ||
        data.request.phase === VerificationPhase.Cancelled ||
        data.request.phase === VerificationPhase.Done
      )
        setData({ request, targetDevice });
    };
    navigation.on(cons.events.navigation.EMOJI_VERIFICATION_OPENED, handleOpen);
    mx.on(Crypto.CryptoEvent.VerificationRequestReceived, handleOpen);
    return () => {
      navigation.removeListener(cons.events.navigation.EMOJI_VERIFICATION_OPENED, handleOpen);
      mx.removeListener(Crypto.CryptoEvent.VerificationRequestReceived, handleOpen);
    };
  });

  const requestClose = () => setData(null);

  return [data, requestClose];
}

function SessionVerification() {
  // Get Verification request data
  const [data, requestClose] = useVisibilityToggle();
  const title = 'Emoji verification';

  // Send verification request into the modal
  return (
    <Dialog
      isOpen={data !== null}
      className="modal-dialog-centered modal-lg noselect"
      title={
        <Text variant="s1" weight="medium" primary>
          {title}
        </Text>
      }
      onRequestClose={requestClose}
    >
      {data !== null ? (
        <SessionVerificationContent
          data={data}
          requestClose={requestClose}
          type="sas"
          title={title}
        />
      ) : (
        <div />
      )}
    </Dialog>
  );
}

export default SessionVerification;
