var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://passff/common.js");

/**
 * A very simple counter.
 */
PassFF.MessageCount = {

  /* Preference object for the message count*/
  _countPref : null,

  /**
   * Object constructor.
   */
  _init : function() {
    let application =
      Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication);

    this._countPref =
      application.prefs.get("extensions.passff.message.count");
  },

  /**
   * Returns the current message count.
   * @return the current message count.
   */
  get count() { return this._countPref.value; },

  /**
   * Increments the message count by one.
   */
  increment : function() {
    this._countPref.value++;
  }
};

// Constructor.
(function() { this._init(); }).
  apply(PassFF.MessageCount);
