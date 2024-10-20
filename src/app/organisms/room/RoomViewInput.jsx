import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import $ from 'jquery';

import TextareaAutosize from 'react-autosize-textarea';
import moment from '@src/util/libs/momentjs';

import { ReactEditor } from 'slate-react';
import { Editor, Transforms } from 'slate';

import Img from '@src/app/atoms/image/Image';
import FileInput, { fileInputClick, fileInputValue } from '@src/app/molecules/file-input/FileInput';

import { blobToBase64 } from '@src/util/libs/blobUrlManager';
import threadsList from '@src/util/libs/thread';
import { isMobile } from '@src/util/libs/mobile';
import initMatrix from '../../../client/initMatrix';
import cons from '../../../client/state/cons';
import settings from '../../../client/state/settings';
import { openEmojiBoard, openReusableContextMenu } from '../../../client/action/navigation';
import navigation from '../../../client/state/navigation';
import { bytesToSize, getEventCords } from '../../../util/common';
import { getUsername, getCurrentState, canSupport } from '../../../util/matrixUtil';
import { colorMXID } from '../../../util/colorMXID';
import { shiftNuller } from '../../../util/shortcut';
import audioRecorder from '../../../util/audioRec';
import { momentCountdown, resizeWindowChecker, toast } from '../../../util/tools';

import Text from '../../atoms/text/Text';
import RawIcon from '../../atoms/system-icons/RawIcon';
import IconButton from '../../atoms/button/IconButton';
import ScrollView from '../../atoms/scroll/ScrollView';
import { MessageReply } from '../../molecules/message/Message';

import { confirmDialog } from '../../molecules/confirm-dialog/ConfirmDialog';

import commands from '../../../commands';
import matrixAppearance, { getAppearance } from '../../../util/libs/appearance';
import tinyFixScrollChat from '../../molecules/media/mediaFix';
import RoomUpload from '../../molecules/room-upload-button/RoomUpload';

// Variables
const CMD_REGEX = /(^\/|:|@|#)(\S*)$/;
let isTyping = false;
let isCmdActivated = false;
let cmdCursorPos = null;

function RoomViewInput({ roomId, threadId, roomTimeline, viewEvent, refRoomInput }) {
  // Rec Ref
  const recAudioRef = useRef(null);
  const [isStickersVisible, setIsStickersVisible] = useState(matrixAppearance.get('showStickers'));
  const [closeUpButton, setCloseUpButton] = useState(null);
  const [fileSrc, setFileSrc] = useState(null);

  // File
  const [attachment, setAttachment] = useState(null);

  // Reply
  const [replyTo, setReplyTo] = useState(null);

  // Inputs
  const textAreaRef = useRef(null);
  const editor = useRef(null);
  const editorElRef = useRef(null);
  const inputBaseRef = useRef(null);
  const uploadInputRef = useRef(null);
  const uploadProgressRef = useRef(null);
  const rightOptionsRef = useRef(null);

  // Timeout Cfg
  const TYPING_TIMEOUT = 20000;

  // Matrix Client
  const mx = initMatrix.matrixClient;
  const { roomsInput } = initMatrix;

  // Request Focus
  function requestFocusInput() {
    $(textAreaRef.current).focus();
  }

  useEffect(() => {
    const tinyScrollTime = () => tinyFixScrollChat();
    if (roomsInput) {
      roomsInput.on(cons.events.roomsInput.ATTACHMENT_SET, setAttachment);
      roomsInput.on(cons.events.roomsInput.ATTACHMENT_SET, tinyScrollTime);
    }
    viewEvent.on('focus_msg_input', requestFocusInput);
    return () => {
      if (roomsInput) {
        roomsInput.removeListener(cons.events.roomsInput.ATTACHMENT_SET, setAttachment);
        roomsInput.removeListener(cons.events.roomsInput.ATTACHMENT_SET, tinyScrollTime);
      }

      viewEvent.removeListener('focus_msg_input', requestFocusInput);
    };
  }, [roomsInput, viewEvent]);

  function clearEditor() {
    if (editor.current)
      Transforms.delete(editor.current, {
        at: {
          anchor: editor.current.start([]),
          focus: editor.current.end([]),
        },
      });
  }

  // Send is Typing
  const sendIsTyping = (isT) => {
    mx.sendTyping(roomId, isT, isT ? TYPING_TIMEOUT : undefined);
    isTyping = isT;

    if (isT === true) {
      setTimeout(() => {
        if (isTyping) sendIsTyping(false);
      }, TYPING_TIMEOUT);
    }
  };

  function checkTypingPerm() {
    const content = mx.getAccountData('pony.house.privacy')?.getContent() ?? {};
    return content.hideTypingWarn === true;
  }

  // Effects
  useEffect(() => {
    // Audio Record
    const prefixConsole = (text, type = 'log') => console[type](`[chatbox record] ${text}`);
    const tinyRec = {
      enabled: false,
      loading: false,
      timeout: 0,
      timeout2: 0,
      clock: moment().subtract(1, 'second'),
      pointRec: '',
    };
    tinyRec.input = $(recAudioRef.current);
    tinyRec.time = tinyRec.input.find('> time');
    tinyRec.roomInput = $('.room-input');
    const holdTinyAudio = [
      // User Click
      () => {
        tinyRec.clock = moment().subtract(1, 'second');
        tinyRec.roomInput.removeClass('textarea-focus-rec');
        tinyRec.time.addClass('d-none').text('');
        tinyRec.input.addClass('audio-click');

        clearInterval(tinyRec.timeout2);
        tinyRec.timeout2 = 0;
        clearTimeout(tinyRec.timeout);

        if (tinyRec.enabled || tinyRec.loading) {
          if (!checkTypingPerm()) sendIsTyping(false);
          audioRecorder.cancel();
          tinyRec.enabled = false;
        }

        tinyRec.loading = true;
        tinyRec.timeout = setTimeout(holdTinyAudio[2], 300);
      },

      // Remove Click
      () => {
        // Stop Interval
        clearInterval(tinyRec.timeout2);
        tinyRec.timeout2 = 0;
        clearTimeout(tinyRec.timeout);

        // Audio Click
        tinyRec.roomInput.removeClass('textarea-focus-rec');
        tinyRec.time.addClass('d-none').text('');
        tinyRec.input.removeClass('audio-hold').removeClass('audio-click');
        $(textAreaRef.current).attr('placeholder', 'Send a message...');

        // Stop Record
        if (!tinyRec.loading) {
          if (!checkTypingPerm()) sendIsTyping(false);
          audioRecorder
            .stop()
            .then((blob) => {
              if (blob) {
                // Get Room ID
                const selectedRoomId = navigation.selectedRoomId;
                const selectedThreadId = navigation.selectedThreadId;
                if (!selectedRoomId) return;

                // Get Type
                let fileExt = blob.type;

                // Filter File Type
                if (typeof fileExt === 'string') {
                  fileExt = fileExt.split('/');
                  fileExt = fileExt[1].split(';')[0];
                }

                // Insert File Name
                blob.name = `voice_message_${moment().format('MM/DD/YYYY_HH:mm:ss')}.${fileExt}`;

                // Insert attachment and complete
                initMatrix.roomsInput.setAttachment(selectedRoomId, selectedThreadId, blob);
                tinyFixScrollChat();
                initMatrix.roomsInput.emit(cons.events.roomsInput.ATTACHMENT_SET, blob);
                tinyRec.enabled = false;
              }
            })

            // Fail Record
            .catch((err) => {
              // on error
              // No Browser Support Error
              if (
                err.message.includes(
                  'mediaDevices API or getUserMedia method is not supported in this browser.',
                )
              ) {
                prefixConsole('To record audio, use browsers like Chrome and Firefox.', 'warn');
              }

              // Error handling structure
              switch (err.name) {
                case 'AbortError': // err from navigator.mediaDevices.getUserMedia
                  prefixConsole('An AbortError has occured.', 'error');
                  console.error(err);
                  break;
                case 'NotAllowedError': // err from navigator.mediaDevices.getUserMedia
                  prefixConsole(
                    'A NotAllowedError has occured. User might have denied permission.',
                    'error',
                  );
                  console.error(err);
                  break;
                case 'NotFoundError': // err from navigator.mediaDevices.getUserMedia
                  prefixConsole('A NotFoundError has occured.', 'error');
                  console.error(err);
                  break;
                case 'NotReadableError': // err from navigator.mediaDevices.getUserMedia
                  prefixConsole('A NotReadableError has occured.', 'error');
                  console.error(err);
                  break;
                case 'SecurityError': // err from navigator.mediaDevices.getUserMedia or from the MediaRecorder.start
                  prefixConsole('A SecurityError has occured.', 'error');
                  console.error(err);
                  break;
                case 'TypeError': // err from navigator.mediaDevices.getUserMedia
                  prefixConsole('A TypeError has occured.', 'error');
                  console.error(err);
                  break;
                case 'InvalidStateError': // err from the MediaRecorder.start
                  prefixConsole('An InvalidStateError has occured.', 'error');
                  console.error(err);
                  break;
                case 'UnknownError': // err from the MediaRecorder.start
                  prefixConsole('An UnknownError has occured.', 'error');
                  console.error(err);
                  break;
                default:
                  prefixConsole(`An err occured with the err name ${err.name}`, 'error');
                  console.error(err);
              }

              tinyRec.enabled = false;
              tinyRec.loading = false;
              toast(err.message);
            });
        }

        // Cancel
        else {
          // Complete
          if (!checkTypingPerm()) sendIsTyping(false);
          audioRecorder.cancel();

          tinyRec.enabled = false;
          tinyRec.loading = false;
        }
      },

      // User Hold
      () => {
        if (tinyRec.loading && !tinyRec.enabled && !tinyRec.timeout2) {
          tinyRec.enabled = true;

          tinyRec.timeout2 = momentCountdown((time) => {
            if (tinyRec.pointRec === '...') {
              tinyRec.pointRec = '';
            } else if (tinyRec.pointRec === '..') {
              tinyRec.pointRec = '...';
            } else if (tinyRec.pointRec === '.') {
              tinyRec.pointRec = '..';
            } else {
              tinyRec.pointRec = '.';
            }

            tinyRec.input.addClass('audio-hold');

            tinyRec.time.text(time);
            $(textAreaRef.current).attr(
              'placeholder',
              `${time} - Recording voice${tinyRec.pointRec}`,
            );
          }, tinyRec.clock);

          // Start Record
          if (!checkTypingPerm()) sendIsTyping(true);
          audioRecorder
            .start()
            .then(() => {
              tinyRec.loading = false;
              tinyRec.roomInput.addClass('textarea-focus-rec');
              tinyRec.time.removeClass('d-none');
            })

            // Fail Record
            .catch((err) => {
              // No Browser Support Error
              if (
                err.message.includes(
                  'mediaDevices API or getUserMedia method is not supported in this browser.',
                )
              ) {
                prefixConsole('To record audio, use browsers like Chrome and Firefox.', 'warn');
              }

              // Error handling structure
              switch (err.name) {
                case 'AbortError': // error from navigator.mediaDevices.getUserMedia
                  prefixConsole('An AbortError has occured.', 'error');
                  console.error(err);
                  break;
                case 'NotAllowedError': // error from navigator.mediaDevices.getUserMedia
                  prefixConsole(
                    'A NotAllowedError has occured. User might have denied permission.',
                    'error',
                  );
                  console.error(err);
                  break;
                case 'NotFoundError': // error from navigator.mediaDevices.getUserMedia
                  prefixConsole('A NotFoundError has occured.', 'error');
                  console.error(err);
                  break;
                case 'NotReadableError': // error from navigator.mediaDevices.getUserMedia
                  prefixConsole('A NotReadableError has occured.', 'error');
                  console.error(err);
                  break;
                case 'SecurityError': // error from navigator.mediaDevices.getUserMedia or from the MediaRecorder.start
                  prefixConsole('A SecurityError has occured.', 'error');
                  console.error(err);
                  break;
                case 'TypeError': // error from navigator.mediaDevices.getUserMedia
                  prefixConsole('A TypeError has occured.', 'error');
                  console.error(err);
                  break;
                case 'InvalidStateError': // error from the MediaRecorder.start
                  prefixConsole('An InvalidStateError has occured.', 'error');
                  console.error(err);
                  break;
                case 'UnknownError': // error from the MediaRecorder.start
                  prefixConsole('An UnknownError has occured.', 'error');
                  console.error(err);
                  break;
                default:
                  prefixConsole(`An error occured with the error name ${err.name}`, 'error');
                  console.error(err);
              }

              tinyRec.enabled = false;
              tinyRec.loading = false;
              toast(err.message);
            });
        }
      },
      () => {
        // Warn Hold
        if (!tinyRec.enabled) {
          toast(`You need to hold the button down to record your audio.`, 'Send Voice - Warning');
        }
      },
    ];

    // Events
    tinyRec.input
      .on('mousedown touchstart', holdTinyAudio[0])
      .on('mouseup mouseleave touchend', holdTinyAudio[1])
      .on('click', holdTinyAudio[3]);

    return () => {
      tinyRec.input
        .off('mousedown', holdTinyAudio[0])
        .off('mouseup mouseleave', holdTinyAudio[1])
        .off('click', holdTinyAudio[3]);
    };
  }, []);

  function uploadingProgress(myRoomId, myThreadId, { loaded, total }) {
    if (myRoomId !== roomId) return;
    if (threadId && threadId !== myThreadId) return;
    const progressPer = Math.round((loaded * 100) / total);

    $(uploadProgressRef.current).text(
      `Uploading: ${bytesToSize(loaded)}/${bytesToSize(total)} (${progressPer}%)`,
    );
    $(inputBaseRef.current).css(
      'background-image',
      `linear-gradient(90deg, var(--bg-surface-hover) ${progressPer}%, var(--bg-surface-low) ${progressPer}%)`,
    );
  }

  function clearAttachment(myRoomId, myThreadId) {
    if (roomId !== myRoomId) return;
    if (threadId && threadId !== myThreadId) return;
    setAttachment(null);
    tinyFixScrollChat();
    $(inputBaseRef.current).css('background-image', 'unset');
    fileInputValue(uploadInputRef, '');
  }

  function rightOptionsA11Y(A11Y) {
    if (rightOptionsRef.current === null) return;
    const rightOptions = rightOptionsRef.current.children;
    for (let index = 0; index < rightOptions.length; index += 1) {
      const el = rightOptions[index];
      el.tabIndex = A11Y ? 0 : -1;
    }
  }

  // CMD Stuff
  function activateCmd(prefix) {
    isCmdActivated = true;
    rightOptionsA11Y(false);
    viewEvent.emit('cmd_activate', prefix);
  }

  function deactivateCmd() {
    isCmdActivated = false;
    cmdCursorPos = null;
    rightOptionsA11Y(true);
  }

  function deactivateCmdAndEmit() {
    deactivateCmd();
    viewEvent.emit('cmd_deactivate');
  }

  function setCursorPosition(pos1, pos2) {
    setTimeout(() => {
      if (editor.current) ReactEditor.focus(editor.current);
      if (editor.current) Transforms.select(editor.current, { path: [0, 0], offset: pos1 });
    }, 0);

    return new Promise((resolve) => {
      setTimeout(() => {
        const textArea = $(textAreaRef.current);

        let selectionStart = pos1;
        let selectionEnd = pos2;

        if (textArea.length > 0) {
          if (selectionStart === 'auto') selectionStart = textArea[0].selectionStart;
          if (selectionEnd === 'auto') selectionEnd = textArea[0].selectionEnd;
        }

        if (typeof selectionStart !== 'number') {
          if (textArea.length > 0) {
            textArea.focus();

            if (typeof selectionEnd !== 'number' || selectionStart === selectionEnd)
              textArea.get(0).setSelectionRange(selectionStart, selectionStart);
            else textArea.get(0).setSelectionRange(selectionStart, selectionEnd);
          }

          resolve(true);
        } else resolve(false);
      }, 0);
    });
  }

  function replaceCmdWith(msg, cursor, replacement) {
    if (msg === null) return null;
    const targetInput = msg.slice(0, cursor);
    const cmdParts = targetInput.match(CMD_REGEX);
    const leadingInput = msg.slice(0, cmdParts.index);
    if (replacement.length > 0) setCursorPosition(leadingInput.length + replacement.length);
    return leadingInput + replacement + msg.slice(cursor);
  }

  function firedCmd(cmdData) {
    const textArea = $(textAreaRef.current);
    const msg = textArea.val();
    textArea.val(
      `${replaceCmdWith(
        msg,
        cmdCursorPos,
        typeof cmdData?.replace !== 'undefined' ? cmdData.replace : '',
      )}${typeof cmdData?.type === 'string' && cmdData.type === 'msg' ? ' ' : ''}`,
    );

    textArea.focus();

    deactivateCmd();
    tinyFixScrollChat();
  }

  // Input
  function focusInput() {
    if (settings.isTouchScreenDevice) return;
    $(textAreaRef.current).focus();

    // check if editor.current is in the DOM
    if (!document.body.contains(editorElRef.current)) return;

    if (editor.current) ReactEditor.focus(editor.current);
    if (editor.current) Transforms.select(editor.current, Editor.end(editor.current, []));
    tinyFixScrollChat();
  }

  // Set Reply
  function setUpReply(userId, eventId, body, formattedBody) {
    setReplyTo({ userId, eventId, body });
    tinyFixScrollChat();

    if (roomsInput)
      roomsInput.setReplyTo(roomId, threadId, {
        userId,
        eventId,
        body,
        formattedBody,
      });

    focusInput();
  }

  // Effects
  useEffect(() => {
    // Events On
    if (roomsInput) {
      roomsInput.on(cons.events.roomsInput.UPLOAD_PROGRESS_CHANGES, uploadingProgress);
      roomsInput.on(cons.events.roomsInput.ATTACHMENT_CANCELED, clearAttachment);
      roomsInput.on(cons.events.roomsInput.FILE_UPLOADED, clearAttachment);
    }

    viewEvent.on('cmd_fired', firedCmd);

    navigation.on(cons.events.navigation.REPLY_TO_CLICKED, setUpReply);

    // Textarea
    const textArea = $(textAreaRef.current);
    if (textArea.length > 0) {
      isTyping = false;
      if (roomsInput) {
        textArea.val(roomsInput.getMessage(roomId, threadId));
        setAttachment(roomsInput.getAttachment(roomId, threadId));
        setReplyTo(roomsInput.getReplyTo(roomId, threadId));
        tinyFixScrollChat();
      }
    }

    const textResize = () => {
      const roomInput = $('.room-input');
      if (textArea.val()?.length > 0) {
        roomInput.addClass('textarea-typing');
      } else {
        roomInput.removeClass('textarea-typing');
      }

      resizeWindowChecker();
    };
    const focusUpdate = [
      () => {
        $('.room-input').addClass('textarea-focus');
      },
      () => {
        $('.room-input').removeClass('textarea-focus');
      },
    ];

    // Complete
    tinyFixScrollChat();
    textArea
      .on('focus', focusUpdate[0])
      .on('blur', focusUpdate[1])
      .on('keydown', textResize)
      .on('keypress', textResize)
      .on('keyup', textResize);
    return () => {
      if (roomsInput) {
        roomsInput.removeListener(
          cons.events.roomsInput.UPLOAD_PROGRESS_CHANGES,
          uploadingProgress,
        );
        roomsInput.removeListener(cons.events.roomsInput.ATTACHMENT_CANCELED, clearAttachment);
        roomsInput.removeListener(cons.events.roomsInput.FILE_UPLOADED, clearAttachment);
      }

      viewEvent.removeListener('cmd_fired', firedCmd);
      navigation.removeListener(cons.events.navigation.REPLY_TO_CLICKED, setUpReply);

      const textArea2 = $(textAreaRef.current);
      textArea2
        .off('focus', focusUpdate[0])
        .off('blur', focusUpdate[1])
        .off('keydown', textResize)
        .off('keypress', textResize)
        .off('keyup', textResize);

      if (isCmdActivated) deactivateCmd();
      if (textArea2.length < 1) return;

      const msg = textArea2.val();

      textArea2.css('height', 'unset');
      $(inputBaseRef.current).css('background-image', 'unset');

      if (msg.trim() === '') {
        if (roomsInput) roomsInput.setMessage(roomId, threadId, '');
        return;
      }
      if (roomsInput) roomsInput.setMessage(roomId, threadId, msg);
    };
  }, [roomId, threadId]);

  // Send Body
  const sendBody = async (body, options) => {
    // Options
    const opt = options ?? {};

    // Is Text
    if (!opt.msgType) opt.msgType = 'm.text';

    // Markdown
    if (typeof opt.autoMarkdown !== 'boolean') opt.autoMarkdown = true;

    // Is Seding?
    if (roomsInput && roomsInput.isSending(roomId, threadId)) return;

    // Cancel Typing Warn
    if (!checkTypingPerm()) sendIsTyping(false);

    // Set Message
    if (roomsInput) roomsInput.setMessage(roomId, threadId, body);

    // Prepare Files
    if (attachment !== null) {
      if (roomsInput) {
        roomsInput.setAttachment(roomId, threadId, attachment);
        tinyFixScrollChat();
      }
    }

    // Prepare Message
    const textArea = $(textAreaRef.current);
    textArea.prop('disabled', true).css('cursor', 'not-allowed');

    // Send Input
    if (roomsInput)
      await roomsInput.sendInput(roomId, threadId, opt).catch((err) => {
        console.error(err);
        toast(err.message);
      });

    // CSS
    textArea.prop('disabled', false).css('cursor', 'unset');
    focusInput();

    // Get Room ID
    clearEditor();
    if (roomsInput) textArea.val(roomsInput.getMessage(roomId, threadId)).css('height', 'unset');

    // Follow Thread
    if (canSupport('Thread') && threadId) threadsList.addActive(roomId, threadId);

    // Reply Fix
    if (replyTo !== null) setReplyTo(null);
    tinyFixScrollChat();
  };

  // Command
  const processCommand = (cmdBody) => {
    const spaceIndex = cmdBody.indexOf(' ');
    const cmdName = cmdBody.slice(1, spaceIndex > -1 ? spaceIndex : undefined);
    const cmdData = spaceIndex > -1 ? cmdBody.slice(spaceIndex + 1) : '';

    if (!commands[cmdName]) {
      confirmDialog('Invalid Command', `"${cmdName}" is not a valid command.`, 'Alright');
      return;
    }

    if (typeof commands[cmdName].type === 'string') {
      if (commands[cmdName].type === 'msg') {
        commands[cmdName].exe(roomId, cmdData, sendBody);
        return;
      }
    }

    commands[cmdName].exe(roomId, cmdData);
    tinyFixScrollChat();
  };

  // Send Message
  const sendMessage = async () => {
    // Animation
    requestAnimationFrame(() => deactivateCmdAndEmit());

    // Message Body
    const textArea = $(textAreaRef.current);
    const msgBody = textArea.val().trim();

    // This is command!
    if (msgBody.startsWith('/')) {
      processCommand(msgBody.trim());
      textArea.val('');
      textArea.css('height', 'unset');
      if (editor.current) editor.current.deleteFragment();
      return;
    }

    // Send Body
    if (msgBody === '' && attachment === null) return;
    $('.room-input').removeClass('textarea-typing');
    sendBody(msgBody);
  };

  // Sticker
  const handleSendSticker = async (data) => {
    if (roomsInput) await roomsInput.sendSticker(roomId, threadId, data);
    tinyFixScrollChat();
  };

  // Typing Progress
  function processTyping(msg) {
    if (!checkTypingPerm()) {
      const isEmptyMsg = msg === '';

      if (isEmptyMsg && isTyping) {
        sendIsTyping(false);
        return;
      }

      if (!isEmptyMsg && !isTyping) {
        sendIsTyping(true);
      }
    }
  }

  // Get Cursor
  function getCursorPosition() {
    if (editor.current) {
      return editor.current.selection.anchor.offset;
    }

    return textAreaRef.current.selectionStart;
  }

  // Cmd
  function recognizeCmd(rawInput) {
    const cursor = getCursorPosition();
    const targetInput = rawInput.slice(0, cursor);

    const cmdParts = targetInput.match(CMD_REGEX);
    if (cmdParts === null) {
      if (isCmdActivated) deactivateCmdAndEmit();
      return;
    }

    const cmdPrefix = cmdParts[1];
    const cmdSlug = cmdParts[2];

    if (cmdPrefix === ':') {
      // skip emoji autofill command if link is suspected.
      const checkForLink = targetInput.slice(0, cmdParts.index);
      if (
        checkForLink.match(
          /(http|https|mailto|matrix|ircs|irc|ftp|ipfs|bitcoin|twitter|dogecoin|ethereum|monero|web3|ar|lbry|steam)$/,
        )
      ) {
        deactivateCmdAndEmit();
        return;
      }
    }

    cmdCursorPos = cursor;
    if (cmdSlug === '') {
      activateCmd(cmdPrefix);
      return;
    }

    if (!isCmdActivated) activateCmd(cmdPrefix);
    viewEvent.emit('cmd_process', cmdPrefix, cmdSlug);
  }

  // Msg Typing
  const handleMsgTyping = (e) => {
    const msg = e.target.value;
    recognizeCmd(e.target.value);
    if (!isCmdActivated) processTyping(msg);
  };

  // Keydown
  const handleKeyDown = (e) => {
    const appearanceSettings = getAppearance();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (roomsInput) roomsInput.cancelReplyTo(roomId, threadId);
      setReplyTo(null);
      tinyFixScrollChat();
    }

    if (
      (!isMobile() || appearanceSettings.sendMessageEnter) &&
      e.key === 'Enter' &&
      e.shiftKey === false
    ) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle Paste
  const handlePaste = (e) => {
    if (e.clipboardData === false) {
      return;
    }

    if (e.clipboardData.items === undefined) {
      return;
    }

    for (let i = 0; i < e.clipboardData.items.length; i += 1) {
      const item = e.clipboardData.items[i];
      if (item.type.indexOf('image') !== -1) {
        const image = item.getAsFile();
        if (attachment === null) {
          setAttachment(image);
          if (image !== null) {
            if (roomsInput) roomsInput.setAttachment(roomId, threadId, image);
            tinyFixScrollChat();
            return;
          }
          tinyFixScrollChat();
        } else {
          return;
        }
      }
    }
  };

  // Add Emoji Function
  function addEmoji(emoji) {
    let textArea = $(textAreaRef.current);
    const tinyEditText = $('.message__edit textarea');
    if (tinyEditText.length > 0) textArea = tinyEditText;

    if (textArea.length > 0) {
      let selectionStart = 0;
      let selectionEnd = 0;

      if (textArea.length > 0) {
        selectionStart = textArea[0].selectionStart;
        selectionEnd = textArea[0].selectionEnd;
      }

      textArea.focus();

      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        let part1 = textArea.val().substring(0, selectionStart);
        let part2 = textArea.val().substring(selectionEnd, textArea.val().length);

        if (part1.endsWith(':')) {
          part1 += ' ';
          selectionStart++;
        }

        if (part2.startsWith(':')) {
          part2 = ` ${part2}`;
          selectionEnd++;
        }

        textArea.val(part1 + emoji.unicode + part2);

        textAreaRef.current.selectionStart = selectionStart + emoji.unicode.length;
        textAreaRef.current.selectionEnd = selectionStart + emoji.unicode.length;
      } else {
        textArea.val(`${textArea.val()}${emoji.unicode}`);
      }

      textArea.focus();
    }
  }

  function uploadFileChange(target, getFile) {
    const file = getFile(0);
    setAttachment(file);
    if (roomsInput && file !== null) roomsInput.setAttachment(roomId, threadId, file);
    tinyFixScrollChat();
  }

  const handleUploadClick = () => {
    if (attachment === null) fileInputClick(uploadInputRef, uploadFileChange);
    else if (roomsInput) {
      roomsInput.cancelAttachment(roomId, threadId);
    }
  };

  useEffect(() => {
    const focusOnLive = () => {
      if (!isMobile()) {
        if (editor.current) ReactEditor.focus(editor.current);
        $(textAreaRef.current).focus();
      }
    };
    roomTimeline.addListener(cons.events.roomTimeline.SCROLL_TO_LIVE, focusOnLive);
    return () => {
      roomTimeline.removeListener(cons.events.roomTimeline.SCROLL_TO_LIVE, focusOnLive);
    };
  });

  useEffect(() => {
    const updateShowStickers = (showStickers) => {
      setIsStickersVisible(showStickers);
    };
    matrixAppearance.on('showStickers', updateShowStickers);
    return () => {
      matrixAppearance.off('showStickers', updateShowStickers);
    };
  });

  // Render Inputs
  function renderInputs() {
    // Check Perm
    const canISend = getCurrentState(roomTimeline.room).maySendMessage(mx.getUserId());
    const tombstoneEvent = getCurrentState(roomTimeline.room).getStateEvents('m.room.tombstone')[0];

    // Nope
    if (!canISend || tombstoneEvent) {
      return (
        <Text className="room-input__alert">
          {tombstoneEvent
            ? (tombstoneEvent.getContent()?.body ??
              'This room has been replaced and is no longer active.')
            : 'You do not have permission to post to this room'}
        </Text>
      );
    }

    setTimeout(() => !isMobile() && $('#message-textarea').focus(), 100);

    // Complete
    return (
      <>
        <div
          className={`room-input__option-container${
            attachment === null ? '' : ' room-attachment__option'
          }`}
        >
          <FileInput onChange={uploadFileChange} ref={uploadInputRef} />

          {attachment ? (
            <IconButton
              id="room-file-upload"
              onClick={handleUploadClick}
              tooltip="Cancel"
              fa="fa-solid fa-circle-plus"
            />
          ) : null}

          <IconButton
            className="d-none"
            id="room-more-textarea"
            onClick={() => {
              $('.room-input').removeClass('textarea-typing');
            }}
            tooltip="More"
            fa="fa-solid fa-angle-right"
          />
        </div>

        <div ref={inputBaseRef} className="room-input__input-container">
          {attachment === null ? (
            <IconButton
              id="room-file-upload"
              className="me-2"
              onDblClick={() => {
                if (closeUpButton) closeUpButton();
                setCloseUpButton(null);
                handleUploadClick();
              }}
              onClick={(evt) =>
                openReusableContextMenu('top', getEventCords(evt, '.btn-link'), (closeMenu) => {
                  setCloseUpButton(closeMenu);
                  return (
                    <RoomUpload
                      roomId={roomId}
                      handleUploadClick={handleUploadClick}
                      afterOptionSelect={closeMenu}
                    />
                  );
                })
              }
              fa="fa-solid fa-circle-plus"
            />
          ) : null}

          {roomTimeline.isEncrypted() && <RawIcon size="extra-small" fa="bi bi-shield-lock-fill" />}

          <ScrollView autoHide>
            <Text className="room-input__textarea-wrapper">
              <TextareaAutosize
                dir="auto"
                id="message-textarea"
                ref={textAreaRef}
                onChange={handleMsgTyping}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="Send a message..."
              />
            </Text>
          </ScrollView>

          <div
            ref={rightOptionsRef}
            id="chat-textarea-actions"
            className="ms-1 room-input__option-container"
          >
            {isStickersVisible ? (
              <IconButton
                id="sticker-opener"
                onClick={(e) => {
                  const cords = getEventCords(e);
                  cords.x -= document.dir === 'rtl' ? -80 : 280;
                  cords.y -= 460;

                  cords.y += 220;

                  openEmojiBoard(roomId, cords, 'sticker', (data) => {
                    handleSendSticker({
                      body: data.unicode.substring(1, data.unicode.length - 1),
                      httpUrl: initMatrix.mxcUrl.toHttp(data.mxc),
                      src: data.src,
                      href: data.href,
                      mxc: data.mxc,
                    });

                    shiftNuller(() => e.target.click());
                  });
                }}
                tooltip="Sticker"
                fa="fa-solid fa-note-sticky"
              />
            ) : null}

            <IconButton
              id="emoji-opener"
              onClick={(e) => {
                const cords = getEventCords(e);
                cords.x -= document.dir === 'rtl' ? -80 : 280;
                cords.y -= 460;

                if (window.matchMedia('screen and (max-width: 479px)').matches) {
                  cords.x -= 50;
                }

                const tabNewSpace = $('.room-view__sticky').height(true) - 84;
                cords.y += 220;

                if (tabNewSpace > 0) {
                  cords.y -= tabNewSpace - 60;
                }

                openEmojiBoard(roomId, cords, 'emoji', (emoji) => {
                  addEmoji(emoji);
                  shiftNuller(() => e.target.click());
                });
              }}
              tooltip="Emoji"
              fa="fa-solid fa-face-smile"
            />

            <IconButton
              id="audio-sender"
              ref={recAudioRef}
              tooltip="Send Audio"
              fa="fa-solid fa-microphone"
            >
              <time className="very-small ps-2 d-none" />
            </IconButton>

            <IconButton
              id="send-room-message"
              onClick={sendMessage}
              tooltip="Send"
              fa="fa-solid fa-paper-plane"
            />
          </div>
        </div>
      </>
    );
  }

  // Insert File
  useEffect(() => {
    if (!fileSrc && attachment) {
      if (!isMobile(true)) {
        blobToBase64(attachment).then((tinySrc) => {
          setFileSrc(tinySrc);
        });
      } else {
        setFileSrc(`data:${attachment.type};base64, ${attachment.data}`);
      }
    } else if (fileSrc && !attachment) {
      setFileSrc(null);
    }
  });

  function attachFile() {
    const fileType = attachment.type.slice(0, attachment.type.indexOf('/'));
    $('#message-textarea').focus();

    return (
      <div className="room-attachment">
        <div
          className={`room-attachment__preview${
            fileType !== 'image' ? ' room-attachment__icon' : ''
          }`}
        >
          {fileType === 'image' && fileSrc && (
            <Img queueId="attach" alt={attachment.name} src={fileSrc} />
          )}
          {fileType === 'video' && <RawIcon fa="fa-solid fa-film" />}
          {fileType === 'audio' && <RawIcon fa="fa-solid fa-volume-high" />}
          {fileType !== 'image' && fileType !== 'video' && fileType !== 'audio' && (
            <RawIcon fa="fa-solid fa-file" />
          )}
        </div>
        <div className="room-attachment__info">
          <Text variant="b1">{attachment.name}</Text>
          <div className="very-small text-gray">
            <span ref={uploadProgressRef}>{`size: ${bytesToSize(attachment.size)}`}</span>
          </div>
        </div>
      </div>
    );
  }

  // File Reply
  function attachReply() {
    return (
      <div className="room-reply">
        <IconButton
          onClick={() => {
            roomsInput.cancelReplyTo(roomId, threadId);
            setReplyTo(null);
            tinyFixScrollChat();
          }}
          className="me-2"
          fa="fa-solid fa-xmark"
          tooltip="Cancel reply"
          size="extra-small"
        />
        <MessageReply
          userId={replyTo.userId}
          onKeyDown={handleKeyDown}
          name={getUsername(replyTo.userId)}
          color={colorMXID(replyTo.userId)}
          body={replyTo.body}
        />
      </div>
    );
  }

  // Complete
  return (
    <>
      {roomsInput && replyTo !== null && attachReply()}
      {attachment !== null && attachFile()}
      <form
        ref={refRoomInput}
        className="room-input"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {renderInputs()}
      </form>
    </>
  );
}
// ================================ End Script

// Room View PropTypes
RoomViewInput.propTypes = {
  roomId: PropTypes.string.isRequired,
  threadId: PropTypes.string,
  roomTimeline: PropTypes.shape({}).isRequired,
  viewEvent: PropTypes.shape({}).isRequired,
};

export default RoomViewInput;
