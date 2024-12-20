import React from 'react';
import $ from 'jquery';

import { tinyCrypto } from '@mods/web3/ethers/base';
import initMatrix from '@src/client/initMatrix';

import { btModal, toast } from '@src/util/tools';
import EthereumProfileTabItem from './EthereumItem';

export default function EthereumProfileTab(menuBarItems, accountContent, existEthereum) {
  if (existEthereum) {
    menuBarItems.push({
      menu: () => 'Ethereum',
      render: ({ userId, accountContent }) => {
        // Config
        const user = initMatrix.matrixClient.getUser(userId);

        // Ethereum
        const ethereum = accountContent.ethereum;
        return (
          <>
            <strong className="small">Address:</strong>{' '}
            <a
              className="small text-click"
              onClick={(event) => {
                event.preventDefault();
                const qrcodeCanvas = $('<canvas>');
                qrcode.toCanvas(qrcodeCanvas[0], ethereum.address, (error) => {
                  if (error) {
                    toast(error);
                  } else {
                    // Prepare Text
                    btModal({
                      title: 'Ethereum Address',

                      id: 'user-eth-address',
                      dialog: 'modal-lg modal-dialog-centered',

                      body: $('<center>', { class: 'small' }).append(
                        $('<h6>', { class: 'mb-4 noselect' }).text(
                          'Please enter the address correctly! Any type issue will be permanent loss of your funds!',
                        ),
                        $('<span>').text(user.displayName ? user.displayName : user.userId),
                        $('<br/>'),
                        $('<span>').text(ethereum.address),
                        $('<div>', { class: 'mt-3' }).append(qrcodeCanvas),
                      ),
                    });
                  }
                });
              }}
            >
              {ethereum.address}
            </a>
            <div className="small row">
              {Object.keys(tinyCrypto.userProviders).map((chain) => (
                <EthereumProfileTabItem
                  key={`profile_ethereum_${chain}`}
                  chain={chain}
                  ethereum={ethereum}
                />
              ))}
            </div>
          </>
        );
      },
    });
  }
}
