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
      shell                 : '/bin/bash',
      shellArgs             : '',
      home                  : '',
      gnupgHome             : '',
      storeDir              : '',
      storeGit              : '',
      gpgAgentInfo          : '.gpg-agent-info',
      autoFill              : false,
      autoSubmit            : false,
      shortcutKey           : 'y',
      shortcutMod           : 'control',
      logEnabled            : false,
      iframeSearchDepth     : 5,
      callType              : 'direct',
      caseInsensitiveSearch : true,
      enterBehavior         : 0,
      defaultPasswordLength : 16,
      defaultIncludeSymbols : true,
      preferInsert          : false,
    };

    return defaultParams;
  };

  return {
    _gpgAgentEnv: null,
    _params: getDefaultParams(),
    init: function(bgmode) {
      let promised_changes = [];
      for (let [key, val] in Iterator(PassFF.Preferences._params)) {
        promised_changes.push(
          browser.storage.local.get(key)
            .then((res) => {
              if (typeof res[key] === 'undefined') {
                let obj = {}; obj[key] = val;
                browser.storage.local.set(obj);
              } else {
                this._params[key] = res[key];
              }
            })
        );
      }

      return Promise.all(promised_changes).then(() => {
        if (bgmode === true) {
          log.info("Preferences initialised", {
            passwordInputNames    : this.passwordInputNames,
            loginInputNames       : this.loginInputNames,
            loginFieldNames       : this.loginFieldNames,
            passwordFieldNames    : this.passwordFieldNames,
            urlFieldNames         : this.urlFieldNames,
            command               : this.command,
            commandArgs           : this.commandArgs,
            shell                 : this.shell,
            shellArgs             : this.shellArgs,
            home                  : this.home,
            storeDir              : this.storeDir,
            storeGit              : this.storeGit,
            autoFill              : this.autoFill,
            autoSubmit            : this.autoSubmit,
            shortcutKey           : this.shortcutKey,
            shortcutMod           : this.shortcutMod,
            logEnabled            : this.logEnabled,
            iframeSearchDepth     : this.iframeSearchDepth,
            callType              : this.callType,
            caseInsensitiveSearch : this.caseInsensitiveSearch,
            enterBehavior         : this.enterBehavior
          });
          let params = { command: 'gpgAgentEnv' };
          params['arguments'] = [this._params.gpgAgentInfo];
          return browser.runtime.sendNativeMessage('passff', params)
            .then((result) => { this._gpgAgentEnv = result; });
        }
      });
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

    get command() {
      return this._params.command;
    },

    get commandArgs() {
      return this._params.commandArgs.split(' ');
    },

    get shell() {
      return this._params.shell;
    },

    get shellArgs() {
      return this._params.shellArgs.split(' ');
    },

    get home() {
      if (this._params.home.trim().length > 0) {
        return this._params.home;
      }
      return PassFF.Pass.env.get('HOME');
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

    get logEnabled() {
      return this._params.logEnabled;
    },

    get iframeSearchDepth() {
      return this._params.iframeSearchDepth;
    },

    get callType() {
      return this._params.callType;
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
    }
  };
})();
