import { UserEvent } from 'matrix-js-sdk';
import { useEffect, useState } from 'react';
import clone from 'clone';

import { getPresence } from '../onlineStatus';
import initMatrix from '@src/client/initMatrix';
import { getUserWeb3Account } from '../web3';

const userPresenceEffect = (user) => {
  const mx = initMatrix.matrixClient;
  const [accountContent, setAccountContent] = useState(null);
  const [isClosed, setIsClosed] = useState(false);
  const resetAccountContent = () => setAccountContent(null);

  const closeAccountContent = () => {
    setIsClosed(true);
    setAccountContent(null);
  };
  const openAccountContent = () => {
    setIsClosed(false);
  };

  useEffect(() => {
    if (!isClosed) {
      // Update Status Profile
      const updateProfileStatus = (mEvent, tinyData) => {
        setAccountContent(getPresence(tinyData));
      };
      if (user) {
        // Prepare events
        user.on(UserEvent.CurrentlyActive, updateProfileStatus);
        user.on(UserEvent.LastPresenceTs, updateProfileStatus);
        user.on(UserEvent.Presence, updateProfileStatus);
        user.on(UserEvent.DisplayName, updateProfileStatus);
        user.on(UserEvent.AvatarUrl, updateProfileStatus);

        // Create first data
        if (!accountContent) {
          // User account
          if (user.userId !== mx.getUserId()) updateProfileStatus(null, user);
          // Youself!
          else {
            // Tiny Data
            const tinyUser = mx.getUser(mx.getUserId());

            // Get account data here
            const yourData = clone(mx.getAccountData('pony.house.profile')?.getContent() ?? {});

            // Get ethereum data
            yourData.ethereum = getUserWeb3Account();
            if (typeof yourData.ethereum.valid !== 'undefined') delete yourData.ethereum.valid;

            // Stringify data
            tinyUser.presenceStatusMsg = JSON.stringify(yourData);

            // Update presence
            setAccountContent(getPresence(tinyUser));
          }
        }
      }
      // Delete data
      else if (accountContent) setAccountContent(null);
      return () => {
        if (user) {
          user.removeListener(UserEvent.CurrentlyActive, updateProfileStatus);
          user.removeListener(UserEvent.LastPresenceTs, updateProfileStatus);
          user.removeListener(UserEvent.Presence, updateProfileStatus);
          user.removeListener(UserEvent.DisplayName, updateProfileStatus);
          user.removeListener(UserEvent.AvatarUrl, updateProfileStatus);
        }
      };
    }
  });

  // Complete!
  return { accountContent, resetAccountContent, closeAccountContent, openAccountContent };
};

export default userPresenceEffect;
