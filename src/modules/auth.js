/* jshint node: true */
'use strict';

PassFF.Auth = (function () {
  /**
    * This controller comes into play when HTTP authentication is required.
    */

  var currentAuths = [];
  var promises = {};

  function getAuthById(requestId) {
    let auth = currentAuths.filter(a => a.requestId === requestId);
    return (!auth.length) ? null : auth[0];
  }

  // Find a currentAuth for the current realm at the root URI as per [0]
  // [0] https://datatracker.ietf.org/doc/html/rfc7235#section-2.2
  function getAuthByRootUriAndRealm(rootUri, realm) {
    let auth = currentAuths.filter(a => (
        a.rootUri === rootUri
        && a.realm === realm
    ));
    return (!auth.length) ? null : auth[0];
  }

  // Get the root URI (scheme + authority [0]) from a URL
  // [0] https://datatracker.ietf.org/doc/html/rfc3986#section-3.2
  function getRootUri(url) {
      return url.replace(/^(.*\/\/[^\/?#]*).*$/,"$1");
  }

  function cancelAuth(auth) {
    if (!auth) return;
    log.debug("Cancelling auth", auth.requestId);
    if (typeof auth.resolve === 'function') {
      auth.resolve({ cancel: false });
    }
    closePopup(auth);
    // only cancelled auths are ever removed from currentAuths
    currentAuths.splice(currentAuths.indexOf(auth), 1);
  }

  function closePopup(auth) {
    if (!auth) return;
    log.debug("Clean up auth popup", auth.requestId);
    if (auth.popupId !== null) {
      browser.windows.onRemoved.removeListener(auth.popupClose);
      browser.windows.remove(auth.popupId);
    }
  }

  function onAuthRequired(details) {
    log.debug("onAuthRequired", details.requestId, details.url);
    let auth = getAuthById(details.requestId);
    if (auth === null) {
      let rootUri = getRootUri(details.url);
       auth = getAuthByRootUriAndRealm(
         rootUri,
         details.realm
       );
       // If we still have an unresolved promise for the same Root/Realm
       // (i.e., if the promise has already resolved and we're back here,
       // the previous resolved data is not good, and we should retry)
       if (auth !== null && auth.resolveItem == null) {
         log.debug("Auth window already showing for realm "
           + details.realm
           + " from root "
           + rootUri
           + ", skipping popup");
           return promises[auth.requestId];
       } else {
        auth = {
          requestId: null,
          requestUrl: null,
          rootUri: null,
          realm: null,
          popupId: null,
          popupClose: null,
          promise: null,
          resolveItem: null,
          resolveAttempts: 0,
          contextItems: [],
        };

        currentAuths.push(auth);
      }
    }

    auth.requestId = details.requestId;
    auth.requestUrl = details.url;
    auth.rootUri= getRootUri(details.url);
    auth.realm = details.realm;
    auth.contextItems = PassFF.Pass.getUrlMatchingItems(auth.requestUrl);
    promises[auth.requestId] = new Promise((resolve, reject) => {
      auth.resolve = resolve;
      PassFF.Page.goToAutoFillPending()
        .then(function (pending) {
          if (pending !== null) {
            log.debug("Handle pending auto fill", pending.item.fullKey,
                      "as HTTP auth", auth.requestId);
            auth.resolveItem = pending.item;
            PassFF.Page.resolveGoToAutoFillPending(false);
          }
          if (PassFF.Preferences.autoFill && PassFF.Preferences.autoSubmit) {
            let bestFitItem = PassFF.Pass.findBestFitItem(auth.contextItems,
                                                          auth.requestUrl);
            auth.resolveItem = bestFitItem;
          }

          // Allow for a second automatic resolve attempt.
          // This is crucial when we have a HTTP->HTTPS redirect after the first
          // attempt (which triggers a second auth request with same id).
          if (auth.resolveItem !== null && auth.resolveAttempts < 2) {
            log.debug("Automatically resolving auth", auth.requestId,
                      "using", auth.resolveItem.fullKey);
            PassFF.Auth.resolve(auth.resolveItem, auth.requestId);
            return;
          }

          log.debug("Open HTTP auth dialog");
          return browser.windows.create({
            'url': browser.runtime.getURL('/content/itemPicker.html'),
            'width': 450,
            'height': 281,
            'type': 'popup',
          });
        })
        .then((win) => {
          if (typeof win === "undefined") return;
          setTimeout(() => browser.windows.update(win.id, { height: 280 }), 100);
          auth.popupId = win.id;
          auth.popupClose = function (windowId) {
            if (win.id === windowId) cancelAuth(auth);
          };
          browser.windows.onRemoved.addListener(auth.popupClose);
        });
    });
    return promises[auth.requestId];
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    init: function () {
      log.debug("Init auth module");
      if (browser.webRequest.onAuthRequired) {
        browser.webRequest.onAuthRequired.removeListener(onAuthRequired);
        if(PassFF.Preferences.handleHttpAuth) {
          browser.webRequest.onAuthRequired.addListener(
            onAuthRequired, { urls: ["<all_urls>"] }, ["blocking"]
          );
        }
      } else {
        log.debug("Can't handle HTTP auth (not supported by browser)!");
      }
    },

    getAuthForPopup: background_function("Auth.getAuthForPopup", function (popupId) {
      let auth = currentAuths.filter(a => a.popupId === popupId);
      return (!auth.length) ? null : auth[0];
    }),

    resolve: background_function("Auth.resolve", function (item, requestId) {
      let auth = getAuthById(requestId);
      if (auth === null) {
        log.debug("Auth request not found", requestId);
        return false;
      }
      log.debug("Get pass data for HTTP auth", auth.requestId);
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") {
            /* User has probably cancelled the GPG decryption */
            return false;
          }
          log.debug("Resolve HTTP auth", auth.requestId,
                    "using", item.fullKey, auth.resolveAttempts);
          auth.resolveItem = item;
          auth.resolveAttempts += 1;
          auth.resolve({
            authCredentials: {
              username: passwordData.login,
              password: passwordData.password
            }
          });
          closePopup(auth);
        });
    })
  };
})();
