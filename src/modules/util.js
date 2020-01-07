/* jshint node: true */
'use strict';

const PASSFF_URL_GIT = "https://github.com/passff/passff";
const PASSFF_URL_GIT_HOST = "https://github.com/passff/passff-host";
const PASSFF_URL_INSTALLATION = PASSFF_URL_GIT + "#installation";

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

function parse_markdown(obj) {
  let str = obj.innerHTML;
  str = str.replace(/\[([^\]]+)\]\(([^\}]+)\)/,
    function (match, p1, p2) {
      let a = document.createElement("a");
      a.setAttribute("href", p2);
      a.textContent = p1;
      return a.outerHTML;
    });
  str = str.replace(/```([\s\S]+)```/,
    function (match, p1) {
      let c = document.createElement("code");
      c.classList.add("block");
      c.textContent = p1;
      return c.outerHTML;
    });
  str = str.replace(/`([\s\S]+)`/,
    function (match, p1) {
      let c = document.createElement("code");
      c.textContent = p1;
      return c.outerHTML;
    });
  str = str.replace(/\n/g, '<br />');
  obj.innerHTML = str;
}

/* #############################################################################
 * #############################################################################
 *  logging
 * #############################################################################
 */

var log = {
  generateArguments: function (args) {
    var argsArray = Array.from(args);
    argsArray.unshift('[PassFF.' + PassFF.mode + ']');
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

/* #############################################################################
 * #############################################################################
 *  semantic versioning
 * #############################################################################
 */

/*
 * This implementation has been inspired by npm's semver.
 *
 * For in-depth explanations,
 * See https://github.com/passff/passff/pull/342
 */

const semver = (function semver() {

  /**
   * Takes a version string as input and parses it.
   * Returns the major, minor and patch identifiers of the version as integers.
   */
  function parser(version) {
    version = version + "";

    // _VERSIONHOLDER_ alias 0.0.0-development
    if (version === "_VERSIONHOLDER_") {
      return {
        major: 0,
        minor: 0,
        patch: 0,
      }
    }

    const id = String.raw`(0|[1-9]\d*)`;
    const ext = String.raw`(?:|[\+-].+)`;
    const reg = String.raw`^${id}\.${id}(?:\.${id})?${ext}$`;
    const m = version.trim().match(reg);

    if (!m) throw new TypeError('Invalid Version: ' + version);

    return {
      major: +m[1] || 0,
      minor: +m[2] || 0,
      patch: +m[3] || 0,
    };
  }

  /**
   * Takes two version strings as input.
   * Returns an integer. The latter is:
   *   - negative (<0) if v1 < v2
   *   - positive (>0) if v1 > v2
   *   - zero     (=0) if v1 = v2
   * Notice the symmetry in the relations.
   * Last but not least, we can sort versions using Array#sort(comparator).
   */
  function comparator(v1,v2) {
    v1 = parser(v1);
    v2 = parser(v2);

    return (v1.major - v2.major ||
            v1.minor - v2.minor ||
            v1.patch - v2.patch);
  }

  function gt(v1, v2) {
    return comparator(v1,v2) > 0;
  }

  function gte(v1, v2) {
    return comparator(v1,v2) >= 0;
  }

  function eq(v1, v2) {
    return comparator(v1,v2) == 0;
  }

  let publicAPI = { gt, gte, eq };
  return publicAPI;
})();
