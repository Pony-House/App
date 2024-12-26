import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import moment from '@src/util/libs/momentjs';
import tinyConsole from '@src/util/libs/console';

import jReact from '../jReact';

export default function helloWorld() {
  // Normal Welcome
  tinyConsole.log(`[Tiny Plugin] Hello World!`, moment());

  // jQuery Welcome
  tinyConsole.log(
    `[Tiny Plugin] jQuery + React Demo`,
    jReact(<small>Hello World in react!</small>),
  );

  // Vanilla Welcome
  tinyConsole.log(
    `[Tiny Plugin] Vanilla React Demo`,
    renderToStaticMarkup(<small>Hello World in react!</small>),
  );
}
