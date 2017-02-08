/* jshint node: true */
'use strict';

var log = {
  generateArguments: function(args) {
    var argsArray = Array.slice(args);
    argsArray.unshift('[PassFF]');
    return argsArray;
  }
};

(function() {
  function logPrototype() {
    if (PassFF.Preferences && PassFF.Preferences.logEnabled) {
      // jshint validthis: true
      this.apply(console, log.generateArguments(arguments));
    }
  }
  log.debug = logPrototype.bind(console.debug);
  log.info = logPrototype.bind(console.info);
  log.warn = logPrototype.bind(console.warn);
  log.error = logPrototype.bind(console.error);
})();

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true})
         .then((tabs) => { return tabs[0]; });
}

var PassFF = {
  Ids: {
    panel: 'passff-panel',
    button: 'passff-button',
    key: 'passff-key',
    keyset: 'passff-keyset',
    searchbox: 'passff-search-box',
    searchboxlabel: 'passff-search-box-label',
    entrieslist: 'passff-entries-list',
    contextlist: 'passff-context-list',
    optionsmenu: 'passff-options-menu',
    optionsmenupopup: 'passff-options-menupopup',
    rootbutton: 'passff-root-button',
    contextbutton: 'passff-context-button',
    buttonsbox: 'passff-buttonsbox',
    refreshmenuitem: 'passff-refresh-menuitem',
    prefsmenuitem: 'passff-prefs-menuitem',
    menubar: 'passff-menubar',
    menu: 'passff-menu-',
  },

  tab_url: null,

  env: {
    _environment: {},
    exists: function (key) { return this._environment.hasOwnProperty(key); },
    get: function (key) {
      if (this.exists(key)) return this._environment[key];
      else return "";
    }
  },

  gsfm: function (key, params) {
    if (params) {
      return browser.i18n.getMessage(key, params);
    }
    return browser.i18n.getMessage(key);
  },

  alert: function(msg) {
    browser.tabs.executeScript({code : 'alert(' + JSON.stringify(msg) + ');' });
  },

  init: function() {
    return PassFF.init_env();
  },

  init_env: function () {
    return browser.runtime.sendNativeMessage("passff", { command: "env" })
    .then((result) => { PassFF.env._environment = result; });
  },

  init_tab: function (tab) {
    // do nothing if called from a non-tab context
    if( ! tab || ! tab.url ) {
        return;
    }

    log.debug('Location changed', tab.url);
    PassFF.tab_url = tab.url;
    PassFF.Menu.createContextualMenu(null, PassFF.tab_url);
  },

  onTabUpdate: function () {
    getActiveTab().then(PassFF.init_tab);
  }
};
