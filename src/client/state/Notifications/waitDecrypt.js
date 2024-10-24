import { MatrixEventEvent } from 'matrix-js-sdk';

export default function waitDecrypt(mEvent) {
  return new Promise((resolve) => {
    let complete = false;
    // Decrypt Notification
    const content = mEvent.getContent();
    const msgType = content?.msgtype;
    if (msgType !== 'm.bad.encrypted') {
      if (!complete) resolve(mEvent);
      complete = true;
    }

    // Fail Decrypt 1
    else {
      let decryptTimeout;
      const decryptFunction = (mEvent2, tries = 0) => {
        if (decryptTimeout) {
          clearTimeout(decryptTimeout);
          decryptTimeout = null;
        }

        // Decrypt Notification 2
        const content2 = mEvent2.getContent();
        const msgType2 = content2?.msgtype;
        if (msgType2 !== 'm.bad.encrypted') {
          if (!complete) resolve(mEvent2);
          complete = true;
        }

        // Fail Decrypt 2
        else if (tries < 10) {
          const newTry = (mEvent3) => decryptFunction(mEvent3, tries + 1);
          decryptTimeout = setTimeout(() => {
            mEvent2.off(MatrixEventEvent.Decrypted, newTry);
            if (!complete) resolve(null);
          }, 60000);
          mEvent2.once(MatrixEventEvent.Decrypted, newTry);
        }
      };

      // Try decrypt again
      decryptTimeout = setTimeout(() => {
        mEvent.off(MatrixEventEvent.Decrypted, decryptFunction);
      }, 60000);
      mEvent.once(MatrixEventEvent.Decrypted, decryptFunction);
    }
  });
}
