import { log } from "./util.js";

export function getOverwrites(prefs) {
  if (!browser.storage.managed) {
    return Promise.resolve({});
  }
  return browser.storage.managed
    .get(Object.keys(prefs))
    .catch(() => ({})) // rejects when no policy is configured
    .then((res) => {
      let overwrites = {};
      for (let [key, val] of Object.entries(res || {})) {
        if (typeof val === typeof prefs[key]) {
          overwrites[key] = val;
        } else {
          log.warn("Ignoring invalid managed preference", key);
        }
      }
      return overwrites;
    });
}
