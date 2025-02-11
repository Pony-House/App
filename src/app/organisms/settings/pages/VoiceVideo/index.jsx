import React, { useState, useEffect, useRef } from 'react';
import $ from 'jquery';

import tinyConsole from '@src/util/libs/console';
import storageManager from '@src/util/libs/localStorage/StorageManager';
import RatioScreen from '@src/app/atoms/video/RatioScreen';

import VolumeMeter from '../../../../../util/libs/volumeMeter';
import SettingTile from '../../../../molecules/setting-tile/SettingTile';
import Toggle from '../../../../atoms/button/Toggle';
import Button from '../../../../atoms/button/Button';
import { toggleActionLocal } from '../../Api';

let webcamStream = null;
let testingMicro = false;
let microphone = null;
let microInterval = null;

let loadingDevices = false;
let devices;
const listDevices = async () => {
  loadingDevices = true;
  const devicesResult = await navigator.mediaDevices?.enumerateDevices?.();
  if (devicesResult) {
    const video = [];
    const audio = [];
    const speaker = [];

    for (const device of devicesResult) {
      switch (device.kind) {
        case 'videoinput':
          video.push(device);
          break;
        case 'audioinput':
          audio.push(device);
          break;
        case 'audiooutput':
          speaker.push(device);
          break;
      }
    }

    loadingDevices = false;
    devices = { video, audio, speaker };
    return devices;
  }

  loadingDevices = false;
  throw new Error('Media Devices API is not supported.');
};

const validatorVolume = (value) => {
  if (typeof value === 'number' || typeof value === 'string') {
    const newValue = Number(value);

    return !Number.isNaN(newValue) && Number.isFinite(newValue)
      ? newValue >= 0
        ? newValue <= 100
          ? newValue
          : 100
        : 0
      : 100;
  }

  return 100;
};

const stopMicroTest = (testingValue = false, audioMonitor = null) =>
  new Promise(async (resolve, reject) => {
    try {
      if (microphone) await microphone.stop();
      if (audioMonitor) audioMonitor.find('.progress-bar').css('width', '100%');

      microphone = null;
      testingMicro = testingValue;

      if (microInterval) {
        clearInterval(microInterval);
        microInterval = null;
      }

      resolve(true);
    } catch (err) {
      reject(err);
    }
  });

const stopWebcamTest = () =>
  new Promise(async (resolve, reject) => {
    try {
      if (webcamStream) {
        await webcamStream.getTracks().forEach(async (track) => {
          await track.stop();
        });
      }

      webcamStream = null;
      resolve(true);
    } catch (err) {
      reject(err);
    }
  });

function VoiceVideoSection() {
  // Prepare React
  const audioMediaSettings = toggleActionLocal('ponyHouse-usermedia')();
  const [devicesItem, setDevicesItem] = useState(null);

  const [echoCancellation, setEchoCancellation] = useState(
    audioMediaSettings.echoCancellation === true,
  );
  const [noiseSuppression, setNoiseSuppression] = useState(
    audioMediaSettings.noiseSuppression === true,
  );

  const audioSelectRef = useRef(null);
  const speakerSelectRef = useRef(null);
  const videoSelectRef = useRef(null);

  const videoMonitorRef = useRef(null);
  const audioMonitorRef = useRef(null);

  const audioVolumeRef = useRef(null);
  const speakerVolumeRef = useRef(null);

  const testMicroRefButton = useRef(null);
  const testWebcamRefButton = useRef(null);

  // Effects
  useEffect(() => {
    // jQuery prepare
    const testMicroButton = $(testMicroRefButton.current);
    const testWebcamButton = $(testWebcamRefButton.current);

    const audioVolume = $(audioVolumeRef.current);
    const speakerVolume = $(speakerVolumeRef.current);

    const videoMonitor = $(videoMonitorRef.current);
    const audioMonitor = $(audioMonitorRef.current);

    const videoSelect = $(videoSelectRef.current);
    const speakerSelect = $(speakerSelectRef.current);
    const audioSelect = $(audioSelectRef.current);

    // Test Webcam
    const tinyTestWebcam = () => {
      // Start
      testWebcamButton.addClass('disabled');
      const tinyVideoDeviceUse = storageManager.getItem('tinyVideoDevice');

      // Start Media
      navigator.getUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msgGetUserMedia;
      navigator.getUserMedia(
        {
          video: {
            deviceId: {
              exact:
                typeof tinyVideoDeviceUse === 'string' && tinyVideoDeviceUse.length > 0
                  ? tinyVideoDeviceUse
                  : 'default',
            },
          },
        },
        (stream) => {
          webcamStream = stream;
          const video = $('<video>', { class: 'h-100 w-100' }).prop('autoplay', true);
          videoMonitor.empty().append(video).css('background-color', '#000');
          video[0].srcObject = stream;
        },
        (err) => {
          testWebcamButton.removeClass('disabled');
          tinyConsole.error(err);
          alert(err.message, 'Webcam Stream Error');
        },
      );
    };

    // Test Microphone
    const tinyTestMicro = (forced = false) => {
      // Prepare Micro
      testMicroButton.removeClass('btn-outline-primary').removeClass('btn-outline-danger');
      if ((!testingMicro && !microphone) || (typeof forced === 'boolean' && forced)) {
        stopMicroTest(true, audioMonitor)
          .then(() => {
            // Get Value
            testMicroButton.addClass('disabled');
            const tinyAudioDeviceUse = storageManager.getItem('tinyAudioDevice');

            // Start Media
            navigator.getUserMedia =
              navigator.getUserMedia ||
              navigator.webkitGetUserMedia ||
              navigator.mozGetUserMedia ||
              navigator.msgGetUserMedia;
            navigator.getUserMedia(
              {
                audio: {
                  /*
                            mandatory: {
                                googEchoCancellation: false,
                                googAutoGainControl: false,
                                googNoiseSuppression: false,
                                googHighpassFilter: false
                            },
                            */

                  echoCancellation,
                  noiseSuppression,
                  autoGainControl: false,
                  highpassFilter: false,

                  deviceId: {
                    exact:
                      typeof tinyAudioDeviceUse === 'string' && tinyAudioDeviceUse.length > 0
                        ? tinyAudioDeviceUse
                        : 'default',
                  },
                },
              },
              (stream) => {
                // Prepare Audio
                microphone = new VolumeMeter();
                microphone.connectToSource(stream, true, () => {
                  microphone.setVolume(storageManager.getItem('tinyAudioVolume'));
                  microInterval = setInterval(() => {
                    let volumeValue = microphone.volume * 1000;
                    volumeValue = volumeValue < 100 ? (volumeValue > 0 ? volumeValue : 0) : 100;

                    audioMonitor.find('.progress-bar').css('width', `${100 - volumeValue}%`);
                  }, 1);
                });

                // Complete
                testMicroButton.addClass('btn-outline-danger');
                testMicroButton.removeClass('disabled');
              },
              (err) => {
                testMicroButton.addClass('btn-outline-primary');
                testMicroButton.removeClass('disabled');

                tinyConsole.error(err);
                alert(err.message, 'Microphone Stream Error');
              },
            );
          })
          .catch((err) => {
            tinyConsole.error(err);
            alert(err.message, 'Stop Microphone Error');
          });
      }

      // Disable
      else {
        stopMicroTest(true, audioMonitor)
          .then(() => {
            microphone = null;
            testingMicro = false;

            testMicroButton.addClass('btn-outline-primary');
          })
          .catch((err) => {
            tinyConsole.error(err);
            alert(err.message, 'Stop Microphone Error');
          });
      }
    };

    // Insert Volume
    let tinyAudioVolume = storageManager.getItem('tinyAudioVolume');
    let tinySpeakerVolume = storageManager.getItem('tinySpeakerVolume');

    tinyAudioVolume = validatorVolume(tinyAudioVolume);
    tinySpeakerVolume = validatorVolume(tinySpeakerVolume);

    const updateTinyVolume =
      (target, where, updateVolume = false, forceUpdate = false) =>
      () => {
        const oldValue = storageManager.getItem(where);
        const newValue = target.val();

        if (oldValue !== newValue) storageManager.setItem(where, newValue);
        if (updateVolume && microphone) microphone.setVolume(newValue);

        if (testingMicro && microphone && forceUpdate) {
          tinyTestMicro(true);
        }
      };

    audioVolume.val(tinyAudioVolume);
    speakerVolume.val(tinySpeakerVolume);

    const updateVolAudio = updateTinyVolume(audioVolume, 'tinyAudioVolume', true);
    const updateSpeakerAudio = updateTinyVolume(speakerVolume, 'tinySpeakerVolume');

    // Insert Selectors
    let tinyAudioDevice = storageManager.getItem('tinyAudioDevice');
    let tinySpeakerDevice = storageManager.getItem('tinySpeakerDevice');
    let tinyVideoDevice = storageManager.getItem('tinyVideoDevice');

    if (typeof tinyAudioDevice !== 'string' || tinyAudioDevice.length < 1)
      tinyAudioDevice = 'default';
    if (typeof tinySpeakerDevice !== 'string' || tinySpeakerDevice.length < 1)
      tinySpeakerDevice = 'default';
    if (typeof tinyVideoDevice !== 'string' || tinyVideoDevice.length < 1)
      tinyVideoDevice = 'default';

    videoSelect.val(tinyVideoDevice);
    speakerSelect.val(tinySpeakerDevice);
    audioSelect.val(tinyAudioDevice);

    const updateVolDevice = updateTinyVolume(audioSelect, 'tinyAudioDevice', false, true);
    const updateSpeakerDevice = updateTinyVolume(speakerSelect, 'tinySpeakerDevice', false, true);
    const updateVideoDevice = updateTinyVolume(videoSelect, 'tinyVideoDevice');

    // Get Devices List
    if (!loadingDevices && devicesItem === null) {
      listDevices()
        .then((devices2) => {
          setDevicesItem(devices2);
        })
        .catch((err) => {
          tinyConsole.error(err);
          alert(err.message, 'List Devices Error');
        });
    } else {
      setDevicesItem(devices);
    }

    // Events
    videoSelect.on('change', updateVideoDevice);
    speakerSelect.on('change', updateSpeakerDevice);
    audioSelect.on('change', updateVolDevice);

    audioVolume.on('change', updateVolAudio);
    speakerVolume.on('change', updateSpeakerAudio);

    testMicroButton.on('click', tinyTestMicro);
    testWebcamButton.on('click', tinyTestWebcam);

    return () => {
      if (devicesItem !== null) setDevicesItem(null);

      videoSelect.off('change', updateVideoDevice);
      speakerSelect.off('change', updateSpeakerDevice);
      audioSelect.off('change', updateVolDevice);
      audioVolume.off('change', updateVolAudio);
      speakerVolume.off('change', updateSpeakerAudio);

      testMicroButton.off('click', tinyTestMicro);
      testWebcamButton.off('click', tinyTestWebcam);

      testMicroButton
        .removeClass('btn-outline-primary')
        .removeClass('btn-outline-danger')
        .addClass('btn-outline-primary');
      stopMicroTest(false, audioMonitor);
      stopWebcamTest();
    };
  });

  // Complete Render
  return (
    <>
      <div className="card noselect">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Voice Settings</li>

          <li className="list-group-item border-0">
            <div className="row">
              <div className="col-md-6">
                <div className="very-small text-uppercase fw-bold mb-2">Input Device</div>
                <select ref={audioSelectRef} className="form-select form-control-bg">
                  <option>Choose...</option>
                  {devicesItem && Array.isArray(devicesItem.audio) && devicesItem.audio.length > 0
                    ? devicesItem.audio.map((item) => (
                        <option
                          key={`voiceVideoSection_input_audio_${item.deviceId}`}
                          value={item.deviceId}
                        >
                          {item.label}
                        </option>
                      ))
                    : null}
                </select>
              </div>

              <div className="col-md-6">
                <div className="very-small text-uppercase fw-bold mb-2">Output Device</div>
                <select ref={speakerSelectRef} className="form-select form-control-bg">
                  <option>Choose...</option>
                  {devicesItem &&
                  Array.isArray(devicesItem.speaker) &&
                  devicesItem.speaker.length > 0
                    ? devicesItem.speaker.map((item) => (
                        <option
                          key={`voiceVideoSection_input_speak_${item.deviceId}`}
                          value={item.deviceId}
                        >
                          {item.label}
                        </option>
                      ))
                    : null}
                </select>
              </div>
            </div>
          </li>

          <li className="list-group-item border-0">
            <div className="row">
              <div className="col-md-6">
                <div className="very-small text-uppercase fw-bold mb-2">Input Volume</div>
                <input ref={audioVolumeRef} type="range" className="form-range" min={0} max={100} />
              </div>

              <div className="col-md-6">
                <div className="very-small text-uppercase fw-bold mb-2">Output Volume</div>
                <input
                  ref={speakerVolumeRef}
                  type="range"
                  className="form-range"
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </li>

          <li className="list-group-item border-0">
            <div className="very-small text-uppercase fw-bold mb-1">Mic Test</div>

            <div className="very-small mb-2">
              Having mic issues? Start a test and say something fun. Your voice will be played back
              to you.
            </div>
            <div className="my-3">
              <button
                className={`btn btn-sm btn-outline-${testingMicro ? 'danger' : 'primary'}`}
                type="button"
                ref={testMicroRefButton}
              >
                Let&apos;s Check
              </button>
            </div>

            <div
              ref={audioMonitorRef}
              className="progress justify-content-end audio-progress-bar"
              role="progressbar"
            >
              <div className="progress-bar" style={{ width: '100%' }} />
            </div>
          </li>
        </ul>
      </div>

      <div className="card noselect mt-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Video Settings</li>

          <li className="list-group-item border-0">
            <center>
              <RatioScreen classBase="" className="w-50 border border-bg mb-2">
                <div
                  ref={videoMonitorRef}
                  className="d-flex justify-content-center align-items-center text-center"
                >
                  <Button
                    ref={testWebcamRefButton}
                    variant="primary"
                    className="btn-sm"
                    size="extra-small"
                    tooltip="Test Video"
                    faSrc="fa-solid fa-video"
                  >
                    Test Video
                  </Button>
                </div>
              </RatioScreen>
            </center>

            <div className="very-small text-uppercase fw-bold mb-2">Camera</div>
            <select ref={videoSelectRef} className="form-select form-control-bg">
              <option selected>Choose...</option>
              {devicesItem && Array.isArray(devicesItem.video) && devicesItem.video.length > 0
                ? devicesItem.video.map((item) => (
                    <option
                      key={`voiceVideoSection_input_camera_${item.deviceId}`}
                      value={item.deviceId}
                    >
                      {item.label}
                    </option>
                  ))
                : null}
            </select>
          </li>
        </ul>
      </div>

      <div className="card noselect mt-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">User Media Settings</li>

          <SettingTile
            title="Echo Cancellation"
            options={
              <Toggle
                className="d-inline-flex"
                isActive={echoCancellation}
                onToggle={toggleActionLocal(
                  'ponyHouse-usermedia',
                  'echoCancellation',
                  setEchoCancellation,
                )}
              />
            }
            content={
              <div className="very-small text-gray">
                Echo cancellation is a feature which attempts to prevent echo effects on a two-way
                audio connection by attempting to reduce or eliminate crosstalk between the
                user&apos;s output device and their input device.
              </div>
            }
          />

          <SettingTile
            title="Noise Suppression"
            options={
              <Toggle
                className="d-inline-flex"
                isActive={noiseSuppression}
                onToggle={toggleActionLocal(
                  'ponyHouse-usermedia',
                  'noiseSuppression',
                  setNoiseSuppression,
                )}
              />
            }
            content={
              <div className="very-small text-gray">
                Noise suppression automatically filters the audio to remove background noise, hum
                caused by equipment.
              </div>
            }
          />
        </ul>
      </div>
    </>
  );
}

export default VoiceVideoSection;
