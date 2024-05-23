/* jshint node: true */
'use strict';

PassFF.Page = (function () {
  /**
    * Manipulates and interacts with web pages opened by the user.
    */

  let doc = document;
  let inputElements = [];
  let loginInputTypes = ['text', 'email', 'tel'];
  let otpInputTypes = ['text', 'number', 'password', 'tel'];
  let tab_init_pending = [];
  let matchItems = [];
  let bestFitItem = null;
  let goToAutoFillPending = null;
  let lastActiveElement = null;

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

  function refocus() {
    if (lastActiveElement !== null) {
      lastActiveElement.focus();
    }
  }

  function isInvisible(el) {
    return el.offsetHeight === 0 || el.offsetParent === null;
  }

  function isVisible(el) {
    return !isInvisible(el);
  }

  function getSubmitButton(form) {
    let buttonQueries = PassFF.Preferences.buttonInputQueries;
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

  function getAutocompleteAttr(input) {
    let autocomplete = input.getAttribute("autocomplete");
    if (input.hasAttribute('passff-autocomplete')) {
      autocomplete = input.getAttribute('passff-autocomplete');
    }
    return autocomplete;
  }

  function readInputNames(input) {
    let inputNames = [input.name || "", input.id || ""];
    let placeholder = input.getAttribute('placeholder');
    if (placeholder && placeholder.toLowerCase().indexOf('search') === -1) {
      inputNames.push(placeholder);
    }

    // there is actually no such thing as a "label" attribute, but aliexpress.com uses it
    // https://github.com/passff/passff-host/issues/68
    let label = input.getAttribute('label');
    if (label) {
      inputNames.push(label);
    }

    let autocomplete = getAutocompleteAttr(input);
    if (autocomplete && ["on","off"].indexOf(autocomplete) === -1) {
      inputNames.push(autocomplete);
    }

    // labels are <label> elements whose `for`-attribute points to this input
    if (input.labels) {
      inputNames = inputNames.concat(Array.from(input.labels, l => l.innerText));
    }

    if (["email","tel"].indexOf(input.type) >= 0) {
      inputNames.push(input.type);
    }

    return inputNames.slice(0,2)
      .concat(inputNames.slice(2).filter(Boolean))
      .map(nm => nm.toLowerCase());
  }

  function findIntersection(arr1, arr2, callback) {
    // find first element from arr1 in intersection of arr1 and arr2
    // equality of elements is determined according to callback(el1, el2)
    callback = callback || ((el1, el2) => el1 === el2);
    return arr1.find(el1 => arr2.some(el2 => callback(el1, el2)));
  }

  function rateInputNames(input, goodNames) {
    let inputNames = readInputNames(input);
    let rt = inputNames.map(inputName => {
      let rating = 0;
      for (let gn of goodNames) {
        if (inputName.indexOf(gn) >= 0) {
          rating = 1;
          if (inputName == gn) {
            return 2;
          }
        }
      }
      return rating;
    });
    rt = 10 * (rt[0] + rt[1]) + rt.slice(2).reduce((a,b) => a + b, 0);
    // We ignore `autocomplete="off"` if the rating is at least 10 (which
    // usually means a match in the "id" and/or "name" attribute).
    // https://developer.mozilla.org/en-US/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion#the_autocomplete_attribute_and_login_fields
    if (getAutocompleteAttr(input) == "off" && rt < 10) {
      rt = 0;
    }
    return rt;
  }

  function ratePasswordInput(input) {
    if (input.type === 'password') {
      return 100;
    } else if (input.type === 'text') {
      return rateInputNames(input, PassFF.Preferences.passwordInputNames);
    }
    return 0;
  }

  function rateLoginInput(input) {
    if (loginInputTypes.indexOf(input.type) < 0) {
      return 0;
    } else {
      return rateInputNames(input, PassFF.Preferences.loginInputNames);
    }
  }

  function rateOtpInput(input) {
    if (otpInputTypes.indexOf(input.type) < 0) {
      return 0;
    } else {
      return rateInputNames(input, PassFF.Preferences.otpInputNames);
    }
  }

/* #############################################################################
 * #############################################################################
 *  Helpers for DOM event handling/simulation
 * #############################################################################
 */

  function createFakeEvent(typeArg) {
    if (['keydown', 'keyup', 'keypress'].includes(typeArg)) {
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
    } else if (['input', 'change'].includes(typeArg)) {
      return new InputEvent(typeArg, {
        'bubbles': true,
        'composed': true,
        'cancelable': true
      });
    } else if (['focus', 'blur'].includes(typeArg)) {
      return new FocusEvent(typeArg, {
        'bubbles': true,
        'composed': true,
        'cancelable': true
      });
    } else {
        log.error("createFakeEvent: Unknown event type: " + typeArg);
        return null;
    }
  }

  function writeValueWithEvents(input, value) {
    // don't fill if element is invisible
    if (isInvisible(input)) return;
    let inputs = [input];
    let values = [value];
    if (input.maxLength == 1) {
      inputs = Array.from(
        document.getElementsByTagName('input')
      ).filter(el => el.maxLength == 1);
      if (inputs.length == value.length) {
        values = value.split("");
      } else {
        inputs = [input];
      }
    }
    values.forEach((value, i) => {
      input = inputs[i];
      input.value = value;
      for (let action of ['focus', 'keydown', 'keyup', 'keypress',
                          'input', 'change', 'blur']) {
        input.dispatchEvent(createFakeEvent(action));
        input.value = value;
      }
    });

  }

  function annotateInputs(inputs) {
    return inputs.map(input => {
      let rt_login = rateLoginInput(input);
      let rt_pw = ratePasswordInput(input);
      let rt_otp = rateOtpInput(input);
      let input_type = "";
      if (rt_otp > rt_login) {
        if (rt_otp > rt_pw) {
          input_type = "otp";
        } else {
          input_type = "password";
        }
      } else if (rt_pw > rt_login) {
        input_type = "password";
      } else if (rt_login > 0) {
        input_type = "login";
      }
      return [input, input_type];
    });
  }

  function onNodeAdded() {
    inputElements = annotateInputs(
      Array.from(document.getElementsByTagName('input')).concat(
        Array.from(document.getElementsByTagName('select'))
      ).filter(isVisible));
    if (PassFF.Preferences.markFillable) {
      inputElements.filter(inp => inp[1] != "")
        .forEach(inp => injectIcon(inp[0]));
    }
  }

/* #############################################################################
 * #############################################################################
 *  Helpers for DOM manipulation
 * #############################################################################
 */

  function setInputs(inputs, passwordData) {
    log.debug("setInputs:", inputs);
    let otherNames = Object.keys(passwordData._other);

    // If the number of OTP input fields agrees with the length of the OTP
    // token, fill one digit from the token into each of the input fields.
    let otp_inputs = inputs.filter((inp) => inp[1] == "otp");
    let otp_filled = false;
    if (otp_inputs.length == passwordData.otp?.length) {
      otp_inputs.forEach((annotatedInput, i) => {
        writeValueWithEvents(annotatedInput[0], passwordData.otp[i]);
      })
      otp_filled = true;
    }

    inputs.forEach(annotatedInput => {
      let input = annotatedInput[0];
      let input_type = annotatedInput[1];
      if (otherNames.length > 0) {
        // Other data is checked before default input types, but
        // one of name/id/labels of the input field has to match exactly!
        let inputNames = readInputNames(input);
        let matching = findIntersection(otherNames, inputNames);
        if (typeof matching !== "undefined") {
          const values = passwordData._other[matching];
          let value = values[values.length - 1];
          if (value == "PASSFF_OMIT_FIELD") {
            return;
          } else if (value == "PASSFF_FIELD_OTP") {
            value = passwordData.otp;
          } else if (value == "PASSFF_FIELD_LOGIN") {
            value = passwordData.login;
          } else if (value == "PASSFF_FIELD_PASSWORD") {
            value = passwordData.password;
          }
          writeValueWithEvents(input, value);
          return;
        }
      }
      if (input_type != "") {
        let pd = passwordData[input_type];
        if (
          pd != "PASSFF_OMIT_FIELD"
          && (input_type != "otp" || pd && !otp_filled)
        ) {
          writeValueWithEvents(input, pd);
        }
      }
    });
  }

// %%%%%%%%%%%%%%% Implementation of input field marker %%%%%%%%%%%%%%%%%%%%%%%%

  let passff_icon = browser.runtime.getURL('/skin/icon.svg');
  let passff_icon_light = browser.runtime.getURL('/skin/icon-light.svg');

  /* The following two icons have been taken from
   *  https://github.com/encharm/Font-Awesome-SVG-PNG (MIT-License)
   * which provides PNG/SVG versions for Font Awesome icons:
   *  http://fontawesome.io/ (License: SIL OFL 1.1)
   */
  let paper_plane_16 = browser.runtime.getURL('/skin/paper-plane.svg');
  let pencil_square_16 = browser.runtime.getURL('/skin/pencil-square.svg');

  function isMouseOverIcon(e) {
    if (typeof e.target.passff_injected === "undefined") return false;
    let bcrect = e.target.getBoundingClientRect();
    let leftLimit = bcrect.left + bcrect.width - 22;
    return e.clientX > leftLimit;
  }

  function setIconBackgroundStyle(input, icon_url) {
    input.style.backgroundRepeat = "no-repeat";
    input.style.backgroundAttachment = "scroll";
    input.style.backgroundSize = "16px 16px";
    input.style.backgroundPosition = "calc(100% - 4px) 50%";
    input.style.backgroundImage = `url('${icon_url}')`;
  }

  function onIconHover(e) {
    if (isMouseOverIcon(e)) {
      setIconBackgroundStyle(e.target, passff_icon);
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
    setIconBackgroundStyle(input, passff_icon_light);
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
      browser.runtime.getURL("content/content-popup.html"));
    popup_menu.classList.add("passff_popup_menu");
    popup_menu.addEventListener("load", function () {
      let doc = popup_menu.contentDocument;
      let popup_div = doc.getElementsByTagName("div")[0];
      if (matchItems.length === 0) {
        let alert_el = doc.createElement("div");
        alert_el.classList.add("alert");
        alert_el.textContent = _('passff_no_entries_found');
        popup_div.innerHTML = "";
        popup_div.appendChild(alert_el);
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
    popup_width = parseInt(popup_width.substring(0,popup_width.length-2), 10);
    let scrollright = window.scrollX - popup_width;
    popup_menu.style.top      = (window.scrollY + rect.bottom + 1) + "px";
    popup_menu.style.left     = (scrollright + rect.right - 2) + "px";
    popup_menu.style.display  = "block";

    // get the largest z-index value and position ourselves above it
    let z = Math.max(1, ...[...document.querySelectorAll('body *')]
      .filter(e => ["static",""].indexOf(e) === -1)
      .map(e => parseInt(window.getComputedStyle(e).zIndex, 10))
      .filter(e => e>0));
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
        return PassFF.Page.fillActiveElement(passwordData);
      })
      .then(() => {
        PassFF.Page.submit(form_doc);
      });
  }

/* #############################################################################
 * #############################################################################
 *  Helper to prevent auto-fill from causing submit loops
 * #############################################################################
 */

  let submittedTabs = {
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

    let obs = new MutationObserver(onNodeAdded);
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

  function securityChecks(passItemURL, currTabURL, isAutoFill) {
    if (
      (!isAutoFill && PassFF.Preferences.checkOnlyAuto) || (
        PassFF.Preferences.checkProtocol == 0
        && PassFF.Preferences.checkSubdomain == 0
        && PassFF.Preferences.checkDomain == 0
        && PassFF.Preferences.checkFullUrl == 0
      )
    ) {
      return Promise.resolve(true);
    }

    return Promise.resolve()
    .then(() => {
      let checkResults = {
        "err_message": null,
        "curr_url": currTabURL,
        "curr_url_valid": false,
        "pass_url": passItemURL,
        "pass_url_valid": false,
        "protocol": false,
        "fullurl": false,
        "subdomain": false,
        "domain": false,
      };

      let currURL;
      try {
        currURL = new URL(currTabURL);
        checkResults["curr_url_valid"] = true;
      } catch (e) {
        checkResults["err_message"] = e.message;
        return checkResults;
      }

      let err_message;
      let passURL = [];
      for (const url of passItemURL) {
        try {
          passURL.push(new URL(url));
          checkResults["pass_url_valid"] = true;
        } catch (e) {
          err_message = e.message;
        }
      }

      if (passURL.length == 0) {
        checkResults["err_message"] = err_message;
        return checkResults;
      }

      if (currURL.protocol == "https:") {
        checkResults["protocol"] = true;
      }

      if (passURL.some(url => url.href == currURL.href)) {
        checkResults["fullurl"] = true;
        checkResults["subdomain"] = true;
        checkResults["domain"] = true;
      } else {
        let currHost = currURL.hostname;
        let passHosts = passURL.map(url => url.hostname);
        if (passHosts.some(host => checkIsSubdomain(currHost, host))) {
          checkResults["subdomain"] = true;
          checkResults["domain"] = true;
        } else {
          let currDomain = getMainDomain(currHost);
          let passDomains = passHosts.map(getMainDomain);
          checkResults["domain"] = passDomains.some(domain => domain == currDomain);
        }
      }

      return checkResults;
    })
    .then((results) => {
      let confirmation_required = false;
      let confirmation_message = "";

      if (!results["curr_url_valid"]) {
        if (
          PassFF.Preferences.checkProtocol == 2
          || PassFF.Preferences.checkSubdomain == 2
          || PassFF.Preferences.checkDomain == 2
          || PassFF.Preferences.checkFullUrl == 2
        ) {
          return false;
        }
        confirmation_required = true;
        confirmation_message += _("passff_checks_invalid_url_curr") + " ";
      } else {
        let pref = PassFF.Preferences.checkProtocol;
        if (!results["protocol"] && pref > 0) {
          confirmation_required = true;
          confirmation_message += _("passff_checks_protocol") + " ";
          if (pref == 2) return false;
        }

        let checkLevels = ["fullurl", "subdomain", "domain"];
        let checkLevelPrefs = ["checkFullUrl", "checkSubdomain", "checkDomain"];
        for (let i = 0; i < checkLevels.length; i++) {
          let pref = PassFF.Preferences[checkLevelPrefs[i]];
          if (!results[checkLevels[i]] && pref > 0) {
            confirmation_required = true;
            confirmation_message += _(`passff_checks_${checkLevels[i]}`) + " ";
            if (pref == 2) return false;
            break;
          }
        }
      }

      return confirmation_required ? PassFF.Page.confirm(
        "**" + confirmation_message + "**\n"
        + _("passff_checks_url_curr") + "```" + results["curr_url"] + "```"
        + _("passff_checks_url_pass") + "```" + results["pass_url"].join("\n") + "```"
        + "**" + _("passff_checks_override_confirm") + "**"
      ) : true;
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

            for (let modifier of Object.keys(shortcut.expectedModifierState)) {
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
            lastActiveElement = getActiveElement();
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
      matchItems = PassFF.Pass.getUrlMatchingItems(url);
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
            log.debug('goToItemUrl:', item.fullKey, newTab, autoFill, submit);
            let url = passwordData.url[0];
            for (let i = 0; i < passwordData.url.length; i++) {
              try {
                url = (new URL(passwordData.url[i])).href;
              } catch (e) {
                continue;
              }
            }
            log.debug(`goToItemUrl: using URL ${url}`);
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
        PassFF.Page.fillInputs(bestFitItem, false, true)
          .then((passwordData) => {
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
        let inputTypes = loginInputTypes.concat(["password", "number"]);
        log.debug("Fill active element", activeElement);
        if (activeElement.tagName !== "INPUT"
            || inputTypes.indexOf(activeElement.type) < 0) return;
        return securityChecks(passwordData.url, window.location.href, false)
          .then((result) => {
            if (!result) return;
            let inputs = [activeElement];
            if (activeElement.form) {
              inputs = Array.from(activeElement.form.elements).filter(
                el => el.tagName == "INPUT"
              );
            }
            inputs = annotateInputs(Array.from(inputs).filter(isVisible));
            setInputs(inputs, passwordData);
          });
      }
    ),

    fillInputs: content_function("Page.fillInputs",
      function (item, andSubmit, isAutoFill) {
        refocus();
        if (
          inputElements.filter(inp => inp[1] == "password" || inp[1] == "otp")
            .length === 0
        ) {
          if (inputElements.length == 0 || isAutoFill) {
            log.debug("fillInputs: No relevant login input elements recognized.");
            return Promise.resolve();
          } else {
            log.debug("fillInputs: Warning: no password inputs found!");
          }
        }
        return PassFF.Pass.getPasswordData(item)
          .then((passwordData) => {
            if (typeof passwordData === "undefined") return;
            log.debug('fillInputs: Start auto-fill using', item.fullKey, andSubmit);
            return securityChecks(passwordData.url, window.location.href, isAutoFill)
              .then((result) => {
                if (!result) return;
                setInputs(inputElements, passwordData);
                if (andSubmit) {
                  PassFF.Page.submit();
                } else {
                  refocus();
                }
                return passwordData;
              });
          });
      }, true),

// %%%%%%%%%%%%%%%%%%%%%%% Form submitter %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    submit: content_function("Page.submit", function (form) {
      if (typeof form === "undefined") {
        let passwords = inputElements.filter(inp => inp[1] == "password");
        if (passwords.length === 0) return false;
        form = passwords[0][0].form;
      }

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
        dialog = document.createElement("dialog");
        dialog.id = "passff_notification";
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = "<div><p></p><div><button>OK</button></div></div>";
      let div = dialog.querySelector("div");
      div.style.backgroundImage = "url('" + passff_icon + "')";
      let dialog_text = null;
      dialog_text = dialog.querySelector("div p");
      dialog_text.textContent = message; // prevent HTML injection
      parse_markdown(dialog_text);
      dialog.showModal();
      return new Promise(function (resolve, reject) {
        let button = dialog.querySelector("button");
        button.addEventListener("click", () => {
          dialog.close();
          document.body.removeChild(dialog);
          resolve(true);
        });
      });
    }),

    confirm: content_function("Page.confirm", function (message) {
      let dialog = document.getElementById("passff_notification");
      if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "passff_notification";
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = "<div><p></p><div><button>OK</button> <button>Cancel</button></div></div>";
      let div = dialog.querySelector("div");
      div.style.backgroundImage = "url('" + passff_icon + "')";
      let dialog_text = null;
      dialog_text = dialog.querySelector("div p");
      dialog_text.textContent = message; // prevent HTML injection
      parse_markdown(dialog_text);
      dialog.showModal();
      return new Promise(function (resolve, reject) {
        let button = dialog.querySelector("button:first-child");
        button.addEventListener("click", () => {
          dialog.close();
          document.body.removeChild(dialog);
          resolve(true);
        });
        button = dialog.querySelector("button:last-child");
        button.addEventListener("click", () => {
          dialog.close();
          document.body.removeChild(dialog);
          resolve(false);
        });
      });
    }),

// %%%%%%%%%%%%%%%%%%%%%%%%%%% Miscellaneous %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    getActiveInput: content_function("Page.getActiveInput", function () {
      let input = getActiveElement();
      if (input.tagName != "INPUT" || loginInputTypes.indexOf(input.type) < 0) {
        return null;
      }
      return [input.type, input.name ? input.name : input.id];
    }),
  };
})();
