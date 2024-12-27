let resetRoomInfo;
global.resetRoomInfo = () => (typeof resetRoomInfo === 'function' ? resetRoomInfo() : null);
let tinyRoomInfo;

export function getRoomInfo() {
  return tinyRoomInfo;
}

export const setResetRoomInfo = (newResetInfo) => {
  resetRoomInfo = newResetInfo;
};

export const setTinyRoomInfo = (newRoomInfo) => {
  tinyRoomInfo = newRoomInfo;
};

if (__ENV_APP__.MODE === 'development') {
  global.getRoomInfo = getRoomInfo;
}
