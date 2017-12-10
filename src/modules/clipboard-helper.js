/* jshint node: true */
'use strict';

// If this function is not called on a visible page, such as a browserAction
// popup or a content script, it is delegated to a content script.
function copyToClipboard(text) {
  if (typeof chrome.extension.getBackgroundPage === 'function') {
    // probably background script
    getActiveTab().then((tab) => {
      let code = `copyToClipboard({0});`.format(JSON.stringify(text));
      PassFF.Page._execWithDeps(tab, code, [{
        'source': 'modules/clipboard-helper.js',
        'functions': ['copyToClipboard'],
      }]);
    });
  } else {
    document.addEventListener("copy", function oncopy(event) {
      document.removeEventListener("copy", oncopy, true);

      // Hide the event from the page to prevent tampering.
      event.stopImmediatePropagation();

      // Overwrite the clipboard content.
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    }, true);

    // Requires the clipboardWrite permission, or a user gesture:
    document.execCommand("copy");
  }
}
