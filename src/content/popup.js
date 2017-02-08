/* jshint node: true */
'use strict';

let promisedBg = browser.runtime.getBackgroundPage();

window.onload = function () {
    promisedBg.then((bg) => {
        bg.PassFF.Menu.init(window);
    });
};
