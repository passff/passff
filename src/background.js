/* jshint node: true */
'use strict';

browser.runtime.onMessage.addListener(PassFF.bg_handle);

PassFF.Preferences.init(true)
  .then(() => PassFF.init())
  .then(() => PassFF.Pass.init())
  .then(() => {
    browser.tabs.onUpdated.addListener(PassFF.onTabUpdate);
    browser.tabs.onActivated.addListener(PassFF.onTabUpdate);
    PassFF.onTabUpdate();
  });
