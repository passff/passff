/**
 * This module provides universal helper functions for PassFF.
 */

import PassFF from "./main.js";

export const PASSFF_URL_GIT = "https://codeberg.org/PassFF/passff";
export const PASSFF_URL_GIT_HOST = "https://codeberg.org/PassFF/passff-host";
export const PASSFF_URL_INSTALLATION = PASSFF_URL_GIT + "#installation";

/* #############################################################################
 * #############################################################################
 *  i18n string handling
 * #############################################################################
 */

export function _(key, params) {
  if (params) {
    return browser.i18n.getMessage(key, params);
  }
  return browser.i18n.getMessage(key);
}

export function parseMarkdown(obj) {
  let str = obj.textContent;
  obj.innerHTML = "";
  let patterns = [
    [
      /\[([^\]]+)\]\(([^\}\)]+)\)/,
      function (match, p1, p2) {
        let a = document.createElement("a");
        a.setAttribute("href", p2);
        a.textContent = p1;
        return a;
      },
    ],
    [
      /\*\*([^\*]+)\*\*/,
      function (match, p1) {
        let c = document.createElement("b");
        c.textContent = p1;
        return c;
      },
    ],
    [
      /```([^`]+)```/,
      function (match, p1) {
        let c = document.createElement("code");
        c.classList.add("block");
        c.textContent = p1;
        return c;
      },
    ],
    [
      /`([^`]+)`/,
      function (match, p1) {
        let c = document.createElement("code");
        c.textContent = p1;
        return c;
      },
    ],
    [
      /\n/,
      function (match) {
        return document.createElement("br");
      },
    ],
  ];
  while (str.length > 0) {
    let matches = patterns.map((p) => str.match(p[0]));
    let [iMatch, matchStart] = matches
      .map((m, i) => [i, m === null ? -1 : m.index])
      .filter((m) => m[1] >= 0)
      .reduce(
        (acc, val) => (val[1] < acc[1] ? val : acc),
        [-1, str.length + 1],
      );
    let matchEnd = str.length;
    if (iMatch >= 0) {
      let match = matches[iMatch];
      matchEnd = matchStart + match[0].length;
      obj.appendChild(document.createTextNode(str.substring(0, matchStart)));
      obj.appendChild(patterns[iMatch][1](...match));
    } else {
      obj.appendChild(document.createTextNode(str));
    }
    str = str.substring(matchEnd);
  }
}

/* #############################################################################
 * #############################################################################
 *  logging
 * #############################################################################
 */

export let log = {
  generateArguments: function (args, preInit) {
    let argsArray = Array.from(args);
    argsArray.unshift(
      `[PassFF${preInit ? " (not initialized)" : "." + PassFF.mode}]`,
    );
    return argsArray;
  },
};

(function () {
  function logPrototype() {
    let preInit = !PassFF.Preferences || !PassFF.Preferences.ready;
    if (preInit || PassFF.Preferences.enableLogging) {
      this.apply(console, log.generateArguments(arguments, preInit));
    }
  }
  log.debug = logPrototype.bind(console.debug);
  log.info = logPrototype.bind(console.info);
  log.warn = logPrototype.bind(console.warn);
  log.error = logPrototype.bind(console.error);
})();

/* #############################################################################
 * #############################################################################
 *  Tab handling
 * #############################################################################
 */

export function getActiveTab() {
  return browser.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => {
      return tabs[0];
    });
}

export function getTabContainer(tb) {
  return Promise.resolve()
    .then(() => {
      if (typeof browser.contextualIdentities !== "undefined") {
        return browser.contextualIdentities.query({});
      } else {
        log.debug(
          "getTabContainer: browser.contextualIdentities not available",
        );
        return [];
      }
    })
    .then((identities) => {
      let name = null;
      Array.from(identities)
        .filter((i) => i.cookieStoreId == tb.cookieStoreId)
        .forEach((i) => {
          name = i.name;
        });
      return name;
    });
}

export function waitTabComplete(tb) {
  let promisedTab = Promise.resolve(tb);
  if (typeof tb === "undefined") promisedTab = getActiveTab();
  return promisedTab.then((tab) => {
    return new Promise((resolve, reject) => {
      if (tab.status === "complete") return resolve(tab);
      browser.tabs.onUpdated.addListener(function _f(_0, _1, evtTab) {
        if ((evtTab.id = tab.id && evtTab.status === "complete")) {
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

export function backgroundFunction(name, fun, useSender) {
  if (typeof useSender === "undefined") {
    useSender = false;
  }
  return async function () {
    if (PassFF.mode !== "background") {
      let args = Array.from(arguments);
      args.unshift(useSender);
      args.unshift(name);
      return backgroundExec.apply(null, args);
    } else {
      return fun.apply(getFunctionFromStr(name)[0], arguments);
    }
  };
}

async function backgroundExec(action, useSender) {
  let msg;
  try {
    msg = await browser.runtime.sendMessage({
      action: action,
      params: Array.from(arguments).slice(2),
      useSender: useSender,
    });
  } catch (error) {
    log.error("backgroundExec: runtime port has crashed", action, error);
  }
  return msg ? msg.response : null;
}

export function contentFunction(name, fun, provideTab) {
  return function () {
    if (PassFF.mode !== "content") {
      let args = Array.from(arguments);
      if (!provideTab) {
        args.unshift(null);
      }
      args.splice(1, 0, name);
      return contentExec.apply(null, args);
    } else {
      return fun.apply(getFunctionFromStr(name)[0], arguments);
    }
  };
}

function contentExec(targetTab, action) {
  let promisedTab = Promise.resolve(targetTab);
  let args = Array.from(arguments).slice(2);
  if (!targetTab) {
    promisedTab = getActiveTab();
  }
  return promisedTab
    .then((tab) => {
      log.debug("Awaiting tab init for", action);
      return PassFF.Page.initTab(tab).then(function () {
        log.debug("Executing", action, "in content script");
        return browser.tabs.sendMessage(tab.id, {
          action: action,
          params: args,
          useSender: false,
        });
      });
    })
    .then((msg) => {
      if (msg) {
        return msg.response;
      } else {
        return null;
      }
    })
    .catch((error) => {
      log.error("contentExec: content script port has crashed", action, error);
    });
}

export function getFunctionFromStr(name) {
  let parts = name.split(".");
  if (parts.length > 1) {
    return [PassFF[parts[0]], parts[1]];
  } else {
    return [PassFF, parts[0]];
  }
}

export function debouncedFunction(fun, delay) {
  /* Make sure that `fun` is not called more than once every `delay` milliseconds
   *
   * This wrapper is for functions that are triggered by rather frequent events (such as DOM
   * changes), but should not be executed more than once every `delay` milliseconds (e.g. for
   * performance reasons).
   * If delay=5, and the wrapper is called at t=0 and t=2, the function `fun` will be called only
   * once: at t=5. The call at t=2 and other calls between t=0 and t=5 are discarded.
   *
   * Note that the wrapper does not pass function arguments or return values.
   */
  let timerId = undefined;
  let lastInvokeTime = undefined;
  let timerExpired = () => {
    const time = Date.now();
    const remainingWait = delay - (time - lastInvokeTime);
    if (lastInvokeTime !== undefined && remainingWait > 0) {
      timerId = setTimeout(timerExpired, remainingWait);
    } else {
      timerId = undefined;
      lastInvokeTime = time;
      fun(time);
    }
  };
  return () => {
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, delay);
    }
  };
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
 * See https://codeberg.org/PassFF/passff/pull/342
 */

export const semver = (function semver() {
  /**
   * Takes a version string as input and parses it.
   * Returns the major, minor and patch identifiers of the version as integers.
   */
  function parser(version) {
    version = version + "";

    const id = String.raw`(0|[1-9]\d*)`;
    const ext = String.raw`(?:|[\+-].+)`;
    const reg = String.raw`^${id}\.${id}(?:\.${id})?${ext}$`;
    const m = version.trim().match(reg);

    if (!m) throw new TypeError("Invalid Version: " + version);

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
  function comparator(v1, v2) {
    v1 = parser(v1);
    v2 = parser(v2);

    return v1.major - v2.major || v1.minor - v2.minor || v1.patch - v2.patch;
  }

  function gt(v1, v2) {
    return comparator(v1, v2) > 0;
  }

  function gte(v1, v2) {
    return comparator(v1, v2) >= 0;
  }

  function eq(v1, v2) {
    return comparator(v1, v2) == 0;
  }

  let publicAPI = { gt, gte, eq };
  return publicAPI;
})();

/* #############################################################################
 * #############################################################################
 *  URL handling
 * #############################################################################
 */

export function sanitizeDomain(domain) {
  // remove leading or trailing dots from hostname
  return domain.replace(/^\.+/, "").replace(/\.+$/, "");
}

export function getDomainSuffix(domain) {
  // get the domain suffix without the leading dot
  domain = sanitizeDomain(domain);
  let domainParts = domain.split(/\.+/);
  let suffix =
    domainParts.length >= 2 ? domainParts[domainParts.length - 1] : "";
  if (/^[0-9]+$/.test(suffix)) {
    // this is probably an IPv4 address (no suffix)
    suffix = "";
  }
  PassFF.Preferences.recognisedSuffixes
    .map((s) => s.trim())
    .filter((s) => domain.endsWith(s))
    .forEach((s) => (suffix = s));
  return suffix;
}

export function getMainDomain(domain) {
  // truncate subdomain parts from hostname, but keep suffix
  domain = sanitizeDomain(domain);
  let suffix = getDomainSuffix(domain);
  let prefix =
    suffix.length == 0
      ? domain
      : domain.substr(0, domain.length - suffix.length - 1);
  let parts = prefix.split(".");
  return parts[parts.length - 1] + "." + suffix;
}

export function checkIsSubdomain(domain1, domain2) {
  // check if domain1 is equal to or a subdomain of domain2
  domain1 = sanitizeDomain(domain1);
  domain2 = sanitizeDomain(domain2);
  return domain1 == domain2 || domain1.endsWith("." + domain2);
}

export function checkDomainsHaveSameMain(domain1, domain2) {
  domain1 = sanitizeDomain(domain1);
  domain2 = sanitizeDomain(domain2);
  let main1 = getMainDomain(domain1);
  return checkIsSubdomain(domain2, main1);
}
