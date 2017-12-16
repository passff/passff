/* jshint node: true */
'use strict';

let promised_init = PassFF.init(false);
window.onload = () => promised_init.then(() => {
  let passOutputEl = document.getElementsByTagName("pre")[0];
  let restOutputEl = document.getElementsByTagName("pre")[1];
  document.querySelector("div:first-child > span").textContent
    = PassFF.gsfm("passff_display_hover");
  PassFF.bg_exec('getDisplayItemData')
    .then((passwordData) => {
      let otherData = passwordData['fullText'];
      let sep = otherData.indexOf("\n");
      passOutputEl.textContent = passwordData['password'];
      restOutputEl.textContent = otherData.substring(sep+1);
    });
});
