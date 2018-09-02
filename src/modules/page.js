/* jshint node: true */
'use strict';

PassFF.Page = (function () {
  /**
    * Manipulates and interacts with web pages opened by the user.
    */

  var doc = document;
  var inputElements = [];
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

  function getActiveElement(doc, depth) {
    depth = depth || 0;
    doc = doc || window.document;
    if (typeof doc.activeElement.contentDocument !== "undefined") {
      if (depth > 5) {
        return false;
      }
      return getActiveElement(doc.activeElement.contentDocument, depth++);
    } else {
      return doc.activeElement;
    }
    return false;
  }

  function isInvisible(el) {
    return el.offsetHeight === 0 || el.offsetParent === null;
  }

  function isVisible(el) {
    return !isInvisible(el);
  }

  function getSubmitButton(form) {
    let buttonQueries = [
      "button:not([type=reset])",
      "input[type=submit]",
      "input[type=button]"
    ];
    let buttons = form.querySelectorAll(buttonQueries.join(","));
    buttons = Array.from(buttons).filter(isVisible);
    let submitButtonPredicates = [
      // explicit submit type
      (button) => button.getAttribute("type") === "submit",
      // the browser interprets an unset or invalid type as submit
      (button) => !["submit", "button"].includes(button.getAttribute("type")),
      // assume that last button in form performs submission via javascript
      (button, index, arr) => index + 1 === arr.length
    ];
    for (let predicate of submitButtonPredicates) {
      let button = buttons.find(predicate);
      if (button) return button;
    }
    return null;
  }

  function readInputNames(input) {
    let inputNames = [input.name, input.id];
    if (input.hasAttribute('placeholder')) {
      inputNames.push(input.getAttribute('placeholder'));
    }

    /* Some pages (e.g., accounts.google.com) use the autocomplete attribute to
     * specify the meaning of this input field in the form, even though this
     * is not the purpose of this attribute according to the specs.
     */
    let autocomplete = input.getAttribute("autocomplete");
    if (input.hasAttribute('passff-autocomplete')) {
      autocomplete = input.getAttribute('passff-autocomplete');
    }
    if (autocomplete && ["on","off"].indexOf(autocomplete) === -1) {
      inputNames.push(autocomplete);
    }

    // labels are <label> elements whose `for`-attribute points to this input
    if (input.labels) {
      inputNames = inputNames.concat(Array.from(input.labels, l => l.innerText));
    }

    return inputNames.filter(Boolean).map(nm => nm.toLowerCase());
  }

  function findIntersection(arr1, arr2, callback) {
    // find first element from arr1 in intersection of arr1 and arr2
    // equality of elements is determined according to callback(el1, el2)
    callback = callback || ((el1, el2) => el1 === el2);
    return arr1.find(el1 => arr2.some(el2 => callback(el1, el2)));
  }

  function isPasswordInput(input) {
    if (input.type === 'password') {
      return true;
    } else if (input.type === 'text') {
      let goodNames = PassFF.Preferences.passwordInputNames;
      let inputNames = readInputNames(input);
      let callback = ((gn, n) => n.indexOf(gn) >= 0);
      return findIntersection(goodNames, inputNames, callback) !== undefined;
    }
    return false;
  }

  function isLoginInput(input) {
    let goodNames = PassFF.Preferences.loginInputNames;
    let inputNames = readInputNames(input);
    let callback = ((gn, n) => n.indexOf(gn) >= 0);
    return (loginInputTypes.indexOf(input.type) >= 0 &&
            findIntersection(goodNames, inputNames, callback) !== undefined);
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
    });
  }

  function writeValueWithEvents(input, value) {
    // don't fill if element is invisible
    if (isInvisible(input)) return;
    input.dispatchEvent(createFakeKeystroke('keydown'));
    input.value = value;
    input.dispatchEvent(createFakeKeystroke('keyup'));
    input.dispatchEvent(createFakeKeystroke('keypress'));
    input.dispatchEvent(createFakeInputEvent('input'));
    input.dispatchEvent(createFakeInputEvent('change'));
  }

  function onNodeAdded() {
    inputElements = document.getElementsByTagName('input');
    inputElements = Array.from(inputElements).filter(isVisible);
    if (PassFF.Preferences.markFillable) {
      inputElements.filter(isLoginInput).forEach(injectIcon);
      inputElements.filter(isPasswordInput).forEach(injectIcon);
    }
  }

/* #############################################################################
 * #############################################################################
 *  Helpers for DOM manipulation
 * #############################################################################
 */

  function setLoginInputs(inputs, login) {
    inputs.filter(isLoginInput).forEach((it) => writeValueWithEvents(it, login));
  }

  function setPasswordInputs(inputs, password) {
    inputs.filter(isPasswordInput).forEach((it) => writeValueWithEvents(it, password));
  }

  function setOtherInputs(inputs, other) {
    // Other data can override already filled-in login or password data, but
    // one of name/id/labels of the input field has to match exactly!
    let otherNames = Object.keys(other);
    if (otherNames.length === 0) return;
    inputs.forEach(function (input) {
      let inputNames = readInputNames(input);
      let matching = findIntersection(otherNames, inputNames);
      if (matching !== undefined) writeValueWithEvents(input, other[matching]);
    });
  }

  function setInputs(inputs, passwordData) {
    log.debug("Set inputs...")
    setLoginInputs(inputs, passwordData.login);
    setPasswordInputs(inputs, passwordData.password);
    setOtherInputs(inputs, passwordData._other);
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
        e.target.setAttribute("passff-autocomplete", e.target.getAttribute("autocomplete"));
      e.target.setAttribute("autocomplete", "off");

      return;
    }
    if (e.target !== popup_target) resetIcon(e.target);
    e.target.style.cursor = "auto";
    if (e.target.hasAttribute('passff-autocomplete'))
      e.target.setAttribute("autocomplete", e.target.getAttribute('passff-autocomplete'));
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
    if (!PassFF.Preferences.markFillable) return;

    // Remove old instances of the popup menu
    let old = document.querySelector(".passff_popup_menu");
    if (old) old.parentNode.removeChild(old);

    // Setup new instance
    popup_menu = document.createElement("iframe");
    popup_menu.setAttribute("src",
      browser.extension.getURL("content/content-popup.html"));
    popup_menu.classList.add("passff_popup_menu");
    popup_menu.addEventListener("load", function () {
      let doc = popup_menu.contentDocument;
      let popup_div = doc.getElementsByTagName("div")[0];
      if (matchItems.length === 0) {
        popup_div.innerHTML = '<div class="alert">'
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
        popup_div.appendChild(entry);
      });
    }, true);
    popup_menu.style.display = "none";
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
    let popup_width = window.getComputedStyle(popup_menu).width;
    popup_width = parseInt(popup_width.substring(0,popup_width.length-2));
    let scrollright = window.scrollX - popup_width;
    popup_menu.style.top      = (window.scrollY + rect.bottom + 1) + "px";
    popup_menu.style.left     = (scrollright + rect.right - 2) + "px";
    popup_menu.style.display  = "block";

    // get the largest z-index value and position ourselves above it
    let z = [...document.querySelectorAll('body *')]
      .filter(e => !(e.style.position in ["static", ""]))
      .map(e => window.getComputedStyle(e).zIndex)
      .filter(e => e>0)
      .sort()
      .slice(-1)[0];
    popup_menu.style.zIndex = "" + (+z+1 || 1);
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
        return PassFF.Page.fillActiveElement(passwordData);
      })
      .then(() => {
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
    obs.observe(document, { attributes: true, childList: true, subtree: true });
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
 *  Security Checks for (Auto)fill
 * #############################################################################
 */

  function securityChecks(passItemURL, currTabURL) {
    if (!PassFF.Preferences.autoFillDomainCheck) {
      return Promise.resolve(true);
    }

    try {
      var passURL = new URL(passItemURL);
    } catch(e) {
      return PassFF.Page.confirm(
        _("passff_error_getting_url_pass", passItemURL) + " "
        + _("passff_override_antiphishing_confirmation"));
    }

    try {
      var currURL = new URL(currTabURL);
    } catch(e) {
      return PassFF.Page.confirm(
        _("passff_error_getting_url_curr", currTabURL) + " "
        + _("passff_override_antiphishing_confirmation"));
    }

    return domainSecurityCheck(passURL, currURL)
      .then((result) => {
        if (!result) return false;
        return protocolSecurityCheck(currURL, passURL);
      });
  }

  function domainSecurityCheck(passURL, currURL) {
    /*
    Instead of requiring that the entire hostname match, which would lead to
    example.com and login.example.com being considered different, only the
    domains must match. However, identifying the domain is difficult because of
    top-level-domains like .co.uk that have multiple dots in them, unlike the
    more conventional single-dot TLDs like .com.
    Resources on Identifying Domain:
    https://stackoverflow.com/questions/10210058/get-the-parent-document-domain-without-subdomains
    https://stackoverflow.com/questions/399250/going-where-php-parse-url-doesnt-parsing-only-the-domain
    https://publicsuffix.org/
    While not ideal, the current solution is to assume a single-dot TLD and
    therefore match everything after the second-to-last dot. This is a security
    risk on two-dot TLDs, as only the TLD (e.g. co.uk) will be matched.
    */
    let passDomain = passURL.hostname.split(".").slice(-2).join(".");
    let currDomain = currURL.hostname.split(".").slice(-2).join(".");
    if (passDomain != currDomain) {
      return PassFF.Page.confirm(
        _("passff_domain_mismatch", [currDomain, passDomain]) + " "
        + _("passff_override_antiphishing_confirmation"));
    }
    return Promise.resolve(true);
  }

  function protocolSecurityCheck(currURL, passURL) {
    let currProt = currURL.protocol;
    let passProt = passURL.protocol;
    if (currProt == "https:") {
      // Storing an HTTP link is OK if the site redirects to HTTPS
      return Promise.resolve(true);
    }

    return PassFF.Page.confirm(
             _("passff_http_curr_warning") + " "
             + _("passff_override_antiphishing_confirmation")
      ).then((result) => {
        // Maybe the current protocol was unsafe because an unsafe URL is stored
        if (!result && passProt != "https:") {
          PassFF.Page.notify(_("passff_http_pass_warning", passURL.href));
        }
        return result;
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
            if (shortcut.commandLetter !== evt.key.toLowerCase()) return;

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

    refresh: content_function("Page.refresh", function () {
      let url = window.location.href;
      matchItems = PassFF.Pass.contextItems;
      bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);
      setupPopup();
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
                let tab_url = tab.url.replace(/^https?:\/+/,"").replace(/\/+$/,"");
                let test_url = url.replace(/^https?:\/+/,"").replace(/\/+$/,"");
                if (tab_url === test_url) {
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
        let activeElement = getActiveElement();
        let inputTypes = Array.concat(loginInputTypes, ["password"]);
        log.debug("Fill active element", activeElement);
        if (activeElement.tagName !== "INPUT"
            || inputTypes.indexOf(activeElement.type) < 0) return;
        return securityChecks(passwordData.url, window.location.href)
          .then((result) => {
            if (!result) return;
            let inputs = [activeElement];
            if (activeElement.form) {
              inputs = activeElement.form.getElementsByTagName('input');
            }
            setInputs(Array.from(inputs).filter(isVisible), passwordData);
          });
      }
    ),

    fillInputs: content_function("Page.fillInputs", function (item, andSubmit) {
      if (inputElements.filter(isPasswordInput).length === 0) {
        log.debug("fillInputs: No password inputs found!");
        return null;
      }
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") return;
          log.debug('Start auto-fill using', item.fullKey, andSubmit);
          return securityChecks(passwordData.url, window.location.href)
            .then((result) => {
              if (!result) return;
              setInputs(inputElements, passwordData);
              if (andSubmit) PassFF.Page.submit();
              return passwordData;
            });
        });
    }, true),

// %%%%%%%%%%%%%%%%%%%%%%% Form submitter %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    submit: content_function("Page.submit", function () {
      let passwords = inputElements.filter(isPasswordInput);
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

// %%%%%%%%%%%%%%% Implementation of notification dialog %%%%%%%%%%%%%%%%%%%%%%%

    notify: content_function("Page.notify", function (message) {
      let dialog = document.getElementById("passff_notification");
      if (!dialog) {
        dialog = document.createElement("div");
        dialog.id = "passff_notification";
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = "<div><p></p><div><button>OK</button></div></div>";
      let div = dialog.querySelector("div");
      div.style.backgroundImage = "url('" + passff_icon + "')";
      let dialog_text = null;
      dialog_text = dialog.querySelector("div p");
      dialog_text.textContent = message; // prevent HTML injection
      dialog_text.innerHTML = dialog_text.textContent.replace(/\n/g, '<br />');
      return new Promise(function (resolve, reject) {
        let button = dialog.querySelector("button");
        button.addEventListener("click", () => {
          document.body.removeChild(dialog);
          resolve(true);
        });
      });
    }),

    confirm: content_function("Page.confirm", function (message) {
      let dialog = document.getElementById("passff_notification");
      if (!dialog) {
        dialog = document.createElement("div");
        dialog.id = "passff_notification";
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = "<div><p></p><div><button>OK</button> <button>Cancel</button></div></div>";
      let div = dialog.querySelector("div");
      div.style.backgroundImage = "url('" + passff_icon + "')";
      let dialog_text = null;
      dialog_text = dialog.querySelector("div p");
      dialog_text.textContent = message; // prevent HTML injection
      dialog_text.innerHTML = dialog_text.textContent.replace(/\n/g, '<br />');
      return new Promise(function (resolve, reject) {
        let button = dialog.querySelector("button:first-child");
        button.addEventListener("click", () => {
          document.body.removeChild(dialog);
          resolve(true);
        });
        button = dialog.querySelector("button:last-child");
        button.addEventListener("click", () => {
          document.body.removeChild(dialog);
          resolve(false);
        });
      });
    }),

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
      return [input.type, input.name ? input.name : input.id];
    }),
  };
})();
