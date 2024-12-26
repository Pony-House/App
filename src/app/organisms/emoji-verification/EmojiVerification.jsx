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
const renderWait = (request) => {
  let body;
  switch (request.phase) {
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

function EmojiVerificationContent({ data, requestClose }) {
  const [tData, setSas] = useState({ sas: null, verifier: null });
  const [process, setProcess] = useState(false);
  const { request, targetDevice } = data;
  const mx = initMatrix.matrixClient;
  const mountStore = useStore();
  const beginStore = useStore();

  // Being Verification Script
  const startVerification = async (verifier) => {
    // Show the SAS now
    const handleVerifier = async (sasData) => {
      verifier.off('show_sas', handleVerifier);
      if (!mountStore.getItem()) return;
      setSas({ sas: sasData, verifier });
      setProcess(false);
    };
    verifier.on('show_sas', handleVerifier);
    await verifier.verify();
  };

  const beginVerification = async () => {
    if (request.phase === VerificationPhase.Cancelled || request.phase === VerificationPhase.Done)
      return;
    // Get crypto and start now
    const crypto = mx.getCrypto();
    try {
      // Get key id and check it
      const keyId = (crypto && (await crypto.getCrossSigningKeyId())) || null;
      if (
        (await isCrossVerified(mx.deviceId)) &&
        (keyId === null || keyId !== CrossSigningKey.SelfSigning)
      ) {
        if (!hasPrivateKey(getDefaultSSKey())) {
          const keyData = await accessSecretStorage('Emoji verification');
          if (!keyData) {
            request.cancel();
            return;
          }
          if (
            request.phase === VerificationPhase.Cancelled ||
            request.phase === VerificationPhase.Done
          )
            return;
        }
        await mx.checkOwnCrossSigningTrust();
      }
      setProcess(true);

      // Accept new request
      if (request.phase === VerificationPhase.Requested) await request.accept();

      // Ready? Let's go!
      if (request.phase === VerificationPhase.Ready) {
        const verifier = await request.startVerification('m.sas.v1');
        await startVerification(verifier);
      }
    } catch (err) {
      // Oh no
      tinyConsole.error(err);
      setSas({ sas: null, verifier: null });
      setProcess(false);
      alert(err.message, 'Emoji Verification Error');
    }
  };

  // Sas confirmation
  const sasMismatch = () => {
    tData.sas.mismatch();
    setProcess(true);
  };

  const sasConfirm = () => {
    tData.sas.confirm().catch((err) => {
      alert(err.message, 'SAS Confirm error!');
      tinyConsole.error(err);
      setProcess(false);
    });
    setProcess(true);
  };

  // Checking phases here
  useEffect(() => {
    // Close request. This is tiny okay now
    if (request.phase === VerificationPhase.Done || request.phase === VerificationPhase.Cancelled) {
      requestClose();
      return;
    }

    mountStore.setItem(true);
    const handleChange2 = () => {
      if (request.phase === VerificationPhase.Cancelled || request.phase === VerificationPhase.Done)
        requestClose();
    };

    const handleChange = () => {
      if (targetDevice && !beginStore.getItem()) {
        beginStore.setItem(true);
        beginVerification();
      }
      handleChange2();
    };

    // Nope
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
      req.on('change', handleChange);
      return () => {
        req.off('change', handleChange);
        reqCancel();
      };
    }

    // Nope
    else if (
      targetDevice &&
      request.otherUserId &&
      request.otherDeviceId &&
      request.phase === VerificationPhase.Requested
    ) {
      request
        .accept()
        .then(async () => {
          const verifier = await request.startVerification('m.sas.v1');
          await startVerification(verifier);
        })
        .catch((err) => {
          tinyConsole.error(err);
          alert(err.message, 'Request device verification error');
          reqCancel();
        });

      request.on('change', handleChange2);
      return () => {
        request.off('change', handleChange2);
      };
    }
  }, [request]);

  // Exist sas data
  if (tData.sas !== null) {
    return (
      <div className="emoji-verification__content">
        <Text>Confirm the emoji below are displayed on both devices, in the same order:</Text>
        <div className="emoji-verification__emojis">
          {tData.sas.sas.emoji.map((emoji, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div className="emoji-verification__emoji-block" key={`${emoji[1]}-${i}`}>
              <Text variant="h1">{twemojifyReact(emoji[0])}</Text>
              <Text>{emoji[1]}</Text>
            </div>
          ))}
        </div>
        <div className="emoji-verification__buttons">
          {process ? (
            renderWait(request)
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
        <div className="emoji-verification__buttons">{renderWait(request)}</div>
      </div>
    );
  }

  // Button to start verification progress
  return (
    <div className="emoji-verification__content">
      <Text>Click accept to start the verification process.</Text>
      <div className="emoji-verification__buttons">
        {process ? (
          renderWait(request)
        ) : (
          <Button variant="primary" onClick={beginVerification}>
            Accept
          </Button>
        )}
      </div>
    </div>
  );
}
EmojiVerificationContent.propTypes = {
  data: PropTypes.shape({}).isRequired,
  requestClose: PropTypes.func.isRequired,
};

function useVisibilityToggle() {
  const [data, setData] = useState(null);
  const mx = initMatrix.matrixClient;

  useEffect(() => {
    const handleOpen = (request, targetDevice) => {
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

function EmojiVerification() {
  const [data, requestClose] = useVisibilityToggle();

  return (
    <Dialog
      isOpen={data !== null}
      className="modal-dialog-centered modal-lg noselect"
      title={
        <Text variant="s1" weight="medium" primary>
          Emoji verification
        </Text>
      }
      onRequestClose={requestClose}
    >
      {data !== null ? (
        <EmojiVerificationContent data={data} requestClose={requestClose} />
      ) : (
        <div />
      )}
    </Dialog>
  );
}

export default EmojiVerification;
