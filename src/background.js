/* jshint node: true */
'use strict';

PassFF.Preferences.init();
PassFF.Pass.init().then(() => {
  browser.tabs.onUpdated.addListener(PassFF.onTabUpdate);
  browser.tabs.onActivated.addListener(PassFF.onTabUpdate);
  PassFF.onTabUpdate();
});
