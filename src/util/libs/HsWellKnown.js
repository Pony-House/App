import EventEmitter from 'events';
import { objType } from 'for-promise/utils/lib.mjs';

import tinyConsole from '@src/util/libs/console';

import * as auth from '@src/client/action/auth';
import { getBaseUrl } from '../matrixUtil';

// Emitter
class HsWellKnown extends EventEmitter {
  constructor() {
    super();
    this.resetAll();
  }

  resetAll() {
    this.resetData();
    this.resetSsoProviders();
    this.resetIsPassword();
    this.emit('resetData');
  }

  setSearchingHs(searchingHs) {
    this._searchingHs = searchingHs;
    this.emit('changeSearchingHs', this._searchingHs);
  }

  async fetch(servername, setProcess) {
    const tinyThis = this;
    let baseUrl = null;
    baseUrl = await getBaseUrl(servername);

    if (this._searchingHs !== servername) return;
    if (typeof setProcess === 'function')
      setProcess({ isLoading: true, message: `Connecting to ${baseUrl}...` });
    const tempClient = auth.createTemporaryClient(baseUrl);

    return Promise.allSettled([tempClient.loginFlows(), tempClient.register()])
      .then((values) => {
        const loginFlow = values[0].status === 'fulfilled' ? values[0]?.value : undefined;
        const registerFlow = values[1].status === 'rejected' ? values[1]?.reason?.data : undefined;
        if (loginFlow === undefined || registerFlow === undefined) throw new Error();

        if (tinyThis._searchingHs !== servername) return;
        tinyThis.setData({
          serverName: servername,
          baseUrl,
          login: loginFlow,
          register: registerFlow,
        });

        if (objType(loginFlow, 'object') && Array.isArray(loginFlow.flows)) {
          tinyThis.setSsoProviders(loginFlow.flows);
          tinyThis.setIsPassword(loginFlow.flows);
        }

        if (typeof setProcess === 'function') setProcess({ isLoading: false });
        const finalData = {
          data: tinyThis.getData(),
          ssoProviders: tinyThis.getSsoProviders(),
          isPassword: tinyThis.getIsPassword(),
        };

        this.emit('ready', finalData);
        return finalData;
      })
      .catch((err) => {
        if (servername) tinyConsole.error(err);
        if (tinyThis._searchingHs !== servername) return;
        tinyThis.resetAll();
        if (typeof setProcess === 'function')
          setProcess({
            isLoading: false,
            error: 'Unable to connect. Please check your input.',
          });
      });
  }

  setData(data = { serverName: null, baseUrl: null, login: null, register: null }) {
    try {
      this.serverName = data.serverName;
      this.baseUrl = data.baseUrl;
      this._login = data.login;
      this._register = data.register;
    } catch {
      this.resetData(false);
    }
    this.emit('changeData', this.getData());
  }

  resetData(sendEmit = true) {
    this.serverName = null;
    this.baseUrl = null;
    this._login = null;
    this._register = null;
    if (sendEmit) this.emit('changeData', this.getData());
  }

  getServerName() {
    return this.serverName;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getLoginFlows() {
    if (objType(this._login, 'object') && Array.isArray(this._login.flows))
      return this._login.flows;
  }

  getRegister() {
    return this._register;
  }

  getRegisterSession() {
    if (objType(this._register, 'object') && typeof this._register.session === 'string')
      return this._register.session;
  }

  getRegisterFlows() {
    if (objType(this._register, 'object') && Array.isArray(this._register.flows))
      return this._register.flows;
  }

  getRegisterParams() {
    if (objType(this._register, 'object') && objType(this._register.params, 'object'))
      return this._register.params;
  }

  getData() {
    return {
      serverName: this.serverName,
      baseUrl: this.baseUrl,
      login: this._login,
      register: this._register,
    };
  }

  setIsPassword(loginFlow) {
    try {
      this._isPassword = loginFlow?.filter((flow) => flow.type === 'm.login.password')[0];
      this.isPassword =
        objType(this._isPassword, 'object') &&
        typeof this._isPassword.type === 'string' &&
        this._isPassword.type === 'm.login.password';
    } catch {
      this.resetIsPassword(false);
    }
    this.emit('changeIsPassword', this.getIsPassword());
  }

  resetIsPassword(sendEmit = true) {
    this._isPassword = null;
    this.isPassword = null;
    if (sendEmit) this.emit('changeIsPassword', this.getIsPassword());
  }

  getIsPassword() {
    return this.isPassword;
  }

  setSsoProviders(loginFlow) {
    try {
      this._ssoProviders = loginFlow?.filter((flow) => flow.type === 'm.login.sso')[0];
      try {
        this.ssoProviders = this._ssoProviders.identity_providers;
      } catch {
        this.ssoProviders = [];
      }
    } catch {
      this.resetSsoProviders(false);
    }
    this.emit('changeSsoProviders', this.getSsoProviders());
  }

  resetSsoProviders(sendEmit = true) {
    this._ssoProviders = {
      type: 'm.login.sso',
      identity_providers: [],
    };
    this.ssoProviders = this._ssoProviders.identity_providers;
    if (sendEmit) this.emit('changeSsoProviders', this.getSsoProviders());
  }

  getSsoProviders() {
    return this.ssoProviders;
  }
}

// Export
const hsWellKnown = new HsWellKnown();
hsWellKnown.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
export default hsWellKnown;

// DEV
if (__ENV_APP__.MODE === 'development') {
  global.hsWellKnown = hsWellKnown;
}
