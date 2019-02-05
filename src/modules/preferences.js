/* jshint node: true */
'use strict';

PassFF.Preferences = (function () {
  /**
   * This object provides access to the preferences of PassFF and handles
   * the user interface of the preferences page.
   *
   * You can change or read preferences by accessing `PassFF.Preferences[key]`.
   */

/* #############################################################################
 * #############################################################################
 *  Helper for preferences page UI
 * #############################################################################
 */

  var ui_i18n_init = false;
  function init_ui() {
    let pref_str_change_cb = function (key, isInt) {
      return function (evt) {
        let val = evt.target.value;
        if (isInt) val = parseInt(val, 10);
        PassFF.Preferences[key] = val;
      };
    };

    let pref_bool_change_cb = function (key) {
      return function (evt) {
        PassFF.Preferences[key] = evt.target.checked;
      };
    };

    if (!ui_i18n_init) {
      document.querySelectorAll("h1,label,p.text,option")
        .forEach(function (el) {
          el.textContent = _(el.textContent);
        });
      ui_i18n_init = true;
    }

    for (let [key, val] of Object.entries(prefParams)) {
      let el = document.getElementById("pref_" + key);
      if (el === null) continue;
      if (el.tagName == "TEXTAREA" || el.tagName == "INPUT" && el.type == "text") {
        el.value = val;
        el.addEventListener("change", pref_str_change_cb(key));
      } else if (el.tagName == "INPUT" && el.type == "checkbox") {
        el.checked = val;
        el.addEventListener("change", pref_bool_change_cb(key));
      } else if (el.tagName == "SELECT") {
        el.value = val;
        el.addEventListener("change", pref_str_change_cb(key, true));
      }
    }
  }

/* #############################################################################
 * #############################################################################
 *  Default preferences
 * #############################################################################
 */

  var prefParams = {
    passwordInputNames    : 'passwd,password,pass',
    loginInputNames       : 'login,user,mail,email,username,opt_login,log,usr_name',
    otpInputNames         : 'otp,code',
    loginFieldNames       : 'login,user,username,id',
    passwordFieldNames    : 'passwd,password,pass',
    urlFieldNames         : 'url,http',
    autoFill              : false,
    autoSubmit            : false,
    autoFillBlacklist     : '',
    autoFillDomainCheck   : false,
    caseInsensitiveSearch : true,
    handleHttpAuth        : true,
    enterBehavior         : 0,
    defaultPasswordLength : 16,
    defaultIncludeSymbols : true,
    preferInsert          : 0,
    showNewPassButton     : true,
    markFillable          : true,
    contextMenu           : true,
    submitFillable        : true,
    directoriesFirst      : false,
    enableLogging         : false,
    showStatus            : true,
    tbMenuShortcut        : '',
    recognisedSuffixes    : 'co.uk,org.uk,me.uk,co.jp,com.au',
  };

  var listParams = {
    'passwordInputNames'  : ',',
    'loginInputNames'     : ',',
    'otpInputNames'       : ',',
    'loginFieldNames'     : ',',
    'passwordFieldNames'  : ',',
    'urlFieldNames'       : ',',
    'autoFillBlacklist'   : ',',
    'recognisedSuffixes'  : ','
  };

  var lowerCaseParams = [
    'passwordInputNames',
    'loginInputNames',
    'otpInputNames',
    'loginFieldNames',
    'passwordFieldNames',
    'urlFieldNames',
    'autoFillBlacklist'
  ];

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  var prefObj = {
    init: function () {
      return PassFF.Preferences.getBrowserCommand()
        .then((command) => {
            prefParams['tbMenuShortcut'] = command.shortcut;
            return browser.storage.local.get(Object.keys(prefParams));
        })
        .then((res) => {
          let obj = {};
          for (let [key, val] of Object.entries(prefParams)) {
            if (typeof res[key] === 'undefined') {
              obj[key] = val;
            } else {
              prefParams[key] = res[key];
            }
          }
          return browser.storage.local.set(obj);
        })
        .then(() => {
          return updateBrowserCommand();
        })
        .then(() => {
          browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;
            for (var item of Object.keys(changes)) {
              prefParams[item] = changes[item].newValue;
              if (item == "handleHttpAuth" && PassFF.mode === "background") {
                PassFF.Auth.init();
              } else if (item == "tbMenuShortcut") {
                updateBrowserCommand();
              }
            }
          });

          if (PassFF.mode === "preferences") {
            init_ui();
          }
        });
    },

// %%%%%%%%%%%%% Add identifier to the list of known login inputs %%%%%%%%%%%%%%

    addInputName: function (type, name) {
      let names = PassFF.Preferences.loginInputNames;
      if (type == "password") {
        names = PassFF.Preferences.passwordInputNames;
      }
      if (type == "otp") {
        names = PassFF.Preferences.otpInputNames;
      }
      for (let i = 0; i < names.length; i++) {
        if (name.toLowerCase().indexOf(names[i].toLowerCase()) >= 0) {
          return false;
        }
      }
      log.debug("New input name", name, "of type", type);
      names.push(name);
      names = names.join(",");
      if (type == "password") {
        PassFF.Preferences.passwordInputNames = names;
      } else if (type == "otp") {
        PassFF.Preferences.otpInputNames = names;
      } else {
        PassFF.Preferences.loginInputNames = names;
      }
      PassFF.refresh_all();
    },

// %%%%%%%%%%%%%%%%%%%%%% Get/set keyboard shortcut %%%%%%%%%%%%%%%%%%%%%%%%%%%%

    getKeyboardShortcut: background_function("Preferences.getKeyboardShortcut",
      function () {
        return PassFF.Preferences.getBrowserCommand()
          .then((command) => {
            let shortcut = null;
            if (command) {
              shortcut = {
                commandLetter: '',
                expectedModifierState: {
                    'Alt': false,
                    'Meta': false,
                    'Control': false,
                    'Shift': false
                }
              };

              // Mapping between modifier names in manifest.json and DOM KeyboardEvent.
              let commandModifiers = {
                'Ctrl': browser.runtime.PlatformOs == 'mac' ? 'Meta' : 'Control',
                'MacCtrl': 'Control',
                'Command': 'Meta',
                'Alt': 'Alt',
                'Shift': 'Shift'
              };

              command.shortcut.split(/\s*\+\s*/).forEach((part) => {
                if (commandModifiers.hasOwnProperty(part)) {
                  shortcut.expectedModifierState[commandModifiers[part]] = true;
                } else {
                  shortcut.commandLetter = part.toLowerCase();
                }
              });
            }
            return shortcut;
          });
      }
    ),

    getBrowserCommand: background_function("Preferences.getBrowserCommand",
      function () {
        let name = '_execute_browser_action';
        return browser.commands.getAll()
          .then((commands) => {
            let command = { "name": name, "shortcut": '' };
            commands.forEach((c) => {
              if (name == c.name && c.shortcut) {
                command.shortcut = c.shortcut;
              }
            });
            return command;
          });
      }
    ),
  };

  function updateBrowserCommand() {
    if (browser.commands && browser.commands.update) {
      return browser.commands.update({
        name: "_execute_browser_action",
        shortcut: prefParams["tbMenuShortcut"]
      });
    } else {
      return Promise.resolve(false);
    }
  }

/* #############################################################################
 * #############################################################################
 *  Helper for preferences getting/setting
 * #############################################################################
 */

  return new Proxy(prefObj, {
    set: function (target, key, val) {
      let obj = {};
      obj[key] = val;
      browser.storage.local.set(obj);
      return true;
    },

    get: function (target, key) {
      if (target.hasOwnProperty(key)) {
        return target[key];
      } else if (!prefParams.hasOwnProperty(key)) {
        return undefined;
      }

      let value = prefParams[key];

      if (lowerCaseParams.indexOf(key) >= 0) {
        value = value.toLowerCase();
      }

      if (listParams.hasOwnProperty(key)) {
        value = value.split(listParams[key])
          .filter((entry) => { return entry.length > 0; });
      }

      return value;
    }
  });
})();
