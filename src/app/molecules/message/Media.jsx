import React from 'react';
import muteUserManager from '@src/util/libs/muteUserManager';
import initMatrix from '../../../client/initMatrix';

import * as Media from '../media/Media';

import { getBlobSafeMimeType } from '../../../util/mimetypes';
import { getAnimatedImageUrl, getAppearance } from '../../../util/libs/appearance';

// Detect Media
export function isMedia(mE) {
  return (
    mE.getContent()?.msgtype === 'm.file' ||
    mE.getContent()?.msgtype === 'm.image' ||
    mE.getContent()?.msgtype === 'm.audio' ||
    mE.getContent()?.msgtype === 'm.video' ||
    mE.getType() === 'm.sticker'
  );
}

// Media Generator
export function genMediaContent(mE, seeHiddenData, setSeeHiddenData) {
  // Client
  const mx = initMatrix.matrixClient;
  const mxcUrl = initMatrix.mxcUrl;
  const mContent = mE.getContent();
  if (!mContent || !mContent.body)
    return <span style={{ color: 'var(--bg-danger)' }}>Malformed event</span>;

  // Content URL
  let mediaMXC = mContent?.url;
  const isEncryptedFile = typeof mediaMXC === 'undefined';
  if (isEncryptedFile) mediaMXC = mContent?.file?.url;

  // Thumbnail
  let thumbnailMXC = mContent?.info?.thumbnail_url;

  // Bad Event Again
  if (typeof mediaMXC === 'undefined' || mediaMXC === '')
    return <span style={{ color: 'var(--bg-danger)' }}>Malformed event</span>;

  // Content Type
  let msgType = mE.getContent()?.msgtype;
  const safeMimetype = getBlobSafeMimeType(mContent.info?.mimetype);

  // Sticker
  if (mE.getType() === 'm.sticker') {
    msgType = 'm.sticker';
  }

  // File
  else if (safeMimetype === 'application/octet-stream') {
    msgType = 'm.file';
  }

  const blurhash = mContent?.info?.['xyz.amorgan.blurhash'];
  const senderId = mE.getSender();

  switch (msgType) {
    // File
    case 'm.file':
      return (
        <Media.File
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          content={mContent}
          link={mxcUrl.toHttp(mediaMXC)}
          file={mContent.file || null}
        />
      );

    // Image
    case 'm.image':
      return !muteUserManager.isImageMuted(senderId) || seeHiddenData ? (
        <Media.Image
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          width={typeof mContent.info?.w === 'number' ? mContent.info?.w : null}
          height={typeof mContent.info?.h === 'number' ? mContent.info?.h : null}
          link={mxcUrl.toHttp(mediaMXC)}
          file={isEncryptedFile ? mContent.file : null}
          content={mContent}
          blurhash={blurhash}
        />
      ) : (
        <a
          href="#"
          className="text-warning"
          onClick={(e) => {
            e.preventDefault();
            setSeeHiddenData(true);
          }}
        >
          <i className="fa-solid fa-eye-slash me-1" />
          Hidden Image. Click here to view.
        </a>
      );

    // Sticker
    case 'm.sticker':
      const enableAnimParams = getAppearance('enableAnimParams');
      return !muteUserManager.isStickerMuted(senderId) || seeHiddenData ? (
        <Media.Sticker
          content={mContent}
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          width={
            typeof mContent.info?.w === 'number' && !Number.isNaN(mContent.info?.w)
              ? mContent.info?.w
              : null
          }
          height={
            typeof mContent.info?.h === 'number' && !Number.isNaN(mContent.info?.h)
              ? mContent.info?.h
              : null
          }
          link={
            !enableAnimParams
              ? mxcUrl.toHttp(mediaMXC)
              : getAnimatedImageUrl(mxcUrl.toHttp(mediaMXC, 170, 170))
          }
          file={isEncryptedFile ? mContent.file : null}
        />
      ) : (
        <a
          href="#"
          className="text-warning"
          onClick={(e) => {
            e.preventDefault();
            setSeeHiddenData(true);
          }}
        >
          <i className="fa-solid fa-eye-slash me-1" />
          Hidden Sticker. Click here to view.
        </a>
      );

    // Audio
    case 'm.audio':
      return (
        <Media.Audio
          content={mContent}
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          link={mxcUrl.toHttp(mediaMXC)}
          file={mContent.file || null}
        />
      );

    // Video
    case 'm.video':
      if (typeof thumbnailMXC === 'undefined') {
        thumbnailMXC = mContent.info?.thumbnail_file?.url || null;
      }
      return !muteUserManager.isVideoMuted(senderId) || seeHiddenData ? (
        <Media.Video
          content={mContent}
          roomId={mE.getRoomId()}
          threadId={mE.getThread()?.id}
          link={mxcUrl.toHttp(mediaMXC)}
          thumbnail={thumbnailMXC === null ? null : mxcUrl.toHttp(thumbnailMXC)}
          thumbnailFile={isEncryptedFile ? mContent.info?.thumbnail_file : null}
          thumbnailType={mContent.info?.thumbnail_info?.mimetype || null}
          width={typeof mContent.info?.w === 'number' ? mContent.info?.w : null}
          height={typeof mContent.info?.h === 'number' ? mContent.info?.h : null}
          file={isEncryptedFile ? mContent.file : null}
          blurhash={blurhash}
        />
      ) : (
        <a
          href="#"
          className="text-warning"
          onClick={(e) => {
            e.preventDefault();
            setSeeHiddenData(true);
          }}
        >
          <i className="fa-solid fa-eye-slash me-1" />
          Hidden Video. Click here to view.
        </a>
      );

    // Bad Event Again?
    default:
      return <span style={{ color: 'var(--bg-danger)' }}>Malformed event</span>;
  }
}
