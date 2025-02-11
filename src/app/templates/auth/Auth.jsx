import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import tinyConsole from '@src/util/libs/console';
import WelcomePage from '@mods/WelcomePage';
import storageManager from '@src/util/libs/localStorage/StorageManager';
import urlParams from '@src/util/libs/urlParams';

import ProxyModal from '@src/app/organisms/proxy-modal/ProxyModal';
import { canProxy } from '@src/util/libs/proxy';
import { openProxyModal } from '@src/client/action/navigation';

import * as auth from '../../../client/action/auth';
import cons from '../../../client/state/cons';
import { getUrlParams } from '../../../util/common';
import Avatar from '../../atoms/avatar/Avatar';

import LoadingScreen from './modules/LoadingScreen';
import AuthCard from './modules/AuthCard';
import ElectronSidebar from '../client/ElectronSidebar';
import { AuthDivBaseWithBanner } from './modules/AuthDivBase';
import LoadingPage, { setLoadingPage } from '../client/Loading';

function Auth({ isDevToolsOpen = false }) {
  const [loginToken, setLoginToken] = useState(getUrlParams('loginToken'));
  const [type, setType] = useState('login');
  const [isWelcome, setIsWelcome] = useState(WelcomePage.enabled);

  useEffect(() => {
    const authSync = async () => {
      if (__ENV_APP__.GUEST_ACCOUNT) {
        const joinGuestMode = async () => {
          setLoadingPage('Joining...');
          try {
            const baseUrl = `https://${ENV.HOMESERVER_LIST[0]}`;
            const tempClient = auth.createTemporaryClient(baseUrl);
            const { user_id, device_id, access_token } = await tempClient.registerGuest();
            auth.updateLocalStore(access_token, device_id, user_id, baseUrl, true);
            window.location.reload();
            return true;
          } catch (err) {
            tinyConsole.error(err);
            alert(err.message);
            setLoadingPage(false);
            return false;
          }
        };

        const roomId = urlParams.get('room_id');
        const ENV = __ENV_APP__.LOGIN ?? {};
        if (
          !ENV.ALLOW_CUSTOM_HOMESERVERS &&
          Array.isArray(ENV.HOMESERVER_LIST) &&
          ENV.HOMESERVER_LIST.length === 1 &&
          typeof ENV.HOMESERVER_LIST[0] === 'string' &&
          ENV.HOMESERVER_LIST[0].length > 0 &&
          typeof roomId === 'string' &&
          roomId.length > 0
        ) {
          const guestSuccess = await joinGuestMode();
          if (guestSuccess) return;
        }
      }

      if (!loginToken) return;
      if (storageManager.getItem(cons.secretKey.BASE_URL) === undefined) {
        setLoginToken(null);
        return;
      }
      const baseUrl = storageManager.getItem(cons.secretKey.BASE_URL);
      try {
        await auth.loginWithToken(baseUrl, loginToken);

        const { href } = window.location;
        window.location.replace(href.slice(0, href.indexOf('?')));
      } catch {
        setLoginToken(null);
      }
    };

    authSync();
  }, []);

  const showLoginPage = !isWelcome || !WelcomePage.html || loginToken;
  return (
    <>
      <ElectronSidebar isDevToolsOpen={isDevToolsOpen} />
      <ProxyModal />
      <LoadingPage />
      <section className={`vh-100 auth-base${isDevToolsOpen ? ' devtools-open' : ''}`}>
        <div className="container py-5 h-100">
          <div className="row d-flex justify-content-center align-items-center h-100">
            <div className={`col col-xl-10 tiny-box${showLoginPage ? ' tiny-box-login' : ''}`}>
              <div className="card">
                <div className="row g-0">
                  {showLoginPage ? (
                    <AuthDivBaseWithBanner>
                      {loginToken && <LoadingScreen message="Redirecting..." />}
                      {!loginToken && (
                        <>
                          <div className="d-flex align-items-center mb-3 pb-1 noselect">
                            <Avatar imageSrc="./img/png/cinny-main.png" />
                            <span className="ms-3 h2 fw-bold mb-0">{__ENV_APP__.INFO.name}</span>
                          </div>

                          <AuthCard type={type} setType={setType} />
                        </>
                      )}

                      <section className="border-top border-bg py-4 footer noselect">
                        <div className="row text-center d-flex justify-content-center">
                          <div className={`col-md-${canProxy() ? '3' : '4'} small`}>
                            <a
                              href="https://github.com/Pony-House/Client/releases"
                              rel="noreferrer"
                              className="text-bg-force"
                              target="_blank"
                            >{`Version ${cons.version}`}</a>
                          </div>

                          {canProxy() ? (
                            <div className={`col-md-3 small`}>
                              <a
                                href="#!"
                                className="text-bg-force"
                                onClick={(e) => {
                                  openProxyModal();
                                  e.preventDefault();
                                }}
                              >
                                Proxy Settings
                              </a>
                            </div>
                          ) : null}

                          <div className={`col-md-${canProxy() ? '3' : '4'} small`}>
                            <a
                              href="https://twitter.com/JasminDreasond"
                              target="_blank"
                              rel="noreferrer"
                              className="text-bg-force"
                            >
                              Twitter
                            </a>
                          </div>

                          <div className={`col-md-${canProxy() ? '3' : '4'} small`}>
                            <a
                              href="https://matrix.org"
                              target="_blank"
                              rel="noreferrer"
                              className="text-bg-force"
                            >
                              Powered by Matrix
                            </a>
                          </div>
                        </div>
                      </section>
                    </AuthDivBaseWithBanner>
                  ) : (
                    <WelcomePage.html setIsWelcome={setIsWelcome} setType={setType} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

Auth.propTypes = {
  isDevToolsOpen: PropTypes.bool,
};

export default Auth;
