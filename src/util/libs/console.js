class TinyConsole {
  constructor(logs = ['log', 'debug', 'warn', 'error', 'info']) {
    this._logs = logs;
    this._canShow = __ENV_APP__.SHOW_LOG;
    this.cache = [];

    const tinyThis = this;
    for (const item in this._logs) {
      this[`_${this._logs[item]}`] = [];
      this[this._logs[item]] = function () {
        const args = [];
        for (const item2 in arguments) args.push(arguments[item2]);
        tinyThis._sendLog(tinyThis._logs[item], args);
      };
    }
  }

  install(logger) {
    for (const item in this._logs) {
      logger[this._logs[item]] = this[this._logs[item]];
    }
  }

  see(items = this._logs) {
    const showList = [];
    for (const item in this.cache) {
      const index = this.cache[item].index;
      const type = this.cache[item].type;
      if (items.indexOf(type) > -1) showList.push(this[`_${type}`][index]);
    }

    return showList;
  }

  _sendLog(type, args) {
    this[`_${type}`].push(args);
    this.cache.push({ type, index: this[`_${type}`].length - 1 });
    if (this._canShow || type === 'error' || type === 'warn') console[type].apply(console, args);
  }

  activeShow() {
    this._canShow = true;
  }

  disableShow() {
    this._canShow = false;
  }
}

const tinyConsole = new TinyConsole();
if (__ENV_APP__.MODE !== 'development') tinyConsole.disableShow();

export default tinyConsole;

if (__ENV_APP__.MODE === 'development') {
  global.tinyConsole = tinyConsole;
}
