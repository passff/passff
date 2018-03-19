/* jshint node: true */
'use strict';

var PassFF = (function () {
  /**
    * The main controller object that initiates submodules depending on the
    * current context (e.g., background script or content script)
    *
    * This code requires `util.js`, `preferences.js` and `pass.js`.
    */

  var init_promise = null;
  var activeWindow = null;

/* #############################################################################
 * #############################################################################
 *  Context menu handling
 * #############################################################################
 */

  function onContextMenuClick(info, tab) {
    if (info.menuItemId == "login-add") {
      PassFF.Page.getActiveInput()
        .then(function (info) {
          let input_type = (info[0] == "password") ? "password" : "login";
          PassFF.Preferences.addInputName(input_type, info[1]);
        });
    } else {
      let itemId = parseInt(info.menuItemId.split("-")[1]);
      let item = PassFF.Pass.getItemById(itemId);
      PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") return;
          PassFF.Page.fillActiveElement(passwordData);
        });
    }
  }

  function setupContextMenu() {
    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: "login-add",
      title: "Add login input name",
      contexts: ["editable"]
    });
    chrome.contextMenus.create({
      id: "sep",
      type: "separator",
      contexts: ["editable"]
    });
    PassFF.Pass.contextItems
      .filter((i) => { return i.isLeaf; })
      .slice(0,3).forEach((i) => {
        chrome.contextMenus.create({
          id: "login-"+i.id,
          title: i.fullKey,
          contexts: ["editable"]
        });
      });
  }

/* #############################################################################
 * #############################################################################
 *  Message handling (between background and content scripts etc.)
 * #############################################################################
 */

  function onMessage(request, sender) {
    if (request === "refresh") {
      log.debug("Refresh request received in", PassFF.mode);
      return PassFF.Preferences.init()
        .then(() => PassFF.Pass.init())
        .then(() => {
          if (PassFF.mode === "content") return PassFF.Page.refresh();
        });
    } else if (["background","content"].indexOf(PassFF.mode) >= 0) {
      log.debug("Message", request.action, "received in", PassFF.mode);
      let fname = fun_name(request.action);
      let args = request.params;
      if(request.useSender === true) {
        args.unshift(sender);
      }
      let result = fname[0][fname[1]].apply(fname[0], args);
      return Promise.resolve(result)
        .then((response) => { return { response: response }; });
    }
  }

/* #############################################################################
 * #############################################################################
 *  React to context/url changes
 * #############################################################################
 */

  function onTabUpdated(tabId, changeInfo, tab) {
    // react only to url/status changes and tab activation
    if (changeInfo !== null && !changeInfo.url && !changeInfo.status) return;

    if (changeInfo === null || changeInfo.url) {
      PassFF.Page.init_tab(tab);
    }

    if (tab.status === "complete" && tab.active && tab.windowId == activeWindow) {
      let url = tab.url;
      if (typeof PassFF.Menu.state['itemPickerTarget'] !== "undefined") {
        url = PassFF.Menu.state['itemPickerTarget'];
      }

      PassFF.Pass.loadContextItems(url);
      setupContextMenu();
      PassFF.Menu.onContextChanged();
    }
  }

  function onTabActivated() {
    return getActiveTab()
      .then((tab) => { return onTabUpdated(tab.id, null, tab); });
  }

  function onWindowFocus(windowId) {
    activeWindow = windowId;
    // Focussing a window does not trigger a browser.tabs.onActivated event!
    return onTabActivated();
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    mode: null,

    init: function () {
      // don't run init twice, which might happen for content scripts
      if (init_promise !== null) return init_promise;

      if (window.location.href.indexOf("moz-extension") !== 0) {
        PassFF.mode = "content";
      } else {
        PassFF.mode = document.querySelector("body").id;
        if (!PassFF.mode) {
          PassFF.mode = "background";
        }
      }

      browser.runtime.onMessage.addListener(onMessage);
      return init_promise = PassFF.Preferences.init()
        .then(() => { return PassFF.Pass.init(); })
        .then(() => {
          switch (PassFF.mode) {
            case "content":
              return PassFF.Page.init();
              break;
            case "itemPicker":
            case "menu":
              return PassFF.Menu.init();
              break;
            case "background":
              PassFF.Auth.init();
              browser.contextMenus.onClicked.addListener(onContextMenuClick);
              browser.tabs.onUpdated.addListener(onTabUpdated);
              browser.tabs.onActivated.addListener(onTabActivated);
              browser.windows.onFocusChanged.addListener(onWindowFocus);
              return onTabActivated();
              break;
          }
        });
    },

    refresh_all: background_function("refresh_all", function () {
      return PassFF.Preferences.init()
        .then(() => PassFF.Pass.init())
        .then(() => onTabActivated())
        .then(() => browser.runtime.sendMessage("refresh"))
        .then(() => browser.tabs.query({}))
        .then((tabs) => {
            tabs.forEach((t) => browser.tabs.sendMessage(t.id, "refresh"));
        });
    })
  };
})();

window.addEventListener('load', PassFF.init);
