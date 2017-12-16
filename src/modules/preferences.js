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
      shell                 : '/bin/bash',
      shellArgs             : '',
      gnupgHome             : '',
      storeDir              : '',
      storeGit              : '',
      gpgAgentInfo          : '.gpg-agent-info',
      autoFill              : false,
      autoSubmit            : false,
      autoFillBlacklist     : '',
      shortcutKey           : 'y',
      shortcutMod           : 'control',
      subpageSearchDepth    : 5,
      callType              : 'direct',
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
          shellArgs : '--login',
          callType  : 'shell',
        });
        break;
    }
    return defaultParams;
  };

  return {
    _gpgAgentEnv: null,
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

        if (bgmode === true) {
          log.info("Preferences initialised", this._params);
          let params = { command: 'gpgAgentEnv' };
          params['arguments'] = [this._params.gpgAgentInfo];
          return browser.runtime.sendNativeMessage('passff', params)
            .then((result) => { this._gpgAgentEnv = result; })
            .catch((error) => {
              log.error("Error detecting GPG Agent:", error);
            });
        }
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

    get shell() {
      return this._params.shell;
    },

    get shellArgs() {
      return this._params.shellArgs.split(' ');
    },

    get gnupgHome() {
      if (this._params.gnupgHome.trim().length > 0) {
        return this._params.gnupgHome;
      }
      return PassFF.Pass.env.get('GNUPGHOME');
    },

    get storeDir() {
      if (this._params.storeDir.trim().length > 0) {
        return this._params.storeDir;
      }
      return PassFF.Pass.env.get('PASSWORD_STORE_DIR');
    },

    get storeGit() {
      if (this._params.storeGit.trim().length > 0) {
        return this._params.storeGit;
      }
      return PassFF.Pass.env.get('PASSWORD_STORE_GIT');
    },

    get path() {
      return PassFF.Pass.env.get('PATH');
    },

    get gpgAgentEnv() {
      return this._gpgAgentEnv;
    },

    get autoFill() {
      return this._params.autoFill;
    },

    get autoSubmit() {
      return this._params.autoSubmit;
    },

    get shortcutKey() {
      return this._params.shortcutKey;
    },

    get shortcutMod() {
      return this._params.shortcutMod;
    },

    get subpageSearchDepth() {
      return this._params.subpageSearchDepth;
    },

    get callType() {
      return this._params.callType;
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
