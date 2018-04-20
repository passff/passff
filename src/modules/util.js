/* jshint node: true */
'use strict';

/* #############################################################################
 * #############################################################################
 *  i18n string handling
 * #############################################################################
 */

function _(key, params) {
  if (params) {
    return browser.i18n.getMessage(key, params);
  }
  return browser.i18n.getMessage(key);
}

/* #############################################################################
 * #############################################################################
 *  logging
 * #############################################################################
 */

var log = {
  generateArguments: function (args) {
    var argsArray = Array.from(args);
    argsArray.unshift('[PassFF]');
    return argsArray;
  }
};

(function () {
  function logPrototype() {
    if (PassFF.Preferences) {
      // jshint validthis: true
      if (PassFF.Preferences.enableLogging) {
        this.apply(console, log.generateArguments(arguments));
      }
    }
  }
  log.debug = logPrototype.bind(console.debug);
  log.info  = logPrototype.bind(console.info);
  log.warn  = logPrototype.bind(console.warn);
  log.error = logPrototype.bind(console.error);
})();

/* #############################################################################
 * #############################################################################
 *  Tab handling
 * #############################################################################
 */

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true})
         .then((tabs) => { return tabs[0]; });
}

function waitTabComplete(tb) {
  let promised_tab = Promise.resolve(tb);
  if (typeof tb === "undefined") promised_tab = getActiveTab();
  return promised_tab.then((tab) => {
    return new Promise((resolve, reject) => {
      if (tab.status === "complete") return resolve(tab);
      browser.tabs.onUpdated.addListener(function _f(_0, _1, evtTab) {
        if (evtTab.id = tab.id && evtTab.status === "complete") {
          browser.tabs.onUpdated.removeListener(_f);
          resolve(evtTab);
        }
      });
    });
  });
}

/* #############################################################################
 * #############################################################################
 *  Decorators for fcts that have to run in background/content script contexts
 * #############################################################################
 */

function background_function(name, fun, useSender) {
  if (typeof useSender === "undefined") {
    useSender = false;
  }
  return function () {
    if (PassFF.mode !== "background") {
      let args = Array.from(arguments);
      args.unshift(useSender);
      args.unshift(name);
      return background_exec.apply(null, args);
    } else {
      return Promise.resolve(fun.apply(fun_name(name)[0], arguments));
    }
  };
}

function background_exec(action, useSender) {
  return browser.runtime.sendMessage({
    action: action,
    params: Array.from(arguments).slice(2),
    useSender: useSender
  }).then((msg) => {
    if (msg) {
      return msg.response;
    } else {
      return null;
    }
  }).catch((error) => {
    log.error("Runtime port has crashed:", action, error);
  });
}

function content_function(name, fun, provideTab) {
  return function () {
    if (PassFF.mode !== "content") {
      let args = Array.from(arguments);
      if (!provideTab) {
        args.unshift(null);
      }
      args.splice(1,0,name);
      return content_exec.apply(null, args);
    } else {
      return fun.apply(fun_name(name)[0], arguments);
    }
  };
}

function content_exec(targetTab, action) {
  let promised_tab = Promise.resolve(targetTab);
  let args = Array.from(arguments).slice(2);
  if (!targetTab) {
    promised_tab = getActiveTab();
  }
  return promised_tab
    .then((tab) => {
      log.debug("Awaiting tab init for", action);
      return PassFF.Page.init_tab(tab)
        .then(function () {
          log.debug("Executing", action, "in content script");
          return browser.tabs.sendMessage(tab.id, {
            action: action,
            params: args,
            useSender: false
          });
        });
    })
    .then((msg) => {
      if (msg) {
        return msg.response;
      } else {
        return null;
      }
    }).catch((error) => {
      log.error("Content script port has crashed:", error);
    });
}

function fun_name(name) {
  let parts = name.split(".");
  if (parts.length > 1) {
    return [PassFF[parts[0]], parts[1]];
  } else {
    return [PassFF, parts[0]];
  }
}
