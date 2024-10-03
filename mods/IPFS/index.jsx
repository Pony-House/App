import React from 'react';
import tinyAPI from '@src/util/mods';
import envAPI from '@src/util/libs/env';

export default function startIPFS() {
  tinyAPI.on('linkifyRegisterCustomProtocols', (data) => {
    if (envAPI.get('IPFS')) {
      if (!Array.isArray(data.protocols)) data.protocols = [];
      data.protocols.push('ipfs');
    }
  });
}
