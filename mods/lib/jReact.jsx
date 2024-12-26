import { renderToStaticMarkup } from 'react-dom/server';
import $ from 'jquery';

import tinyConsole from '@src/util/libs/console';

export default function jReact(dom, config = {}) {
  let result = null;

  try {
    result = renderToStaticMarkup(dom);
  } catch (err) {
    result = null;
    tinyConsole.error(err);
  }

  return $(result, config);
}
