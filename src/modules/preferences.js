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
        if (isInt) val = parseInt(val);
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
    loginFieldNames       : 'login,user,username,id',
    passwordFieldNames    : 'passwd,password,pass',
    urlFieldNames         : 'url,http',
    autoFill              : false,
    autoSubmit            : false,
    autoFillBlacklist     : '',
    caseInsensitiveSearch : true,
    handleHttpAuth        : true,
    enterBehavior         : 0,
    defaultPasswordLength : 16,
    defaultIncludeSymbols : true,
    preferInsert          : 0,
    showNewPassButton     : true,
    markFillable          : true,
    submitFillable        : true,
    directoriesFirst      : false,
    enableLogging         : false,
    showStatus            : true,
  };

  var listParams = {
    'passwordInputNames'  : ',',
    'loginInputNames'     : ',',
    'loginFieldNames'     : ',',
    'passwordFieldNames'  : ',',
    'urlFieldNames'       : ',',
    'autoFillBlacklist'   : ','
  };

  var lowerCaseParams = [
    'passwordInputNames',
    'loginInputNames',
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
      return browser.storage.local.get(Object.keys(prefParams))
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
          browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") return;
            for (var item of Object.keys(changes)) {
              prefParams[item] = changes[item].newValue;
              if (item == "handleHttpAuth" && PassFF.mode === "background") {
                PassFF.Auth.init();
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
      } else {
        PassFF.Preferences.loginInputNames = names;
      }
      PassFF.refresh_all();
    },

// %%%%%%%%%%%%%%%%%%%%% Determine keyboard shortcut %%%%%%%%%%%%%%%%%%%%%%%%%%%

    getKeyboardShortcut: background_function("Preferences.getKeyboardShortcut",
      function () {
        /*
          Read the _execute_browser_action command to get its shortcut. We're
          ignoring the shortcut specified in preferences because there is
          currently no way to apply that preference. See open mozilla bug at
          https://bugzilla.mozilla.org/show_bug.cgi?id=1215061
        */
        let name = '_execute_browser_action';
        return browser.commands.getAll()
          .then((commands) => {
            let shortcut = null;
            commands.forEach((command) => {
              if (name == command.name && command.shortcut) {
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
            });
            return shortcut;
          });
      }
    ),
  };


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
