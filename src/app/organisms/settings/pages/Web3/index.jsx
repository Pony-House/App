import React, { useState, useEffect, useRef } from 'react';
import objectHash from 'object-hash';
import FileSaver from 'file-saver';
import clone from 'clone';

import { objType } from 'for-promise/utils/lib.mjs';

import FileInput, {
  fileInputClick,
  fileInputValue,
  fileReader,
} from '@src/app/molecules/file-input/FileInput';
import { getAppearance } from '@src/util/libs/appearance';

import SettingTile from '../../../../molecules/setting-tile/SettingTile';
import Toggle from '../../../../atoms/button/Toggle';
import { toggleActionLocal } from '../../Api';
import {
  getWeb3Cfg,
  deleteWeb3Cfg,
  setWeb3Cfg,
  getUserWeb3Account,
  setUserWeb3Account,
  resetUserWeb3Account,
  tinyCrypto,
} from '@mods/web3/ethers/base';
import Web3Item from './Web3Item';
import { tinyConfirm, tinyPrompt } from '../../../../../util/tools';
import { ethereumUpdate } from '../../../../../client/action/navigation';
import initMatrix from '../../../../../client/initMatrix';
import { setLoadingPage } from '../../../../templates/client/Loading';

function Web3Section() {
  // Prepare React
  const web3Settings = getWeb3Cfg();
  const [networks, setNetworks] = useState({ keys: [], values: [] });
  const [web3Enabled, setWeb3Enabled] = useState(web3Settings.web3Enabled);
  const [userWeb3, setUserWeb3] = useState(getUserWeb3Account());
  const [, setUploadPromise] = useState(null);

  const web3ConfigUploadRef = useRef(null);
  const advancedUserMode = getAppearance('advancedUserMode');
  const basicUserMode = getAppearance('basicUserMode');

  useEffect(() => {
    const newWeb3Settings = getWeb3Cfg();

    const newNetworks = { keys: [], values: [] };
    for (const item in newWeb3Settings.networks) {
      newNetworks.values.push(newWeb3Settings.networks[item]);
      newNetworks.keys.push(item);
    }

    newNetworks.keys.sort(
      (a, b) => newWeb3Settings.networks[a].chainIdInt - newWeb3Settings.networks[b].chainIdInt,
    );
    newNetworks.values.sort((a, b) => a.chainIdInt - b.chainIdInt);

    if (objectHash(newNetworks) !== objectHash(networks)) {
      setNetworks(newNetworks);
    } else {
      tinyCrypto.updateProviders();
    }
  });

  const tinyChange = async (target, getFile) => {
    const file = getFile(0);
    if (file === null) return;

    fileReader(file)
      .then((result) => {
        const obj = JSON.parse(result);
        if (objType(obj, 'object')) {
          setWeb3Cfg('networks', obj);
          setUploadPromise(null);
          setNetworks({ keys: [], values: [] });
        }
      })
      .catch((err) => {
        console.error(err);
        alert(err.message, 'Web3 File Reader Error');
        setUploadPromise(null);
      });

    fileInputValue(web3ConfigUploadRef, null);
  };

  // Complete Render
  return (
    <>
      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Main Settings</li>

          <SettingTile
            title="Enabled"
            options={
              <Toggle
                className="d-inline-flex"
                isActive={web3Enabled}
                onToggle={toggleActionLocal('ponyHouse-web3', 'web3Enabled', setWeb3Enabled)}
              />
            }
            content={
              <div className="very-small text-gray">
                All Pony House web3 features require this setting enabled. If you disable this
                option, everything related to web3 will be limited to native Pony House features
                only. To disable the feature completely, you need to disable the feature before
                logging into your account.
              </div>
            }
          />
        </ul>
      </div>

      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Ethereum Settings</li>

          <li className="list-group-item very-small text-gray">
            {userWeb3.address ? (
              <>
                {__ENV_APP__.ELECTRON_MODE ? (
                  <p>
                    It looks like you are using the desktop version! To use the application with
                    your web3 wallet, you need to have the frame wallet installed on your computer.
                  </p>
                ) : (
                  ''
                )}
                <p>
                  Wallet connected:{' '}
                  <strong className={userWeb3.valid ? 'text-success' : 'text-danger'}>
                    {userWeb3.address}
                  </strong>
                </p>

                <button
                  type="button"
                  className="btn btn-sm btn-danger my-1 my-sm-0"
                  onClick={async () => {
                    const isConfirmed = await tinyConfirm(
                      'Are you sure you want to reset your ethereum wallet storage? All your data will be lost forever!',
                      'Reset Ethereum Wallet',
                    );
                    if (isConfirmed) {
                      const newAccount = resetUserWeb3Account();
                      ethereumUpdate(newAccount);
                      setUserWeb3(newAccount);
                    }
                  }}
                >
                  <i className="fa-brands fa-ethereum" /> Disconnect Wallet
                </button>
              </>
            ) : (
              <>
                <p>
                  Connect your wallet to start configuring your account integration.
                  {__ENV_APP__.ELECTRON_MODE
                    ? ' It looks like you are using the desktop version! To use the application with your web3 wallet, you need to have the frame wallet installed on your computer.'
                    : ''}
                </p>

                <button
                  type="button"
                  className={`btn btn-sm btn-primary my-1 my-sm-0${tinyCrypto.protocol === null ? ' disabled' : ''}`}
                  disabled={tinyCrypto.protocol === null}
                  onClick={() => {
                    setLoadingPage();
                    setUserWeb3Account()
                      .then((userData) => {
                        const newUser = clone(userData);
                        const newAccount = getUserWeb3Account(
                          newUser,
                          initMatrix.matrixClient.getUserId(),
                        );

                        ethereumUpdate(newAccount);
                        setUserWeb3(newAccount);
                        setLoadingPage(false);
                      })
                      .catch((err) => {
                        setLoadingPage(false);
                        console.error(err);
                        alert(err.message, 'Set User Web3 Account Error');
                      });
                  }}
                >
                  <i className="fa-brands fa-ethereum" /> Connect Wallet
                  {tinyCrypto.protocol === 'frame'
                    ? ' (Frame)'
                    : tinyCrypto.protocol === 'metamask'
                      ? ' (Metamask)'
                      : ''}
                </button>
              </>
            )}
          </li>
        </ul>
      </div>

      {!basicUserMode && advancedUserMode ? (
        <>
          <div className="card noselect mb-3">
            <ul className="list-group list-group-flush">
              <li className="list-group-item very-small text-gray">Network Settings</li>

              <li className="list-group-item very-small text-gray">
                <button
                  type="button"
                  className="btn btn-sm btn-danger me-3 my-1 my-sm-0"
                  onClick={async () => {
                    const isConfirmed = await tinyConfirm(
                      'Are you sure you want to reset this? All your data will be lost forever!',
                      'Reset web3 config',
                    );
                    if (isConfirmed) {
                      deleteWeb3Cfg('networks');
                      setNetworks({ keys: [], values: [] });
                    }
                  }}
                >
                  Reset config
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-success me-3 my-1 my-sm-0"
                  onClick={async () => {
                    const newNetwork = await tinyPrompt(
                      'Choose an Object Id for your new network',
                      'New web3 network',
                      { placeholder: 'ethereum' },
                    );
                    if (typeof newNetwork === 'string' && newNetwork.length > 0) {
                      const newWeb3Settings = getWeb3Cfg();
                      newWeb3Settings.networks[newNetwork] = { chainName: newNetwork };
                      setWeb3Cfg('networks', newWeb3Settings.networks);
                      setNetworks({ keys: [], values: [] });
                    }
                  }}
                >
                  Create
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-secondary me-3 my-1 my-sm-0"
                  onClick={() => {
                    const newWeb3Settings = getWeb3Cfg();
                    const blob = new Blob([JSON.stringify(newWeb3Settings.networks, null, 4)], {
                      type: 'text/plain;charset=us-ascii',
                    });

                    FileSaver.saveAs(blob, 'pony-house-web3-networks.json');
                  }}
                >
                  Export
                </button>

                <FileInput
                  onChange={tinyChange}
                  ref={web3ConfigUploadRef}
                  accept="application/JSON"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary my-1 my-sm-0"
                  onClick={() => fileInputClick(web3ConfigUploadRef, tinyChange)}
                >
                  Import
                </button>
              </li>
            </ul>
          </div>

          {networks && Array.isArray(networks.values) && networks.values.length > 0 ? (
            networks.values.map((item, index) => (
              <Web3Item
                key={`web3Section_${networks.keys[index]}`}
                item={item}
                networkId={networks.keys[index]}
              />
            ))
          ) : (
            <p className="placeholder-glow m-0">
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
              <span className="placeholder col-12" />
            </p>
          )}
        </>
      ) : null}
    </>
  );
}

export default Web3Section;
