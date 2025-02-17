/* eslint-disable react-hooks/rules-of-hooks */
import React, { useEffect, useState } from 'react';

import { isAuthenticated } from '@src/client/state/auth';

import { startWeb3 } from '@mods/web3/ethers/base';

import Auth from '@src/app/templates/auth/Auth';
import Client from '@src/app/templates/client/Client';

// import web3Talk from '@src/util/web3/xmtp';
import envAPI from '@src/util/libs/env';
import libreTranslate from '@src/util/libs/libreTranslate';
import { useDevToolsStatus } from '../templates/client/useDevToolsStatus';
import tinyPwa from '@src/util/pwa/installer';

function App() {
  const isDevToolsOpen = useDevToolsStatus();
  const [firstTime, setFirstTime] = useState(true);
  const [canLoad, setCanLoad] = useState(false);

  useEffect(() => {
    if (firstTime) envAPI.startDB().then(() => setFirstTime(false));
  });

  if (!canLoad) {
    tinyPwa.waitInit().then(() => setCanLoad(true));
    return null;
  } else if (!firstTime) {
    libreTranslate.start();
    // startWeb3(() => web3Talk.start());
    startWeb3();
  } else return null;

  return isAuthenticated() ? (
    <Client isDevToolsOpen={isDevToolsOpen} />
  ) : (
    <Auth isDevToolsOpen={isDevToolsOpen} />
  );
}

export default App;
