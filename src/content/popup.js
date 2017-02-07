/* jshint node: true */
'use strict';

PassFF.Preferences.init();
var promisedInit = PassFF.Pass.init();

window.onload = function () {
    PassFF.Menu.init(document);
    promisedInit.then(() => {
        browser.tabs.onUpdated.addListener(PassFF.onTabUpdate);
        PassFF.onTabUpdate();
    });
};
