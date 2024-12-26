import clone from 'clone';

import tinyConsole from '@src/util/libs/console';
import moment from '@src/util/libs/momentjs';

import { logger as mxLogger } from 'matrix-js-sdk/lib/logger';
// import tinyAPI from '../../util/mods';

const logCache = {
  data: [],
  add: (level, msg) => {
    if (typeof level === 'string' && (Array.isArray(msg) || typeof msg === 'string')) {
      logCache.data.push({
        level,
        msg,
        time: moment(),
      });

      if (logCache.data.length > 1000) {
        // const tinyData = logCache.data.shift();
      }

      // const tinyData = { level, msg };
    }
  },
};

// rewrite matrix logger
mxLogger.info = (...msg) => logCache.add('info', msg);
mxLogger.log = (...msg) => logCache.add('log', msg);
mxLogger.warn = (...msg) => logCache.add('warn', msg);
mxLogger.error = (...msg) => logCache.add('error', msg);
mxLogger.trace = (...msg) => logCache.add('trace', msg);
mxLogger.debug = (...msg) => logCache.add('debug', msg);

function isLogString(value) {
  for (const item in value) {
    if (typeof value[item] !== 'string') {
      return false;
    }
  }

  return true;
}

function logDatatoString(value) {
  if (Array.isArray(value) && isLogString(value)) {
    return value.join(' ');
  }

  if (typeof value === 'string') {
    return value;
  }

  return null;
}

const createLogArgs = (type, args) => {
  const tinyArgs = [type];
  for (const item in args) {
    tinyArgs.push(args[item]);
  }

  return tinyArgs;
};

function playLogData() {
  for (const item in logCache.data) {
    tinyConsole[logCache.data[item].level](
      `[${moment().format()}] [matrix]`,
      logDatatoString(logCache.data[item].msg),
    );
  }
}

if (__ENV_APP__.MODE === 'development') {
  global.logger = {
    logDatatoString,
    isLogString,

    getData: () => clone(logCache.data),

    debug() {
      logCache.add.apply(this, createLogArgs('debug', arguments));
    },
    log() {
      logCache.add.apply(this, createLogArgs('log', arguments));
    },
    info() {
      logCache.add.apply(this, createLogArgs('info', arguments));
    },
    warn() {
      logCache.add.apply(this, createLogArgs('warn', arguments));
    },
    error() {
      logCache.add.apply(this, createLogArgs('error', arguments));
    },
    trace() {
      logCache.add.apply(this, createLogArgs('trace', arguments));
    },

    play: playLogData,
  };
}

export default {
  logDatatoString,
  isLogString,

  getData: () => logCache.data,

  debug() {
    logCache.add.apply(this, createLogArgs('debug', arguments));
  },
  log() {
    logCache.add.apply(this, createLogArgs('log', arguments));
  },
  info() {
    logCache.add.apply(this, createLogArgs('info', arguments));
  },
  warn() {
    logCache.add.apply(this, createLogArgs('warn', arguments));
  },
  error() {
    logCache.add.apply(this, createLogArgs('error', arguments));
  },
  trace() {
    logCache.add.apply(this, createLogArgs('trace', arguments));
  },

  play: playLogData,
};
