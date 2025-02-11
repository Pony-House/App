const timeoutFixer = {};
setInterval(() => {
  for (const id in timeoutFixer) {
    if (timeoutFixer[id].now > 0) timeoutFixer[id].now--;
  }
}, 5000);

export const opSetTimeout = (id, callback, value, limit = null) => {
  if (!timeoutFixer[id]) timeoutFixer[id] = { value, now: 0 };
  let result = timeoutFixer[id].value * timeoutFixer[id].now;
  if (typeof limit !== 'number') return setTimeout(callback, result);
  if (result > limit) return setTimeout(callback, limit);
};

export function waitForTrue(getValue, checkInterval = 100) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (getValue()) {
        clearInterval(interval);
        resolve();
      }
    }, checkInterval);
  });
}
