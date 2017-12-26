/* jshint node: true */
'use strict';

PassFF.Auth = (function () {
  /**
    * This controller comes into play when HTTP authentication is required.
    */

  var currentHttpAuth = {
    requestId: null,
    popupId: null,
    popupClose: null,
    resolveItem: null,
    resolveAttempts: 0,
  };

  function cancelAuth() {
    log.debug("Cancelling auth", currentHttpAuth.requestId);
    if (typeof currentHttpAuth.resolve === 'function') {
      currentHttpAuth.resolve({ cancel: false });
    }
    closePopup();
    currentHttpAuth.requestId = null;
    currentHttpAuth.popupId = null;
    currentHttpAuth.popupClose = null;
    currentHttpAuth.resolveItem = null;
    currentHttpAuth.resolveAttempts = 0;
  }

  function closePopup() {
    log.debug("Clean up auth popup", currentHttpAuth.requestId);
    if (currentHttpAuth.popupId !== null) {
      browser.windows.onRemoved.removeListener(currentHttpAuth.popupClose);
      browser.windows.remove(currentHttpAuth.popupId);
    }
    PassFF.Menu.state['itemPickerTarget'] = undefined;
  }

  function onAuthRequired(details) {
    log.debug("onAuthRequired", details.requestId, details.url);

    // Allow for two resolve attempts.
    // This is crucial when we have a HTTP->HTTPS redirect after the first
    // attempt (which triggers a second auth request with same id).
    if (details.requestId !== currentHttpAuth.requestId
        || currentHttpAuth.resolveAttempts >= 2) cancelAuth();

    currentHttpAuth.requestId = details.requestId;
    PassFF.Menu.state['itemPickerTarget'] = details.url;
    return new Promise((resolve, reject) => {
      currentHttpAuth.resolve = resolve;
      PassFF.Page.goToAutoFillPending()
        .then(function (pending) {
          if (pending !== null) {
            log.debug("Handle pending auto fill", pending.item.fullKey,
                      "as HTTP auth", currentHttpAuth.requestId);
            currentHttpAuth.resolveItem = pending.item;
            PassFF.Page.resolveGoToAutoFillPending(false);
          }
          if (PassFF.Preferences.autoFill && PassFF.Preferences.autoSubmit) {
            let url = details.url;
            let matchItems = PassFF.Pass.getUrlMatchingItems(url);
            let bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);
            currentHttpAuth.resolveItem = bestFitItem;
          }
          if (currentHttpAuth.resolveItem !== null) {
            return PassFF.Auth.resolve(currentHttpAuth.resolveItem);
          }
          log.debug("Open HTTP auth dialog");
          return browser.windows.create({
            'url': browser.extension.getURL('/content/itemPicker.html'),
            'width': 450,
            'height': 281,
            'type': 'popup',
          })
        })
        .then((win) => {
          if (typeof win === "undefined") return;
          browser.windows.update(win.id, { height: 280 });
          currentHttpAuth.popupId = win.id;
          currentHttpAuth.popupClose = function (windowId) {
            if (win.id === windowId) cancelAuth();
          };
          browser.windows.onRemoved.addListener(currentHttpAuth.popupClose);
        });
    });
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    init: function () {
      log.debug("Init auth module");
      browser.webRequest.onAuthRequired.removeListener(onAuthRequired);
      if(PassFF.Preferences.handleHttpAuth) {
        browser.webRequest.onAuthRequired.addListener(
          onAuthRequired, { urls: ["<all_urls>"] }, ["blocking"]
        );
      }
    },

    resolve: function (item) {
      log.debug("Get pass data for HTTP auth", currentHttpAuth.requestId);
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") {
            /* User has probably cancelled the GPG decryption */
            return false;
          }
          log.debug("Resolve HTTP auth", currentHttpAuth.requestId,
                    "using", item.fullKey, currentHttpAuth.resolveAttempts);
          currentHttpAuth.resolveItem = item;
          currentHttpAuth.resolveAttempts += 1;
          currentHttpAuth.resolve({
            authCredentials: {
              username: passwordData.login,
              password: passwordData.password
            }
          });
          closePopup();
        });
    }
  };
})();
