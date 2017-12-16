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
  _submittedTabs: [],
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
    if (PassFF.Page._autoFillAndSubmitPending
        || !PassFF.Preferences.autoFill
        || tab.status != "complete") {
      return;
    }
    log.info('Start pref-auto-fill');
    let matchItems = PassFF.Pass.getUrlMatchingItems(tab.url);
    let bestFitItem = PassFF.Pass.findBestFitItem(matchItems, tab.url);
    if (bestFitItem) {
      PassFF.Page.fillInputs(tab, bestFitItem).then((passwordData) => {
        if (PassFF.Preferences.autoSubmit
            && PassFF.Pass.getItemsLeafs(matchItems).length == 1
            && passwordData._other['autosubmit'] !== "false") {
          PassFF.Page.submit(tab, true);
        }
      });
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
        return PassFF.Page._execWithPrefs(tab,
          "processDoc({0}, 0);".format(JSON.stringify(passwordData))
        ).then(() => { return passwordData; });
      }
    });
  },

  submit: function(tab, safeguard) {
    if (safeguard && PassFF.Page.getSubmitted(tab)) {
      log.info('Tab already auto-submitted. skip it');
      return;
    }
    let date = Date.now();
    PassFF.Page.setSubmitted(tab, date);
    PassFF.Page._execWithPrefs(tab, "submit();").then((results) => {
      if(!results || results[0] !== true) {
        PassFF.Page.unsetSubmitted(tab, date);
      }
    });
  },

  getSubmitted: function(tab) {
    let val = PassFF.Page._submittedTabs.find((val) => {
      // Only check tab id (not url for now since it might change)
      return val[0] == tab.id;
    });
    if (typeof val !== 'undefined') {
      // Is the deleted entry younger than 20 seconds?
      return Date.now() - val[1] < 20000;
    }
    return false;
  },

  setSubmitted: function(tab, date) {
    PassFF.Page._submittedTabs.push([tab.id, date]);
    // Remember only last 10 entries
    let submittedCount = PassFF.Page._submittedTabs.length;
    if (submittedCount > 10) {
      PassFF.Page._submittedTabs.splice(0, submittedCount-10);
    }
  },

  unsetSubmitted: function(tab, date) {
    let index = PassFF.Page._submittedTabs.findIndex((t) => {
      return t[0] == tab.id && t[1] == date;
    });
    if (index >= 0) {
      PassFF.Page._submittedTabs.splice(index, 1);
    }
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
    return PassFF.Page._execWithDeps(tab, codeWithPrefs, [{
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
    return PassFF.Page._injectIfNecessary(tab, deps).then(() => {
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
