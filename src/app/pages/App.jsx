/* eslint-disable react-hooks/rules-of-hooks */
import React, { useEffect, useState } from 'react';

import { isAuthenticated } from '@src/client/state/auth';

import { startWeb3 } from '@src/util/web3';

import Auth from '@src/app/templates/auth/Auth';
import Client from '@src/app/templates/client/Client';

import web3Talk from '@src/util/web3/xmtp';
import envAPI from '@src/util/libs/env';
import libreTranslate from '@src/util/libs/libreTranslate';
import { useDevToolsStatus } from '../templates/client/useDevToolsStatus';

function App() {
  const isDevToolsOpen = useDevToolsStatus();
  const [firstTime, setFirstTime] = useState(true);

  useEffect(() => {
    if (firstTime) envAPI.startDB().then(() => setFirstTime(false));
  });

  if (!firstTime) {
    libreTranslate.start();
    startWeb3(() => web3Talk.start());
  } else {
    return null;
  }

  return isAuthenticated() ? (
    <Client isDevToolsOpen={isDevToolsOpen} />
  ) : (
    <Auth isDevToolsOpen={isDevToolsOpen} />
  );
}

export default App;
