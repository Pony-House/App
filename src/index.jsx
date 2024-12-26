import './scss/theme/white/base.scss';
import './scss/theme/dark/base.scss';

import './scss/theme/silver/base.scss';
import './scss/theme/butter/base.scss';
import './scss/theme/black/base.scss';

import './scss/default.scss';

import tinyConsole from '@src/util/libs/console';
import StartApp from './start';

tinyConsole.log('[index] File detected! Starting app!');
StartApp('vite');
