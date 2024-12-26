import $ from 'jquery';
import tinyConsole from '@src/util/libs/console';

import { toggleActionLocal } from '../app/organisms/settings/Api';
import storageManager from './libs/Localstorage';

// Console Values
const prefixConsole = (text, type = 'log') => tinyConsole[type](`[audioRec.js] ${text}`);

// Cache
const tinyCache = {
  /** Stores the recorded audio as Blob objects of audio data as the recording continues */
  audioBlobs: [] /* of type Blob[] */,

  /** Stores the reference of the MediaRecorder instance that handles the MediaStream when recording starts */
  mediaRecorder: null /* of type MediaRecorder */,

  /** Stores the reference to the stream currently capturing the audio */
  streamBeingCaptured: null /* of type MediaStream */,
};

// API to handle audio recording
const audioRecorder = {
  /** Start recording the audio
   * @returns {Promise} - returns a promise that resolves if audio recording successfully started
   */
  start: () => {
    // Feature Detection
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      // Feature is not supported in browser
      // return a custom error
      return Promise.reject(
        new Error('mediaDevices API or getUserMedia method is not supported in this browser.'),
      );
    }

    // Feature is supported in browser

    // create an audio stream
    const tinyAudioDeviceUse = storageManager.getItem('tinyAudioDevice');
    const audioMediaSettings = toggleActionLocal('ponyHouse-usermedia')();
    return (
      navigator.mediaDevices
        .getUserMedia(
          {
            audio: {
              deviceId: {
                exact:
                  typeof tinyAudioDeviceUse === 'string' && tinyAudioDeviceUse.length > 0
                    ? tinyAudioDeviceUse
                    : 'default',
              },
              echoCancellation: audioMediaSettings.echoCancellation === true,
              noiseSuppression: audioMediaSettings.noiseSuppression === true,
            },
          } /* of type MediaStreamConstraints */,
        )
        // returns a promise that resolves to the audio stream
        .then((stream) /* of type MediaStream */ => {
          // save the reference of the stream to be able to stop it when necessary
          tinyCache.streamBeingCaptured = stream;

          // create a media recorder instance by passing that stream into the MediaRecorder constructor
          tinyCache.mediaRecorder = new MediaRecorder(
            stream,
          ); /* the MediaRecorder interface of the MediaStream Recording
                    API provides functionality to easily record media */

          // clear previously saved audio Blobs, if any
          tinyCache.audioBlobs = [];

          // add a dataavailable event listener in order to store the audio data Blobs when recording
          tinyCache.mediaRecorder.addEventListener('dataavailable', (event) => {
            // store audio Blob object
            tinyCache.audioBlobs.push(event.data);
          });

          // start the recording by calling the start method on the media recorder
          tinyCache.mediaRecorder.start();
        })
    );

    /* errors are not handled in the API because if its handled and the promise is chained, the .then after the catch will be executed */
  },

  /** Stop the started audio recording
   * @returns {Promise} - returns a promise that resolves to the audio as a blob file
   */
  stop: () =>
    new Promise((resolve) => {
      if (tinyCache.mediaRecorder) {
        // save audio type to pass to set the Blob type
        const mimeType = tinyCache.mediaRecorder.mimeType;

        // listen to the stop event in order to create & return a single Blob object
        tinyCache.mediaRecorder.addEventListener('stop', () => {
          // create a single blob object, as we might have gathered a few Blob objects that needs to be joined as one
          const audioBlob = new Blob(tinyCache.audioBlobs, { type: mimeType });

          // resolve promise with the single audio blob representing the recorded audio
          resolve(audioBlob);
        });
        audioRecorder.cancel();
      } else {
        resolve(null);
      }
    }),

  /** Cancel audio recording */
  cancel: () => {
    if (tinyCache.mediaRecorder) {
      // stop the recording feature
      tinyCache.mediaRecorder.stop();

      // stop all the tracks on the active stream in order to stop the stream
      audioRecorder.stopStream();

      // reset API properties for next recording
      audioRecorder.resetRecordingProperties();
    }
  },

  /** Stop all the tracks on the active stream in order to stop the stream and remove
   * the red flashing dot showing in the tab
   */
  stopStream: () => {
    if (tinyCache.streamBeingCaptured) {
      // stopping the capturing request by stopping all the tracks on the active stream
      tinyCache.streamBeingCaptured
        .getTracks() // get all tracks from the stream
        .forEach((track) /* of type MediaStreamTrack */ => track.stop()); // stop each one

      return true;
    }
    return false;
  },

  /** Reset all the recording properties including the media recorder and stream being captured */
  resetRecordingProperties: () => {
    tinyCache.mediaRecorder = null;
    tinyCache.streamBeingCaptured = null;

    /* No need to remove event listeners attached to mediaRecorder as
        If a DOM element which is removed is reference-free (no references pointing to it), the element itself is picked
        up by the garbage collector as well as any event handlers/listeners associated with it.
        getEventListeners(tinyCache.mediaRecorder) will return an empty array of events. */
  },
};

// View
const microphoneButton = $('.start-recording-button');
const recordingControlButtonsContainer = $('.recording-contorl-buttons-container');
const stopRecordingButton = $('.stop-recording-button');
const cancelRecordingButton = $('.cancel-recording-button');
const elapsedTimeTag = $('.elapsed-time');
const closeBrowserNotSupportedBoxButton = $('.close-browser-not-supported-box');
const overlay = $('.overlay');
const audioElement = $('.audio-element');
let audioElementSource = $('.audio-element').find('source');
const textIndicatorOfAudiPlaying = $('.text-indication-of-audio-playing');

// Controller

/** Stores the actual start time when an audio recording begins to take place to ensure elapsed time start time is accurate */
let audioRecordStartTime;

/** Stores the maximum recording time in hours to stop recording once maximum recording hour has been reached */
const maximumRecordingTimeInHours = 1;

/** Stores the reference of the setInterval function that controls the timer in audio recording */
let elapsedTimeTimer;

/**
 * @param {String} elapsedTime - elapsed time in the format mm:ss or hh:mm:ss
 * @returns {Boolean} whether the elapsed time reached the maximum number of hours or not
 */
function elapsedTimeReachedMaximumNumberOfHours(elapsedTime) {
  // Split the elapsed time by the symbo :
  const elapsedTimeSplitted = elapsedTime.split(':');

  // Turn the maximum recording time in hours to a string and pad it with zero if less than 10
  const maximumRecordingTimeInHoursAsString =
    maximumRecordingTimeInHours < 10
      ? `0${maximumRecordingTimeInHours}`
      : maximumRecordingTimeInHours.toString();

  // if it the elapsed time reach hours and also reach the maximum recording time in hours return true
  if (
    elapsedTimeSplitted.length === 3 &&
    elapsedTimeSplitted[0] === maximumRecordingTimeInHoursAsString
  )
    return true;
  return false;
}

/** Computes the elapsedTime since the moment the function is called in the format mm:ss or hh:mm:ss
 * @param {String} startTime - start time to compute the elapsed time since
 * @returns {String} elapsed time in mm:ss format or hh:mm:ss format, if elapsed hours are 0.
 */
function computeElapsedTime(startTime) {
  // record end time
  const endTime = new Date();

  // time difference in ms
  let timeDiff = endTime - startTime;

  // convert time difference from ms to seconds
  timeDiff /= 1000;

  // extract integer seconds that dont form a minute using %
  let seconds = Math.floor(timeDiff % 60); // ignoring uncomplete seconds (floor)

  // pad seconds with a zero if neccessary
  seconds = seconds < 10 ? `0${seconds}` : seconds;

  // convert time difference from seconds to minutes using %
  timeDiff = Math.floor(timeDiff / 60);

  // extract integer minutes that don't form an hour using %
  let minutes = timeDiff % 60; // no need to floor possible incomplete minutes, becase they've been handled as seconds
  minutes = minutes < 10 ? `0${minutes}` : minutes;

  // convert time difference from minutes to hours
  timeDiff = Math.floor(timeDiff / 60);

  // extract integer hours that don't form a day using %
  const hours = timeDiff % 24; // no need to floor possible incomplete hours, becase they've been handled as seconds

  // convert time difference from hours to days
  timeDiff = Math.floor(timeDiff / 24);

  // the rest of timeDiff is number of days
  const days = timeDiff; // add days to hours

  let totalHours = hours + days * 24;
  totalHours = totalHours < 10 ? `0${totalHours}` : totalHours;

  if (totalHours === '00') {
    return `${minutes}:${seconds}`;
  }
  return `${totalHours}:${minutes}:${seconds}`;
}

/** Creates a source element for the the audio element in the HTML document */
function createSourceForAudioElement() {
  const sourceElement = document.createElement('source');
  audioElement.append(sourceElement);

  audioElementSource = $(sourceElement);
}

/** Display the text indicator of the audio being playing in the background */
function displayTextIndicatorOfAudioPlaying() {
  textIndicatorOfAudiPlaying.removeClass('hide');
}

/** Plays recorded audio using the audio element in the HTML document
 * @param {Blob} recorderAudioAsBlob - recorded audio as a Blob Object
 */
function playAudio(recorderAudioAsBlob) {
  // read content of files (Blobs) asynchronously
  const reader = new FileReader();

  // once content has been read
  reader.onload = (e) => {
    // store the base64 URL that represents the URL of the recording audio
    const base64URL = e.target.result;

    // If this is the first audio playing, create a source element
    // as pre populating the HTML with a source of empty src causes error
    if (audioElementSource.length > 0)
      // if its not defined create it (happens first time only)
      createSourceForAudioElement();

    // set the audio element's source using the base64 URL
    audioElementSource.attr('src', base64URL);

    // set the type of the audio element based on the recorded audio's Blob type
    const BlobType = recorderAudioAsBlob.type.includes(';')
      ? recorderAudioAsBlob.type.substring(0, recorderAudioAsBlob.type.indexOf(';'))
      : recorderAudioAsBlob.type;
    audioElementSource.attr('type', BlobType);

    // Audio Element
    const audio = audioElement.get(0);

    // call the load method as it is used to update the audio element after changing the source or other settings
    audio.load();

    // play the audio after successfully setting new src and type that corresponds to the recorded audio
    prefixConsole('Playing audio...');
    audio.play();

    // Display text indicator of having the audio play in the background
    displayTextIndicatorOfAudioPlaying();
  };

  // read content and convert it to a URL (base64)
  reader.readAsDataURL(recorderAudioAsBlob);
}

/** Hide the displayed recording control buttons */
function handleHidingRecordingControlButtons() {
  // Display the microphone button that starts audio recording
  microphoneButton.css('display', 'block');

  // Hide the recording control buttons
  recordingControlButtonsContainer.addClass('hide');

  // stop interval that handles both time elapsed and the red dot
  clearInterval(elapsedTimeTimer);
}

/** Stop the currently started audio recording & sends it
 */
function stopAudioRecording() {
  prefixConsole('Stopping Audio Recording...');

  // stop the recording using the audio recording API
  audioRecorder
    .stop()
    .then((audioAsblob) => {
      // Play recorder audio
      playAudio(audioAsblob);

      // hide recording control button & return record icon
      handleHidingRecordingControlButtons();
    })
    .catch((error) => {
      // Error handling structure
      switch (error.name) {
        case 'InvalidStateError': // error from the MediaRecorder.stop
          prefixConsole('An InvalidStateError has occured.', 'error');
          tinyConsole.error(error);
          break;
        default:
          prefixConsole(`An error occured with the error name ${error.name}`, 'error');
          tinyConsole.error(error);
      }
    });
}

/** Display elapsed time during audio recording
 * @param {String} elapsedTime - elapsed time in the format mm:ss or hh:mm:ss
 */
function displayElapsedTimeDuringAudioRecording(elapsedTime) {
  // 1. display the passed elapsed time as the elapsed time in the elapsedTime HTML element
  elapsedTimeTag.html(elapsedTime);

  // 2. Stop the recording when the max number of hours is reached
  if (elapsedTimeReachedMaximumNumberOfHours(elapsedTime)) {
    stopAudioRecording();
  }
}

/** Computes the elapsed recording time since the moment the function is called in the format h:m:s */
function handleElapsedRecordingTime() {
  // display inital time when recording begins
  displayElapsedTimeDuringAudioRecording('00:00');

  // create an interval that compute & displays elapsed time, as well as, animate red dot - every second
  elapsedTimeTimer = setInterval(() => {
    // compute the elapsed time every second
    const elapsedTime = computeElapsedTime(audioRecordStartTime); // pass the actual record start time
    // display the elapsed time
    displayElapsedTimeDuringAudioRecording(elapsedTime);
  }, 1000); // every second
}

/** Displays recording control buttons */
function handleDisplayingRecordingControlButtons() {
  // Hide the microphone button that starts audio recording
  microphoneButton.css('display', 'none');

  // Display the recording control buttons
  recordingControlButtonsContainer.removeClass('hide');

  // Handle the displaying of the elapsed recording time
  handleElapsedRecordingTime();
}

/** Displays browser not supported info box for the user */
function displayBrowserNotSupportedOverlay() {
  overlay.removeClass('hide');
}

/** Displays browser not supported info box for the user */
function hideBrowserNotSupportedOverlay() {
  overlay.addClass('hide');
}

/** Hide the text indicator of the audio being playing in the background */
function hideTextIndicatorOfAudioPlaying() {
  textIndicatorOfAudiPlaying.addClass('hide');
}

/** Starts the audio recording */
function startAudioRecording() {
  prefixConsole('Recording Audio...');

  // If a previous audio recording is playing, pause it
  const audio = audioElement.get(0);
  const recorderAudioIsPlaying = !audio.paused; // the paused property tells whether the media element is paused or not
  prefixConsole(`paused? ${String(!recorderAudioIsPlaying)}`);
  if (recorderAudioIsPlaying) {
    audio.pause();
    // also hide the audio playing indicator displayed on the screen
    hideTextIndicatorOfAudioPlaying();
  }

  // start recording using the audio recording API
  audioRecorder
    .start()
    .then(() => {
      // on success

      // store the recording start time to display the elapsed time according to it
      audioRecordStartTime = new Date();

      // display control buttons to offer the functionality of stop and cancel
      handleDisplayingRecordingControlButtons();
    })
    .catch((error) => {
      // on error
      // No Browser Support Error
      if (
        error.message.includes(
          'mediaDevices API or getUserMedia method is not supported in this browser.',
        )
      ) {
        prefixConsole('To record audio, use browsers like Chrome and Firefox.', 'warn');
        displayBrowserNotSupportedOverlay();
      }

      // Error handling structure
      switch (error.name) {
        case 'AbortError': // error from navigator.mediaDevices.getUserMedia
          prefixConsole('An AbortError has occured.', 'error');
          tinyConsole.error(error);
          break;
        case 'NotAllowedError': // error from navigator.mediaDevices.getUserMedia
          prefixConsole(
            'A NotAllowedError has occured. User might have denied permission.',
            'error',
          );
          tinyConsole.error(error);
          break;
        case 'NotFoundError': // error from navigator.mediaDevices.getUserMedia
          prefixConsole('A NotFoundError has occured.', 'error');
          tinyConsole.error(error);
          break;
        case 'NotReadableError': // error from navigator.mediaDevices.getUserMedia
          prefixConsole('A NotReadableError has occured.', 'error');
          tinyConsole.error(error);
          break;
        case 'SecurityError': // error from navigator.mediaDevices.getUserMedia or from the MediaRecorder.start
          prefixConsole('A SecurityError has occured.', 'error');
          tinyConsole.error(error);
          break;
        case 'TypeError': // error from navigator.mediaDevices.getUserMedia
          prefixConsole('A TypeError has occured.', 'error');
          tinyConsole.error(error);
          break;
        case 'InvalidStateError': // error from the MediaRecorder.start
          prefixConsole('An InvalidStateError has occured.', 'error');
          tinyConsole.error(error);
          break;
        case 'UnknownError': // error from the MediaRecorder.start
          prefixConsole('An UnknownError has occured.', 'error');
          tinyConsole.error(error);
          break;
        default:
          prefixConsole(`An error occured with the error name ${error.name}`, 'error');
          tinyConsole.error(error);
      }
    });
}

/** Cancel the currently started audio recording */
function cancelAudioRecording() {
  prefixConsole('Canceling audio...');

  // cancel the recording using the audio recording API
  audioRecorder.cancel();

  // hide recording control button & return record icon
  handleHidingRecordingControlButtons();
}

// Listeners

// Listen to start recording button
microphoneButton.on('click', startAudioRecording);

// Listen to stop recording button
stopRecordingButton.on('click', stopAudioRecording);

// Listen to cancel recording button
cancelRecordingButton.on('click', cancelAudioRecording);

// Listen to when the ok button is clicked in the browser not supporting audio recording box
closeBrowserNotSupportedBoxButton.on('click', hideBrowserNotSupportedOverlay);

// Listen to when the audio being played ends
audioElement.on('ended', hideTextIndicatorOfAudioPlaying);

// Export
export default audioRecorder;
