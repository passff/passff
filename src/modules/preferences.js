/* jshint node: true */
'use strict';

PassFF.Preferences = (function() {

  let getDefaultParams = function() {
    let defaultParams = {
      passwordInputNames    : 'passwd,password,pass',
      loginInputNames       : 'login,user,mail,email,username,opt_login,log,usr_name',
      loginFieldNames       : 'login,user,username,id',
      passwordFieldNames    : 'passwd,password,pass',
      urlFieldNames         : 'url,http',
      command               : '/usr/bin/pass',
      commandArgs           : '',
      commandEnv            : '',
      autoFill              : false,
      autoSubmit            : false,
      autoFillBlacklist     : '',
      subpageSearchDepth    : 5,
      caseInsensitiveSearch : true,
      handleHttpAuth        : true,
      enterBehavior         : 0,
      defaultPasswordLength : 16,
      defaultIncludeSymbols : true,
      preferInsert          : 0,
      showNewPassButton     : false,
    };

    let osString = browser.runtime.PlatformOs;
    switch (osString) {
      case 'mac':
        Object.assign(defaultParams, {
          command   : '/usr/local/bin/pass',
        });
        break;
    }
    return defaultParams;
  };

  return {
    _params: getDefaultParams(),
    init: function(bgmode) {
      return browser.storage.local.get(Object.keys(this._params))
      .then((res) => {
        let obj = {};
        for (let [key, val] of Object.entries(this._params)) {
          if (typeof res[key] === 'undefined') {
            obj[key] = val;
          } else {
            this._params[key] = res[key];
          }
        }
        return browser.storage.local.set(obj);
      })
      .then(() => {
        browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName == "local") {
            var changedItems = Object.keys(changes);
            for (var item of changedItems) {
              this._params[item] = changes[item].newValue;
              if (item == "handleHttpAuth" && bgmode === true) {
                PassFF.init_http_auth();
              }
            }
          }
        });
      });
    },

    pref_set: function(key, val) {
        let obj = {};
        obj[key] = val;
        browser.storage.local.set(obj);
    },

    addInputName: function(type, name) {
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
        PassFF.Preferences.pref_set("passwordInputNames", names);
      } else {
        PassFF.Preferences.pref_set("loginInputNames", names);
      }
      return true;
    },

    get passwordInputNames() {
      return this._params.passwordInputNames.split(',');
    },

    get loginInputNames() {
      return this._params.loginInputNames.split(',');
    },

    get loginFieldNames() {
      return this._params.loginFieldNames.split(',');
    },

    get passwordFieldNames() {
      return this._params.passwordFieldNames.split(',');
    },

    get urlFieldNames() {
      return this._params.urlFieldNames.split(',');
    },

    get autoFillBlacklist() {
      return this._params.autoFillBlacklist.split(',');
    },

    get command() {
      return this._params.command;
    },

    get commandArgs() {
      return this._params.commandArgs.split(' ');
    },

    get commandEnv() {
      return this._params.commandEnv.split('\n').map((line) => {
        let sep = line.indexOf("=");
        return [line.substring(0,sep), line.substr(sep+1)];
      });
    },

    get path() {
      return PassFF.Pass.env.get('PATH');
    },

    get autoFill() {
      return this._params.autoFill;
    },

    get autoSubmit() {
      return this._params.autoSubmit;
    },

    get subpageSearchDepth() {
      return this._params.subpageSearchDepth;
    },

    get handleHttpAuth() {
      return this._params.handleHttpAuth;
    },

    get caseInsensitiveSearch() {
      return this._params.caseInsensitiveSearch;
    },

    get enterBehavior() {
      return this._params.enterBehavior;
    },

    get defaultPasswordLength() {
      return this._params.defaultPasswordLength;
    },

    get defaultIncludeSymbols() {
      return this._params.defaultIncludeSymbols;
    },

    get preferInsert() {
      return this._params.preferInsert;
    },

    get showNewPassButton() {
      return this._params.showNewPassButton;
    }
  };
})();
