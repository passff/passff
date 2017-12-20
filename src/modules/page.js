/* jshint node: true */
'use strict';

PassFF.Page = (function () {
  /**
    * Manipulates and interacts with web pages opened by the user.
    */

  var doc = document;
  var loginInputTypes = ['text', 'email', 'tel'];
  var tab_init_pending = [];

/* #############################################################################
 * #############################################################################
 *  Helpers for DOM analysis
 * #############################################################################
 */

  function getActiveElement(document, depth) {
    depth = depth || 0;
    document = document || window.document;
    if (typeof document.activeElement.contentDocument !== "undefined") {
      if (depth > subpageSearchDepth) {
        return false;
      }
      return getActiveElement(document.activeElement.contentDocument, depth++);
    } else {
      return document.activeElement;
    }
    return false;
  }

  function getSubmitButton(form) {
    let buttons = form.querySelectorAll('button:not([type=reset]),input[type=submit]');
    let submitButtonPredicates = [
      // explicit submit type
      (button) => button.getAttribute("type") === "submit",
      // the browser interprets an unset or invalid type as submit
      (button) => !["submit", "button"].includes(button.getAttribute("type")),
      // assume that last button in form performs submission via javascript
      (button, index, arr) => index + 1 === arr.length
    ];
    for (let predicate of submitButtonPredicates) {
      let button = [].find.call(buttons, predicate);
      if (button) return button;
    }
    return null;
  }

  function hasGoodName(fieldName, goodFieldNames) {
    let lowerFN = fieldName.toLowerCase();
    return goodFieldNames
      .some((fn) => { return lowerFN.indexOf(fn.toLowerCase()) >= 0; });
  }

  function isPasswordInput(input) {
    if (input.type === 'password') {
      return true;
    } else if (input.type === 'text') {
      let inputName = input.name ? input.name : input.id;
      return hasGoodName(inputName, PassFF.Preferences.passwordInputNames)
    }
    return false;
  }

  function isLoginInput(input) {
    let identifier = input.name ? input.name : input.id;
    return (loginInputTypes.indexOf(input.type) >= 0 &&
            hasGoodName(identifier, PassFF.Preferences.loginInputNames));
  }

  function isOtherInputCheck(other) {
    return function(input) {
      let identifier = input.name ? input.name : input.id;
      return (hasGoodName(identifier, Object.keys(other)));
    }
  }

  function getLoginInputs() {
    return [].filter.call(doc.getElementsByTagName('input'), isLoginInput);
  }

  function getPasswordInputs() {
    let result =[].filter.call(doc.getElementsByTagName('input'), isPasswordInput);
    log.debug("getPasswordInput", result);
    return result;
  }

  function getOtherInputs(other) {
    return [].filter.call(doc.getElementsByTagName('input'), isOtherInputCheck(other));
  }

/* #############################################################################
 * #############################################################################
 *  Helpers for DOM event handling/simulation
 * #############################################################################
 */

  function createFakeKeystroke(typeArg, key) {
    return new KeyboardEvent(typeArg, {
      'key': ' ',
      'code': ' ',
      'charCode': ' '.charCodeAt(0),
      'keyCode': ' '.charCodeAt(0),
      'which': ' '.charCodeAt(0),
      'bubbles': true,
      'composed': true,
      'cancelable': true
    });
  }

  function createFakeInputEvent(typeArg) {
    return new InputEvent(typeArg, {
      'bubbles': true,
      'composed': true,
      'cancelable': true
    })
  }

  function writeValueWithEvents(input, value) {
    // don't fill if element is invisible
    if (input.offsetHeight === 0 || input.offsetParent === null) return;
    input.dispatchEvent(createFakeKeystroke('keydown'));
    input.value = value;
    input.dispatchEvent(createFakeKeystroke('keyup'));
    input.dispatchEvent(createFakeKeystroke('keypress'));
    input.dispatchEvent(createFakeInputEvent('input'));
    input.dispatchEvent(createFakeInputEvent('change'));
  }

/* #############################################################################
 * #############################################################################
 *  Helpers for DOM manipulation
 * #############################################################################
 */

  function setLoginInputs(login) {
    getLoginInputs().forEach((it) => writeValueWithEvents(it, login));
  }

  function setPasswordInputs(password) {
    getPasswordInputs().forEach((it) => writeValueWithEvents(it, password));
  }

  function setOtherInputs(other) {
    getOtherInputs(other).forEach(function(otherInput) {
      let value;
      if (other.hasOwnProperty(otherInput.name)) {
        value = other[otherInput.name];
      } else if (other.hasOwnProperty(otherInput.id)) {
        value = other[otherInput.id];
      }
      if (value) {
        writeValueWithEvents(otherInput, value);
      }
    });
  }

  function setInputs(passwordData) {
    setLoginInputs(passwordData.login);
    setPasswordInputs(passwordData.password);
    setOtherInputs(passwordData._other);
  }

/* #############################################################################
 * #############################################################################
 *  Helper to prevent auto-fill from causing submit loops
 * #############################################################################
 */

  var submittedTabs = {
    _tabs: [],
    get: function(tab) {
      let val = this._tabs.find((val) => {
        // Only check tab id (not url since it might change)
        return val[0] == tab.id;
      });
      if (typeof val !== 'undefined') {
        return Date.now() - val[1] < 20000;
      }
      return false;
    },
    set: function(tab, date) {
      this._tabs.unshift([tab.id, date]);
      // Remember only last 10 entries
      this._tabs.splice(10, this._tabs.length);
    },

    unset: function(tab, date) {
      let index = this._tabs.findIndex((t) => {
        return (t[0] == tab.id && t[1] == date);
      });
      if (index >= 0) {
        this._tabs.splice(index, 1);
      }
    }
  };

/* #############################################################################
 * #############################################################################
 *  Helper for tab initialization
 * #############################################################################
 */

  function init_tab(tab) {
    return new Promise((resolve, reject) => {
      let onFinally = function () {
        log.debug("Tab init done", tab.id);
        resolve(tab);
      };
      /*
        On privileged pages, script exec. will be rejected. We resolve anyhow in
        those cases using the same callback for resolve and reject (as long as
        `Promise.prototype.finally()` is not available).
      */
      browser.tabs.executeScript(tab.id, {
        code: 'PassFF.init();',
        runAt: 'document_start'
      }).then(onFinally, onFinally);
    });
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    init: function () {
      window.onload = PassFF.Page.autoFill;

      /*
        Allow our browser command to bypass the usual dom event mapping, so that
        the keyboard shortcut still works, even  when a password field is focused.
      */
      return PassFF.Preferences.getKeyboardShortcut()
        .then((shortcut) => {
          /*
            Attach a DOM-level event handler for our command key, so it works
            even if an input box is focused.
          */
          document.addEventListener('keydown', function(evt) {
            if (shortcut.commandLetter !== evt.key) return;

            for (var modifier in shortcut.expectedModifierState) {
              if (shortcut.expectedModifierState[modifier] !==
                  evt.getModifierState(modifier)) {
                return;
              }
            }

            /*
              This is a bit of a hack: if we focus the body on keydown,
              the DOM won't let the input box handle the keypress, and
              it'll get routed to _execute_browser_action instead.
            */
            document.firstElementChild.focus();
          }, true);
        });
    },

    init_tab: background_function("Page.init_tab", function (tab) {
      /*
        We keep track of which tabs have already been initialized to avoid
        unnecessary calls to `browser.tabs.executeScript()`.
      */
      let pending_id = tab_init_pending.findIndex(function (t) {
        return (t.id == tab.id);
      });
      if (pending_id >= 0) {
        return tab_init_pending[pending_id].promise;
      } else {
        pending_id = tab_init_pending.length;
        log.debug("Awaiting tab init...", tab.id);
        let pending_promise = init_tab(tab);
        tab_init_pending.push({ id: tab.id, promise: pending_promise });
        return pending_promise.then((ready_tab) => {
          tab_init_pending.splice(pending_id, 1);
          return ready_tab;
        });
      }
    }),

// %%%%%%%%%%%%%%%%%%%%%%%%%% URL changer %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    goToItemUrl: background_function("Page.goToItemUrl",
      function(item, newTab, autoFill, submit) {
        if (!item) return Promise.resolve();
        let promised_tab = (newTab) ? browser.tabs.create({}) : getActiveTab();
        return PassFF.Pass.getPasswordData(item)
          .then((passwordData) => {
            if (typeof passwordData === "undefined") return null;
            log.debug('Go to item url', item, newTab, autoFill, submit);
            let url = passwordData.url || item.key;
            if (!url.startsWith('http')) url = 'http://' + url;
            return promised_tab
              .then((tab) => {
                return browser.tabs.update(tab.id, { url: url });
              });
          })
          .then(function (tab) {
            if (tab === null || !autoFill) return;
            waitTabComplete().then(() => {
              PassFF.Page.fillInputs(tab, item, submit); });
          });
      }
    ),

// %%%%%%%%%%%%%%%%%%%%%%%%%% Form filler %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    autoFill: content_function("Page.autoFill", function() {
      if (!PassFF.Preferences.autoFill) return;

      let url = window.location.href;
      let url_in_blacklist = PassFF.Preferences.autoFillBlacklist
                        .findIndex((str) => { return url.indexOf(str) >= 0; });
      if (url_in_blacklist >= 0) return;

      log.info('Start pref-auto-fill');
      let matchItems = PassFF.Pass.getUrlMatchingItems(url);
      let bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);
      if (bestFitItem) {
        PassFF.Page.fillInputs(bestFitItem).then((passwordData) => {
          if (PassFF.Preferences.autoSubmit
              && PassFF.Pass.getItemsLeafs(matchItems).length == 1
              && passwordData._other['autosubmit'] !== "false") {
            PassFF.Page.safeSubmit();
          }
        });
      }
    }),

    fillActiveElement: content_function("Page.fillActiveElement",
      function (passwordData) {
        let input = getActiveElement();
        input.value = passwordData.login;
        doc = input.form;
        setPasswordInputs(passwordData.password);
        doc = document;
      }
    ),

    fillInputs: content_function("Page.fillInputs", function(item, andSubmit) {
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") return;
          log.debug('Start auto-fill', item, andSubmit);
          PassFF.Page.processDoc(passwordData, 0);
          if (andSubmit) PassFF.Page.submit();
          return passwordData;
        });
    }, true),

    processDoc: content_function("Page.processDoc",
      function (passwordData, depth) {
        depth = depth || 0;
        // clean up before going into subpages
        doc = (depth === 0) ? document : doc;
        log.debug("Fill depth", depth);
        setInputs(passwordData);
        if (depth <= PassFF.Preferences.subpageSearchDepth) {
          let subpages = doc.querySelectorAll('iframe,frame');
          [].forEach.call(subpages, (subpage) => {
            doc = subpage.contentDocument;
            PassFF.Page.processDoc(passwordData, depth+1);
          });
        }
        // clean up after scanning subpages
        doc = (depth === 0) ? document : doc;
      }
    ),

// %%%%%%%%%%%%%%%%%%%%%%% Form submitter %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    submit: content_function("Page.submit", function () {
      log.debug("Unsafe submit...");
      let passwords = getPasswordInputs();
      if (passwords.length === 0) return false;

      let form = passwords[0].form;
      if (!form) return false;

      let submitBtn = getSubmitButton(form);
      log.debug("Unsafe submit...", submitBtn);
      if (submitBtn) {
        submitBtn.click();
      } else {
        form.submit();
      }
      return true;
    }, true),

    safeSubmit: background_function("Page.safeSubmit", function(sender) {
      let tab = sender.tab;
      if (submittedTabs.get(tab)) {
        log.info('Tab already auto-submitted. skip it');
        return;
      }
      log.info('Start submit');
      let date = Date.now();
      submittedTabs.set(tab, date);
      PassFF.Page.submit(tab)
        .then((results) => {
          if(!results || results[0] !== true) {
            submittedTabs.unset(tab, date);
          }
        });
    }, true),

// %%%%%%%%%%%%%%%%%%%%%%%%%%% Miscellaneous %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    copyToClipboard: content_function("Page.copyToClipboard", function (text) {
      document.addEventListener("copy", function oncopy(event) {
        document.removeEventListener("copy", oncopy, true);
        event.stopImmediatePropagation();
        event.preventDefault();
        event.clipboardData.setData("text/plain", text);
      }, true);
      document.execCommand("copy");
    }),

    getActiveInput: content_function("Page.getActiveInput", function () {
      let input = getActiveElement();
      if (input.tagName != "INPUT" || loginInputTypes.indexOf(input.type) < 0) {
        return null;
      }
      return [input.type, input.name ? input.name : input.id]
    }),
  };
})();
