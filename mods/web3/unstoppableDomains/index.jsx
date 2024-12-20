import React, { useEffect, useState } from 'react';
import $ from 'jquery';

import tinyAPI from '@src/util/mods';
import initMatrix from '@src/client/initMatrix';
import copyText from '@src/app/organisms/profile-viewer/copyText';

import { toast, btModal } from '../../../src/util/tools';
import getWallets from '../../ud';
import { getUdDomain, getUdDomains } from './getDomain';

function UnstoppableDomainsTab({ userId, accountContent }) {
  // Prepare
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [dnsDomain, setDnsDomain] = useState(null);
  const [addresses, setAddresses] = useState(null);

  // Config
  const user = initMatrix.matrixClient.getUser(userId);

  // Ethereum
  const ethereum = accountContent.ethereum;

  // Get Data
  useEffect(() => {
    if (isLoading && !isError && !isEmpty) {
      // Ethereum
      getUdDomain(ethereum.address)
        .then((domain) => {
          if (typeof domain === 'string' && domain.length > 0) {
            getUdDomains(ethereum.address, domain)
              .then((newAddresses) => {
                setIsLoading(false);
                if (Array.isArray(newAddresses) && newAddresses.length > 0) {
                  setDnsDomain(domain);
                  setAddresses(newAddresses);
                } else tinyError();
              })
              .catch(tinyError);
          } else {
            tinyError();
          }
        })
        .catch(tinyError);
    }
  });

  // Tiny Error
  const tinyError = (err) => {
    if (err) {
      toast(err.message);
      console.error(err);
      setIsError(true);
    } else {
      setIsEmpty(true);
    }
  };

  // Is Loading
  if (isLoading)
    return (
      <strong className="small">
        <div className="me-2 spinner-border spinner-border-sm d-inline-block" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>{' '}
        Loading data...
      </strong>
    );

  // Is Error
  if (isError) return <strong className="small text-danger">ERROR LOADING!</strong>;

  // Is Empty
  if (isEmpty)
    return (
      <strong className="small">No reverse UD domains were found linked to this wallet.</strong>
    );

  // Complete
  return (
    <>
      <strong className="small">Address:</strong>{' '}
      <a
        className="small text-click"
        onClick={(event) => {
          event.preventDefault();
          const qrcodeCanvas = $('<canvas>');
          qrcode.toCanvas(qrcodeCanvas[0], dnsDomain, (error) => {
            if (error) {
              toast(error);
            } else {
              // Prepare Text
              btModal({
                title: 'UD Address',

                id: 'user-eth-address',
                dialog: 'modal-lg modal-dialog-centered',

                body: $('<center>', { class: 'small' }).append(
                  $('<h6>', { class: 'mb-4 noselect' }).text(
                    'Please enter the address correctly! Any type issue will be permanent loss of your funds!',
                  ),
                  $('<span>').text(user.displayName ? user.displayName : user.userId),
                  $('<br/>'),
                  $('<span>').text(dnsDomain),
                  $('<div>', { class: 'mt-3' }).append(qrcodeCanvas),
                ),
              });
            }
          });
        }}
      >
        {dnsDomain}
      </a>
      <div className="small row">
        {getWallets.map((value, item) => {
          // Check Wallets
          const address = addresses[item];
          const walletInfo = value.split('.');
          if (
            typeof address === 'string' &&
            address.length > 0 &&
            walletInfo[0] === 'crypto' &&
            walletInfo[2] === 'address'
          ) {
            return (
              <div key={`web3_ud_wallet_${value}`} className="col-md-6 mt-3">
                <div className="border border-bg p-3">
                  <div className="fw-bold">
                    <i className={`me-2 cf cf-${walletInfo[1].toLowerCase()}`} />
                    {walletInfo[1]}
                  </div>

                  <span
                    className="small text-click"
                    onClick={(event) => {
                      event.preventDefault();
                      const qrcodeCanvas = $('<canvas>');
                      qrcode.toCanvas(qrcodeCanvas[0], address, (error) => {
                        if (error) {
                          toast(error);
                        } else {
                          // Prepare Text
                          btModal({
                            title: `${walletInfo[1]} Address`,

                            id: 'user-eth-address',
                            dialog: 'modal-lg modal-dialog-centered',

                            body: $('<center>', { class: 'small' }).append(
                              $('<h6>', { class: 'mb-4 noselect' }).text(
                                'Please enter the address correctly! Any type issue will be permanent loss of your funds!',
                              ),
                              $('<span>').text(user.displayName ? user.displayName : user.userId),
                              $('<br/>'),
                              $('<span>').text(address),
                              $('<div>', { class: 'mt-3' }).append(qrcodeCanvas),
                            ),
                          });
                        }
                      });
                    }}
                  >
                    {address}
                  </span>
                </div>
              </div>
            );
          }

          // Nothing
          return null;
        })}
      </div>
      <div className="very-small text-center mt-3">
        Powered by{` `}
        <a href="https://unstoppabledomains.com" target="_blank" className="text-bg-force">
          Unstoppable Domains
        </a>
      </div>
    </>
  );
}

export default function startMod() {
  tinyAPI.on('profileTabsSpawn', (data, menuBarItems, accountContent, existEthereum) => {
    if (existEthereum) {
      menuBarItems.push({
        menu: () => 'UD',
        render: ({ userId, accountContent }) => (
          <UnstoppableDomainsTab userId={userId} accountContent={accountContent} />
        ),
      });
    }
  });
}
