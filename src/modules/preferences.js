/* jshint node: true */
'use strict';

const {TextDecoder, OS} = Cu.import('resource://gre/modules/osfile.jsm', {});

PassFF.Preferences = {
  _environment: Cc['@mozilla.org/process/environment;1']
                .getService(Components.interfaces.nsIEnvironment),
  _gpgAgentEnv: null,
  _params: {
    passwordInputNames    : 'passwd,password,pass',
    loginInputNames       : 'login,user,mail,email',
    loginFieldNames       : 'login,user,username,id',
    passwordFieldNames    : 'passwd,password,pass',
    urlFieldNames         : 'url,http',
    command               : '/usr/bin/pass',
    commandArgs           : '',
    shell                 : '/bin/bash',
    shellArgs             : '',
    home                  : '',
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
    caseInsensitiveSearch : false,
  },

  init: function() {
    let application = Cc['@mozilla.org/fuel/application;1']
                      .getService(Ci.fuelIApplication);

    let branch = Services.prefs.getDefaultBranch('extensions.passff.');
    for (let [key, val] in Iterator(PassFF.Preferences._params)) {
      switch (typeof val) {
        case 'boolean':
          branch.setBoolPref(key, val);
          break;
        case 'number':
          branch.setIntPref(key, val);
          break;
        case 'string':
          branch.setCharPref(key, val);
          break;
      }
      this._params[key] = application.prefs.get('extensions.passff.' + key);
    }

    log.info('Preferences initialised', {
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
      caseInsensitiveSearch : this.caseInsensitiveSearch
    });
  },

  setGpgAgentEnv: function() {
    let gpgAgentInfo = this._params.gpgAgentInfo.value;
    let filename;

    if (OS.Path.split(gpgAgentInfo).absolute) {
      filename = gpgAgentInfo;
    } else {
      filename = OS.Path.join(this.home, gpgAgentInfo);
    }
    log.info('Try to retrieve Gpg agent variable from file ' + filename);

    let promise = OS.File.read(filename); // Read the complete file as an array
    let decoder = new TextDecoder();

    let success = function(array) {
      let re = /^([^=]+=[^;]+)/;
      log.info('Retrieve Gpg agent variable from file');

      PassFF.Preferences._gpgAgentEnv = [];
      decoder.decode(array).split('\n').forEach(function(line) {
        if(re.test(line)) {
          PassFF.Preferences._gpgAgentEnv.push(re.exec(line)[0]);
        }
      });

      let keyringControl = this._environment.get('GNOME_KEYRING_CONTROL');
      PassFF.Preferences._gpgAgentEnv.push('GNOME_KEYRING_CONTROL=' + keyringControl);

      log.debug('Set Gpg agent variable:', PassFF.Preferences._gpgAgentEnv);

      return Promise.resolve('OK');
    }.bind(this);

    let error = function(reason) {
      log.info('Can\'t read file. Getting gpg-agent variable from environment');
      PassFF.Preferences._gpgAgentEnv = [
        'GPG_AGENT_INFO=' + this._environment.get('GPG_AGENT_INFO'),
        'GNOME_KEYRING_CONTROL=' + this._environment.get('GNOME_KEYRING_CONTROL')
      ];
      log.debug('Set gpg-agent variable :', PassFF.Preferences._gpgAgentEnv);
      return Promise.resolve('OK');
    }.bind(this);

    promise = promise.then(success, error);

    promise.catch(function onError(reason) {
      log.error('Failed to set gpg-agent variable', reason);
    });
  },

  get passwordInputNames() {
    return this._params.passwordInputNames.value.split(',');
  },

  get loginInputNames() {
    return this._params.loginInputNames.value.split(',');
  },

  get loginFieldNames() {
    return this._params.loginFieldNames.value.split(',');
  },

  get passwordFieldNames() {
    return this._params.passwordFieldNames.value.split(',');
  },

  get urlFieldNames() {
    return this._params.urlFieldNames.value.split(',');
  },

  get command() {
    return this._params.command.value;
  },

  get commandArgs() {
    return this._params.commandArgs.value.split(' ');
  },

  get shell() {
    return this._params.shell.value;
  },

  get shellArgs() {
    return this._params.shellArgs.value.split(' ');
  },

  get home() {
    if (this._params.home.value.trim().length > 0) {
      return this._params.home.value;
    }
    return OS.Constants.Path.homeDir;
  },

  get storeDir() {
    if (this._params.storeDir.value.trim().length > 0) {
      return this._params.storeDir.value;
    }
    return this._environment.get('PASSWORD_STORE_DIR');
  },

  get storeGit() {
    if (this._params.storeGit.value.trim().length > 0) {
      return this._params.storeGit.value;
    }
    return this._environment.get('PASSWORD_STORE_GIT');
  },

  get path() {
    return this._environment.get('PATH');
  },

  get gpgAgentEnv() {
    if (this._gpgAgentEnv === null) {
      this.setGpgAgentEnv();
    }
    return this._gpgAgentEnv;
  },

  get autoFill() {
    return this._params.autoFill.value;
  },

  get autoSubmit() {
    return this._params.autoSubmit.value;
  },

  get shortcutKey() {
    return this._params.shortcutKey.value;
  },

  get shortcutMod() {
    return this._params.shortcutMod.value;
  },

  get logEnabled() {
    return this._params.logEnabled.value;
  },

  get iframeSearchDepth() {
    return this._params.iframeSearchDepth.value;
  },

  get callType() {
    return this._params.callType.value;
  },

  get caseInsensitiveSearch() {
    return this._params.caseInsensitiveSearch.value;
  }
};
