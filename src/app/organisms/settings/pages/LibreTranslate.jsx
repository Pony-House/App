import React, { useState, useEffect } from 'react';
import clone from 'clone';

import tinyConsole from '@src/util/libs/console';
import Img from '@src/app/atoms/image/Image';
import libreTranslate from '@src/util/libs/libreTranslate';
import SegmentedControls from '@src/app/atoms/segmented-controls/SegmentedControls';
import { getAppearance } from '@src/util/libs/appearance';
import SettingText from '@src/app/molecules/setting-text/SettingText';

import SettingTile from '../../../molecules/setting-tile/SettingTile';
import Toggle from '../../../atoms/button/Toggle';
import { toggleActionLocal } from '../Api';

function LibreTranslateSection() {
  const appearanceSettings = getAppearance();
  const [isEnabled, setIsEnabled] = useState(libreTranslate.get('enabled'));

  const [host, setHost] = useState(libreTranslate.get('host'));
  const [apiKey, setApiKey] = useState(libreTranslate.get('apiKey'));
  const [source, setSource] = useState(libreTranslate.get('source'));
  const [target, setTarget] = useState(libreTranslate.get('target'));
  const [langs, setLangs] = useState(null);
  const [loadingLangs, setLoadingLangs] = useState(false);

  useEffect(() => {
    if (langs === null && !loadingLangs) {
      setLoadingLangs(true);
      libreTranslate
        .getLanguages()
        .then((langData) => {
          if (langData !== null && langData.length > 0) {
            const newLangs = [];
            for (const item in langData) {
              newLangs.push({
                text: langData[item].name,
                value: langData[item].code,
              });
            }

            setLangs(newLangs);
          }
          setLoadingLangs(false);
        })
        .catch((err) => {
          tinyConsole.error(err);
          setLoadingLangs(false);
        });
    }
  });

  const toggleAppearanceAction = (where, setData) => (data) => {
    setData(data);
    libreTranslate.set(where, data);
  };

  const validatorSelect = (value, items) => {
    if (Array.isArray(items)) return items.findIndex((ti) => ti.value === value);
    return -1;
  };

  const sourceList = clone(langs);
  if (Array.isArray(sourceList)) {
    sourceList.push({
      text: 'Auto Detect',
      value: 'auto',
    });
  }

  // Complete Render
  return (
    <>
      <div className="card noselect mb-3">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Feature</li>

          <SettingTile
            title="Enabled"
            options={
              <Toggle
                className="d-inline-flex"
                isActive={isEnabled}
                onToggle={toggleAppearanceAction('enabled', setIsEnabled)}
              />
            }
            content={
              <div className="very-small text-gray">
                Activate all Libre Translation resources at {__ENV_APP__.INFO.name}.
              </div>
            }
          />

          {!appearanceSettings.basicUserMode && appearanceSettings.advancedUserMode ? (
            <SettingTile
              title="Host domain"
              content={
                <SettingText
                  value={host || libreTranslate.getDefaultHost()}
                  onChange={(value, target, queryTarget) => {
                    if (libreTranslate.testUrl(value)) {
                      libreTranslate.set('host', value);
                      setHost(value);
                    } else {
                      queryTarget.val('');
                    }
                  }}
                  maxLength={100}
                  content={
                    <div className="very-small text-gray">
                      Enter the host domain of your LibreTranslate instance. You can just type the
                      domain, or type your address into a http or https protocol. If you are using
                      localhost, place the address starting with "http://".
                    </div>
                  }
                />
              }
            />
          ) : null}

          <SettingTile
            title="API Key"
            content={
              <SettingText
                value={apiKey}
                onChange={(value) => {
                  libreTranslate.set('apiKey', value);
                  setApiKey(value);
                }}
                maxLength={300}
                isPassword
                content={
                  <div className="very-small text-gray">
                    If you are using a LibreTranslate instance that requires an API key, please
                    enter here. This information is saved on your machine locally.
                  </div>
                }
              />
            }
          />

          {!appearanceSettings.basicUserMode ? (
            <SettingTile
              title="Source"
              content={
                <div className="mt-2">
                  <SegmentedControls
                    type="select"
                    disabled={!Array.isArray(langs)}
                    selected={validatorSelect(source, sourceList)}
                    segments={Array.isArray(sourceList) ? sourceList : []}
                    onSelect={(index) => {
                      if (Array.isArray(langs)) {
                        const value = sourceList[index].value;
                        if (value !== source) {
                          libreTranslate.set('source', value);
                          setSource(value);
                        }
                      }
                    }}
                  />
                </div>
              }
            />
          ) : null}

          <SettingTile
            title="Target"
            content={
              <div className="mt-2">
                <SegmentedControls
                  type="select"
                  disabled={!Array.isArray(langs)}
                  selected={validatorSelect(target, langs)}
                  segments={Array.isArray(langs) ? langs : []}
                  onSelect={(index) => {
                    if (Array.isArray(langs)) {
                      const value = langs[index].value;
                      if (value !== target) {
                        libreTranslate.set('target', value);
                        setTarget(value);
                      }
                    }
                  }}
                />
              </div>
            }
          />
        </ul>
      </div>

      <div className="card">
        <ul className="list-group list-group-flush">
          <li className="list-group-item very-small text-gray">Credits</li>

          <li className="list-group-item border-0">
            <Img
              src="./img/icon/libre-translate.ico"
              className="logo-white-bg mb-1"
              alt="libre-translate-logo"
              draggable={false}
            />
            <div className="small">
              This software is not directly installed at Pony House. This is a third-party service
              connected using a API that will only be executed when you request execution. If you
              are an advanced user, you can use your own LibreTranslate self-host to increase your
              privacy. Enable advanced user settings to change the host used by the{' '}
              {__ENV_APP__.INFO.name}.
            </div>
            <div className="small">
              The{' '}
              <a
                href="https://github.com/LibreTranslate/LibreTranslate"
                rel="noreferrer noopener"
                target="_blank"
              >
                Libre Translate
              </a>{' '}
              is used under the terms of{' '}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.en.html"
                rel="noreferrer noopener"
                target="_blank"
              >
                AGPL-3.0
              </a>
              .
            </div>
          </li>
        </ul>
      </div>
    </>
  );
}

export default LibreTranslateSection;
