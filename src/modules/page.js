/**
 * Manipulates and interacts with web pages opened by the user.
 */

import * as util from "./util.js";
import { _, log } from "./util.js";
import PassFF from "./main.js";

let doc = document;
let tabContainer = null;
let inputElements = [];
let loginInputTypes = ["text", "email", "tel"];
let otpInputTypes = ["text", "number", "password", "tel"];
let pwInputTypes = ["password", "text"];
let tabInitPending = [];
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
  let buttonQuery = PassFF.Preferences.buttonInputQueries.join(",");
  let buttons = Array.from(form.querySelectorAll(buttonQuery))
    .concat(Array.from(form.elements).filter((el) => el.matches(buttonQuery)))
    .filter(isVisible);
  let submitButtonPredicates = [
    // explicit submit type
    (button) => button.getAttribute("type") === "submit",
    // the browser interprets an unset or invalid type as submit
    (button) => !["submit", "button"].includes(button.getAttribute("type")),
    // assume that last button in form performs submission via javascript
    (button, index, arr) => index + 1 === arr.length,
  ];
  for (let predicate of submitButtonPredicates) {
    let button = buttons.find(predicate);
    if (button) return button;
  }
  return null;
}

function getAutocompleteAttr(input) {
  let autocomplete = input.getAttribute("autocomplete");
  if (input.hasAttribute("passff-autocomplete")) {
    autocomplete = input.getAttribute("passff-autocomplete");
  }
  return autocomplete;
}

function readInputNames(input) {
  let inputNames = [input.name || "", input.id || ""];
  let placeholder = input.getAttribute("placeholder");
  if (placeholder && placeholder.toLowerCase().indexOf("search") === -1) {
    inputNames.push(placeholder);
  }

  // there is actually no such thing as a "label" attribute, but aliexpress.com uses it
  // https://codeberg.org/PassFF/passff-host/issues/68
  let label = input.getAttribute("label");
  if (label) {
    inputNames.push(label);
  }

  let autocomplete = getAutocompleteAttr(input);
  if (autocomplete && ["on", "off"].indexOf(autocomplete) === -1) {
    inputNames.push(autocomplete);
  }

  // labels are <label> elements whose `for`-attribute points to this input
  if (input.labels) {
    inputNames = inputNames.concat(
      Array.from(input.labels, (l) => l.innerText),
    );
  }

  if (["email", "tel"].indexOf(input.type) >= 0) {
    inputNames.push(input.type);
  }

  return inputNames
    .slice(0, 2)
    .concat(inputNames.slice(2).filter(Boolean))
    .map((nm) => nm.toLowerCase());
}

function findIntersection(arr1, arr2, callback) {
  // find first element from arr1 in intersection of arr1 and arr2
  // equality of elements is determined according to callback(el1, el2)
  callback = callback || ((el1, el2) => el1 === el2);
  return arr1.find((el1) => arr2.some((el2) => callback(el1, el2)));
}

function rateInputNames(input, goodNames) {
  let inputNames = readInputNames(input);
  let rt = inputNames.map((inputName) => {
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
  rt = 10 * (rt[0] + rt[1]) + rt.slice(2).reduce((a, b) => a + b, 0);
  // We ignore `autocomplete="off"` if the rating is at least 10 (which
  // usually means a match in the "id" and/or "name" attribute).
  // https://developer.mozilla.org/en-US/docs/Web/Security/Securing_your_site/Turning_off_form_autocompletion#the_autocomplete_attribute_and_login_fields
  if (getAutocompleteAttr(input) == "off" && rt < 10) {
    rt = 0;
  }
  return rt;
}

function ratePasswordInput(input) {
  if (pwInputTypes.indexOf(input.type) < 0) {
    return 0;
  } else {
    let rt = rateInputNames(input, PassFF.Preferences.passwordInputNames);
    if (input.type === "password" && rt < 10) {
      // just not as good as having a name or id matching an OTP input name exactly
      return 19;
    }
    return rt;
  }
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
  if (["keydown", "keyup", "keypress"].includes(typeArg)) {
    return new KeyboardEvent(typeArg, {
      key: " ",
      code: " ",
      charCode: " ".charCodeAt(0),
      keyCode: " ".charCodeAt(0),
      which: " ".charCodeAt(0),
      bubbles: true,
      composed: true,
      cancelable: true,
    });
  } else if (["input", "change"].includes(typeArg)) {
    return new InputEvent(typeArg, {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
  } else if (["focus", "blur"].includes(typeArg)) {
    return new FocusEvent(typeArg, {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
  } else {
    log.error("createFakeEvent: Unknown event type", typeArg);
    return null;
  }
}

function writeValueWithEvents(input, value) {
  // don't fill if element is invisible
  if (isInvisible(input)) return;
  let inputs = [input];
  let values = [value];
  if (input.maxLength == 1) {
    inputs = Array.from(document.getElementsByTagName("input")).filter(
      (el) => el.maxLength == 1,
    );
    if (inputs.length == value.length) {
      values = value.split("");
    } else {
      inputs = [input];
    }
  }
  values.forEach((value, i) => {
    input = inputs[i];
    input.value = value;
    for (let action of [
      "focus",
      "keydown",
      "keyup",
      "keypress",
      "input",
      "change",
      "blur",
    ]) {
      input.dispatchEvent(createFakeEvent(action));
      input.value = value;
    }
  });
}

function annotateInputs(inputs) {
  return inputs.map((input) => {
    let rtLogin = rateLoginInput(input);
    let rtPassword = ratePasswordInput(input);
    let rtOtp = rateOtpInput(input);
    let inputType = "";
    if (rtOtp > rtLogin) {
      if (rtOtp > rtPassword) {
        inputType = "otp";
      } else {
        inputType = "password";
      }
    } else if (rtPassword > rtLogin) {
      inputType = "password";
    } else if (rtLogin > 0) {
      inputType = "login";
    }
    return [input, inputType];
  });
}

function onNodeAdded() {
  inputElements = annotateInputs(
    Array.from(document.getElementsByTagName("input"))
      .concat(Array.from(document.getElementsByTagName("select")))
      .filter(isVisible),
  );
  if (PassFF.Preferences.markFillable) {
    let url = window.location.href;
    let urlInBlacklist = PassFF.Preferences.markFillableBlacklist.findIndex(
      (str) => {
        return url.indexOf(str) >= 0;
      },
    );
    if (urlInBlacklist == -1) {
      inputElements
        .filter((inp) => inp[1] != "")
        .forEach((inp) => injectIcon(inp[0]));
    }
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
  let otpInputs = inputs.filter((inp) => inp[1] == "otp");
  let otpFilled = false;
  if (otpInputs.length == passwordData.otp?.length) {
    otpInputs.forEach((annotatedInput, i) => {
      writeValueWithEvents(annotatedInput[0], passwordData.otp[i]);
    });
    otpFilled = true;
  }

  inputs.forEach((annotatedInput) => {
    let input = annotatedInput[0];
    let inputType = annotatedInput[1];
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
    if (inputType != "") {
      let pd = passwordData[inputType];
      if (
        pd != "PASSFF_OMIT_FIELD" &&
        (inputType != "otp" || (pd && !otpFilled))
      ) {
        writeValueWithEvents(input, pd);
      }
    }
  });
}

// %%%%%%%%%%%%%%% Implementation of input field marker %%%%%%%%%%%%%%%%%%%%%%%%

function getPassffIcon(light) {
  return browser.runtime.getURL(`/skin/icon${!!light ? "-light" : ""}.svg`);
}

function isMouseOverIcon(e) {
  if (typeof e.target.passffInjected === "undefined") return false;
  let bcrect = e.target.getBoundingClientRect();
  let iconoffset = parseFloat(PassFF.Preferences.iconOffset) || 0;
  //let leftLimit = bcrect.left + bcrect.width - 22;
  let leftLimit = bcrect.left + bcrect.width - 22 - iconoffset;
  let rightLimit = bcrect.left + bcrect.width - iconoffset;
  return e.clientX > leftLimit && e.clientX < rightLimit;
}

function setIconBackgroundStyle(input, iconUrl) {
  input.style.backgroundRepeat = "no-repeat";
  input.style.backgroundAttachment = "scroll";
  input.style.backgroundSize = "16px 16px";
  input.style.backgroundPosition = "calc(100% - 24px) 50%";
  input.style.backgroundPosition = `calc(100% - 4px - ${PassFF.Preferences.iconOffset}) 50%`;
  input.style.backgroundImage = `url('${iconUrl}')`;
}

function onIconHover(e) {
  if (isMouseOverIcon(e)) {
    setIconBackgroundStyle(e.target, getPassffIcon());
    e.target.style.cssText += "cursor: pointer !important;";

    /* Set autocomplete attribute to "off", so Firefox' autofill list won't
     * overlap passff's popup menu. Also save its value beforehand, so it can
     * be restored when the popup gets dismissed.
     */
    if (!e.target.hasAttribute("passff-autocomplete"))
      e.target.setAttribute(
        "passff-autocomplete",
        e.target.getAttribute("autocomplete"),
      );
    e.target.setAttribute("autocomplete", "off");

    return;
  }
  if (e.target !== popupTarget) resetIcon(e.target);
  e.target.style.cursor = "auto";
  if (e.target.hasAttribute("passff-autocomplete"))
    e.target.setAttribute(
      "autocomplete",
      e.target.getAttribute("passff-autocomplete"),
    );
}

function onIconClick(e) {
  if (isMouseOverIcon(e)) openPopup(e.target);
}

function injectIcon(input) {
  if (typeof input.passffInjected !== "undefined") return;
  log.debug("Inject icon", input.id || input.name);
  input.passffInjected = true;
  setIconBackgroundStyle(input, getPassffIcon(true));
  input.addEventListener("mouseout", (e) => {
    if (e.target !== popupTarget) resetIcon(e.target);
  });
  input.addEventListener("mousemove", onIconHover);
  input.addEventListener("click", onIconClick);
}

function resetIcon(input) {
  input.style.backgroundImage = "url('" + getPassffIcon(true) + "')";
}

// %%%%%%%%%%%%%%% Implementation of input field popup %%%%%%%%%%%%%%%%%%%%%%%%%

let popupFrame = null;
let popupTarget = null;

function resetPopup(target) {
  // return true if resetted popupFrame belonged to target
  let result = target === popupTarget;
  if (popupTarget !== null) resetIcon(popupTarget);
  if (result) popupTarget = null;
  if (popupFrame === null) setupPopup();
  popupFrame.style.display = "none";
  popupFrame.style.width = PassFF.Preferences.lookPopupWidth;
  return result;
}

function setupPopup() {
  if (!PassFF.Preferences.markFillable) return;

  // Remove old instances of the popup menu
  let old = document.querySelector(".passff_popup_frame");
  if (old) old.parentNode.removeChild(old);

  // Setup new instance
  popupFrame = document.createElement("iframe");
  popupFrame.setAttribute(
    "src",
    browser.runtime.getURL("content/content-popup.html"),
  );
  popupFrame.classList.add("passff_popup_frame");
  popupFrame.addEventListener(
    "load",
    function () {
      let doc = popupFrame.contentDocument;
      let popupMenu = doc.querySelector(".passff_popup_menu");
      let popupDiv = doc.querySelector(".passff_popup_menu > div");

      /* The following two icons have been taken from
       *  https://github.com/encharm/Font-Awesome-SVG-PNG (MIT-License)
       * which provides PNG/SVG versions for Font Awesome icons:
       *  http://fontawesome.io/ (License: SIL OFL 1.1)
       */
      let paperPlane16 = browser.runtime.getURL("/skin/paper-plane.svg");
      let pencilSquare16 = browser.runtime.getURL("/skin/pencil-square.svg");

      if (matchItems.length === 0) {
        let alertEl = doc.createElement("div");
        alertEl.classList.add("alert");
        alertEl.textContent = _("passff_no_entries_found");
        popupMenu.innerHTML = "";
        popupMenu.appendChild(alertEl);
      }
      matchItems
        .filter((i) => i.isLeaf || i.hasFields)
        .forEach((item) => {
          let entry = document.createElement("div");
          entry.classList.add("passff_entry");
          entry.passffItem = item;
          entry.innerHTML = `
        <!-- display: table-row -->
        <div><button class="passff_key"><span></span></button></div>
        <div><button class="passff_fill passff_button"></button></div>
        <div><button class="passff_submit passff_button"></button></div>
      `;
          let button = entry.querySelector(".passff_key span");
          let fullKey = item.fullKey.replace(/^\//, "");
          button.textContent = fullKey;
          button.parentNode.title = fullKey;
          button.parentNode.addEventListener("click", function (e) {
            if (PassFF.Preferences.submitFillable) return onPopupSubmitClick(e);
            return onPopupFillClick(e);
          });
          button = entry.querySelector(".passff_fill");
          button.style.backgroundImage = "url('" + pencilSquare16 + "')";
          button.addEventListener("click", onPopupFillClick);
          button = entry.querySelector(".passff_submit");
          button.style.backgroundImage = "url('" + paperPlane16 + "')";
          button.addEventListener("click", onPopupSubmitClick);
          popupDiv.appendChild(entry);
        });
    },
    true,
  );
  popupFrame.style.display = "none";
  document.body.appendChild(popupFrame);
}

function openPopup(target) {
  if (resetPopup(target)) return;
  popupTarget = target;

  // remove this popup when user clicks somewhere else on the page
  document.addEventListener("click", function f(e) {
    if (getPopupEntryItem(e.target) !== null || isMouseOverIcon(e)) return;
    document.removeEventListener("click", f);
    resetPopup(target);
  });

  // position popup relative to input field
  let rect = target.getBoundingClientRect();
  let popupWidth = window.getComputedStyle(popupFrame).width;
  popupWidth = parseInt(popupWidth.substring(0, popupWidth.length - 2), 10);
  let scrollright = window.scrollX - popupWidth;
  popupFrame.style.top = window.scrollY + rect.bottom + 1 + "px";
  popupFrame.style.left = scrollright + rect.right - 2 + "px";
  popupFrame.style.display = "block";

  // get the largest z-index value and position ourselves above it
  let z = Math.max(
    1,
    ...[...document.querySelectorAll("body *")]
      .filter((e) => ["static", ""].indexOf(e) === -1)
      .map((e) => parseInt(window.getComputedStyle(e).zIndex, 10))
      .filter((e) => e > 0),
  );
  popupFrame.style.zIndex = "" + z;
}

function getPopupEntryItem(target) {
  let entry = target.parentElement;
  while (entry && !entry.classList.contains("passff_entry")) {
    entry = entry.parentElement;
  }
  if (!entry) return null;
  return entry.passffItem;
}

function onPopupFillClick(e) {
  let item = getPopupEntryItem(e.target);
  popupTarget.focus();
  resetPopup(popupTarget);
  PassFF.Pass.getPasswordData(item).then((passwordData) => {
    if (typeof passwordData === "undefined") return;
    PassFF.Page.fillActiveElement(passwordData);
  });
}

function onPopupSubmitClick(e) {
  let item = getPopupEntryItem(e.target);
  popupTarget.focus();
  let formDoc = popupTarget.form;
  resetPopup(popupTarget);
  PassFF.Pass.getPasswordData(item)
    .then((passwordData) => {
      if (typeof passwordData === "undefined") return;
      return PassFF.Page.fillActiveElement(passwordData);
    })
    .then(() => {
      PassFF.Page.submit(formDoc);
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
    if (typeof val !== "undefined") {
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
      return t[0] == tab.id && t[1] == date;
    });
    if (index >= 0) {
      this._tabs.splice(index, 1);
    }
  },
};

/* #############################################################################
 * #############################################################################
 *  Helper for tab initialization
 * #############################################################################
 */

function initTab(tab) {
  return new Promise((resolve, reject) => {
    let onFinally = function () {
      log.debug("initTab: done", tab.id, tab.url, tab.cookieStoreId);
      resolve(tab);
    };
    /*
      On privileged pages, script exec. will be rejected. We resolve anyhow in
      those cases using the same callback for resolve and reject (as long as
      `Promise.prototype.finally()` is not available).
    */
    browser.tabs
      .executeScript(tab.id, {
        code: "PassFF.init();",
        runAt: "document_start",
      })
      .then(onFinally, onFinally);
  });
}

function resetMatchItems() {
  let url = window.location.href;
  matchItems = PassFF.Pass.getUrlMatchingItems(url, tabContainer);
  bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url, tabContainer);
}

function onWindowLoad() {
  resetMatchItems();

  let obs = new MutationObserver(onNodeAdded);
  obs.observe(document, { attributes: true, childList: true, subtree: true });
  onNodeAdded();

  return PassFF.Page.goToAutoFillPending().then(function (pending) {
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

export function doAllSecurityChecks(passItemURL, currTabURL) {
  let checkResults = {
    errMessage: null,
    currUrl: currTabURL,
    currUrlValid: false,
    passUrl: passItemURL,
    passUrlValid: false,
    protocol: false,
    fullurl: false,
    subdomain: false,
    domain: false,
  };

  let currURL;
  try {
    currURL = new URL(currTabURL);
    checkResults["currUrlValid"] = true;
  } catch (e) {
    checkResults["errMessage"] = e.message;
    return checkResults;
  }

  if (currURL.protocol == "https:") {
    checkResults["protocol"] = true;
  }

  let errMessage;
  let passURL = [];
  for (const url of passItemURL) {
    try {
      passURL.push(new URL(url));
      checkResults["passUrlValid"] = true;
    } catch (e) {
      errMessage = e.message;
    }
  }

  if (passURL.length == 0) {
    checkResults["errMessage"] = errMessage;
    return checkResults;
  }

  if (passURL.some((url) => url.href == currURL.href)) {
    checkResults["fullurl"] = true;
    checkResults["subdomain"] = true;
    checkResults["domain"] = true;
  } else {
    let currHost = currURL.hostname;
    let passHosts = passURL.map((url) => url.hostname);
    if (passHosts.some((host) => util.checkIsSubdomain(currHost, host))) {
      checkResults["subdomain"] = true;
      checkResults["domain"] = true;
    } else {
      let currDomain = util.getMainDomain(currHost);
      let passDomains = passHosts.map(util.getMainDomain);
      checkResults["domain"] = passDomains.some(
        (domain) => domain == currDomain,
      );
    }
  }

  return checkResults;
}

function securityChecksConfirmationRequired(results) {
  let confirmationMessage = "";
  if (!results["currUrlValid"]) {
    if (
      PassFF.Preferences.checkProtocol == 2 ||
      PassFF.Preferences.checkSubdomain == 2 ||
      PassFF.Preferences.checkDomain == 2 ||
      PassFF.Preferences.checkFullUrl == 2
    ) {
      return ["", false];
    }
    confirmationMessage += _("passff_checks_invalid_url_curr") + " ";
  } else {
    let pref = PassFF.Preferences.checkProtocol;
    if (!results["protocol"] && pref > 0) {
      confirmationMessage += _("passff_checks_protocol") + " ";
      if (pref == 2) return ["", false];
    } else if (
      PassFF.Preferences.checkSubdomain == 0 &&
      PassFF.Preferences.checkDomain == 0 &&
      PassFF.Preferences.checkFullUrl == 0
    ) {
      return ["", true];
    }

    if (!results["passUrlValid"]) {
      if (
        PassFF.Preferences.checkSubdomain == 2 ||
        PassFF.Preferences.checkDomain == 2 ||
        PassFF.Preferences.checkFullUrl == 2
      ) {
        return ["", false];
      }
      confirmationMessage += _("passff_checks_invalid_url_pass") + " ";
    } else {
      let checkLevels = ["fullurl", "subdomain", "domain"];
      let checkLevelPrefs = ["checkFullUrl", "checkSubdomain", "checkDomain"];
      for (let i = 0; i < checkLevels.length; i++) {
        let pref = PassFF.Preferences[checkLevelPrefs[i]];
        if (!results[checkLevels[i]] && pref > 0) {
          confirmationMessage += _(`passff_checks_${checkLevels[i]}`) + " ";
          if (pref == 2) return ["", false];
          break;
        }
      }
    }
  }
  return [confirmationMessage, true];
}

function securityChecks(passItemURL, currTabURL, isAutoFill) {
  if (
    (!isAutoFill && PassFF.Preferences.checkOnlyAuto) ||
    (PassFF.Preferences.checkProtocol == 0 &&
      PassFF.Preferences.checkSubdomain == 0 &&
      PassFF.Preferences.checkDomain == 0 &&
      PassFF.Preferences.checkFullUrl == 0)
  ) {
    return Promise.resolve(true);
  }

  let results = doAllSecurityChecks(passItemURL, currTabURL);
  let [confirmationMessage, alternative] =
    securityChecksConfirmationRequired(results);

  if (confirmationMessage === "") {
    return Promise.resolve(alternative);
  }

  return PassFF.Page.confirm(
    `**${confirmationMessage}**\n${_("passff_checks_url_curr")}` +
      `\`\`\`${results["currUrl"]}\`\`\`${_("passff_checks_url_pass")}` +
      `\`\`\`${results["passUrl"].join("\n")}\`\`\`` +
      `**${_("passff_checks_override_confirm")}**`,
  );
}

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

export default {
  init: function () {
    return PassFF.Page.getTabContainer()
      .then((name) => {
        tabContainer = name;

        if (document.readyState === "complete") onWindowLoad();
        else window.addEventListener("load", onWindowLoad);

        /*
          Allow our browser command to bypass the usual DOM event mapping, so that
          the keyboard shortcut still works, even when a password field is focused.
        */
        return PassFF.Preferences.getKeyboardShortcut();
      })
      .then((shortcut) => {
        /*
          Attach a DOM-level event handler for our command key, so it works
          even if an input box is focused.
        */
        document.addEventListener(
          "keydown",
          function (evt) {
            if (shortcut.commandLetter !== evt.key.toLowerCase()) return;

            for (let modifier of Object.keys(shortcut.expectedModifierState)) {
              if (
                shortcut.expectedModifierState[modifier] !==
                evt.getModifierState(modifier)
              ) {
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
          },
          true,
        );
      });
  },

  initTab: util.backgroundFunction("Page.initTab", function (tab) {
    /*
      We keep track of which tabs have already been initialized to avoid
      unnecessary calls to `browser.tabs.executeScript()`.
    */
    let pendingId = tabInitPending.findIndex(function (t) {
      return t.id == tab.id;
    });
    if (pendingId >= 0) {
      return tabInitPending[pendingId].promise;
    } else {
      pendingId = tabInitPending.length;
      log.debug("Awaiting tab init...", tab.id, tab.url);
      let pendingPromise = initTab(tab);
      tabInitPending.push({ id: tab.id, promise: pendingPromise });
      return pendingPromise.then((readyTab) => {
        tabInitPending.splice(pendingId, 1);
        return readyTab;
      });
    }
  }),

  refresh: util.contentFunction("Page.refresh", function () {
    resetMatchItems();
    setupPopup();
  }),

  // %%%%%%%%%%%%%%%%%%%%%%%%%% URL changer %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  goToItemUrl: util.backgroundFunction(
    "Page.goToItemUrl",
    function (item, newTab, autoFill, submit) {
      if (!item) return Promise.resolve();
      let promisedTab = newTab ? browser.tabs.create({}) : util.getActiveTab();
      return PassFF.Pass.getPasswordData(item)
        .then((passwordData) => {
          if (typeof passwordData === "undefined") return null;
          log.debug("goToItemUrl:", item.fullKey, newTab, autoFill, submit);
          let url = passwordData.url[0];
          for (let i = 0; i < passwordData.url.length; i++) {
            try {
              url = new URL(passwordData.url[i]).href;
            } catch (e) {
              continue;
            }
          }
          log.debug(`goToItemUrl: using URL ${url}`);
          return promisedTab.then((tab) => {
            let tabUrl = tab.url.replace(/^https?:\/+/, "").replace(/\/+$/, "");
            let testUrl = url.replace(/^https?:\/+/, "").replace(/\/+$/, "");
            if (tabUrl === testUrl) {
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
              item: item,
            };
          }
        });
    },
  ),

  goToAutoFillPending: util.backgroundFunction(
    "Page.goToAutoFillPending",
    () => goToAutoFillPending,
  ),

  resolveGoToAutoFillPending: util.backgroundFunction(
    "Page.resolveGoToAutoFillPending",
    function (fillInputs) {
      log.debug("Resolving pending auto fill", fillInputs);
      if (fillInputs === true) {
        let pending = goToAutoFillPending;
        PassFF.Page.fillInputs(pending.tab, pending.item, pending.submit);
      }
      goToAutoFillPending = null;
    },
  ),

  // %%%%%%%%%%%%%%%%%%%%%%%%%% Form filler %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  autoFill: util.contentFunction("Page.autoFill", function () {
    if (!PassFF.Preferences.autoFill) return;

    let url = window.location.href;
    let urlInBlacklist = PassFF.Preferences.autoFillBlacklist.findIndex(
      (str) => {
        return url.indexOf(str) >= 0;
      },
    );
    if (urlInBlacklist >= 0) return;

    log.debug("Start pref-auto-fill");
    if (bestFitItem) {
      PassFF.Page.fillInputs(bestFitItem, false, true).then((passwordData) => {
        if (
          PassFF.Preferences.autoSubmit &&
          PassFF.Pass.getItemsLeafs(matchItems).length == 1 &&
          passwordData._other["autosubmit"] !== "false"
        ) {
          PassFF.Page.safeSubmit();
        }
      });
    }
  }),

  fillActiveElement: util.contentFunction(
    "Page.fillActiveElement",
    function (passwordData) {
      let activeElement = getActiveElement();
      let inputTypes = loginInputTypes.concat(["password", "number"]);
      log.debug("Fill active element", activeElement);
      if (
        activeElement.tagName !== "INPUT" ||
        inputTypes.indexOf(activeElement.type) < 0
      )
        return;
      return securityChecks(passwordData.url, window.location.href, false).then(
        (result) => {
          if (!result) return;
          let inputs = [activeElement];
          if (activeElement.form) {
            inputs = Array.from(activeElement.form.elements).filter(
              (el) => el.tagName == "INPUT",
            );
          }
          inputs = annotateInputs(Array.from(inputs).filter(isVisible));
          setInputs(inputs, passwordData);
        },
      );
    },
  ),

  fillInputs: util.contentFunction(
    "Page.fillInputs",
    function (item, andSubmit, isAutoFill) {
      refocus();
      if (
        inputElements.filter((inp) => inp[1] == "password" || inp[1] == "otp")
          .length === 0
      ) {
        if (inputElements.length == 0 || isAutoFill) {
          log.debug("fillInputs: No relevant login input elements recognized.");
          return Promise.resolve();
        } else {
          log.debug("fillInputs: Warning: no password inputs found!");
        }
      }
      return PassFF.Pass.getPasswordData(item).then((passwordData) => {
        if (typeof passwordData === "undefined") return;
        log.debug("fillInputs: Start auto-fill using", item.fullKey, andSubmit);
        return securityChecks(
          passwordData.url,
          window.location.href,
          isAutoFill,
        ).then((result) => {
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
    },
    true,
  ),

  // %%%%%%%%%%%%%%%%%%%%%%% Form submitter %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  submit: util.contentFunction(
    "Page.submit",
    function (form) {
      if (typeof form === "undefined") {
        let passwords = inputElements.filter((inp) => inp[1] == "password");
        if (passwords.length === 0) return false;
        form = passwords[0][0].form;
      }

      if (!form) return false;
      let submitBtn = getSubmitButton(form);
      log.debug("Unsafe submit...", submitBtn);
      if (submitBtn) {
        submitBtn.click();
      } else {
        form.requestSubmit();
      }
      return true;
    },
    true,
  ),

  safeSubmit: util.backgroundFunction(
    "Page.safeSubmit",
    function (sender) {
      let tab = sender.tab;
      if (submittedTabs.get(tab)) {
        log.debug("safeSubmit: Tab already auto-submitted. skip it");
        return;
      }
      log.debug("safeSubmit: Starting submit");
      let date = Date.now();
      submittedTabs.set(tab, date);
      PassFF.Page.submit(tab).then((results) => {
        if (!results || results[0] !== true) {
          submittedTabs.unset(tab, date);
        }
      });
    },
    true,
  ),

  // %%%%%%%%%%%%%%% Implementation of notification dialog %%%%%%%%%%%%%%%%%%%%%%%

  notify: util.contentFunction("Page.notify", function (message) {
    let dialog = document.getElementById("passff_notification");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "passff_notification";
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = "<div><p></p><div><button>OK</button></div></div>";
    let div = dialog.querySelector("div");
    div.style.backgroundImage = "url('" + getPassffIcon() + "')";
    let dialogText = null;
    dialogText = dialog.querySelector("div p");
    dialogText.textContent = message; // prevent HTML injection
    util.parseMarkdown(dialogText);
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

  confirm: util.contentFunction("Page.confirm", function (message) {
    let dialog = document.getElementById("passff_notification");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "passff_notification";
      document.body.appendChild(dialog);
    }
    dialog.innerHTML =
      "<div><p></p><div><button>OK</button> <button>Cancel</button></div></div>";
    let div = dialog.querySelector("div");
    div.style.backgroundImage = "url('" + getPassffIcon() + "')";
    let dialogText = null;
    dialogText = dialog.querySelector("div p");
    dialogText.textContent = message; // prevent HTML injection
    util.parseMarkdown(dialogText);
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

  getActiveInput: util.contentFunction("Page.getActiveInput", function () {
    let input = getActiveElement();
    if (input.tagName != "INPUT" || loginInputTypes.indexOf(input.type) < 0) {
      return null;
    }
    return [input.type, input.name ? input.name : input.id];
  }),

  readLoginInput: util.contentFunction("Page.readLoginInput", function () {
    let login = "";
    inputElements
      .filter((inp) => inp[1] == "login" && inp[0].value != "")
      .forEach((inp) => {
        login = inp[0].value;
      });
    return login;
  }),

  getTabContainer: util.backgroundFunction(
    "Page.getTabContainer",
    function (sender) {
      return util.getTabContainer(sender.tab);
    },
    true,
  ),
};
