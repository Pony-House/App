import EventEmitter from 'events';
import encrypt from 'matrix-encrypt-attachment';
import { encode } from 'blurhash';
import { EventTimeline } from 'matrix-js-sdk';
import ExifReader from 'exifreader';

import { objType } from 'for-promise/utils/lib.mjs';

import storageManager from '@src/util/libs/Localstorage';
import blobUrlManager, { blobToBase64 } from '@src/util/libs/blobUrlManager';
import { isMobile } from '@src/util/libs/mobile';
import { fileReader, uploadContent } from '@src/app/molecules/file-input/FileInput';
import { getAppearance } from '@src/util/libs/appearance';

import { getShortcodeToEmoji } from '../../app/organisms/emoji-board/custom-emoji';
import { getBlobSafeMimeType } from '../../util/mimetypes';
import { sanitizeText } from '../../util/sanitize';
import cons from './cons';
import settings from './settings';
import { markdown, plain, html } from '../../util/markdown';
import { clearUrlsFromHtml, clearUrlsFromText } from '../../util/clear-urls/clearUrls';
import initMatrix from '../initMatrix';

const blurhashField = 'xyz.amorgan.blurhash';

function encodeBlurhash(img) {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return encode(data.data, data.width, data.height, 4, 4);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function loadVideo(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;

    const loadComplete = (result) => {
      // Wait until we have enough data to thumbnail the first frame.
      video.onloadeddata = async () => {
        resolve(video);
        video.pause();
      };
      video.onerror = (err) => {
        reject(err);
      };

      video.src = result;
      video.load();
      video.play();
    };

    if (videoFile.type === 'video/quicktime') {
      const quicktimeVideoFile = new File([videoFile], videoFile.name, { type: 'video/mp4' });
      fileReader(quicktimeVideoFile, 'readAsDataURL').then(loadComplete).catch(reject);
    } else {
      fileReader(videoFile, 'readAsDataURL').then(loadComplete).catch(reject);
    }
  });
}
function getVideoThumbnail(video, width, height, mimeType) {
  return new Promise((resolve) => {
    const MAX_WIDTH = 800;
    const MAX_HEIGHT = 600;
    let targetWidth = width;
    let targetHeight = height;
    if (targetHeight > MAX_HEIGHT) {
      targetWidth = Math.floor(targetWidth * (MAX_HEIGHT / targetHeight));
      targetHeight = MAX_HEIGHT;
    }
    if (targetWidth > MAX_WIDTH) {
      targetHeight = Math.floor(targetHeight * (MAX_WIDTH / targetWidth));
      targetWidth = MAX_WIDTH;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, targetWidth, targetHeight);

    canvas.toBlob((thumbnail) => {
      resolve({
        thumbnail,
        info: {
          w: targetWidth,
          h: targetHeight,
          mimetype: thumbnail.type,
          size: thumbnail.size,
        },
      });
    }, mimeType);
  });
}

// Rooms input
class RoomsInput extends EventEmitter {
  constructor(mx, roomList) {
    super();
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.matrixClient = mx;
    this.roomList = roomList;
    this.roomIdToInput = new Map();
  }

  // Clean Empty Entry
  cleanEmptyEntry(roomId, threadId) {
    const input = this.getInput(roomId, threadId);
    const isEmpty =
      typeof input.attachment === 'undefined' &&
      typeof input.replyTo === 'undefined' &&
      (typeof input.message === 'undefined' || input.message === '');
    if (isEmpty) {
      this.roomIdToInput.delete(!threadId ? roomId : `${roomId}:${threadId}`);
    }
  }

  // Get Input
  getInput(roomId, threadId) {
    return this.roomIdToInput.get(!threadId ? roomId : `${roomId}:${threadId}`) || {};
  }

  // Message

  // Set Message
  setMessage(roomId, threadId, message) {
    const input = this.getInput(roomId, threadId);
    input.message = message;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);
    if (message === '') this.cleanEmptyEntry(roomId, threadId);
  }

  // Get Message
  getMessage(roomId, threadId) {
    const input = this.getInput(roomId, threadId);
    if (typeof input.message === 'undefined') return '';
    return input.message;
  }

  // Reply Message

  // Set Reply to
  setReplyTo(roomId, threadId, replyTo) {
    const input = this.getInput(roomId, threadId);
    input.replyTo = replyTo;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);
  }

  // Get Reply to
  getReplyTo(roomId, threadId) {
    const input = this.getInput(roomId, threadId);
    if (typeof input.replyTo === 'undefined') return null;
    return input.replyTo;
  }

  // Cancel Reply to
  cancelReplyTo(roomId, threadId) {
    const input = this.getInput(roomId, threadId);
    if (typeof input.replyTo === 'undefined') return;
    delete input.replyTo;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);
  }

  // Attachment

  // Set Attachment
  setAttachment(roomId, threadId, file) {
    const input = this.getInput(roomId, threadId);
    input.attachment = {
      file,
    };
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);
  }

  // Get Attachment
  getAttachment(roomId, threadId) {
    const input = this.getInput(roomId, threadId);
    if (typeof input.attachment === 'undefined') return null;
    return input.attachment.file;
  }

  // Cancel Attrachment
  cancelAttachment(roomId, threadId) {
    const input = this.getInput(roomId, threadId);
    if (typeof input.attachment === 'undefined') return;

    const { uploadingPromise } = input.attachment;

    if (uploadingPromise) {
      this.matrixClient.cancelUpload(uploadingPromise);
      delete input.attachment.uploadingPromise;
    }
    delete input.attachment;
    delete input.isSending;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);
    this.emit(cons.events.roomsInput.ATTACHMENT_CANCELED, roomId, threadId);
  }

  // Data

  // Is Sending
  isSending(roomId, threadId) {
    return this.roomIdToInput.get(!threadId ? roomId : `${roomId}:${threadId}`)?.isSending || false;
  }

  // Get Content
  getContent(roomId, threadId, options, message, reply, edit) {
    const msgType = options?.msgType || 'm.text';
    const autoMarkdown = options?.autoMarkdown ?? true;
    const isHtml = options?.isHtml ?? false;

    const room = this.matrixClient.getRoom(roomId);

    const userNames = room.getLiveTimeline().getState(EventTimeline.FORWARDS).userIdsToDisplayNames;
    const parentIds = this.roomList.getAllParentSpaces(room.roomId);
    const parentRooms = [...parentIds].map((id) => this.matrixClient.getRoom(id));
    const emojis = getShortcodeToEmoji(this.matrixClient, [room, ...parentRooms]);

    let output;
    if (isHtml) {
      output = html;
    } else if (settings.isMarkdown && autoMarkdown) {
      output = markdown;
    } else {
      output = plain;
    }

    const tinyCache = {};
    const body = output(message, roomId, threadId, { userNames, emojis }, tinyCache);

    if (isHtml) {
      // the html parser might remove stuff we want, so we need to re-add it
      body.onlyPlain = false;
      body.html = message;
    }

    const content = {
      body: body.plain,
      msgtype: msgType,
    };

    if (objType(tinyCache['m.mentions'], 'object')) content['m.mentions'] = tinyCache['m.mentions'];

    if (!body.onlyPlain || reply) {
      content.format = 'org.matrix.custom.html';
      content.formatted_body = body.html;
    }

    if (settings.clearUrls) {
      content.body = clearUrlsFromText(content.body);
      if (content.formatted_body) {
        content.formatted_body = clearUrlsFromHtml(content.formatted_body);
      }
    }

    if (edit) {
      content['m.new_content'] = { ...content };
      content['m.relates_to'] = {
        event_id: edit.getId(),
        rel_type: 'm.replace',
      };

      const isReply = edit.getWireContent()['m.relates_to']?.['m.in_reply_to'];
      if (isReply) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = body.html;
      }

      content.body = ` * ${content.body}`;
      if (content.formatted_body) content.formatted_body = ` * ${content.formatted_body}`;

      if (isReply) {
        const eBody = edit.getContent().body;
        const replyHead = eBody.substring(0, eBody.indexOf('\n\n'));
        if (replyHead) content.body = `${replyHead}\n\n${content.body}`;

        const eFBody = edit.getContent().formatted_body;
        if (eFBody) {
          const fReplyHead = eFBody.substring(0, eFBody.indexOf('</mx-reply>'));
          if (fReplyHead)
            content.formatted_body = `${fReplyHead}</mx-reply>${content.formatted_body}`;
        }
      }
    }

    if (reply) {
      content['m.relates_to'] = {
        'm.in_reply_to': {
          event_id: reply.eventId,
        },
      };

      content.body = `> <${reply.userId}> ${reply.body.replace(/\n/g, '\n> ')}\n\n${content.body}`;

      const replyToLink = `<a href="https://matrix.to/#/${encodeURIComponent(
        roomId,
      )}/${encodeURIComponent(reply.eventId)}">In reply to</a>`;
      const userLink = `<a href="https://matrix.to/#/${encodeURIComponent(
        reply.userId,
      )}">${sanitizeText(reply.userId)}</a>`;
      const fallback = `<mx-reply><blockquote>${replyToLink}${userLink}<br />${
        reply.formattedBody || sanitizeText(reply.body)
      }</blockquote></mx-reply>`;
      content.formatted_body = fallback + content.formatted_body;
    }

    return content;
  }

  // Send Input
  async sendInput(roomId, threadId, options) {
    const input = this.getInput(roomId, threadId);
    input.isSending = true;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);

    const sendFileBefore = getAppearance('sendFileBefore');

    // File Before
    if (sendFileBefore) {
      if (input.attachment) {
        await this.sendFile(roomId, threadId, input.attachment.file);
        if (!this.isSending(roomId, threadId)) return;
      }

      if (input.message) {
        const content = this.getContent(roomId, threadId, options, input.message, input.replyTo);
        if (threadId) storageManager.sendMessageThread(roomId, threadId, content);
        else storageManager.sendMessage(roomId, content);
      }
    }

    // File After
    else {
      if (input.message) {
        const content = this.getContent(roomId, threadId, options, input.message, input.replyTo);
        if (threadId) await storageManager.sendMessageThread(roomId, threadId, content);
        else await storageManager.sendMessage(roomId, content);
        if (!this.isSending(roomId, threadId)) return;
      }

      if (input.attachment) {
        await this.sendFile(roomId, threadId, input.attachment.file);
      }
    }

    if (this.isSending(roomId, threadId))
      this.roomIdToInput.delete(!threadId ? roomId : `${roomId}:${threadId}`);
    this.emit(cons.events.roomsInput.MESSAGE_SENT, roomId, threadId);
  }

  async sendSticker(roomId, threadId, data) {
    const { mxc: url, body, httpUrl } = data;
    const info = {};

    try {
      const res = await initMatrix.mxcUrl.fetch(httpUrl, 'image');
      const blob = await res.blob();

      const tags = await ExifReader.load(
        await new Promise((resolve, reject) => {
          const stickerReader = new FileReader();
          stickerReader.onload = (event) => resolve(event.target.result);
          stickerReader.onerror = reject;
          stickerReader.readAsArrayBuffer(blob);
        }),
        {
          async: true,
          includeUnknown: true,
        },
      );

      info.w =
        tags['Image Width'] && typeof tags['Image Width'].value === 'number'
          ? tags['Image Width'].value
          : null;
      info.h =
        tags['Image Height'] && typeof tags['Image Height'].value === 'number'
          ? tags['Image Height'].value
          : null;

      info.mimetype = blob.type;
      info.size = blob.size;
      info.thumbnail_info = { ...info };
      info.thumbnail_url = url;
    } catch (err) {
      console.error(err);
      // send sticker without info
    }

    if (typeof threadId !== 'string') {
      storageManager.sendStickerMessage(roomId, url, info, body);
    } else {
      storageManager.sendStickerMessageThread(roomId, threadId, url, info, body);
    }

    this.emit(cons.events.roomsInput.MESSAGE_SENT, roomId, threadId);
  }

  // Send file
  async sendFile(roomId, threadId, file) {
    const fileType = getBlobSafeMimeType(file.type).slice(0, file.type.indexOf('/'));
    const info = {
      mimetype: file.type,
      size: file.size,
    };
    const content = { info };
    let uploadData = null;
    const room = initMatrix.matrixClient.getRoom(roomId);

    if (fileType === 'image') {
      let imgData;
      if (!isMobile(true)) {
        imgData = await blobToBase64(file);
      } else {
        imgData = `data:${file.type};base64, ${file.data}`;
      }

      const img = await loadImage(imgData);

      info.w = img.width;
      info.h = img.height;
      info[blurhashField] = encodeBlurhash(img);
      blobUrlManager.delete(imgData);

      content.msgtype = 'm.image';
      content.body = file.name || 'Image';
    } else if (fileType === 'video') {
      content.msgtype = 'm.video';
      content.body = file.name || 'Video';

      try {
        const video = await loadVideo(file);

        info.w = video.videoWidth;
        info.h = video.videoHeight;
        info[blurhashField] = encodeBlurhash(video);

        const thumbnailData = await getVideoThumbnail(
          video,
          video.videoWidth,
          video.videoHeight,
          'image/jpeg',
        );
        const thumbnailUploadData = await this.uploadFile(
          roomId,
          threadId,
          thumbnailData.thumbnail,
        );
        info.thumbnail_info = thumbnailData.info;
        if (room.hasEncryptionStateEvent()) {
          info.thumbnail_file = thumbnailUploadData.file;
        } else {
          info.thumbnail_url = thumbnailUploadData.url;
        }
      } catch (e) {
        console.error(e);
        alert(e.message, 'Load Video Error');
        this.emit(cons.events.roomsInput.FILE_UPLOAD_CANCELED, roomId, threadId);
        return;
      }
    } else if (fileType === 'audio') {
      content.msgtype = 'm.audio';
      content.body = file.name || 'Audio';
    } else {
      content.msgtype = 'm.file';
      content.body = file.name || 'File';
    }

    try {
      uploadData = await this.uploadFile(roomId, threadId, file, (data) => {
        // data have two properties: data.loaded, data.total
        this.emit(cons.events.roomsInput.UPLOAD_PROGRESS_CHANGES, roomId, threadId, data);
      });
      this.emit(cons.events.roomsInput.FILE_UPLOADED, roomId, threadId);
    } catch (e) {
      console.error(e);
      alert(e.message, 'Upload File Error');
      this.emit(cons.events.roomsInput.FILE_UPLOAD_CANCELED, roomId, threadId);
      return;
    }
    if (room.hasEncryptionStateEvent()) {
      content.file = uploadData.file;
      if (!threadId) await storageManager.sendMessage(roomId, content);
      else await storageManager.sendMessageThread(roomId, threadId, content);
    } else {
      content.url = uploadData.url;
      if (!threadId) await storageManager.sendMessage(roomId, content);
      else await storageManager.sendMessageThread(roomId, threadId, content);
    }
  }

  // Upload file
  async uploadFile(roomId, threadId, file, progressHandler) {
    const room = initMatrix.matrixClient.getRoom(roomId);
    const isEncryptedRoom = room.hasEncryptionStateEvent();

    let encryptInfo = null;
    let encryptBlob = null;

    if (isEncryptedRoom) {
      const dataBuffer = await file.arrayBuffer();
      if (typeof this.getInput(roomId, threadId).attachment === 'undefined')
        throw new Error('Attachment canceled');
      const encryptedResult = await encrypt.encryptAttachment(dataBuffer);
      if (typeof this.getInput(roomId, threadId).attachment === 'undefined')
        throw new Error('Attachment canceled');
      encryptInfo = encryptedResult.info;
      encryptBlob = new Blob([encryptedResult.data]);
    }

    const uploadingPromise = uploadContent(isEncryptedRoom ? encryptBlob : file, {
      // don't send filename if room is encrypted.
      includeFilename: !isEncryptedRoom,
      progressHandler,
    });

    const input = this.getInput(roomId, threadId);
    input.attachment.uploadingPromise = uploadingPromise;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);

    const { content_uri: url } = await uploadingPromise;

    delete input.attachment.uploadingPromise;
    this.roomIdToInput.set(!threadId ? roomId : `${roomId}:${threadId}`, input);

    if (isEncryptedRoom) {
      encryptInfo.url = url;
      if (file.type) encryptInfo.mimetype = file.type;
      return { file: encryptInfo };
    }
    return { url };
  }

  // Send Edited Message
  async sendEditedMessage(roomId, threadId, mEvent, editedBody) {
    const content = this.getContent(
      roomId,
      threadId,
      { msgType: mEvent.getWireContent().msgtype },
      editedBody,
      null,
      mEvent,
    );
    await storageManager.sendMessage(roomId, content);
  }
}

export default RoomsInput;
