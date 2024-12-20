import React from 'react';
import tinyAPI from '@src/util/mods';
import envAPI from '@src/util/libs/env';
import { getUserWeb3Account } from '@src/util/web3';

export default function startEthers() {
  tinyAPI.on('linkifyRegisterCustomProtocols', (data) => {
    if (envAPI.get('WEB3')) {
      if (!Array.isArray(data.protocols)) data.protocols = [];

      data.protocols.push('bitcoin');
      data.protocols.push('dogecoin');
      data.protocols.push('monero');

      data.protocols.push('ethereum');
      data.protocols.push('web3');

      data.protocols.push('ar');
      data.protocols.push('lbry');
    }
  });

  tinyAPI.on('presenceCustomValues', (data, customValues, user, isNotYou) => {
    customValues.push({
      value: 'ethereum',
      get: (presenceObj, content) => {
        if (isNotYou) content.ethereum = getUserWeb3Account(presenceObj.ethereum, user.userId);
        else content.ethereum = getUserWeb3Account();
      },
    });
  });
}
