/* jshint node: true */
'use strict';

PassFF.Page = (function () {
  /**
    * Manipulates and interacts with web pages opened by the user.
    */

  var doc = document;
  var loginInputTypes = ['text', 'email', 'tel'];
  var tab_init_pending = [];
  var matchItems = [];
  var bestFitItem = null;
  var goToAutoFillPending = null;

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

  function readInputNames(input) {
    return [input.name, input.id]
      .concat([].map.call(input.labels, l => l.innerText));
  }

  function isGoodName(name, goodNames) {
    if (!name) return false;
    let nm = name.toLowerCase();
    return goodNames.some((n) => { return nm.indexOf(n.toLowerCase()) >= 0; });
  }

  function hasGoodName(fieldNames, goodFieldNames) {
    return fieldNames.some((fn) => { return isGoodName(fn, goodFieldNames); });
  }

  function isPasswordInput(input) {
    if (input.type === 'password') {
      return true;
    } else if (input.type === 'text') {
      return hasGoodName(readInputNames(input), PassFF.Preferences.passwordInputNames)
    }
    return false;
  }

  function isLoginInput(input) {
    return (loginInputTypes.indexOf(input.type) >= 0 &&
            hasGoodName(readInputNames(input), PassFF.Preferences.loginInputNames));
  }

  function isOtherInputCheck(other) {
    return function (input) {
      return (hasGoodName(readInputNames(input), Object.keys(other)));
    }
  }

  function getLoginInputs() {
    return [].filter.call(doc.getElementsByTagName('input'), isLoginInput);
  }

  function getPasswordInputs() {
    return [].filter.call(doc.getElementsByTagName('input'), isPasswordInput);
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

  function onNodeAdded() {
    if (PassFF.Preferences.markFillable) {
      getLoginInputs().forEach(injectIcon);
      getPasswordInputs().forEach(injectIcon);
    }
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
    getOtherInputs(other).forEach(function (otherInput) {
      let value;
      let name = (otherInput.name).toLowerCase();
      let id = (otherInput.id).toLowerCase();
      if (other.hasOwnProperty(name)) {
        value = other[name];
      } else if (other.hasOwnProperty(id)) {
        value = other[id];
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

// %%%%%%%%%%%%%%% Implementation of input field marker %%%%%%%%%%%%%%%%%%%%%%%%

  let passff_icon = browser.extension.getURL('/icon.png');
  let passff_icon_light = browser.extension.getURL('/skin/icon-light.png');

  /* The following two icons have been taken from
   *  https://github.com/encharm/Font-Awesome-SVG-PNG (MIT-License)
   * which provides PNG/SVG versions for Font Awesome icons:
   *  http://fontawesome.io/ (License: SIL OFL 1.1)
   */
  let paper_plane_16 = browser.extension.getURL('/skin/paper-plane.png');
  let pencil_square_16 = browser.extension.getURL('/skin/pencil-square.png');

  function isMouseOverIcon(e) {
    if (typeof e.target.passff_injected === "undefined") return false;
    let bcrect = e.target.getBoundingClientRect();
    let leftLimit = bcrect.left + bcrect.width - 22;
    return e.clientX > leftLimit;
  }

  function onIconHover(e) {
    if (isMouseOverIcon(e)) {
      e.target.style.backgroundImage = "url('" + passff_icon + "')";
      e.target.style.cssText += "cursor: pointer !important;";

      /* Set autocomplete attribute to "off", so Firefox' autofill list won't
       * overlap passff's popup menu. Also save its value beforehand, so it can
       * be restored when the popup gets dismissed.
       */
      if (!e.target.hasAttribute('passff-autocomplete'))
        e.target.setAttribute("passff-autocomplete", e.target.autocomplete);
      e.target.autocomplete="off";

      return;
    }
    if (e.target !== popup_target) resetIcon(e.target);
    e.target.style.cursor = "auto";
    if (e.target.hasAttribute('passff-autocomplete'))
      e.target.autocomplete = e.target.getAttribute('passff-autocomplete');
  }

  function onIconClick(e) {
      if (isMouseOverIcon(e)) openPopup(e.target);
    }

  function injectIcon(input) {
    if (typeof input.passff_injected !== "undefined") return;
    log.debug("Inject icon", input.id || input.name);
    input.passff_injected = true;
    input.style.backgroundRepeat = "no-repeat";
    input.style.backgroundAttachment = "scroll";
    input.style.backgroundSize = "16px 16px";
    input.style.backgroundPosition = "calc(100% - 4px) 50%";
    input.style.backgroundImage = "url('" + passff_icon_light + "')";
    input.addEventListener("mouseout", (e) => {
      if (e.target !== popup_target) resetIcon(e.target);
    });
    input.addEventListener("mousemove", onIconHover);
    input.addEventListener("click", onIconClick);
  }

  function resetIcon(input) {
    input.style.backgroundImage = "url('" + passff_icon_light + "')";
  }

// %%%%%%%%%%%%%%% Implementation of input field popup %%%%%%%%%%%%%%%%%%%%%%%%%

  let popup_menu = null;
  let popup_target = null;

  function resetPopup(target) {
    // return true if resetted popup_menu belonged to target
    let result = (target === popup_target);
    if (popup_target !== null) resetIcon(popup_target);
    if (result) popup_target = null;
    if (popup_menu === null) setupPopup();
    popup_menu.style.display = "none";
    return result;
  }

  function setupPopup() {
    // Remove old instances of the popup menu
    let old = document.querySelector(".passff_popup_menu");
    if (old) old.parentNode.removeChild(old);

    // Setup new instance
    popup_menu = document.createElement("div");
    popup_menu.classList.add("passff_popup_menu");
    if (matchItems.length === 0) {
      popup_menu.innerHTML = '<div class="alert">'
        + _('passff_no_entries_found') + '</div>';
    }
    matchItems.filter(i => i.isLeaf || i.hasFields).forEach(item => {
      let entry = document.createElement("div");
      entry.classList.add("passff_entry");
      entry.passff_item = item;
      entry.innerHTML = `
        <div><!-- display: table-row -->
          <div><button class="passff_key"><span></span></button></div>
          <div><button class="passff_fill passff_button"></button></div>
          <div><button class="passff_submit passff_button"></button></div>
        </div>
      `;

      let button = entry.querySelector(".passff_key span");
      button.textContent = item.fullKey;
      button.parentNode.title = item.fullKey;
      button.parentNode.addEventListener("click", function (e) {
        if (PassFF.Preferences.submitFillable) return onPopupSubmitClick(e);
        return onPopupFillClick(e);
      });
      button = entry.querySelector(".passff_fill");
      button.style.backgroundImage = "url('" + pencil_square_16 + "')";
      button.addEventListener("click", onPopupFillClick);
      button = entry.querySelector(".passff_submit");
      button.style.backgroundImage = "url('" + paper_plane_16 + "')";
      button.addEventListener("click", onPopupSubmitClick);

      popup_menu.appendChild(entry);
    });
    document.body.appendChild(popup_menu);
  }

  function openPopup(target) {
    if(resetPopup(target)) return;
    popup_target = target;

    // remove this popup when user clicks somewhere else on the page
    document.addEventListener("click", function f(e) {
      if (getPopupEntryItem(e.target) !== null || isMouseOverIcon(e)) return;
      document.removeEventListener("click", f);
      resetPopup(target);
    });

    // position popup relative to input field
    let rect = target.getBoundingClientRect();
    let scrollright = document.body.scrollWidth - (window.scrollX + rect.x);
    let scrolltop = window.scrollY + rect.y;
    popup_menu.style.top      = (scrolltop + rect.height + 1) + "px";
    popup_menu.style.right    = (scrollright - rect.width) + "px";
    popup_menu.style.display  = "block";

    let p = target;
    let z = 1;
    while (p = p.parentElement) {
      let st = window.getComputedStyle(p);
      if (st.zIndex !== "auto") z += parseInt(st.zIndex);
    }
    popup_menu.style.zIndex = "" + z;
  }

  function getPopupEntryItem(target) {
    let entry = target.parentElement;
    while (entry && !entry.classList.contains("passff_entry")) {
      entry = entry.parentElement;
    }
    if (!entry) return null;
    return entry.passff_item;
  }

  function onPopupFillClick(e) {
    let item = getPopupEntryItem(e.target);
    popup_target.focus();
    resetPopup(popup_target);
    PassFF.Pass.getPasswordData(item)
      .then((passwordData) => {
        if (typeof passwordData === "undefined") return;
        PassFF.Page.fillActiveElement(passwordData);
      });
  }

  function onPopupSubmitClick(e) {
    let item = getPopupEntryItem(e.target);
    popup_target.focus();
    let form_doc = popup_target.form;
    resetPopup(popup_target);
    PassFF.Pass.getPasswordData(item)
      .then((passwordData) => {
        if (typeof passwordData === "undefined") return;
        PassFF.Page.fillActiveElement(passwordData);
        doc = form_doc;
        PassFF.Page.submit();
      });
  }

/* #############################################################################
 * #############################################################################
 *  Helper to prevent auto-fill from causing submit loops
 * #############################################################################
 */

  var submittedTabs = {
    _tabs: [],
    get: function (tab) {
      let val = this._tabs.find((val) => {
        // Only check tab id (not url since it might change)
        return val[0] == tab.id;
      });
      if (typeof val !== 'undefined') {
        return Date.now() - val[1] < 20000;
      }
      return false;
    },
    set: function (tab, date) {
      this._tabs.unshift([tab.id, date]);
      // Remember only last 10 entries
      this._tabs.splice(10, this._tabs.length);
    },

    unset: function (tab, date) {
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
        log.debug("Tab init done", tab.id, tab.url);
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

  function onWindowLoad() {
    let url = window.location.href;
    matchItems = PassFF.Pass.getUrlMatchingItems(url);
    bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

    var obs = new MutationObserver(onNodeAdded);
    obs.observe(document, { childList: true, subtree: true });
    onNodeAdded();

    return PassFF.Page.goToAutoFillPending()
      .then(function (pending) {
        if (pending !== null) {
          PassFF.Page.resolveGoToAutoFillPending(true);
        } else {
          PassFF.Page.autoFill();
        }
      });
  }

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
    init: function () {
      if (document.readyState === 'complete') onWindowLoad();
      else window.addEventListener("load", onWindowLoad);

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
          document.addEventListener('keydown', function (evt) {
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
        log.debug("Awaiting tab init...", tab.id, tab.url);
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
      function (item, newTab, autoFill, submit) {
        if (!item) return Promise.resolve();
        let promised_tab = (newTab) ? browser.tabs.create({}) : getActiveTab();
        return PassFF.Pass.getPasswordData(item)
          .then((passwordData) => {
            if (typeof passwordData === "undefined") return null;
            log.debug('Go to item', item.fullKey, newTab, autoFill, submit);
            let url = passwordData.url || item.key;
            if (!url.startsWith('http')) url = 'http://' + url;
            return promised_tab
              .then((tab) => {
                let tab_url = tab.url.replace(/^https?:\/+/,"");
                if (tab_url === url.replace(/^https?:\/+/,"")) {
                  if (autoFill) PassFF.Page.fillInputs(tab, item, submit);
                  return null;
                } else {
                  return browser.tabs.update(tab.id, { url: url });
                }
              });
          })
          .then(function (tab) {
            if (tab !== null && autoFill) {
              goToAutoFillPending = {
                tab: tab,
                submit: submit,
                item: item
              };
            }
          });
      }
    ),

    goToAutoFillPending: background_function("Page.goToAutoFillPending",
      () => goToAutoFillPending),

    resolveGoToAutoFillPending: background_function(
      "Page.resolveGoToAutoFillPending", function (fillInputs) {
        log.debug("Resolving pending auto fill", fillInputs);
        if (fillInputs === true) {
          let pending = goToAutoFillPending;
          PassFF.Page.fillInputs(pending.tab, pending.item, pending.submit);
        }
        goToAutoFillPending = null;
      }),

// %%%%%%%%%%%%%%%%%%%%%%%%%% Form filler %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    autoFill: content_function("Page.autoFill", function () {
      if (!PassFF.Preferences.autoFill) return;

      let url = window.location.href;
      let url_in_blacklist = PassFF.Preferences.autoFillBlacklist
                        .findIndex((str) => { return url.indexOf(str) >= 0; });
      if (url_in_blacklist >= 0) return;

      log.info('Start pref-auto-fill');
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
        doc = getActiveElement().form;
        setInputs(passwordData);
        doc = document;
      }
    ),

    fillInputs: content_function("Page.fillInputs", function (item, andSubmit) {
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") return;
          log.debug('Start auto-fill using', item.fullKey, andSubmit);
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
            if (subpage.contentDocument) {
              doc = subpage.contentDocument;
              PassFF.Page.processDoc(passwordData, depth+1);
            }
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

    safeSubmit: background_function("Page.safeSubmit", function (sender) {
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
