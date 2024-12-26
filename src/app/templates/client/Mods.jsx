/* eslint-disable react/jsx-no-useless-fragment */
import React, { useEffect } from 'react';

import tinyConsole from '@src/util/libs/console';
import startMods, { startCustomThemes } from '../../../../mods';
import tinyAPI from '../../../util/mods';

export default function Mods() {
  startMods(true);
  useEffect(() => {
    tinyAPI.resetAll();
    startCustomThemes();
    startMods();
    tinyConsole.log(`[mods] Base meta loaded.`);
  });
  return <></>;
}
