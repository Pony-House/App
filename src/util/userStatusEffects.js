import mobileEvents from './libs/mobile';

// Cache Data
const userInteractions = {
  mobile: {
    isActive: true,
  },

  vc: {
    isActive: false,
  },
};

// Mobile
mobileEvents.on('appStateChangeIsActive', (isActive) => {
  userInteractions.mobile.isActive = isActive;
});

// Voice Chat Mode
export function setVoiceChatMode(value = true) {
  if (typeof value === 'boolean') userInteractions.vc.isActive = value;
}
