import React, { useState, useEffect } from 'react';

import { getWeb3Cfg } from '@mods/web3/ethers/base';
import TimeFromNow from '@src/app/atoms/time/TimeFromNow';
import { getUserBalance } from '@mods/web3/ethers/utils';
import IconButton from '@src/app/atoms/button/IconButton';
import moment from '@src/util/libs/momentjs';

export default function EthereumProfileTabItem({ chain, ethereum }) {
  const web3Cfg = getWeb3Cfg();
  const [balance, setBalance] = useState('?.??');
  const [updatedAt, setUpdatedAt] = useState(0);
  const [firstTime, setFirstTime] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const getBalance = (forceUpdate = false) => {
    setIsLoading(true);
    getUserBalance(chain, ethereum.address, forceUpdate)
      .then((data) => {
        if (data) {
          setUpdatedAt(data.date);
          setBalance(data.value);
          setIsError(false);
        } else {
          setIsError(true);
          setBalance('?.??');
          setUpdatedAt(0);
          console.error(new Error('No data found.'));
        }
        setIsLoading(false);
      })
      .catch((err) => {
        setIsError(true);
        setUpdatedAt(moment());
        setIsLoading(false);
        console.error(err);
      });
  };

  useEffect(() => {
    if (!updatedAt && !isLoading && !isError && firstTime) {
      setFirstTime(false);
      getBalance();
    }
  });

  return (
    <div className="col-md-6 mt-3">
      <div className="border border-bg p-3">
        <div className="fw-bold">
          <i
            className={`me-2 cf cf-${web3Cfg.networks[chain]?.nativeCurrency?.symbol ? web3Cfg.networks[chain]?.nativeCurrency?.symbol.toLowerCase() : ''}`}
          ></i>
          {web3Cfg.networks[chain]?.chainName}
        </div>

        {!isLoading ? (
          <a
            href={`${web3Cfg.networks[chain]?.blockExplorerUrls[0]}address/${ethereum.address}`}
            target="_blank"
          >
            {!isError ? `${balance} ${web3Cfg.networks[chain]?.nativeCurrency?.symbol}` : 'ERROR!'}
          </a>
        ) : (
          <div className="spinner-border spinner-border-sm d-inline-block" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        )}
        {updatedAt ? (
          <div className="very-small text-bg-low">
            {`Updated at`}
            {` `}
            <TimeFromNow timestamp={updatedAt} />
            {` `}
            <IconButton
              className="btn-sm"
              size="small"
              disabled={isLoading}
              fa="fa-solid fa-arrows-rotate"
              onClick={() => {
                getBalance(true);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
