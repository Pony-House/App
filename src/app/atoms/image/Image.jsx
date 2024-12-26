import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import tinyConsole from '@src/util/libs/console';
import { jQueryState } from '@src/util/libs/jquery';
import blobUrlManager from '@src/util/libs/blobUrlManager';
import initMatrix from '@src/client/initMatrix';
import { imageExts } from '@src/util/MimesUtil';

import matrixAppearance, {
  getAnimatedImageUrl,
  getAppearance,
} from '../../../util/libs/appearance';
import Tooltip from '../tooltip/Tooltip';

const showErrorMessage = (err) => {
  if (__ENV_APP__.IMG.SHOW_ERROR || __ENV_APP__.MODE === 'development') tinyConsole.error(err);
};

const getTinyUrl = (mxcUrl, src) => {
  return typeof src === 'string' && src.startsWith('mxc://') && mxcUrl && mxcUrl.toHttp
    ? mxcUrl.toHttp(src)
    : src;
};

const filterAvatarAnimation = (avatarSrc, animAvatarSrc) => {
  if (animAvatarSrc && avatarSrc)
    return !getAppearance('enableAnimParams') ? animAvatarSrc : getAnimatedImageUrl(avatarSrc);
  return null;
};

const createImageCanvas = (mainBlob, onLoad, onError) => {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.alt = 'Image.jsx canvas';
    img.onload = () => {
      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const w = (canvas.width = img.width);
      const h = (canvas.height = img.height);

      // Draw canvas
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((canvasBlob) => {
        if (onLoad) onLoad(canvasBlob);
        ctx.clearRect(0, 0, w, h);
      }, 'image/webp');
    };

    // Error
    img.onerror = onError;

    // Load now
    img.src = mainBlob;
  } catch (err) {
    if (onError) onError(err);
  }
};

const Img = React.forwardRef(
  (
    {
      ignoreAuth = false,
      bgColor = 0,
      animParentsCount = 0,
      draggable = 'false',
      queueId = 'default',
      style = null,
      height = null,
      width = null,
      src = null,
      animSrc = null,
      errSrc = null,
      alt = null,
      className = null,
      id = null,
      onLoad = null,
      onClick = null,
      onError = null,
      onLoadingChange = null,
      dataMxEmoticon = null,
      isDefaultImage = false,
      disableBase = false,
      isObj = false,
      getDefaultImage = null,
      customMxcUrl = null,
      placement = null,
      content = null,
      isSticker = false,
      isEmoji = false,
      unicode = null,
      shortcodes = null,
      label = null,
      tags = null,
      hexcode = null,
    },
    ref,
  ) => {
    // Ref
    const mxcUrl = initMatrix.mxcUrl || customMxcUrl;
    const imgRef = ref || useRef(null);

    const url = getTinyUrl(mxcUrl, src);
    const animUrl = filterAvatarAnimation(url, getTinyUrl(mxcUrl, animSrc));

    // Image Broken
    let ImageBrokenSVG = errSrc || './img/svg/image-broken.svg';

    // Get Url
    let tinyImageUrl = url;
    let tinyImageAnimUrl = animUrl;
    if (
      isDefaultImage &&
      getDefaultImage &&
      (typeof bgColor === 'number' || typeof bgColor === 'string')
    ) {
      const defaultAvatar = getDefaultImage(bgColor);
      if (typeof tinyImageUrl !== 'string' || tinyImageUrl.length < 1) {
        tinyImageUrl = defaultAvatar;
      }
      ImageBrokenSVG = defaultAvatar;
    }

    // Prepare data
    const [useFreezePlugin, setFreezePlugin] = useState(getAppearance('useFreezePlugin'));
    const [waitSrc, setWaitSrc] = useState(tinyImageUrl);

    const [imgMime, setImgMime] = useState([]);
    const [imgMimeAnim, setImgMimeAnim] = useState([]);

    const [blobSrc, setBlobSrc] = useState(null);
    const [blobAnimSrc, setBlobAnimSrc] = useState(null);

    const [isLoading, setIsLoading] = useState(0);
    const [useAnimation, setUseAnimation] = useState(false);

    // Get data
    useEffect(() => {
      if (waitSrc !== tinyImageUrl) {
        setWaitSrc(tinyImageUrl);
        setIsLoading(0);
        if (onLoadingChange) onLoadingChange(0);
      }

      // Avatar Config
      const usingFreezePlugin = useFreezePlugin && tinyImageAnimUrl;
      if (isLoading < 1) {
        // Complete checker
        let isLoadingProgress = 0;
        const isComplete = () => {
          if (isLoading < 2 && isLoadingProgress < 1) {
            if (tinyImageUrl === waitSrc) {
              setIsLoading(2);
              if (onLoadingChange) onLoadingChange(2);
            }
          }
        };

        // Active load progress
        const progressLoad = (tinySrc, setTinyBlob, setTinyMime, isAnim) => {
          // Enable loading mode
          setIsLoading(1);
          if (onLoadingChange) onLoadingChange(1);

          // The new image is string
          if (typeof tinySrc === 'string' && tinySrc.length > 0) {
            // Exist blob cache?
            const blobFromId = blobUrlManager.getById(`userAvatar:${tinySrc}`);
            if (blobFromId) {
              if (tinyImageUrl === waitSrc) {
                setTinyMime(blobUrlManager.getMime(blobFromId));
                setTinyBlob(blobFromId);
              }
            }

            // Nope. Let's create a new one.
            else {
              // Reset image data
              if (tinyImageUrl === waitSrc) {
                setTinyBlob(null);
                setTinyMime([]);
              }

              // Is normal image? Reset the animation version too.
              if (!isAnim) {
                if (tinyImageUrl === waitSrc) {
                  setBlobAnimSrc(null);
                  setImgMimeAnim([]);
                }
              }

              // Add loading progress...
              isLoadingProgress++;
              mxcUrl
                .focusFetchBlob(tinySrc, 'image', null, null, queueId, ignoreAuth)
                .then((blobFromFetch) => {
                  const mime =
                    typeof blobFromFetch.type === 'string' ? blobFromFetch.type.split('/') : [];
                  if (mime[0] === 'image' && imageExts.indexOf(mime[1]) > -1) {
                    if (tinyImageUrl === waitSrc) setTinyMime(mime);
                    return blobUrlManager.insert(blobFromFetch, {
                      freeze: true,
                      group: `user_avatars`,
                      id: `userAvatar:${tinySrc}`,
                    });
                  }
                  throw new Error(
                    `INVALID IMAGE MIME MXC! The "${tinySrc}" is "${blobFromFetch.type}".`,
                  );
                })
                // Complete
                .then((blobUrl) => {
                  // Insert data
                  if (tinyImageUrl === waitSrc) {
                    setTinyBlob(blobUrl);
                  }

                  // Check the progress
                  isLoadingProgress--;
                  isComplete();
                })
                // Error
                .catch((err) => {
                  // Set image error
                  if (tinyImageUrl === waitSrc) {
                    setTinyBlob(ImageBrokenSVG);
                    setTinyMime([]);
                    showErrorMessage(err);
                    if (onError) onError(err);
                  }

                  // Check the progress
                  isLoadingProgress--;
                  isComplete();
                });
            }
          }
          // Nothing
          else {
            if (tinyImageUrl === waitSrc) {
              setTinyBlob(null);
              setTinyMime([]);
            }
          }
        };

        // Execute the image loading

        // Normal image
        if (
          !tinyImageUrl ||
          (!tinyImageUrl.startsWith('blob:') &&
            !tinyImageUrl.startsWith('data:') &&
            !tinyImageUrl.startsWith('./'))
        ) {
          if (!usingFreezePlugin) progressLoad(tinyImageUrl, setBlobSrc, setImgMime, false);
          else if (tinyImageUrl) {
            // Get freeze cache
            const blobFromId = blobUrlManager.getById(`freezeUserAvatar:${tinyImageUrl}`);
            if (blobFromId) {
              // Set data
              setImgMime(['image', 'webp']);
              setBlobSrc(blobFromId);
            }

            // Nothing. Create new one
            else {
              // Enable loading mode
              isLoadingProgress++;
              setIsLoading(1);
              if (onLoadingChange) onLoadingChange(1);
              createImageCanvas(
                tinyImageUrl,
                (canvasBlob) => {
                  // Freeze gif now
                  try {
                    if (canvasBlob) {
                      blobUrlManager
                        .insert(canvasBlob, {
                          freeze: true,
                          group: `user_avatars`,
                          id: `freezeUserAvatar:${tinyImageUrl}`,
                        })
                        .then((newTinyUrl) => {
                          if (tinyImageUrl === waitSrc) {
                            // Set data
                            setImgMime(['image', 'webp']);
                            setBlobSrc(newTinyUrl);

                            // Check the progress
                            isLoadingProgress--;
                            isComplete();
                          }
                        })
                        .catch((err) => {
                          if (tinyImageUrl === waitSrc) {
                            setBlobSrc(ImageBrokenSVG);
                            setImgMime([]);
                            showErrorMessage(err);
                            if (onError) onError(err);
                          }

                          // Check the progress
                          isLoadingProgress--;
                          isComplete();
                        });
                    } else {
                      if (tinyImageUrl === waitSrc) {
                        const err = new Error('Fail to create image blob.');
                        setBlobSrc(ImageBrokenSVG);
                        setImgMime([]);
                        showErrorMessage(err);
                        if (onError) onError(err);
                      }

                      // Check the progress
                      isLoadingProgress--;
                      isComplete();
                    }
                  } catch (err) {
                    if (tinyImageUrl === waitSrc) {
                      // Error
                      setBlobSrc(ImageBrokenSVG);
                      setImgMime([]);
                      showErrorMessage(err);
                      if (onError) onError(err);
                    }

                    // Check the progress
                    isLoadingProgress--;
                    isComplete();
                  }
                },

                // Error
                (err) => {
                  if (tinyImageUrl === waitSrc) {
                    setBlobSrc(ImageBrokenSVG);
                    setImgMime([]);
                    showErrorMessage(err);
                    if (onError) onError(err);
                  }

                  // Check the progress
                  isLoadingProgress--;
                  isComplete();
                },
              );
            }
          } else {
            setBlobSrc(ImageBrokenSVG);
            setImgMime([]);
            const err = new Error('File not found.');
            showErrorMessage(err);
            if (onError) onError(err);
          }
        } else {
          if (tinyImageUrl.startsWith('./')) {
            const filename = tinyImageUrl.split('.');
            setImgMime(['image', filename[filename.length - 1]]);
          }
          setBlobSrc(tinyImageUrl);
        }

        // Anim image
        if (
          !tinyImageAnimUrl ||
          (!tinyImageAnimUrl.startsWith('blob:') &&
            !tinyImageAnimUrl.startsWith('data:') &&
            !tinyImageAnimUrl.startsWith('./'))
        ) {
          progressLoad(tinyImageAnimUrl, setBlobAnimSrc, setImgMimeAnim, true);
        } else {
          if (tinyImageAnimUrl.startsWith('./')) {
            const filename = tinyImageAnimUrl.split('.');
            setImgMimeAnim(['image', filename[filename.length - 1]]);
          }
          setBlobAnimSrc(tinyImageAnimUrl);
        }

        // Check the progress
        isComplete();
      }

      // Anim Parents Counter
      if (blobAnimSrc && blobAnimSrc !== blobSrc) {
        let tinyNode;
        if (typeof animUrl === 'string' && animUrl.length > 0) {
          const img = $(imgRef.current);
          if (img.length > 0) {
            tinyNode = img.get(0);
            if (tinyNode) {
              for (let i = 0; i < animParentsCount; i++) {
                if (tinyNode.parentNode) tinyNode = tinyNode.parentNode;
              }
            }
          }
        }

        const animationTransitionIn = () => setUseAnimation(true);
        const animationTransitionOut = () => setUseAnimation(false);
        const tinyQuery = tinyNode ? $(tinyNode) : null;
        if (tinyNode) {
          tinyQuery.on('mouseover', animationTransitionIn);
          tinyQuery.on('mouseout', animationTransitionOut);
        }

        return () => {
          if (tinyNode) {
            tinyQuery.off('mouseover', animationTransitionIn);
            tinyQuery.off('mouseout', animationTransitionOut);
          }
        };
      }
    });

    // Settings update
    useEffect(() => {
      const tinyUpdate = (value) => {
        setFreezePlugin(value);
        setBlobSrc(null);
        setBlobAnimSrc(null);
        setImgMime([]);
        setImgMimeAnim([]);
        setIsLoading(0);
      };
      matrixAppearance.on('useFreezePlugin', tinyUpdate);
      return () => {
        matrixAppearance.off('useFreezePlugin', tinyUpdate);
      };
    });

    // Image
    if (isLoading >= 2) {
      const theImage =
        blobSrc &&
        ((Array.isArray(imgMime) && imgMime[0] === 'image') ||
          tinyImageUrl.startsWith('blob:') ||
          tinyImageUrl.startsWith('data:'))
          ? !blobAnimSrc ||
            blobAnimSrc === blobSrc ||
            !useAnimation ||
            (Array.isArray(imgMimeAnim) && imgMimeAnim[1] !== 'gif' && imgMimeAnim[1] !== 'webp')
            ? blobSrc
            : blobAnimSrc
          : ImageBrokenSVG;

      if (!isObj) {
        const theTinyImg = (
          <img
            ignore_auth={ignoreAuth ? 'true' : null}
            itemProp="image"
            label={label}
            tags={typeof tags === 'string' ? tags : Array.isArray(tags) ? tags.join(',') : null}
            hexcode={hexcode}
            unicode={unicode}
            shortcodes={shortcodes}
            onLoad={onLoad}
            className={className}
            onClick={onClick}
            ref={imgRef}
            data-mx-emoticon={dataMxEmoticon}
            height={height}
            width={width}
            id={id}
            style={style}
            draggable={draggable}
            src-url={tinyImageUrl}
            src-anim-url={tinyImageAnimUrl}
            img-type={isEmoji ? 'emoji' : isSticker ? 'sticker' : null}
            alt={alt}
            onError={({ currentTarget }) => {
              currentTarget.onerror = (err) => {
                showErrorMessage(err);
                if (onError) onError(err);
              };
              if (tinyImageUrl === waitSrc) {
                setBlobSrc(ImageBrokenSVG);
                setBlobAnimSrc(ImageBrokenSVG);
                setIsLoading(2);
                if (onLoadingChange) onLoadingChange(2);
              }
            }}
            src={theImage}
          />
        );

        return !placement ? (
          theTinyImg
        ) : (
          <Tooltip placement={placement} content={content}>
            {theTinyImg}
          </Tooltip>
        );
      }
      return { src: theImage, loading: false, href: tinyImageUrl, hrefAnim: tinyImageAnimUrl };
    }

    // Loading Image base
    else if (!disableBase) {
      const finalStyle = {};
      if (typeof height === 'number') finalStyle.height = height;
      if (typeof width === 'number') finalStyle.width = width;

      if (style) {
        for (const item in style) {
          finalStyle[item] = style[item];
        }
      }

      if (!isObj)
        return (
          <div
            ignore_auth={ignoreAuth ? 'true' : null}
            itemProp="image"
            unicode={unicode}
            hexcode={hexcode}
            label={label}
            tags={typeof tags === 'string' ? tags : Array.isArray(tags) ? tags.join(',') : null}
            shortcodes={shortcodes}
            className={`d-inline-block img-container${className ? ` ${className}` : ''}`}
            onClick={onClick}
            ref={imgRef}
            data-mx-emoticon={dataMxEmoticon}
            height={height}
            width={width}
            id={id}
            style={finalStyle}
            src-url={tinyImageUrl}
            src-anim-url={tinyImageAnimUrl}
            img-type={isEmoji ? 'emoji' : isSticker ? 'sticker' : null}
            alt={alt}
          />
        );
      return { src: null, loading: true, href: tinyImageUrl, hrefAnim: tinyImageAnimUrl };
    }

    // Nothing
    if (!isObj) return null;
    return { src: null, loading: false, href: tinyImageUrl, hrefAnim: tinyImageAnimUrl };
  },
);

const imgPropTypes = {
  queueId: PropTypes.string,
  ignoreAuth: PropTypes.bool,
  onLoadingChange: PropTypes.func,
  getDefaultImage: PropTypes.func,
  bgColor: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  animParentsCount: PropTypes.number,
  isDefaultImage: PropTypes.bool,
  disableBase: PropTypes.bool,
  isObj: PropTypes.bool,
  dataMxEmoticon: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool]),
  draggable: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  style: PropTypes.object,
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  src: PropTypes.string,
  animSrc: PropTypes.string,
  errSrc: PropTypes.string,
  alt: PropTypes.string,
  className: PropTypes.string,
  id: PropTypes.string,
  onLoad: PropTypes.func,
  onClick: PropTypes.func,
  onError: PropTypes.func,
  placement: PropTypes.string,
  content: PropTypes.node,
  isSticker: PropTypes.bool,
  isEmoji: PropTypes.bool,
  label: PropTypes.string,
  tags: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
  hexcode: PropTypes.string,
  unicode: PropTypes.string,
  shortcodes: PropTypes.string,
};
Img.propTypes = imgPropTypes;

export default Img;

function ImgJquery({
  ignoreAuth = false,
  bgColor = 0,
  animParentsCount = 0,
  draggable = 'false',
  queueId = 'default',
  style = null,
  height = null,
  width = null,
  src = null,
  animSrc = null,
  errSrc = null,
  alt = null,
  className = null,
  id = null,
  onLoad = null,
  onClick = null,
  onError = null,
  onLoadingChange = null,
  dataMxEmoticon = null,
  isDefaultImage = false,
  disableBase = false,
  isObj = false,
  getDefaultImage = null,
  customMxcUrl = null,
  isSticker = false,
  isEmoji = false,
  unicode = null,
  shortcodes = null,
  label = null,
  tags = null,
  hexcode = null,
}) {
  const mxcUrl = initMatrix.mxcUrl || customMxcUrl;

  const url = getTinyUrl(mxcUrl, src);
  const animUrl = filterAvatarAnimation(url, getTinyUrl(mxcUrl, animSrc));

  // Image Broken
  let ImageBrokenSVG = errSrc || './img/svg/image-broken.svg';

  // Get Url
  let tinyImageUrl = url;
  let tinyImageAnimUrl = animUrl;
  if (
    isDefaultImage &&
    getDefaultImage &&
    (typeof bgColor === 'number' || typeof bgColor === 'string')
  ) {
    const defaultAvatar = getDefaultImage(bgColor);
    if (typeof tinyImageUrl !== 'string' || tinyImageUrl.length < 1) {
      tinyImageUrl = defaultAvatar;
    }
    ImageBrokenSVG = defaultAvatar;
  }

  // Normal image base
  let img;
  if (!isObj) {
    if (!disableBase) {
      // Build container
      img = $('<div>', {
        'img-type': isEmoji ? 'emoji' : isSticker ? 'sticker' : null,
        class: `d-inline-block img-container${className ? ` ${className}` : ''}`,
        'data-mx-emoticon': dataMxEmoticon,
        height,
        width,
        id,
        alt,
        'src-url': tinyImageUrl,
        'src-anim-url': tinyImageAnimUrl,
      });

      img.attr('itemprop', 'image');
      if (tags)
        img.attr(
          'tags',
          typeof tags === 'string' ? tags : Array.isArray(tags) ? tags.join(',') : null,
        );
      if (alt) img.attr('alt', alt);
      if (hexcode) img.attr('hexcode', hexcode);
      if (unicode) img.attr('unicode', unicode);
      if (shortcodes) img.attr('shortcodes', shortcodes);
      if (ignoreAuth) img.attr('ignore_auth', 'true');

      // Insert Data
      if (style) img.css(style);
      if (onLoad) img.on('load', onLoad);
      if (onClick) img.on('click', onClick);
      if (onError) img.on('error', onError);
      img.on('error', showErrorMessage);
    }

    // Nope
    else {
      img = $('<span>');
    }
  } else {
    img = {
      src: tinyImageUrl,
      animSrc: tinyImageAnimUrl,
      err: null,
    };
  }

  // Start image script
  const startLoadImage = () => {
    // Prepare data
    const [, setImgMime] = jQueryState([]);
    const [, setImgMimeAnim] = jQueryState([]);

    const [blobSrc, setBlobSrc] = jQueryState(null);
    const [blobAnimSrc, setBlobAnimSrc] = jQueryState(null);

    const tinyComplete = () => {
      if (!isObj) {
        const ops = {
          'img-type': isEmoji ? 'emoji' : isSticker ? 'sticker' : null,
          'data-mx-emoticon': dataMxEmoticon,
          id,
          class: className,
          alt,
          height,
          width,
          'src-url': tinyImageUrl,
          'src-anim-url': tinyImageAnimUrl,
        };

        const finalImg = $('<img>', ops);
        img.replaceWith(finalImg);
        finalImg.attr('itemprop', 'image');

        if (tags)
          finalImg.attr(
            'tags',
            typeof tags === 'string' ? tags : Array.isArray(tags) ? tags.join(',') : null,
          );
        if (alt) finalImg.attr('alt', alt);
        if (hexcode) finalImg.attr('hexcode', hexcode);
        if (unicode) finalImg.attr('unicode', unicode);
        if (shortcodes) finalImg.attr('shortcodes', shortcodes);
        if (ignoreAuth) finalImg.attr('ignore_auth', 'true');

        finalImg.on('load', (event) => {
          img.addClass('image-react-loaded');
          img.removeClass('img-container');
        });

        finalImg.on('error', (event) => {
          const e = event.originalEvent;
          e.target.src = ImageBrokenSVG;
        });

        if (style) finalImg.css(style);
        if (onLoad) finalImg.on('load', onLoad);
        if (onClick) finalImg.on('click', onClick);
        if (onError) finalImg.on('error', onError);
        finalImg.on('error', showErrorMessage);

        finalImg.attr('src', blobSrc());
        if (!draggable || draggable === 'false') finalImg.attr('draggable', 'false');

        // Anim Parents Counter
        if (blobAnimSrc() && blobAnimSrc() !== blobSrc()) {
          let tinyNode;
          if (typeof animUrl === 'string' && animUrl.length > 0) {
            tinyNode = finalImg.get(0);
            for (let i = 0; i < animParentsCount; i++) {
              if (tinyNode.parentNode) tinyNode = tinyNode.parentNode;
            }
          }

          const animationTransitionIn = () => finalImg.attr('src', blobAnimSrc());
          const animationTransitionOut = () => finalImg.attr('src', blobSrc());
          const tinyQuery = tinyNode ? $(tinyNode) : null;
          if (tinyNode) {
            tinyQuery.on('mouseover', animationTransitionIn);
            tinyQuery.on('mouseout', animationTransitionOut);
          }
        }
      } else {
        img.blobSrc = blobSrc();
        img.blobAnimSrc = blobAnimSrc();
      }
    };

    // Avatar Config
    const useFreezePlugin = getAppearance('useFreezePlugin') && tinyImageAnimUrl;

    // Starting progress
    if (onLoadingChange) onLoadingChange(0);
    let isLoadingProgress = 0;
    const isComplete = () => {
      if (isLoadingProgress < 1) {
        tinyComplete();
        if (onLoadingChange) onLoadingChange(2);
      }
    };

    // Active load progress
    const progressLoad = (tinySrc, setTinyBlob, setTinyMime, isAnim) => {
      // Enable loading mode
      if (onLoadingChange) onLoadingChange(1);

      // The new image is string
      if (typeof tinySrc === 'string' && tinySrc.length > 0) {
        // Exist blob cache?
        const blobFromId = blobUrlManager.getById(`userAvatar:${tinySrc}`);
        if (blobFromId) {
          setTinyMime(blobUrlManager.getMime(blobFromId));
          setTinyBlob(blobFromId);
        }

        // Nope. Let's create a new one.
        else {
          // Reset image data
          setTinyBlob(null);
          setTinyMime([]);

          // Is normal image? Reset the animation version too.
          if (!isAnim) {
            setBlobAnimSrc(null);
            setImgMimeAnim([]);
          }

          // Add loading progress...
          isLoadingProgress++;
          mxcUrl
            .focusFetchBlob(tinySrc, 'image', null, null, queueId, ignoreAuth)
            .then((blobFromFetch) => {
              const mime =
                typeof blobFromFetch.type === 'string' ? blobFromFetch.type.split('/') : [];
              if (mime[0] === 'image' && imageExts.indexOf(mime[1]) > -1) {
                setTinyMime(mime);
                return blobUrlManager.insert(blobFromFetch, {
                  freeze: true,
                  group: `user_avatars`,
                  id: `userAvatar:${tinySrc}`,
                });
              }
              throw new Error(
                `INVALID IMAGE MIME MXC! The "${tinySrc}" is "${blobFromFetch.type}".`,
              );
            })
            // Complete
            .then((blobUrl) => {
              // Insert data
              setTinyBlob(blobUrl);

              // Check the progress
              isLoadingProgress--;
              isComplete();
            })
            // Error
            .catch((err) => {
              // Set image error
              setTinyBlob(ImageBrokenSVG);
              setTinyMime([]);
              if (isObj) img.err = err;
              showErrorMessage(err);
              if (onError) onError(err);

              // Check the progress
              isLoadingProgress--;
              isComplete();
            });
        }
      }
      // Nothing
      else {
        setTinyBlob(null);
        setTinyMime([]);
      }
    };

    // Execute the image loading

    // Normal image
    if (
      !tinyImageUrl ||
      (!tinyImageUrl.startsWith('blob:') &&
        !tinyImageUrl.startsWith('data:') &&
        !tinyImageUrl.startsWith('./'))
    ) {
      if (!useFreezePlugin) progressLoad(tinyImageUrl, setBlobSrc, setImgMime, false);
      else if (tinyImageUrl) {
        // Get freeze cache
        const blobFromId = blobUrlManager.getById(`freezeUserAvatar:${tinyImageUrl}`);
        if (blobFromId) {
          setImgMime(['image', 'webp']);
          setBlobSrc(blobFromId);
        }

        // Nothing. Create new one
        else {
          // Enable loading mode
          isLoadingProgress++;
          if (onLoadingChange) onLoadingChange(1);
          createImageCanvas(
            tinyImageUrl,
            (canvasBlob) => {
              // Freeze gif now
              try {
                if (canvasBlob) {
                  blobUrlManager
                    .insert(canvasBlob, {
                      freeze: true,
                      group: `user_avatars`,
                      id: `freezeUserAvatar:${tinyImageUrl}`,
                    })
                    .then((newTinyUrl) => {
                      // Set data
                      setImgMime(['image', 'webp']);
                      setBlobSrc(newTinyUrl);

                      // Check the progress
                      isLoadingProgress--;
                      isComplete();
                    })
                    .catch((err) => {
                      setBlobSrc(ImageBrokenSVG);
                      setImgMime([]);
                      if (isObj) img.err = err;
                      showErrorMessage(err);
                      if (onError) onError(err);

                      // Check the progress
                      isLoadingProgress--;
                      isComplete();
                    });
                } else {
                  setBlobSrc(ImageBrokenSVG);
                  setImgMime([]);
                  const err = new Error('Fail to create image blob.');
                  if (isObj) img.err = err;
                  showErrorMessage(err);
                  if (onError) onError(err);

                  // Check the progress
                  isLoadingProgress--;
                  isComplete();
                }
              } catch (err) {
                // Error
                setBlobSrc(ImageBrokenSVG);
                setImgMime([]);
                if (isObj) img.err = err;
                showErrorMessage(err);
                if (onError) onError(err);

                // Check the progress
                isLoadingProgress--;
                isComplete();
              }
            },

            // Error!
            (err) => {
              setBlobSrc(ImageBrokenSVG);
              setImgMime([]);
              if (isObj) img.err = err;
              showErrorMessage(err);
              if (onError) onError(err);

              // Check the progress
              isLoadingProgress--;
              isComplete();
            },
          );
        }
      } else {
        setBlobSrc(ImageBrokenSVG);
        setImgMime([]);
        const err = new Error('File not found.');
        if (isObj) img.err = err;
        showErrorMessage(err);
        if (onError) onError(err);
      }
    } else {
      if (tinyImageUrl.startsWith('./')) {
        const filename = tinyImageUrl.split('.');
        setImgMime(['image', filename[filename.length - 1]]);
      }
      setBlobSrc(tinyImageUrl);
    }

    // Anim image
    if (
      !tinyImageAnimUrl ||
      (!tinyImageAnimUrl.startsWith('blob:') &&
        !tinyImageAnimUrl.startsWith('data:') &&
        !tinyImageAnimUrl.startsWith('./'))
    ) {
      progressLoad(tinyImageAnimUrl, setBlobAnimSrc, setImgMimeAnim, true);
    } else {
      if (tinyImageAnimUrl.startsWith('./')) {
        const filename = tinyImageAnimUrl.split('.');
        setImgMimeAnim(['image', filename[filename.length - 1]]);
      }
      setBlobAnimSrc(tinyImageAnimUrl);
    }

    // Check the progress
    isComplete();
  };

  // Complete
  setTimeout(() => startLoadImage(), 1);
  return img;
}

ImgJquery.propTypes = imgPropTypes;

export { ImgJquery };
