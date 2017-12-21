/* jshint node: true */
'use strict';

PassFF.Auth = (function () {
  /**
    * This controller comes into play when HTTP authentication is required.
    */

  var currentHttpAuth = null;

  function auth_cancel() {
    if (typeof currentHttpAuth.resolve === 'function') {
      currentHttpAuth.resolve({ cancel: false });
    }
    auth_reset();
  }

  function auth_reset() {
    if (currentHttpAuth !== null
        && currentHttpAuth.popup !== null) {
      browser.windows.onRemoved.removeListener(currentHttpAuth.onClose);
      browser.windows.remove(currentHttpAuth.popup.id);
    }
    currentHttpAuth = {
      details: null,
      promise: null,
      popup: null,
      resolve: null,
    };
    PassFF.Menu.state['itemPickerTarget'] = undefined;
  }

  function onAuthRequired(requestDetails) {
    auth_cancel();
    currentHttpAuth.details = requestDetails;
    PassFF.Menu.state['itemPickerTarget'] = requestDetails.url;
    return new Promise((resolve, reject) => {
      browser.windows.create({
        'url': browser.extension.getURL('/content/itemPicker.html'),
        'width': 450,
        'height': 281,
        'type': 'popup',
      }).then((win) => {
        browser.windows.update(win.id, { height: 280 });
        currentHttpAuth.popup = win;
        currentHttpAuth.onClose = function (windowId) {
          if (win.id === windowId) {
            auth_cancel();
          }
        };
        browser.windows.onRemoved.addListener(currentHttpAuth.onClose);
      });
      currentHttpAuth.resolve = resolve;
    });
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    init: function () {
      auth_reset();
      browser.webRequest.onAuthRequired.removeListener(onAuthRequired);
      if(PassFF.Preferences.handleHttpAuth) {
        browser.webRequest.onAuthRequired.addListener(
          onAuthRequired, { urls: ["<all_urls>"] }, ["blocking"]
        );
      }
    },

    resolve: function (item) {
      log.debug("Resolve HTTP auth", item);
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") {
            /* User has probably cancelled the GPG decryption */
            return false;
          }
          currentHttpAuth.resolve({
            authCredentials: {
              username: passwordData.login,
              password: passwordData.password
            }
          });
          auth_reset();
        });
    }
  };
})();
