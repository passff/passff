/* jshint node: true */
'use strict';

if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

PassFF.Page = {
  _autoSubmittedUrls: [],
  _autoFillAndSubmitPending: false,

  swallowShortcut: function(tab, shortcut) {
    let code = `
      document.addEventListener('keydown', function(evt) {
        if (checkKeyboardEventShortcut(evt, {0})) {
          // This is a bit of a hack: if we focus the body on keydown,
          // the DOM won't let the input box handle the keypress, and
          // it'll get routed to _execute_browser_action instead.
          document.firstElementChild.focus();
        }
      }, true);
    `.format(JSON.stringify(shortcut));

    PassFF.Page._execWithDeps(tab, code, [{
      'source': 'modules/shortcut-helper.js',
      'functions': ['checkKeyboardEventShortcut'],
    }]);
  },

  tabAutoFill: function(tab) {
    if (PassFF.Page._autoFillAndSubmitPending || !PassFF.Preferences.autoFill) {
      return;
    }

    if (tab.status != "complete") {
      browser.tabs.onUpdated.addListener(function f(_, changeInfo, evtTab) {
        if (evtTab.id == tab.id && evtTab.status == "complete") {
          browser.tabs.onUpdated.removeListener(f);
          PassFF.Page.tabAutoFill(evtTab);
        }
      });
    } else {
      let url = tab.url;
      let matchItems = PassFF.Pass.getUrlMatchingItems(url);

      log.info('Start pref-auto-fill');
      let bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

      if (bestFitItem) {
        PassFF.Page.fillInputs(tab, bestFitItem).then(() => {
          if (PassFF.Preferences.autoSubmit &&
              PassFF.Pass.getItemsLeafs(matchItems).length == 1) {
            if (PassFF.Page.removeFromArray(PassFF.Page._autoSubmittedUrls, tab.url)) {
              log.info('Url already submit. skip it');
              return;
            }
            PassFF.Page.submit(tab);
            PassFF.Page._autoSubmittedUrls.push([tab.url, Date.now()]);
          }
        });
      }
    }
  },

  onContextMenu: function(info, tab) {
    if (info.menuItemId == "login-add") {
      PassFF.Page._execWithPrefs(tab, "addInputName();");
    } else {
      let itemId = parseInt(info.menuItemId.split("-")[1]);
      let item = PassFF.Pass.getItemById(itemId);
      PassFF.Pass.getPasswordData(item).then((passwordData) => {
        PassFF.Page._execWithPrefs(tab,
          "contextMenuFill({0});".format(JSON.stringify(passwordData))
        );
      });
    }
  },

  goToItemUrl: function(item, newTab, autoFill, submit) {
    if (!item) {
      return Promise.resolve();
    }

    PassFF.Page._autoFillAndSubmitPending = true;
    let promised_tab = null;
    if (newTab) {
      promised_tab = browser.tabs.create({});
    } else {
      promised_tab = getActiveTab();
    }

    log.debug('go to item url', item, newTab, autoFill, submit);
    return PassFF.Pass.getPasswordData(item).then((passwordData) => {
      let url = passwordData.url;

      if (!url) {
        url = item.key;
      }

      if (!url.startsWith('http')) {
        url = 'http://' + url;
      }

      return promised_tab.then(function (tab) {
        return browser.tabs.update(tab.id, { "url": url });
      }).then(function (tab) {
        if (!autoFill) {
          return;
        }
        browser.tabs.onUpdated.addListener(function f(_, changeInfo, evtTab) {
          if (evtTab.id == tab.id && evtTab.status == "complete") {
            browser.tabs.onUpdated.removeListener(f);
            log.info('Start auto-fill');
            PassFF.Page._autoFillAndSubmitPending = false;
            PassFF.Page.fillInputs(evtTab.id, item).then(() => {
              if (submit) {
                log.info('Start submit');
                PassFF.Page.submit(evtTab);
              }
            });
          }
        });
      });
    });
  },

  fillInputs: function(tab, item) {
    return PassFF.Pass.getPasswordData(item).then((passwordData) => {
      if (passwordData) {
        PassFF.Page._execWithPrefs(tab,
          "processDoc(doc, {0}, 0);".format(JSON.stringify(passwordData))
        );
      }
    });
  },

  submit: function(tab) {
    PassFF.Page._execWithPrefs(tab, "submit();");
  },

  removeFromArray: function(array, value) {
    let index = array.find((val) => { return val[0] == value; });
    let result = 60000; // one minute
    if (index >= 0) {
      // How old is the deleted URL?
      result = Date.now() - array.splice(index, 1)[0][1];
    }
    return result < 20000; // Is the deleted URL younger than 20 seconds?
  },

  _execWithPrefs: function (tab, code) {
    let codeWithPrefs = `
      loginInputNames = {0};
      passwordInputNames = {1};
      subpageSearchDepth = {2};
      {3}
    `.format(
      JSON.stringify(PassFF.Preferences.loginInputNames),
      JSON.stringify(PassFF.Preferences.passwordInputNames),
      JSON.stringify(PassFF.Preferences.subpageSearchDepth),
      code
    );
    PassFF.Page._execWithDeps(tab, codeWithPrefs, [{
      'source': 'modules/form-helper.js',
      'functions': [ code.split("(")[0] ],
    }]);
  },

  _injectIfNecessary: function (tab, deps) {
    if (deps.length === 0) {
      return Promise.resolve();
    }
    let depCheckingCode = [];
    deps[0]['functions'].forEach((fctName) => {
      depCheckingCode.push("typeof {0} === 'function'".format(fctName));
    });
    depCheckingCode = depCheckingCode.join(" && ") + ";";
    return browser.tabs.executeScript(tab.id, {
      code: depCheckingCode,
    }).then((results) => {
      // The content script's last expression will be true if the functions
      // have been defined. If this is not the case, then we need to run
      // the source file to define the required functions.
      if (!results || results[0] !== true) {
        return browser.tabs.executeScript(tab.id, {
          file: deps[0]['source'],
        }).then(() => {
          PassFF.Page._injectIfNecessary(tab, deps.slice(1));
        });
      }
    });
  },

  _execWithDeps: function (tab, code, deps) {
    PassFF.Page._injectIfNecessary(tab, deps).then(() => {
      return browser.tabs.executeScript(tab.id, {
        code: code,
        runAt: "document_idle"
      });
    }).catch((error) => {
      // This could happen if the extension is not allowed to run code in
      // the page, for example if the tab is a privileged page.
      log.error("Failed to exec page script: " + error);
    });
  }
};
