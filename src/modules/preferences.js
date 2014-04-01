var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://passff/common.js");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");

PassFF.Preferences = {

  _passwordInputNames : null,
  _loginInputNames    : null,
  _loginFieldNames    : null,
  _command            : null,
  _home               : null,
  _storeDir           : null,
  _storeGit           : null,
  _gpg_agent_env      : null,

  _init : function() {
    let application = Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);

    this._passwordInputNames = application.prefs.get("extensions.passff.passwordInputNames");
    this._loginInputNames    = application.prefs.get("extensions.passff.loginInputNames");
    this._loginFieldNames    = application.prefs.get("extensions.passff.loginFieldNames");
    this._command            = application.prefs.get("extensions.passff.command");
    this._home               = application.prefs.get("extensions.passff.home");
    this._storeDir           = application.prefs.get("extensions.passff.pass_dir");
    this._storeGit           = application.prefs.get("extensions.passff.pass_git");
    this._gpgAgentInfo       = application.prefs.get("extensions.passff.gpg_agent_info");

    this.setGpgAgentEnv();
  },

  get passwordInputNames() { return this._passwordInputNames.value.split(","); },
  get loginInputNames()    { return this._loginInputNames.value.split(","); },
  get loginFieldNames()    { return this._loginFieldNames.value.split(","); },
  get command()            { return this._command.value; },
  get home()               { return (this._home.value.trim().length > 0 ? this._home.value : Cc["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment).get('HOME')); },
  get storeDir()               { return (this._storeDir.value.trim().length > 0 ? this._storeDir.value : Cc["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment).get('PASSWORD_STORE_DIR')); },
  get storeGit()               { return (this._storeGit.value.trim().length > 0 ? this._storeGit.value : Cc["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment).get('PASSWORD_STORE_GIT')); },
  get gpgAgentEnv()       { return this._gpg_agent_env; },

  setGpgAgentEnv : function() {
    var file = new FileUtils.File(this.home + "/.gpg-agent-info");
    if (file.exists()) {
      NetUtil.asyncFetch(file, function(inputStream, status) {
        PassFF.Preferences._gpg_agent_env = NetUtil.readInputStreamToString(inputStream, inputStream.available()).split("\n")
      });
    }
  },
};

(function() { this._init(); }).apply(PassFF.Preferences);
