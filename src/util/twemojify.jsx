/* eslint-disable import/prefer-default-export */
import React, { lazy, Suspense } from 'react';

import * as linkify from "linkifyjs";
import linkifyHtml from 'linkify-html';
import Linkify from 'linkify-react';

import linkifyRegisterKeywords from 'linkify-plugin-keyword';

import parse from 'html-react-parser';
import twemoji from 'twemoji';
import { sanitizeText } from './sanitize';

import keywords from '../../mods/keywords';

// Register Protocols
linkify.registerCustomProtocol('matrix');
linkify.registerCustomProtocol('twitter');
linkify.registerCustomProtocol('steam');

linkify.registerCustomProtocol('ircs');
linkify.registerCustomProtocol('irc');

linkify.registerCustomProtocol('ftp');

linkify.registerCustomProtocol('ipfs');

linkify.registerCustomProtocol('bitcoin');
linkify.registerCustomProtocol('dogecoin');
linkify.registerCustomProtocol('monero');

linkify.registerCustomProtocol('ethereum');
linkify.registerCustomProtocol('web3');

linkify.registerCustomProtocol('ar');
linkify.registerCustomProtocol('lbry');

// Register Keywords
const tinywords = [];
for (const item in keywords) { tinywords.push(keywords[item].name); }
linkifyRegisterKeywords(tinywords);

// Emoji Base
export const TWEMOJI_BASE_URL = './img/twemoji/';

// String Protocols
global.String.prototype.toUnicode = function () {
  let result = "";
  for (let i = 0; i < this.length; i++) {
    // Assumption: all characters are < 0xffff
    result += `\\u${(`000${this[i].charCodeAt(0).toString(16)}`).substring(-4)}`;
  }
  return result;
};

global.String.prototype.emojiToCode = function () {
  return this.codePointAt(0).toString(16);
};

// Tiny Math
const Math = lazy(() => import('../app/atoms/math/Math'));
const mathOptions = {
  replace: (node) => {
    const maths = node.attribs?.['data-mx-maths'];
    if (maths) {
      return (
        <Suspense fallback={<code>{maths}</code>}>
          <Math
            content={maths}
            throwOnError={false}
            errorColor="var(--tc-danger-normal)"
            displayMode={node.name === 'div'}
          />
        </Suspense>
      );
    }
    return null;
  },
};

// Open URL
const openTinyURL = (url) => {
  console.log(url);
};

/**
 * @param {string} text - text to twemojify
 * @param {object|undefined} opts - options for tweomoji.parse
 * @param {boolean} [linkify=false] - convert links to html tags (default: false)
 * @param {boolean} [sanitize=true] - sanitize html text (default: true)
 * @param {boolean} [maths=false] - render maths (default: false)
 * @returns React component
 */
const twemojifyAction = (text, opts, linkifyEnabled, sanitize, maths, isReact) => {

  // Not String
  if (typeof text !== 'string') return text;

  // Content Prepare
  let msgContent = text;
  const options = opts ?? { base: TWEMOJI_BASE_URL };
  if (!options.base) {
    options.base = TWEMOJI_BASE_URL;
  }

  // Sanitize Filter
  if (sanitize) {
    msgContent = sanitizeText(msgContent);
  }

  // Emoji Parse
  msgContent = twemoji.parse(msgContent, options);

  // Linkify Options
  const linkifyOptions = {

    defaultProtocol: 'https',

    formatHref: {
      keyword: (keyword) => {
        const tinyword = keyword.toLowerCase();
        const item = keywords.find(word => word.name === tinyword);
        if (item) return item.href;
      },
    },

    rel: 'noreferrer noopener',
    target: '_blank',

  };

  // React Mode
  if (isReact) {

    // Insert Linkify
    if (linkifyEnabled) {

      // Render Data
      linkifyOptions.render = ({ attributes, content }) => {
        const { href, ...props } = attributes;
        return <a href={href} onClick={(e) => { e.preventDefault(); openTinyURL($(e.target).attr('href')); return false; }} {...props} className='linkify'>{content}</a>;
      };

      // Complete
      return <Linkify options={linkifyOptions}>{parse(msgContent, maths ? mathOptions : null)}</Linkify>;

    }

    // Complete
    return parse(msgContent, maths ? mathOptions : null);

  }

  // jQuery Mode

  // Insert Linkify
  if (linkifyEnabled) {
    linkifyOptions.className = 'linkify';
    msgContent = linkifyHtml(msgContent, linkifyOptions);
  }

  // Final Result
  msgContent = $('<span>').html(msgContent);
  msgContent.find('.linkify').on('click', event => { const e = event.originalEvent; e.preventDefault(); openTinyURL($(e.target).attr('href')); return false; });

  // Complete
  return msgContent;

};

// Functions
export function twemojify(text, opts, linkifyEnabled = false, sanitize = true) {
  return twemojifyAction(text, opts, linkifyEnabled, sanitize, false, false);
}

export function twemojifyReact(text, opts, linkifyEnabled = false, sanitize = true, maths = false) {
  return twemojifyAction(text, opts, linkifyEnabled, sanitize, maths, true);
};

export function twemojifyIcon(text, size = 72) {
  return `${TWEMOJI_BASE_URL}${size}x${size}/${text.emojiToCode().toLowerCase()}.png`;
}
