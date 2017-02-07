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
  return browser.tabs.query({active: true, currentWindow: true});
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

  gsfm: function (key, params) {
    if (params) {
      return browser.i18n.getMessage(key, params);
    }
    return browser.i18n.getMessage(key);
  },

  init: function() {
    // not needed at the moment
  },

  init_tab: function (tab) {
    // do nothing if called from a non-tab context
    if( ! tab || ! tab.url ) {
        return;
    }

    log.debug('Location changed', tab.url);
    PassFF.tab_url = tab.url;
    PassFF.Menu.createContextualMenu(document, tab.url);
  },

  onTabUpdate: function () {
    getActiveTab().then((tabs) => {
        PassFF.init_tab(tabs[0]);
    });
  }
};
