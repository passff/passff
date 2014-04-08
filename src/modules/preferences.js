var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://passff/common.js");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

PassFF.Preferences = {

  _environment        : Cc["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment),
  _console            : Cu.import("resource://gre/modules/devtools/Console.jsm", {}).console,
  _params : {
    passwordInputNames : null,
    loginInputNames    : null,
    loginFieldNames    : null,
    command            : null,
    home               : null,
    storeDir           : null,
    storeGit           : null,
    gpg_agent_env      : null,
    autofill           : null,
  },

  _init : function() {
    let application = Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);

    this._params.passwordInputNames = application.prefs.get("extensions.passff.passwordInputNames");
    this._params.loginInputNames    = application.prefs.get("extensions.passff.loginInputNames");
    this._params.loginFieldNames    = application.prefs.get("extensions.passff.loginFieldNames");
    this._params.command            = application.prefs.get("extensions.passff.command");
    this._params.home               = application.prefs.get("extensions.passff.home");
    this._params.storeDir           = application.prefs.get("extensions.passff.pass_dir");
    this._params.storeGit           = application.prefs.get("extensions.passff.pass_git");
    this._params.gpgAgentInfo       = application.prefs.get("extensions.passff.gpg_agent_info");
    this._params.autoFill           = application.prefs.get("extensions.passff.auto_fill");

    this.setGpgAgentEnv();

    PassFF.Preferences._console.info("[PassFF] preferences initialised");
    PassFF.Preferences._console.debug("[PassFF]", {
      passwordInputNames : this.passwordInputNames,
      loginInputNames : this.loginInputNames,
      loginFieldNames : this.loginFieldNames,
      command : this.command,
      home : this.home,
      storeDir : this.storeDir,
      storeGit : this.storeGit,
      gpgAgentEnv : this.gpgAgentEnv,
      autoFill : this.autoFill
    });
  },

  get passwordInputNames() { return this._params.passwordInputNames.value.split(","); },
  get loginInputNames()    { return this._params.loginInputNames.value.split(","); },
  get loginFieldNames()    { return this._params.loginFieldNames.value.split(","); },
  get command()            { return this._params.command.value; },
  get home()               { return (this._params.home.value.trim().length > 0 ? this._params.home.value : this._environment.get('HOME')); },
  get storeDir()           { return (this._params.storeDir.value.trim().length > 0 ? this._params.storeDir.value : this._environment.get('PASSWORD_STORE_DIR')); },
  get storeGit()           { return (this._params.storeGit.value.trim().length > 0 ? this._params.storeGit.value : this._environment.get('PASSWORD_STORE_GIT')); },
  get gpgAgentEnv()        { return this._params.gpg_agent_env; },
  get autoFill()           { return this._params.autoFill.value; },

  setGpgAgentEnv : function() {
    var filename = (this._params.gpgAgentInfo.value.indexOf("/") != 0 ? this.home + "/" : "") + this._params.gpgAgentInfo
    var file = new FileUtils.File(filename);
    if (file.exists()) {
      
      PassFF.Preferences._console.info("[PassFF]", "Retrieve Gpg agent variables from file " + filename);
      NetUtil.asyncFetch(file, function(inputStream, status) {
        PassFF.Preferences._params.gpg_agent_env = NetUtil.readInputStreamToString(inputStream, inputStream.available()).split("\n")
      });
    } else {
        PassFF.Preferences._console.info("[PassFF]", "Retrieve Gpg agent variables environment");
        PassFF.Preferences._params.gpg_agent_env = [
          "GPG_AGENT_INFO=" + this._environment.get('GPG_AGENT_INFO'),
          "SSH_AUTH_SOCK=" + this._environment.get('SSH_AUTH_SOCK'),
          "SSH_AGENT_PID=" + this._environment.get('SSH_AGENT_PID')
        ]
    }
  }
};

(function() { this._init(); }).apply(PassFF.Preferences);
