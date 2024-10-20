/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useState, useEffect, useRef, useReducer } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import { ClientEvent } from 'matrix-js-sdk';
import parse from 'html-react-parser';
import twemoji from 'twemoji';

import useIsVisible from '@src/util/useIsVisible';

import matrixAppearance from '@src/util/libs/appearance';
import EmojiEvents from '@src/util/libs/emoji/EmojiEvents';
import emojiEditor from '@src/util/libs/emoji/EmojiEditor';
import { colorMXID } from '@src/util/colorMXID';
import { avatarDefaultColor } from '@src/app/atoms/avatar/Avatar';
import Img from '@src/app/atoms/image/Image';

import { emojis } from './emoji';
import { loadEmojiData, getEmojiData, ROW_EMOJIS_COUNT, ROW_STICKERS_COUNT } from './emojiData';

import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import navigation from '../../../client/state/navigation';
import AsyncSearch from '../../../util/AsyncSearch';
import { addToEmojiList, removeFromEmojiList } from './recent';
import { TWEMOJI_BASE_URL, twemojifyUrl } from '../../../util/twemojify';
import { checkVisible } from '../../../util/tools';

import Text from '../../atoms/text/Text';
import IconButton from '../../atoms/button/IconButton';
import Input from '../../atoms/input/Input';
import ScrollView from '../../atoms/scroll/ScrollView';
import { emojiCateogoryList as cateogoryList, emojiGroups } from './data/emojibase-data';

// Emoji Config
let ROW_COUNT;

// Emoji Groups
const EmojiGroup = React.memo(
  ({ boardType = null, name, groupEmojis, className, isFav = false }) => {
    const tinyRef = useRef(null);
    const isIntersecting = useIsVisible(tinyRef);

    function getEmojiBoard() {
      const emojiBoard = [];
      const totalEmojis = groupEmojis.length;
      const mxcUrl = initMatrix.mxcUrl;

      // Read emoji data
      for (let r = 0; r < totalEmojis; r += ROW_COUNT) {
        const emojiRow = [];
        for (let c = r; c < r + ROW_COUNT; c += 1) {
          // Prepare data
          const emojiIndex = c;
          if (emojiIndex >= totalEmojis) break;
          const emoji = groupEmojis[emojiIndex];
          let emojiItem;

          // Hex code
          if (emoji.hexcode) {
            emojiItem = (
              // This is a unicode emoji, and should be rendered with twemoji
              <span
                className={`emoji${emoji.isFav || isFav ? ' fav-emoji' : ''}`}
                draggable="false"
                version={emoji.version?.toString()}
                alt={emoji.shortcodes?.toString()}
                unicode={emoji.unicode}
                shortcodes={emoji.shortcodes?.toString()}
                tags={emoji.tags?.toString()}
                label={emoji.label?.toString()}
                hexcode={emoji.hexcode}
                style={{ backgroundImage: `url("${twemojifyUrl(emoji.hexcode)}")` }}
              />
            );
          }

          // Custom emoji
          else {
            emojiItem = (
              // This is a custom emoji, and should be render as an mxc
              <Img
                queueId="emoji"
                isEmoji={boardType === 'emoji'}
                isSticker={boardType === 'sticker'}
                className={`emoji${emoji.isFav || isFav ? ' fav-emoji' : ''}`}
                draggable="false"
                alt={emoji.shortcode}
                unicode={`:${emoji.shortcode}:`}
                shortcodes={emoji.shortcode}
                src={mxcUrl.toHttp(emoji.mxc)}
                dataMxEmoticon={emoji.mxc}
              />
            );
          }

          // Insert emoji
          emojiRow.push(<span key={emojiIndex}>{emojiItem}</span>);
        }
        emojiBoard.push(
          <div key={r} className={`emoji-row${!isIntersecting ? ' hide-emoji' : ''}`}>
            {emojiRow}
          </div>,
        );
      }
      return emojiBoard;
    }

    return (
      <div ref={tinyRef} className={`emoji-group${className ? ` ${className}` : ''}`}>
        <Text className="emoji-group__header" variant="b2" weight="bold">
          {name}
        </Text>
        {groupEmojis.length !== 0 && <div className="emoji-set noselect">{getEmojiBoard()}</div>}
      </div>
    );
  },
);

EmojiGroup.propTypes = {
  boardType: PropTypes.string,
  isFav: PropTypes.bool,
  className: PropTypes.string,
  name: PropTypes.string.isRequired,
  groupEmojis: PropTypes.arrayOf(
    PropTypes.shape({
      length: PropTypes.number,
      unicode: PropTypes.string,
      hexcode: PropTypes.string,
      mxc: PropTypes.string,
      shortcode: PropTypes.string,
      shortcodes: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    }),
  ).isRequired,
};

// Search Emoji
const asyncSearch = new AsyncSearch();
asyncSearch.setup(emojis, {
  keys: ['shortcode', 'shortcodes', 'label', 'tags'],
  isContain: true,
  limit: 40,
});
function SearchedEmoji({ boardType = null }) {
  // Searched
  const [searchedEmojis, setSearchedEmojis] = useState(null);

  // Set Search
  function handleSearchEmoji(resultEmojis, term) {
    if (term === '' || resultEmojis.length === 0) {
      if (term === '') setSearchedEmojis(null);
      else setSearchedEmojis({ emojis: [] });
      return;
    }

    setSearchedEmojis({ emojis: resultEmojis });
  }

  // Effect
  useEffect(() => {
    asyncSearch.on(asyncSearch.RESULT_SENT, handleSearchEmoji);
    return () => {
      asyncSearch.removeListener(asyncSearch.RESULT_SENT, handleSearchEmoji);
    };
  }, []);

  // Nothing
  if (searchedEmojis === null) return false;

  // Complete
  return (
    <EmojiGroup
      boardType={boardType}
      key="-1"
      name={searchedEmojis.emojis.length === 0 ? 'No search result found' : 'Search results'}
      groupEmojis={searchedEmojis.emojis}
    />
  );
}

// Board
function EmojiBoard({ onSelect, searchRef, emojiBoardRef }) {
  // First Values
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const emojiInfo = useRef(null);
  const [boardType, setBoardType] = useState('emoji');
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const scrollEmojisRef = useRef(null);

  const tinyTimeoutCollection = [];
  const [emojiFav, setEmojiFav] = useState([]);
  const [emojiData, setEmojiData] = useState([]);
  const [emojiRecent, setEmojiRecent] = useState([]);

  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;

  ROW_COUNT = boardType !== 'sticker' ? ROW_EMOJIS_COUNT : ROW_STICKERS_COUNT;
  loadEmojiData(selectedRoomId);
  getEmojiData(
    boardType,
    emojiRecent,
    emojiFav,
    emojiData,
    setEmojiRecent,
    setEmojiFav,
    setEmojiData,
  );

  function isTargetNotEmoji(target) {
    return target.hasClass('emoji') === false;
  }

  function getEmojiDataFromTarget(target) {
    const unicode = target.attr('unicode');
    const hexcode = target.attr('hexcode');
    const href = target.attr('href');
    const src = target.attr('src');
    const mxc = target.attr('data-mx-emoticon');
    const label = target.attr('label');
    let tags = target.attr('tags');
    let shortcodes = target.attr('shortcodes');

    if (typeof shortcodes === 'undefined') shortcodes = undefined;
    else shortcodes = shortcodes.split(',');

    if (typeof tags === 'undefined') tags = undefined;
    else tags = tags.split(',');

    return {
      src,
      href,
      unicode,
      hexcode,
      shortcodes,
      mxc,
      tags,
      label,
    };
  }

  function selectEmoji(e) {
    const el = $(e.target);
    if (isTargetNotEmoji(el)) return;

    const emoji = getEmojiDataFromTarget(el);
    onSelect(emoji);

    if (emoji.hexcode) {
      addToEmojiList(
        { isCustom: false, unicode: emoji.unicode, mxc: null },
        'recent_emoji',
        $(emojiBoardRef.current).attr('board-type'),
      );
    } else {
      addToEmojiList(
        { isCustom: true, unicode: null, mxc: el.attr('data-mx-emoticon') },
        'recent_emoji',
        $(emojiBoardRef.current).attr('board-type'),
      );
    }
  }

  function contextEmoji(e) {
    e.preventDefault();

    const el = $(e.target);
    if (isTargetNotEmoji(el)) return false;

    const emoji = getEmojiDataFromTarget(el);

    const typesAdd = {
      custom: { isCustom: true, unicode: null, mxc: el.attr('data-mx-emoticon') },
      noCustom: { isCustom: false, unicode: emoji.unicode, mxc: null },
    };

    if (!el.hasClass('fav-emoji')) {
      el.addClass('fav-emoji');

      if (emoji.hexcode) {
        addToEmojiList(
          typesAdd.noCustom,
          'fav_emoji',
          $(emojiBoardRef.current).attr('board-type'),
          200,
        );
      } else {
        addToEmojiList(
          typesAdd.custom,
          'fav_emoji',
          $(emojiBoardRef.current).attr('board-type'),
          200,
        );
      }
    } else {
      el.removeClass('fav-emoji');

      if (emoji.hexcode) {
        removeFromEmojiList(
          typesAdd.noCustom,
          'fav_emoji',
          $(emojiBoardRef.current).attr('board-type'),
        );
      } else {
        removeFromEmojiList(
          typesAdd.custom,
          'fav_emoji',
          $(emojiBoardRef.current).attr('board-type'),
        );
      }
    }

    return false;
  }

  function setEmojiInfo(emoji) {
    const el = $(emojiInfo.current);
    const infoEmoji = el.find('>:first-child >:first-child');
    const infoShortcode = el.find('>:last-child');

    infoEmoji.attr('src', emoji.src);
    infoEmoji.attr('alt', emoji.unicode);

    if (typeof emoji.label !== 'string' || emoji.label.trim().length < 1) {
      infoShortcode.text(`:${emoji.shortcode}:`);
    } else {
      infoShortcode.text(emoji.label);
    }
  }

  function hoverEmoji(e) {
    const el = $(e.target);
    const searchEl = $(searchRef.current);
    if (isTargetNotEmoji(el)) return;

    const { shortcodes, unicode, label, tags } = getEmojiDataFromTarget(el);

    let src;

    if (el.prop('tagName').toUpperCase() !== 'IMG') {
      if (el.css('background-image'))
        src = el.css('background-image').substring(5, el.css('background-image').length - 2);
    } else {
      src = el.attr('src');
    }

    if (!src || typeof shortcodes === 'undefined') {
      searchEl.attr('placeholder', 'Search');
      setEmojiInfo({
        unicode: '🙂',
        shortcode: 'slight_smile',
        src: twemojifyUrl('1f642'),
      });
      return;
    }

    if (searchEl.attr('placeholder') === shortcodes[0]) return;
    searchEl.attr('placeholder', shortcodes[0]);
    setEmojiInfo({ shortcode: shortcodes[0], src, unicode, label, tags });
  }

  function handleSearchChange() {
    const term = $(searchRef.current).val();
    asyncSearch.search(term);
    $(scrollEmojisRef.current).scrollTop(0);
  }

  if (emojiBoardRef.current) {
    if (boardType === 'emoji') {
      ROW_COUNT = ROW_EMOJIS_COUNT;
    }

    if (boardType === 'sticker') {
      ROW_COUNT = ROW_STICKERS_COUNT;
    }
  }

  const recentOffset = emojiRecent.length > 0 ? 1 : 0;
  const favOffset = emojiFav.length > 0 ? 1 : 0;

  useEffect(() => {
    const handleEvent = (event) => {
      if (emojiEditor.isEmojiEvent(event)) forceUpdate();
    };

    const handleEvent2 = () => {
      handleEvent({
        getType: () => {
          const tinyData = { eventType: EmojiEvents.UserEmotes };
          return tinyData;
        },
      });
    };
    const updateAvailableEmoji = async (newRoomId) => setSelectedRoomId(newRoomId);

    const onOpen = (roomId, cords, requestEmojiCallback, dom) => {
      $(searchRef.current).val('');
      handleSearchChange();
      setBoardType(dom);
      forceUpdate();
    };

    mx.addListener(ClientEvent.AccountData, handleEvent);
    matrixAppearance.on('useCustomEmojis', handleEvent2);
    matrixAppearance.on('showStickers', handleEvent2);
    navigation.on(cons.events.navigation.UPDATED_EMOJI_LIST_DATA, handleEvent2);
    navigation.on(cons.events.navigation.ROOM_SELECTED, updateAvailableEmoji);
    navigation.on(cons.events.navigation.EMOJIBOARD_OPENED, onOpen);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleEvent);
      matrixAppearance.off('useCustomEmojis', handleEvent2);
      matrixAppearance.off('showStickers', handleEvent2);
      navigation.removeListener(cons.events.navigation.UPDATED_EMOJI_LIST_DATA, handleEvent2);
      navigation.removeListener(cons.events.navigation.ROOM_SELECTED, updateAvailableEmoji);
      navigation.removeListener(cons.events.navigation.EMOJIBOARD_OPENED, onOpen);
    };
  }, []);

  function openGroup(groupOrder) {
    let tabIndex = groupOrder;
    const $emojiContent = $(scrollEmojisRef.current).find('>:first-child');

    const groupCount = $emojiContent.length;
    if (groupCount > emojiGroups.length) {
      tabIndex += groupCount - emojiGroups.length - emojiData.length - recentOffset - favOffset;
    }

    $emojiContent.children().get(tabIndex).scrollIntoView();
  }

  const categoryReader = ([indx, ico, name]) => (
    <IconButton
      onClick={() => openGroup(recentOffset + favOffset + emojiData.length + indx)}
      key={indx}
      fa={ico}
      tooltip={name}
      tooltipPlacement="left"
    />
  );

  setTimeout(() => {
    $('#emoji-board').parent().parent().parent().parent().parent().addClass('emoji-board-tippy');
  }, 500);

  return (
    <div id="emoji-board" className="emoji-board" ref={emojiBoardRef}>
      <ScrollView invisible>
        <div className="emoji-board__nav">
          {emojiFav.length > 0 && (
            <IconButton
              onClick={() => openGroup(0)}
              fa="fa-solid fa-star"
              tooltip="Favorites"
              tooltipPlacement="left"
            />
          )}

          {emojiRecent.length > 0 && (
            <IconButton
              onClick={() => openGroup(1)}
              fa="fa-solid fa-clock-rotate-left"
              tooltip="Recent"
              tooltipPlacement="left"
            />
          )}

          <div className="emoji-board__nav-custom">
            {emojiData.map((pack) => {
              const packItems = pack[boardType !== 'sticker' ? 'getEmojis' : 'getStickers']();
              let tinySrc = pack.avatarUrl;
              if (!tinySrc && packItems && packItems[0]) tinySrc = packItems[0].mxc;
              const src = tinySrc
                ? mxcUrl.toHttp(tinySrc)
                : avatarDefaultColor(colorMXID(pack.displayName ?? 'Unknown'));

              return (
                <IconButton
                  className="emoji-group-button"
                  onClick={() => openGroup(recentOffset + favOffset + pack.packIndex)}
                  src={src}
                  key={pack.packIndex}
                  tooltip={pack.displayName ?? 'Unknown'}
                  tooltipPlacement="left"
                  isImage
                />
              );
            })}
          </div>
          <div className="emoji-board__nav-twemoji">
            {boardType === 'emoji' ? cateogoryList.map(categoryReader) : [].map(categoryReader)}
          </div>
        </div>
      </ScrollView>
      <div className="emoji-board__content">
        <div className="emoji-board__content__search">
          <Input onChange={handleSearchChange} forwardRef={searchRef} placeholder="Search" />
        </div>
        <div className="emoji-board__content__emojis">
          <ScrollView ref={scrollEmojisRef} autoHide>
            <div onMouseMove={hoverEmoji} onContextMenu={contextEmoji} onClick={selectEmoji}>
              <SearchedEmoji boardType={boardType} />

              {emojiFav.length > 0 && (
                <EmojiGroup boardType={boardType} name="Favorites" groupEmojis={emojiFav} isFav />
              )}

              {emojiRecent.length > 0 && (
                <EmojiGroup boardType={boardType} name="Recently used" groupEmojis={emojiRecent} />
              )}

              {emojiData.map((pack) => (
                <EmojiGroup
                  boardType={boardType}
                  name={pack.displayName ?? 'Unknown'}
                  key={pack.packIndex}
                  groupEmojis={pack[boardType !== 'sticker' ? 'getEmojis' : 'getStickers']()}
                  className="custom-emoji-group"
                />
              ))}

              {emojiGroups.map((group) => (
                <EmojiGroup
                  boardType={boardType}
                  className={boardType === 'sticker' ? 'd-none' : null}
                  key={group.name}
                  name={group.name}
                  groupEmojis={group.emojis}
                />
              ))}
            </div>
          </ScrollView>
        </div>
        <div ref={emojiInfo} className="emoji-board__content__info">
          <div>{parse(twemoji.parse('🙂', { base: TWEMOJI_BASE_URL }))}</div>
          <Text>:slight_smile:</Text>
        </div>
      </div>
    </div>
  );
}

EmojiBoard.propTypes = {
  onSelect: PropTypes.func.isRequired,
  searchRef: PropTypes.shape({}).isRequired,
  emojiBoardRef: PropTypes.shape({}).isRequired,
};

export default EmojiBoard;
