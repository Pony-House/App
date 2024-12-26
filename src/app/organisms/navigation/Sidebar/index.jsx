import React, { useEffect, useState } from 'react';
import { Crypto } from 'matrix-js-sdk';

import tinyConsole from '@src/util/libs/console';

import settings from '@src/client/state/settings';
import initMatrix from '@src/client/initMatrix';

import { openShortcutSpaces, openSearch, openSettings } from '../../../../client/action/navigation';

import { isCrossVerified } from '../../../../util/matrixUtil';

import Avatar from '../../../atoms/avatar/Avatar';
import ScrollView from '../../../atoms/scroll/ScrollView';
import SidebarAvatar from '../../../molecules/sidebar-avatar/SidebarAvatar';

import { useDeviceList } from '../../../hooks/useDeviceList';
import { tabText as settingTabText } from '../../settings/Settings';
import SpaceShortcut from './SpaceShortcut';
import FeaturedTab from './FeaturedTab';
import InviteSidebar from './InviteSidebar';

// Cross Sigin Alert
function CrossSigninAlert({ isIconsColored }) {
  const { deviceList } = useDeviceList();
  const [unverified, setUnverified] = useState([]);
  const [devicesChecked, setDevicesChecked] = useState(false);

  useEffect(() => {
    const mx = initMatrix.matrixClient;
    if (!devicesChecked && deviceList) {
      setDevicesChecked(true);
      const checkDevices = async () => {
        const tinyUnverified = [];

        for (const item in deviceList) {
          const device = deviceList[item];
          try {
            const isVerified = await isCrossVerified(device.device_id);
            if (isVerified === false) {
              tinyUnverified.push(device);
            }
          } catch {}
        }

        setUnverified(tinyUnverified);
      };

      checkDevices();
    }

    try {
      const updateList = () => setDevicesChecked(false);
      const crypto = mx.getCrypto();
      crypto.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
      crypto.on(Crypto.CryptoEvent.UserTrustStatusChanged, updateList);
      crypto.on(Crypto.CryptoEvent.DevicesUpdated, updateList);
      crypto.on(Crypto.CryptoEvent.VerificationRequestReceived, updateList);
      return () => {
        crypto.off(Crypto.CryptoEvent.UserTrustStatusChanged, updateList);
        crypto.off(Crypto.CryptoEvent.DevicesUpdated, updateList);
        crypto.off(Crypto.CryptoEvent.VerificationRequestReceived, updateList);
      };
    } catch (err) {
      tinyConsole.error(err);
    }
  });

  if (!unverified?.length) return null;

  return (
    <SidebarAvatar
      className="sidebar__cross-signin-alert"
      tooltip={`${unverified.length} unverified sessions`}
      onClick={() => openSettings(settingTabText.SECURITY)}
      avatar={
        <Avatar
          neonColor
          iconColor={!isIconsColored ? null : 'var(--bs-danger)'}
          faSrc="bi bi-shield-lock-fill btn-text-danger"
          imgClass="profile-image-container"
          className="profile-image-container"
          size="normal"
        />
      }
    />
  );
}

// Sidebar
function SideBar() {
  const [isIconsColored, setIsIconsColored] = useState(settings.isSelectedThemeColored());
  settings.isThemeColoredDetector(useEffect, setIsIconsColored);

  return (
    <>
      <center className="sidebar-item-1 h-100">
        <ScrollView invisible>
          <div className="scrollable-content">
            <div id="space-feature" className="featured-container">
              <FeaturedTab />
              <InviteSidebar />
              <CrossSigninAlert isIconsColored={isIconsColored} />
            </div>

            <div className="sidebar-divider" />

            <div id="space-container" className="space-container">
              <SpaceShortcut />
              <SidebarAvatar
                tooltip="Pin spaces"
                onClick={() => openShortcutSpaces()}
                avatar={
                  <Avatar
                    neonColor
                    iconColor={!isIconsColored ? null : 'rgb(84, 101, 232)'}
                    faSrc="bi bi-bookmark-plus-fill"
                    imgClass="profile-image-container"
                    className="profile-image-container"
                    size="normal"
                  />
                }
              />
            </div>
          </div>
        </ScrollView>
      </center>

      <center className="sidebar-item-2">
        <div className="sidebar-divider" />
        <div id="space-container-2" className="sticky-container">
          <SidebarAvatar
            tooltip="Search"
            onClick={() => openSearch()}
            avatar={
              <Avatar
                neonColor
                iconColor={!isIconsColored ? null : 'rgb(164, 42, 212)'}
                faSrc="fa-solid fa-magnifying-glass"
                imgClass="profile-image-container"
                className="profile-image-container"
                size="normal"
              />
            }
          />
        </div>
      </center>
    </>
  );
}

export default SideBar;
