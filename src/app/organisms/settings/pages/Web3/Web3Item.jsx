import React, { useEffect, useRef, useState } from 'react';
import $ from 'jquery';

import clone from 'clone';
import { objType } from 'for-promise/utils/lib.mjs';

import Img from '@src/app/atoms/image/Image';

import { setWeb3Cfg, getWeb3Cfg, getDefaultNetworks } from '@mods/web3/ethers/base';
import { tinyConfirm } from '../../../../../util/tools';

let loadData = null;

// https://chainlist.org/
function Web3Item({ item, networkId }) {
  // Data React
  const divBaseRef = useRef(null);
  const idValueRef = useRef(null);
  const blockIdRef = useRef(null);
  const blockIdNumberRef = useRef(null);
  const blockNameRef = useRef(null);
  const explorerUrlRef = useRef(null);
  const explorerUrlApiRef = useRef(null);
  const chainRpcRef = useRef(null);
  const factoryScRef = useRef(null);
  const tokenNameRef = useRef(null);
  const tokenSymbolRef = useRef(null);
  const tokenDecimalsRef = useRef(null);

  const [tinyNetwork, setTinyNetwork] = useState(networkId);
  const defaultNetworks = getDefaultNetworks();

  const [blockchainName, setBlockchainName] = useState(
    typeof item.chainName === 'string' ? item.chainName : '',
  );
  const [blockchainId, setBlockId] = useState(typeof item.chainId === 'string' ? item.chainId : '');
  const [blockchainSymbol, setBlockSymbol] = useState(
    item.nativeCurrency && typeof item.nativeCurrency.symbol === 'string'
      ? item.nativeCurrency.symbol
      : '',
  );
  const [blockchainExplorer, setBlockchainExplorer] = useState(
    Array.isArray(item?.blockExplorerUrls) ? item.blockExplorerUrls : [''],
  );

  // Effects
  useEffect(() => {
    // Template
    const valueTemplate = (where, type, data, folder, setValue) => {
      // Prepare Config Base
      const web3Settings = getWeb3Cfg();

      // Get New Item
      const newData = { nativeCurrency: {} };
      if (web3Settings.networks[tinyNetwork]) {
        for (const titem in web3Settings.networks[tinyNetwork]) {
          newData[titem] = web3Settings.networks[tinyNetwork][titem];
        }
      }

      // Insert new data
      if (typeof data === 'string' || typeof data === 'number') {
        if (type === 'array') {
          if (typeof folder === 'string') {
            if (!objType(newData[where], 'object')) {
              newData[where] = {};
            }
            newData[where][folder] = data.replace(/ \,/g, ',').split(',');

            for (const item2 in newData[where][folder]) {
              newData[where][folder][item2] = newData[where][folder][item2].trim();
            }
          } else {
            newData[where] = data.replace(/ \,/g, ',').split(',');

            for (const item2 in newData[where]) {
              newData[where][item2] = newData[where][item2].trim();
            }
          }
        } else if (type === 'number') {
          if (typeof folder === 'string') {
            if (!objType(newData[where], 'object')) {
              newData[where] = {};
            }
            newData[where][folder] = Number(data);
          } else {
            newData[where] = Number(data);
          }
        } else if (typeof folder === 'string') {
          if (!objType(newData[where], 'object')) {
            newData[where] = {};
          }
          newData[where][folder] = data;
        } else {
          newData[where] = data;
        }
      } else if (typeof newData[where][folder] !== 'undefined') {
        delete newData[where][folder];
      } else if (typeof newData[where] !== 'undefined') {
        delete newData[where];
      }

      // Reset Data
      if (web3Settings.networks[tinyNetwork]) delete web3Settings.networks[tinyNetwork];
      web3Settings.networks[tinyNetwork] = newData;
      setWeb3Cfg('networks', web3Settings.networks);

      // set Value
      if (type === 'array') {
        if (typeof setValue === 'function')
          setValue(
            typeof data !== 'undefined' && data !== null
              ? data.replace(/ \,/g, ',').split(',')
              : '',
          );
      } else if (typeof setValue === 'function')
        setValue(typeof data !== 'undefined' && data !== null ? data : '');
    };

    // Object Id
    const idValue = $(idValueRef.current);
    idValue.val(tinyNetwork);
    const idValueChange = (event) => {
      const newId = $(event.target).val();
      if (typeof newId === 'string' && newId.length > 0) {
        // Prepare Config Base
        const web3Settings = getWeb3Cfg();
        const tinyData = {};

        for (const item2 in web3Settings.networks[tinyNetwork]) {
          tinyData[item2] = clone(web3Settings.networks[tinyNetwork][item2]);
        }

        delete web3Settings.networks[tinyNetwork];
        web3Settings.networks[newId] = tinyData;
        setWeb3Cfg('networks', web3Settings.networks);

        setTinyNetwork(newId);
      }
    };

    // Blockchain Id
    const blockId = $(blockIdRef.current);
    const blockIdChange = (event) =>
      valueTemplate('chainId', 'string', $(event.target).val(), undefined, setBlockId);

    // Blockchain Id Int
    const blockIdNumber = $(blockIdNumberRef.current);
    const blockIdNumberChange = (event) =>
      valueTemplate('chainIdInt', 'number', $(event.target).val());

    // Blockchain Name
    const blockName = $(blockNameRef.current);
    const blockNameChange = (event) =>
      valueTemplate('chainName', 'string', $(event.target).val(), undefined, setBlockchainName);

    // Token Name
    const tokenName = $(tokenNameRef.current);
    const tokenNameChange = (event) =>
      valueTemplate('nativeCurrency', 'string', $(event.target).val(), 'name');

    // Token Symbol
    const tokenSymbol = $(tokenSymbolRef.current);
    const tokenSymbolChange = (event) =>
      valueTemplate(
        'nativeCurrency',
        'string',
        $(event.target).val(),
        'symbol',
        undefined,
        setBlockSymbol,
      );

    // Token Decimals
    const tokenDecimals = $(tokenDecimalsRef.current);
    const tokenDecimalsChange = (event) =>
      valueTemplate('nativeCurrency', 'number', $(event.target).val(), 'decimals');

    // Explorer Url
    const explorerUrl = $(explorerUrlRef.current);
    const explorerUrlChange = (event) =>
      valueTemplate(
        'blockExplorerUrls',
        'array',
        $(event.target).val(),
        undefined,
        setBlockchainExplorer,
      );

    // Explorer Url - API
    const explorerUrlApi = $(explorerUrlApiRef.current);
    const explorerUrlApiChange = (event) =>
      valueTemplate('blockExplorerApis', 'array', $(event.target).val());

    // Chain RPC
    const chainRpc = $(chainRpcRef.current);
    const chainRpcChange = (event) => valueTemplate('rpcUrls', 'array', $(event.target).val());

    // Factory Smart Contract
    const factorySc = $(factoryScRef.current);
    const factoryScChange = (event) => valueTemplate('factory', 'array', $(event.target).val());

    loadData = () => {
      const web3Settings = getWeb3Cfg();
      const newItem = web3Settings.networks[tinyNetwork];

      // Blockchain Id
      blockId.val(blockchainId);

      // Blockchain Id Int
      blockIdNumber.val(newItem.chainIdInt);

      // Blockchain Name
      blockName.val(blockchainName);

      // Token Name
      tokenName.val(newItem.nativeCurrency?.name);

      // Token Symbol
      tokenSymbol.val(newItem.nativeCurrency?.symbol);

      // Token Decimals
      tokenDecimals.val(newItem.nativeCurrency?.decimals);

      // Explorer Url
      explorerUrl.val(blockchainExplorer);

      // Explorer Url - API
      explorerUrlApi.val(
        Array.isArray(newItem?.blockExplorerApis) ? newItem.blockExplorerApis.join(', ') : '',
      );

      // Chain RPC
      chainRpc.val(Array.isArray(newItem?.rpcUrls) ? newItem.rpcUrls.join(', ') : '');

      // Factory Smart Contract
      factorySc.val(Array.isArray(newItem?.factory) ? newItem.factory.join(', ') : '');
    };

    // Turn On
    loadData();

    idValue.on('change', idValueChange);
    blockId.on('change', blockIdChange);
    blockIdNumber.on('change', blockIdNumberChange);
    blockName.on('change', blockNameChange);
    tokenName.on('change', tokenNameChange);
    tokenSymbol.on('change', tokenSymbolChange);
    tokenDecimals.on('change', tokenDecimalsChange);
    explorerUrl.on('change', explorerUrlChange);
    explorerUrlApi.on('change', explorerUrlApiChange);
    chainRpc.on('change', chainRpcChange);
    factorySc.on('change', factoryScChange);

    // Complete
    return () => {
      idValue.off('change', idValueChange);
      blockId.off('change', blockIdChange);
      blockIdNumber.off('change', blockIdNumberChange);
      blockName.off('change', blockNameChange);
      tokenName.off('change', tokenNameChange);
      tokenSymbol.off('change', tokenSymbolChange);
      tokenDecimals.off('change', tokenDecimalsChange);
      explorerUrl.off('change', explorerUrlChange);
      explorerUrlApi.off('change', explorerUrlApiChange);
      chainRpc.off('change', chainRpcChange);
      factorySc.off('change', factoryScChange);
    };
  });

  return (
    <div ref={divBaseRef} className="card noselect mb-3">
      <ul className="list-group list-group-flush">
        <li className="list-group-item very-small text-gray">
          <a
            data-bs-toggle="collapse"
            href={`#chain_collapse_${blockchainId}`}
            role="button"
            aria-expanded="false"
            aria-controls={`chain_collapse_${blockchainId}`}
          >
            {blockchainName}{' '}
            {typeof blockchainSymbol === 'string' && blockchainSymbol.length > 0 ? (
              <i className={`ms-1 text-bg-force cf cf-${blockchainSymbol.toLocaleLowerCase()}`} />
            ) : null}
          </a>
        </li>

        <li id={`chain_collapse_${blockchainId}`} className="list-group-item collapse">
          <div className="mb-3">
            <label htmlFor={`chain_name_id_${blockchainId}`} className="form-label small">
              Chain Name
            </label>
            <input
              ref={blockNameRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_name_id_${blockchainId}`}
            />
            <div className="very-small text-gray">Put the blockchain name here.</div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_${blockchainId}`} className="form-label small">
              Object Id
            </label>
            <input
              ref={idValueRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_id_${blockchainId}`}
            />
            <div className="very-small text-gray">
              This is the name to the blockchain id. This is recommend using only lowercase letters
              and no spaces to work correctly.
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_block_id_${blockchainId}`} className="form-label small">
              Blockchain Id
            </label>
            <input
              ref={blockIdRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_block_id_${blockchainId}`}
            />
            <div className="very-small text-gray">
              This is the blockchain identifier value within the Ethereum network. Enter a chain
              value here.
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_block_id_number_${blockchainId}`} className="form-label small">
              Blockchain Id (Number)
            </label>
            <input
              ref={blockIdNumberRef}
              type="number"
              className="form-control form-control-bg"
              id={`chain_block_id_number_${blockchainId}`}
            />
            <div className="very-small text-gray">
              This is the blockchain identifier value (Number) within the Ethereum network. Enter a
              chain value here.
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_factory_${blockchainId}`} className="form-label small">
              Factory Smart Contract
            </label>
            <input
              ref={factoryScRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_factory_${blockchainId}`}
            />
            <div className="very-small text-gray">
              The smart contract of the blockchain factory.
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_explorer_id_${blockchainId}`} className="form-label small">
              Explorer Url
            </label>
            <input
              ref={explorerUrlRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_explorer_id_${blockchainId}`}
            />
            <div className="very-small text-gray">The url of the blockchain explorer server.</div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_explorer_api_id_${blockchainId}`} className="form-label small">
              Explorer API Url
            </label>
            <input
              ref={explorerUrlApiRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_explorer_api_id_${blockchainId}`}
            />
            <div className="very-small text-gray">
              The api url of the blockchain explorer server.
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_rpc_id_${blockchainId}`} className="form-label small">
              RPC Url
            </label>
            <input
              ref={chainRpcRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_rpc_id_${blockchainId}`}
            />
            <div className="very-small text-gray">The RPC url of the blockchain server.</div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_name_${blockchainId}`} className="form-label small">
              Name
            </label>
            <input
              ref={tokenNameRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_name_${blockchainId}`}
            />
            <div className="very-small text-gray">The token name.</div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_symbol_${blockchainId}`} className="form-label small">
              Symbol
            </label>
            <input
              ref={tokenSymbolRef}
              type="text"
              className="form-control form-control-bg"
              id={`chain_symbol_${blockchainId}`}
            />
            <div className="very-small text-gray">The token symbol.</div>
          </div>

          <div className="mb-3">
            <label htmlFor={`chain_decimals_${blockchainId}`} className="form-label small">
              Decimals
            </label>
            <input
              ref={tokenDecimalsRef}
              type="number"
              min={0}
              className="form-control form-control-bg"
              id={`chain_decimals_${blockchainId}`}
            />
            <div className="very-small text-gray">The token decimals.</div>
          </div>

          <div className="mb-3">
            {defaultNetworks[tinyNetwork] ? (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={async () => {
                  const isConfirmed = await tinyConfirm(
                    'Are you sure you want to reset this network data?',
                    'Web3 network',
                  );
                  if (isConfirmed) {
                    const web3Settings = getWeb3Cfg();

                    if (web3Settings.networks[tinyNetwork])
                      delete web3Settings.networks[tinyNetwork];
                    web3Settings.networks[tinyNetwork] = defaultNetworks[tinyNetwork];

                    setWeb3Cfg('networks', web3Settings.networks);
                    const newItem = web3Settings.networks[tinyNetwork];

                    setBlockchainName(
                      typeof newItem.chainName === 'string' ? newItem.chainName : '',
                    );
                    setBlockId(typeof newItem.chainId === 'string' ? newItem.chainId : '');
                    setBlockSymbol(
                      newItem.nativeCurrency && typeof newItem.nativeCurrency?.symbol === 'string'
                        ? newItem.nativeCurrency?.symbol
                        : '',
                    );
                    setBlockchainExplorer(
                      Array.isArray(newItem?.blockExplorerUrls) ? newItem.blockExplorerUrls : [''],
                    );
                    if (typeof loadData === 'function') loadData();
                  }
                }}
              >
                Reset Data
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-sm btn-danger${defaultNetworks[tinyNetwork] ? ' me-3' : ''} my-1 my-sm-0`}
                onClick={async () => {
                  const isConfirmed = await tinyConfirm(
                    'Are you sure you want to delete this network?',
                    'Web3 network',
                  );
                  if (isConfirmed) {
                    $(divBaseRef.current).addClass('d-none');
                    const web3Settings = getWeb3Cfg();

                    if (web3Settings.networks[tinyNetwork])
                      delete web3Settings.networks[tinyNetwork];
                    setWeb3Cfg('networks', web3Settings.networks);
                  }
                }}
              >
                Delete Data
              </button>
            )}
          </div>
        </li>
      </ul>
    </div>
  );
}

export default Web3Item;
