/**
 * The main controller that initiates submodules depending on the
 * current context (e.g., background script or content script)
 */

import * as util from "./util.js";
import { _, log } from "./util.js";
import Auth from "./auth.js";
import Menu from "./menu.js";
import Page from "./page.js";
import Pass from "./pass.js";
import Preferences from "./preferences.js";

let initPromise = null;
let activeWindow = null;

/* #############################################################################
 * #############################################################################
 *  Context menu handling
 * #############################################################################
 */

function onContextMenuClick(info, tab) {
  if (info.menuItemId == "login-add") {
    PassFF.Page.getActiveInput().then(function (info) {
      let input_type = info[0] == "password" ? "password" : "login";
      PassFF.Preferences.addInputName(input_type, info[1]);
    });
  } else if (info.menuItemId == "otp-add") {
    PassFF.Page.getActiveInput().then(function (info) {
      PassFF.Preferences.addInputName("otp", info[1]);
    });
  } else {
    let itemId = parseInt(info.menuItemId.split("-")[1], 10);
    let item = PassFF.Pass.getItemById(itemId);
    PassFF.Pass.getPasswordData(item).then((passwordData) => {
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
    contexts: ["editable"],
  });
  chrome.contextMenus.create({
    id: "otp-add",
    title: "Add otp input name",
    contexts: ["editable"],
  });
  chrome.contextMenus.create({
    id: "sep",
    type: "separator",
    contexts: ["editable"],
  });
  PassFF.Pass.contextItems
    .filter((i) => {
      return i.isLeaf;
    })
    .slice(0, 3)
    .forEach((i) => {
      chrome.contextMenus.create({
        id: "login-" + i.id,
        title: i.fullKey,
        contexts: ["editable"],
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
  } else if (["background", "content"].indexOf(PassFF.mode) >= 0) {
    log.debug("onMessage:", request.action, "received in", PassFF.mode);
    let [fobj, fname] = util.getFunctionFromStr(request.action);
    let args = request.params;
    if (request.useSender === true) {
      args.unshift(sender);
    }
    let result = fobj[fname].apply(fobj, args);
    return Promise.resolve(result).then((response) => {
      return { response: response };
    });
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
    PassFF.Page.initTab(tab);
  }

  if (tab.active && tab.windowId == activeWindow) {
    let url = tab.url;
    if (typeof PassFF.Menu.state["itemPickerTarget"] !== "undefined") {
      url = PassFF.Menu.state["itemPickerTarget"];
    }

    return util.getTabContainer(tab).then((containerName) => {
      PassFF.Pass.loadContextItems(url, containerName);
      if (PassFF.Preferences.contextMenu) {
        setupContextMenu();
      } else {
        chrome.contextMenus.removeAll();
      }
      PassFF.Menu.onContextChanged();
    });
  }
}

function onTabActivated() {
  return util.getActiveTab().then((tab) => {
    return onTabUpdated(tab.id, null, tab);
  });
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

let PassFF = {
  Auth: Auth,
  Menu: Menu,
  Page: Page,
  Pass: Pass,
  Preferences: Preferences,

  mode: null,

  init: function () {
    // don't run init twice, which might happen for content scripts
    if (initPromise !== null) return initPromise;

    if (window.location.href.indexOf("moz-extension") !== 0) {
      PassFF.mode = "content";
    } else {
      PassFF.mode = document.querySelector("body").id;
      if (!PassFF.mode) {
        PassFF.mode = "background";
      }
    }

    browser.runtime.onMessage.addListener(onMessage);
    return (initPromise = PassFF.Preferences.init()
      .then(() => {
        return PassFF.Pass.init();
      })
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
      }));
  },

  refresh_all: util.backgroundFunction("refresh_all", function () {
    return PassFF.Preferences.init()
      .then(() => PassFF.Pass.init())
      .then(() => onTabActivated())
      .then(() => browser.runtime.sendMessage("refresh"))
      .then(() => browser.tabs.query({}))
      .then((tabs) => {
        tabs.forEach((t) => browser.tabs.sendMessage(t.id, "refresh"));
      });
  }),
};

window.addEventListener("load", PassFF.init);

export default PassFF;
