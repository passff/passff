var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://passff/common.js");

PassFF.Preferences = {

  _passwordInputNames : null,
  _loginInputNames    : null,
  _loginFieldNames    : null,
  _command            : null,
  _home               : null,

  _init : function() {
    let application = Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);

    this._passwordInputNames = application.prefs.get("extensions.passff.passwordInputNames");
    this._loginInputNames    = application.prefs.get("extensions.passff.loginInputNames");
    this._loginFieldNames    = application.prefs.get("extensions.passff.loginFieldNames");
    this._command            = application.prefs.get("extensions.passff.command");
    this._home               = application.prefs.get("extensions.passff.home");
  },

  get passwordInputNames() { return this._passwordInputNames.value.split(","); },
  get loginInputNames()    { return this._loginInputNames.value.split(","); },
  get loginFieldNames()    { return this._loginFieldNames.value.split(","); },
  get command()            { return this._command.value; },
  get home()               { return (this._home.value.trim().length > 0 ? this._home.value : Cc["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment).get('HOME')); },
};

(function() { this._init(); }).apply(PassFF.Preferences);
