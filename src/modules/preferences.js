Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

PassFF.Preferences = {

  _environment        : Cc["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment),
  _gpgAgentEnv : null,
  _params : {
    passwordInputNames : "passwd,password,pass",
    loginInputNames    : "login,user,mail,email",
    loginFieldNames    : "login,user,username,id",
    passwordFieldNames : "passwd,password,pass",
    urlFieldNames      : "url,http",
    command            : "/bin/pass",
    home               : "",
    storeDir           : "",
    storeGit           : "",
    gpgAgentInfo       : ".gpg-agent-info",
    autoFill           : false
  },

  _init : function() {
    let application = Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);

    let branch = Services.prefs.getDefaultBranch("extensions.passff.");
    for (let [key, val] in Iterator(PassFF.Preferences._params)) {
      switch (typeof val) {
        case "boolean": branch.setBoolPref(key, val); break;
        case "number": branch.setIntPref(key, val); break;
        case "string": branch.setCharPref(key, val); break;
      }
      this._params[key] = application.prefs.get("extensions.passff." + key);
    }

    this.setGpgAgentEnv();

    console.info("[PassFF]", "Preferences initialised", {
      passwordInputNames : this.passwordInputNames,
      loginInputNames    : this.loginInputNames,
      loginFieldNames    : this.loginFieldNames,
      passwordFieldNames : this.passwordFieldNames,
      urlFieldNames      : this.urlFieldNames,
      command            : this.command,
      home               : this.home,
      storeDir           : this.storeDir,
      storeGit           : this.storeGit,
      gpgAgentEnv        : this.gpgAgentEnv,
      autoFill           : this.autoFill
    });
  },

  get passwordInputNames() { return this._params.passwordInputNames.value.split(","); },
  get loginInputNames()    { return this._params.loginInputNames.value.split(","); },
  get loginFieldNames()    { return this._params.loginFieldNames.value.split(","); },
  get passwordFieldNames() { return this._params.passwordFieldNames.value.split(",");},
  get urlFieldNames()      { return this._params.urlFieldNames.value.split(",");},
  get command()            { return this._params.command.value; },
  get home()               { return (this._params.home.value.trim().length > 0 ? this._params.home.value : this._environment.get('HOME')); },
  get storeDir()           { return (this._params.storeDir.value.trim().length > 0 ? this._params.storeDir.value : this._environment.get('PASSWORD_STORE_DIR')); },
  get storeGit()           { return (this._params.storeGit.value.trim().length > 0 ? this._params.storeGit.value : this._environment.get('PASSWORD_STORE_GIT')); },
  get gpgAgentEnv()        { return this._gpgAgentEnv; },
  get autoFill()           { return this._params.autoFill.value; },

  setGpgAgentEnv : function() {
    let gpgAgentInfo = this._params.gpgAgentInfo.value;
    let filename = (gpgAgentInfo.indexOf("/") != 0 ? this.home + "/" : "") + gpgAgentInfo;
    let file = new FileUtils.File(filename);
    console.debug("[PassFF]", "Check Gpg agent file existance : " + filename);
    if (file.exists() && file.isFile()) {
      console.info("[PassFF]", "Retrieve Gpg agent variable from file " + filename);
      NetUtil.asyncFetch(file, function(inputStream, status) {
        let content = NetUtil.readInputStreamToString(inputStream, inputStream.available());
        console.debug("[PassFF]", "Set Gpg agent variable :", content);
        PassFF.Preferences._gpgAgentEnv = content.split("\n")
      });
    } else {
        console.info("[PassFF]", "Retrieve Gpg agent variable from environment");
        PassFF.Preferences._gpgAgentEnv = [
          "GPG_AGENT_INFO=" + this._environment.get('GPG_AGENT_INFO'),
          "GNOME_KEYRING_CONTROL = " + this._environment.get('GNOME_KEYRING_CONTROL'),
          //"SSH_AUTH_SOCK=" + this._environment.get('SSH_AUTH_SOCK'),
          //"SSH_AGENT_PID=" + this._environment.get('SSH_AGENT_PID')
        ]
    }
  }
};

(function() { this._init(); }).apply(PassFF.Preferences);
