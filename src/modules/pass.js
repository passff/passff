/**
  * This module provides access to the items stored in the password store.
  * It comes with convenient functions like filtering/search capabilities and
  * keeps track of the items matching the current context/url.
  */

import * as util from "./util.js"
import { _, log } from "./util.js"
import PassFF from "./main.js"

let allItems = [];
let contextItems = [];
let metaUrls = null;
let displayItem = null;
let pendingRequests = {};
let addPasswordContext = '/';

/* #############################################################################
 * #############################################################################
 *  Helpers for password data setup
 * #############################################################################
 */

function prefixHttpsIfNeeded(urlStr) {
  // if there is no protocol specified, assume secure HTTP
  return /^[a-z]+:\/\//.test(urlStr) ? urlStr : `https://${urlStr}`;
}

function isUrlValid(urlStr) {
  urlStr = prefixHttpsIfNeeded(urlStr);
  try {
    new URL(urlStr);
    return true;
  } catch (e) {
    return false;
  }
}

function setLoginPasswordUrls(passwordData, item) {
  (
    // lines 2 and 3 have a special meaning for the login and URL fields
    [2, 3]
    .map(lineno => `PASSFF_LINE_${lineno}`)
    .filter(key => !passwordData.hasOwnProperty(key))
    .forEach(key => { passwordData[key] = []; })
  );

  let [logins, passwords, urls] = (
    ["login", "password", "url"]
    .map(key => (
      PassFF.Preferences[`${key}FieldNames`]
      .filter(name => passwordData.hasOwnProperty(name))
      .map(name => passwordData[name])
    ))
    .map(values => [].concat(...values))
  );

  let loginSrc = "field";
  if (logins.length == 0) {
    if (passwordData["PASSFF_LINE_2"].length > 0) {
      loginSrc = "line2";
      logins.push(passwordData["PASSFF_LINE_2"][0]);
    } else {
      loginSrc = "key";
      logins.push(item.key);
    }
  }

  let validUrls = urls.filter(isUrlValid);
  if (validUrls.length == 0) {
    const line3Data = passwordData["PASSFF_LINE_3"];
    const keyParts = item.fullKey.split("/");
    const urlCandidates = [
      line3Data.length == 0 ? "" : line3Data[0],
      loginSrc == "key" ? "" : item.key,
      keyParts.at(-2),
    ].filter(url => url != "");
    validUrls = urlCandidates.filter(isUrlValid);
    if (validUrls.length > 0) {
      urls.push(validUrls[0]);
    } else if (urls.length == 0) {
      // make sure that we keep at least one URL, even if it is invalid
      urls.push(urlCandidates[0]);
    }
  }

  // if multiple logins/passwords are specified only use the first
  passwordData.login = logins[0];
  passwordData.password = passwords[0];

  // the `url` property is a list of all specified URLs
  passwordData.url = urls.map(prefixHttpsIfNeeded);
}

async function setOtp(passwordData, item) {
  let otpauth = false;
  for (let i = 0; i < PassFF.Preferences.otpauthFieldNames.length; i++) {
    otpauth = passwordData[PassFF.Preferences.otpauthFieldNames[i]];
    if (otpauth) break;
  }
  if (!otpauth) return;

  log.debug('setOtp: Generating OTP token');
  passwordData.otp = await PassFF.Pass.generateOtp(item.fullKey);
}

function setOther(passwordData) {
  let other = {};
  Object.keys(passwordData)
    .filter(isOtherField)
    .forEach(fieldName => { other[fieldName] = passwordData[fieldName]; });
  passwordData._other = other;
}

function setText(passwordData, fullText) {
  passwordData.fullText = fullText;
}

function isLoginField(name) {
  name = name.toLowerCase();
  return PassFF.Preferences.loginFieldNames.indexOf(name) >= 0;
}

function isPasswordField(name) {
  name = name.toLowerCase();
  return PassFF.Preferences.passwordFieldNames.indexOf(name) >= 0;
}

function isUrlField(name) {
  name = name.toLowerCase();
  return PassFF.Preferences.urlFieldNames.indexOf(name) >= 0;
}

function isOtpauthField(name) {
  name = name.toLowerCase();
  return PassFF.Preferences.otpauthFieldNames.indexOf(name) >= 0;
}

function isOtherField(name) {
  return !(
    name.startsWith("PASSFF_")
    || isLoginField(name)
    || isPasswordField(name)
    || isUrlField(name)
    || isOtpauthField(name)
  );
}

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data analysis %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

let host_part_blacklist = ["www","login","accounts","edu","blog"];
let regex_regex = /[-\/\\^$*+?.()|[\]{}]/g;

function ci_search_regex(str) {
  // case insensitive RegExp for use with String.search(...)
  return new RegExp(str.replace(regex_regex, '\\$&'), 'i');
}

function hostMatchQuality(item, host) {
  /* Match quality is ranked based on host parts contained in item.fullKey:
    *
    *  'cloud.bob.example.co.uk' > 'bob.example.co.uk' > 'example.co.uk' \
    *    > 'cloud.bob.example' > 'bob.example' > 'example' \
    *    > 'cloud.bob' > 'bob'
    *
    * The last part of the domain name (here: 'co.uk') is considered to be a
    * public suffix and *not* matched *alone*. Same applies to very short (less
    * than 3 chars) and some very generic parts like "www"
    */
  let fullKey = item.fullKey;
  if (PassFF.Preferences.matchDirnameOnly) {
    fullKey = PassFF.Pass.getItemById(item.parent).fullKey;
  }
  host = util.sanitizeDomain(host);
  let suffix = util.getDomainSuffix(host);
  do {
    // check a.b.c.d, then a.b.c, then a.b, ...
    let quality = host.split(/\.+/).length * 100 + host.split(/\.+/).length;
    let subhost = host;
    do {
      // check a.b.c.d, then b.c.d, then c.d, ...
      if (subhost.length < 3 || subhost == suffix
          || host_part_blacklist.indexOf(subhost) >= 0) break;

      let regex = ci_search_regex(subhost);
      if (fullKey.search(regex) >= 0
          || regexSearchMetaUrls(item, regex)) {
        return quality;
      }

      if (subhost.indexOf('.') < 0) break;
      subhost = subhost.replace(/[^\.]+\.+/, '');
      quality--;
    } while (true);
    if (host.indexOf('.') < 0) break;
    if (suffix.length > 0) {
      host = host.substr(0, host.length - suffix.length - 1);
      suffix = "";
    } else {
      host = host.replace(/\.+[^\.]+$/, '');
    }
  } while (true);
  return -1;
}

function regexSearchMetaUrls(item, regex) {
  if (metaUrls === null) {
    return false;
  }
  const itemMetaUrls = metaUrls.get(item.fullKey);
  if (typeof itemMetaUrls === "undefined" || itemMetaUrls.length === 0) {
    return false;
  }
  for (let url of itemMetaUrls) {
    if (url.search(regex) >= 0) {
      return true;
    }
  }
  return false;
}

function pathMatchQuality(item, path) {
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  let parts = path.split(/\/+/);
  return parts.map((part) => part.replace(/\.(html|php|jsp|cgi|asp)$/, ""))
    .filter((part) => (part.length > 2)).map(ci_search_regex)
    .filter((part) => (item.fullKey.search(part) >= 0)).length;
}

function queryMatchQuality(item, query) {
  query = query.replace(/^\?/, '').replace(/&$/, '');
  let parts = query.split(/[&=]+/);
  return parts.filter((part) => (part.length > 1)).map(ci_search_regex)
    .filter((part) => (item.fullKey.search(part) >= 0)).length;
}

function getItemQuality(item, urlStr, containerName) {
  if (!item || item.isField || (!item.isLeaf && !item.hasFields)) {
    return {item: null,  quality: -1};
  }
  let url = new URL(urlStr);
  let quality = hostMatchQuality(item, url.host);
  if (quality <= 0) return { item: null,  quality: -1 };
  if (url.port != "") {
    quality *= 10;
    quality += (item.fullKey.indexOf(url.port) >= 0) ? 1 : 0;
  }
  quality *= 100;
  quality += pathMatchQuality(item, url.pathname);
  quality *= 100;
  quality += queryMatchQuality(item, url.search);
  quality *= 10;
  if (!!containerName && item.fullKey.indexOf(containerName) >= 0) {
    quality += 1;
  }
  return { item: item, quality: quality };
}

function stringSimilarity(str1, str2, caseInsensitive) {
  // currently only returns 2, 1 or 0
  // to be replaced later by something more sophisticated

  if (caseInsensitive) {
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
  }

  // return 2 if str2 is exactly contained in str1
  if (str2.indexOf(str1) >= 0) return 2;

  let regexFlags = caseInsensitive ? 'i' : '';
  let searchRegex = '';
  for (let i = 0; i < str1.length; i++) {
    searchRegex += str1.charAt(i) + '.*';
  }
  searchRegex = new RegExp(searchRegex, regexFlags);
  return (str2.search(searchRegex) >= 0) ? 1 : 0;
}

/* #############################################################################
 * #############################################################################
 *  Pass script interaction
 * #############################################################################
 */

function getPassExecPromise(key) {
  if (!pendingRequests.hasOwnProperty(key)) {
    pendingRequests[key] = PassFF.Pass.executePass([key])
      .then((result) => {
        delete pendingRequests[key];
        return result;
      });
  }
  return pendingRequests[key];
}

function getGpgCodesFromStderr(stderr) {
  let messages = [];
  stderr.split("\n").forEach((line) => {
    // append gpg indented line continuation to previous message
    if (messages.length > 0 && line.startsWith('  ')) {
      messages[messages.length - 1] += `\n${line}`;
    } else {
      messages.push(line);
    }
  });

  // extract GPG error codes from status and debug messages
  // https://github.com/gpg/libgpg-error/blob/master/src/err-codes.h.in
  let gpg_error_code = 0;
  messages.forEach((msg) => {
    if (msg.startsWith('gpg: DBG:')) {
      let m = /chan_\d+ (?:<-|->) ERR (\d+)/.exec(msg);
      if (m !== null) {
        gpg_error_code = parseInt(m[1]) & 0xFFFF;
      }
    } else if (msg.startsWith("[GNUPG:]")) {
      let m = /ERROR pkdecrypt_failed (\d+)/.exec(msg);
      if (m !== null) {
        gpg_error_code = parseInt(m[1]) & 0xFFFF;
      } else if (msg.search('NO_SECKEY') >= 0) {
        gpg_error_code = 17;
      }
    }
  });

  // filter out debug and status outputs
  let stderr_filtered = messages.filter((msg) => (
    /\[GNUPG:\] (BEGIN|END)_DECRYPTION/.test(msg)
    || !["gpg: DBG:", "[GNUPG:]"].some((s) => msg.startsWith(s))
  )).join("\n");

  return [stderr_filtered, gpg_error_code];
}

function createItem(parent, key, attributes) {
  const item = {
    id: allItems.length,
    key: key,
    depth: parent ? parent.depth + 1 : -1,
    parent: parent ? parent.id : null,
    isLeaf: null,
    isField: null,
    hasFields: null,
    isMeta: null,
    hasMeta: null,
    fullKey: parent ? parent.fullKey + '/' + key : key,
    isHidden: null,
    isBroken: false,
    children: [],
    ...attributes,
  };

  allItems.push(item);
  if (parent !== null) {
    parent.children.push(item.id);
  }

  return item;
}

function createSymlinkItem(parent, key, targetPath) {
  if (targetPath.startsWith("/")) {
    log.debug("followSymlinkToDir: only relative links are supported, skipping", key, targetPath);
    return createItem(parent, key, {isBroken: true});
  }

  let targetItem = parent;
  for (let part of targetPath.split("/")) {
    if (part == ".") {
      continue;
    } else if (part == "..") {
      if (targetItem.parent === null) {
        log.debug("followSymlinkToDir: link points outside the pass dir", key, targetPath);
        return createItem(parent, key, {isBroken: true});
      }
      targetItem = PassFF.Pass.getItemById(targetItem.parent);
    } else {
      let targetSiblings = targetItem.children.map(PassFF.Pass.getItemById);
      targetSiblings = targetSiblings.filter(item => item.key == part);
      if (targetSiblings.length != 1) {
        log.debug("followSymlinkToDir: skipping dead link", key, targetPath);
        return createItem(parent, key, {isBroken: true});
      }
      targetItem = targetSiblings[0];
    }
  }

  return copyTree(parent, key, targetItem);
}

function copyTree(parent, key, targetItem) {
  let item = createItem(parent, key);
  targetItem.children.forEach(child => {
    child = PassFF.Pass.getItemById(child);
    if (child) {
      copyTree(item, child.key, child);
    }
  });
  return item;
}

function rmTree(item_id) {
  let item = PassFF.Pass.getItemById(item_id);
  if (!item) return;
  allItems[item_id] = null;
  if (item.parent !== null) {
    const siblings = PassFF.Pass.getItemById(item.parent).children;
    siblings.splice(siblings.indexOf(item_id), 1);
  }
  item.children.forEach(rmTree);
}

async function getLinkedFieldData(item, fieldName, targetPath, recursionHist) {
  recursionHist = recursionHist || [];
  const targetItem = (
    targetPath.startsWith("/")
    ? PassFF.Pass.getItemByFullKey(targetPath)
    : PassFF.Pass.getItemByRelKey(item, targetPath)
  );
  if (targetItem === null) {
    log.debug(
      `getLinkedFieldData: pass entry ${targetPath} referenced from`
      + ` field ${fieldName} in ${item.fullKey} does not exist`
    );
    return `BROKEN_PASS_REF_MISS: -> ${targetPath}`;
  } else if (recursionHist.indexOf(targetItem.id) >= 0) {
    log.debug(
      `getLinkedFieldData: recursion loop for ${targetPath} referenced from`
      + ` field ${fieldName} in ${item.fullKey}`
    );
    return `BROKEN_PASS_REF_LOOP: -> ${targetPath}`;
  } else {
    const targetData = await PassFF.Pass.getPasswordData(targetItem, recursionHist);
    if (!targetData.hasOwnProperty(fieldName)) {
      log.debug(
        `getLinkedFieldData: missing field ${fieldName} in ${targetItem.fullKey},`
        + ` referenced from ${item.fullKey}`
      );
      return `BROKEN_PASS_REF_FIELD: -> ${targetPath}`;
    } else {
      return targetData[fieldName];
    }
  }
}

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

export default {
  init: function () {
    if (PassFF.mode === "passwordGenerator") {
      handlePasswordGeneration();
    }
    return this.loadItems(PassFF.mode === "background")
      .then((items) => {
        if (typeof items === "undefined") {
          log.warn("loadItems failed!");
          return;
        }
        allItems = items[0];
        if (PassFF.mode !== "background") {
          contextItems = items[1];
          metaUrls = items[2];
        }
        if (PassFF.mode === "itemMonitor") {
          let passOutputEl = document.getElementsByTagName("pre")[0];
          let restOutputEl = document.getElementsByTagName("pre")[1];
          document.querySelector("div:first-child > span").textContent
            = _("passff_display_hover");
          this.getDisplayItem()
            .then((passwordData) => {
              if (passwordData === null) return;
              if (passwordData.hasOwnProperty('fullText')) {
                  let otherData = passwordData['fullText'];
                  let sep = otherData.indexOf("\n");
                  passOutputEl.textContent = passwordData['password'];
                  restOutputEl.textContent = otherData.substring(sep + 1);
              } else {
                  passOutputEl.textContent = passwordData['password'];
                  restOutputEl.textContent = "login: " + passwordData['login']
                                          + "\nurl: " + passwordData['url'];
              }
            });
        }
      });
  },

// %%%%%%%%%%%%%%%%%%%%%%%%%% Execute pass script %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  executePass: util.backgroundFunction("Pass.executePass",
    function (args) {
      log.debug("executePass:", args[0]);
      let command = "ls";
      if (args.length > 0) {
        if (["insert",
              "generate",
              "otp",
              "grepMetaUrls"].indexOf(args[0]) >= 0) {
          command = args[0];
        } else {
          command = "show";
        }
      }
      return browser.runtime.sendNativeMessage("passff", args)
        .then((result) => {
          let version = result.version || "0.0";
          const compatible = (function isHostAppCompatible(version) {
            const MIN_VERSION = '1.0.1';
            return version === "testing" || util.semver.gte(version, MIN_VERSION);
          })(version);
          let gpgerr = getGpgCodesFromStderr(result.stderr);
          result.stderr = gpgerr[0];
          result.gpgErrorCode = gpgerr[1];
          if (!compatible) {
            log.warn("The host app is outdated!", version);
            result.exitCode = -2;
            result.stderr = `The host app (v${version}) is outdated!`;
          } else if (command === "otp" && version !== "testing"
                      && util.semver.gt("1.1.0", version)) {
            log.warn("This version of the host app does not support OTP!",
              version);
            PassFF.Page.notify(_("passff_error_otp_host_version",
              [PASSFF_URL_GIT_HOST]));
          } else if (command === "grepMetaUrls" && version !== "testing"
                      && util.semver.gt("1.2.0", version)) {
            log.warn("This version of the host app does not support "
              + "indexing meta urls!", version);
            PassFF.Page.notify(_("passff_error_grep_host_version",
              [PASSFF_URL_GIT_HOST]));
          } else if (result.exitCode !== 0) {
            if (command === "otp" && result.stderr.trim() === "Error: "
                + "otp is not in the password store.") {
              log.warn("pass-otp plugin is not installed, "
                        + "but entry contains otpauth.");
            } else if (result.gpgErrorCode == 99) {
              // "decryption failed: Operation cancelled"
              log.debug('Script execution ok, operation cancelled by user.');
              result.stderr = "gpg: Operation cancelled";
            } else if (result.gpgErrorCode == 11) {
              // "decryption failed: No secret key"
              log.debug('Script execution ok, wrong passphrase provided by user.');
              result.stderr = "gpg: No secret key";
            } else {
              log.warn(
                'Script execution failed',
                result.exitCode, result.gpgErrorCode,
                result.stderr, result.stdout,
              );
              PassFF.Page.notify(
                _("passff_error_script_failed", [result.stderr])
              );
            }
          } else {
            log.debug('Script execution ok');
          }
          PassFF.Menu.state.lastResult = {
            'timestamp': new Date(),
            'stderr': result.stderr,
            'exitCode': result.exitCode,
            'command': command,
          };
          return result;
        }, (ex) => {
          log.error("executePass: executing the host app failed", ex);
          PassFF.Menu.state.lastResult = {
            'timestamp': new Date(),
            'stderr': "PassFF failed to execute the host app",
            'exitCode': -1,
            'command': command
          };
          return { exitCode: -1 };
        });
    }
  ),

// %%%%%%%%%%%%%%%%%%%%%%%%% Data retrieval %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  get rootItems() {
    return allItems[0].children.map(this.getItemById);
  },

  get contextItems() {
    return contextItems;
  },

  loadItems: util.backgroundFunction("Pass.loadItems", function (reload) {
    if (!reload) return [allItems, contextItems, metaUrls];
    return this.executePass([])
      .then((result) => {
        if (result.exitCode !== 0) {
          PassFF.Menu.state.error = true;
          return;
        }

        PassFF.Menu.state.error = false;
        allItems = [];

        let stdout = result.stdout;
        // replace utf8 box characters with traditional ascii tree
        stdout = stdout.replace(/[\u2514\u251C]\u2500\u2500/g, '|--');
        //remove colors
        stdout = stdout.replace(/\x1B\[[^m]*m/g, '');

        const re = /(.*[|`;])+-- (.*)/;
        const re_link = /.* -> (.*)  \[([^\]]+)\]/;

        let curParent = createItem(null, "");
        stdout.split('\n').forEach(line => {
          const match = re.exec(line);
          if (!match) return;

          const curDepth = (match[1].replace('&middot;', '`').length - 1) / 4;
          const key = (
            match[2]
            .replace(/\\ /g, ' ')
            .replace(/ -> .*/g, '')
            .replace(/\.gpg$/, '')
          );

          while (curParent.depth >= curDepth) {
            curParent = PassFF.Pass.getItemById(curParent.parent);
          }

          const match_link = re_link.exec(match[2]);
          if (match_link && match_link[2] == "recursive, not followed") {
            // output of `tree` if a link points to a directory that has been listed before
            curParent = createSymlinkItem(curParent, key, match_link[1])
          } else {
            curParent = createItem(curParent, key);
          }
        });

        let isInUseHiddenRegex = PassFF.Preferences.filterPathRegex.length != 0;
        let isHiddenRegex = new RegExp(PassFF.Preferences.filterPathRegex.join("|"), 'i');

        allItems.slice().reverse().forEach(item => {
          let siblings = item.parent ? this.getItemById(item.parent).children : [];
          siblings = siblings.map(this.getItemById);
          item.isMeta = (item.key.substr(-5) === ".meta") &&
            siblings.some(s => s.key + ".meta" === item.key);
          item.hasMeta = (!item.isMeta) &&
            siblings.some(s => s.key === item.key + ".meta");
          item.isLeaf = (item.children.length === 0) && !item.isMeta;
          item.isField = item.isLeaf && (isLoginField(item.key)
                                          || isPasswordField(item.key)
                                          || isUrlField(item.key)
                                          || isOtpauthField(item.key));
          item.hasFields = item.children.some(c => this.getItemById(c).isField);
          item.isHidden = isInUseHiddenRegex && isHiddenRegex.test(item.fullKey);
        });

        allItems.filter(item => item.isBroken).forEach(item => rmTree(item.id));

        this.indexMetaUrls();
        return [allItems];
      });
  }),

  indexMetaUrls: util.backgroundFunction("Pass.indexMetaUrls", function () {
    if (!PassFF.Preferences.indexMetaUrls) {
      metaUrls = null;
      return;
    }
    if (metaUrls !== null) {
      return;
    }
    log.debug("Indexing meta urls");
    metaUrls = new Map();
    return this.executePass(["grepMetaUrls", PassFF.Preferences.urlFieldNames])
      .then((result) => {
        PassFF.Menu.state.indexingMetaUrls = false;
        let stdout = result.stdout;
        // remove escape codes
        stdout = stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

        let lines = stdout.split("\n");

        let fullKey = "";
        let urls = [];

        // build RegExp for detecting metaTag lines
        let metaTagRegexp = new RegExp(
          `^(${PassFF.Preferences.urlFieldNames.join("|")}):`, "i"
        );
        let urlRegExp = new RegExp("^https?://.*");

        for (let line of stdout.split("\n")) {
          if (!metaTagRegexp.test(line)) {
            // reached next fullKey in output
            if (urls.length > 0) {
              metaUrls.set(fullKey, urls);
            }

            // current line ends with a colon which we need to strip
            // add leading slash for compatibility with our naming scheme
            fullKey = "/" + line.substring(0, line.length - 1);
            urls = [];
          } else {
            // current line is an url matching the last found fullKey
            // 'host:' or 'url:" needs to be stripped
            let url = (
              urlRegExp.test(line) ? line.trim() : line.replace(metaTagRegexp, "")
            ).trim();
            if (!urlRegExp.test(url)) {
              url = `https://${url}`;
            }
            urls.push(url);
          }
        }
        if (urls.length > 0) {
          metaUrls.set(fullKey, urls);
        }
        log.debug(
          `Finished indexing meta urls, found ${metaUrls.size} entries that include urls`
        );
        browser.tabs.query({}).then((tabs) => {
          tabs.forEach((t) => browser.tabs.sendMessage(t.id, "refresh"));
        });
      });
  }),

  loadContextItems: function (url, containerName) {
    contextItems = this.getUrlMatchingItems(url, containerName);
    if (contextItems.length === 0) {
      contextItems = this.rootItems;
    }
  },

  getPasswordData: async function (item, recursionHist) {
    let result = {};
    recursionHist = recursionHist || [];
    recursionHist = [...recursionHist, item.id];
    if (item.hasFields) {
      // hierarchical-style item
      let result = {};
      let otpauthkey;
      let childFields = item.children.map(this.getItemById).filter(c => c.isField);
      for (const child of childFields) {
        const data = await this.getPasswordData(child);
        if (typeof data === "undefined") return;
        if (isOtpauthField(child.key)) {
          otpauthkey = child.fullKey;
        } else {
          result[child.key] = [data.password];
        }
      }
      if (Object.keys(result).length == 0) return;
      setLoginPasswordUrls(result, item);
      setOther(result);
      if (!!otpauthkey) {
        log.debug('getPasswordData: Generating OTP token');
        result.otp = await this.generateOtp(otpauthkey);
      }
      return result;
    } else {
      // multiline-style item
      let executionResult = await getPassExecPromise(item.fullKey);
      if (executionResult.exitCode !== 0) return;

      let stdout = executionResult.stdout;
      if (item.hasMeta) {
        // item with corresponding *.meta
        const metaItem = (
          this
          .getItemById(item.parent)
          .children
          .map(this.getItemById)
          .filter(sib => item.key + ".meta" === sib.key)[0]
        );
        executionResult = await getPassExecPromise(metaItem.fullKey);
        if (executionResult.exitCode !== 0) return;
        stdout += executionResult.stdout;
      }

      let lines = stdout.trimRight().split('\n');
      result.password = [lines[0]];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        result[`PASSFF_LINE_${i + 1}`] = [line.trim()];

        const isUrl = i == 2 && /^https?:\/\/.*/.test(line);
        let splitPos = line.indexOf(':');
        if (splitPos >= 0 && !isUrl) {
          result[`PASSFF_LINE_${i + 1}`] = [];

          // support attribute names that contain a colon (but no space)
          let splitLen = 1;
          let splitPos2 = line.indexOf(': ');
          if (splitPos2 >= 0) {
            splitPos = splitPos2;
            splitLen = 2;
          }

          const fieldName = line.substring(0, splitPos).toLowerCase();
          const value = line.substring(splitPos + splitLen);
          if (!result.hasOwnProperty(fieldName)) {
            result[fieldName] = [];
          }
          result[fieldName].push(value.trim());
        }
      }

      for (const [fieldName, values] of Object.entries(result)) {
        let linkedValues = [];
        for (const value of values) {
          const match = / *-> *(.*)/.exec(value);
          if (!match) {
            linkedValues.push(value);
          } else {
            const lValue = await getLinkedFieldData(
              item, fieldName, match[1], recursionHist,
            );
            linkedValues.push(...(typeof lValue === "string" ? [lValue] : lValue));
          }
        }
        result[fieldName] = linkedValues;
      }

      setLoginPasswordUrls(result, item);
      await setOtp(result, item);
      setOther(result);
      setText(result, stdout);

      return result;
    }
  },

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data filtering %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  getMatchingItems: function (search, limit) {
    return allItems
      .filter(i => i && (i.isLeaf && !i.isField || i.hasFields))
      .map(i => Object({
        "item": i,
        "similarity": stringSimilarity(
          search, i.fullKey, PassFF.Preferences.caseInsensitiveSearch)
      }))
      .sort((i1, i2) => (i2.similarity - i1.similarity))
      .slice(0, limit)
      .filter(i => (i.similarity > 0))
      .map(i => i.item);
  },

  getUrlMatchingItems: function (urlStr, containerName) {
    let url = new URL(urlStr);
    let domainRegex = ci_search_regex(util.getMainDomain(url.host));
    let matchingItems = allItems
      .filter(item => {
        if (!PassFF.Preferences.enforceDomainMatch) return true;
        if (item.fullKey.search(domainRegex) >= 0) return true;
        return regexSearchMetaUrls(item, domainRegex);
      })
      .map(i => getItemQuality(i, urlStr, containerName))
      .filter(i => (i.quality >= 0))
      .sort((i1, i2) => (i2.quality - i1.quality))
      .map(i => i.item)
      .filter(i => !i.isHidden);
    log.debug(matchingItems.length, 'matches for', urlStr, 'in container', containerName);
    return matchingItems;
  },

  findBestFitItem: function (items, urlStr, containerName) {
    let url = new URL(urlStr);

    if (items.length === 0) {
      return null;
    }

    let bestItem = items[0];
    let bestQuality = -1;

    items.forEach(function (curItem) {
      if (curItem.isLeaf) {
        return;
      }

      let curQuality = getItemQuality(curItem, urlStr, containerName);

      if (curQuality.quality > bestQuality && curItem.key.length > bestItem.key.length) {
        bestItem = curItem;
        bestQuality = curQuality.quality;
      }
    });

    log.debug('Best fit item', bestItem.fullKey, "for", urlStr, "in container", containerName);
    return bestItem;
  },

  getItemById: function (id) {
    if (id === null || id >= allItems.length) {
      return null;
    } else {
      return allItems[id];
    }
  },

  getItemByFullKey: function (fullKey) {
    for (const item of allItems) {
      if (!item) continue;
      if (item.fullKey === fullKey) {
        return item;
      }
    }
    return null;
  },

  getItemByRelKey: function (ref_item, relKey) {
    let item = this.getItemById(ref_item.parent);
    for (const part of relKey.split("/")) {
      if (part == ".") {
        continue;
      } else if (part == "..") {
        if (item.parent === null) {
          log.debug(`getItemByRelKey: broken ref ${relKey} from ${ref_item.fullKey}`);
          return null;
        }
        item = this.getItemById(item.parent);
      } else {
        let children = item.children.filter(c => this.getItemById(c).key == part);
        if (children.length != 1) {
          log.debug(`getItemByRelKey: broken ref ${relKey} from ${ref_item.fullKey}`);
          return null;
        }
        item = this.getItemById(children[0]);
      }
    }
    return item;
  },

// %%%%%%%%%%%%%%%%%%%%%%%% Data manipulation %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  addNewPassword: function (name, password, additionalInfo) {
    let fileContents = [password, additionalInfo].join('\n');
    fileContents = fileContents.trim() + "\n";
    return this.executePass(['insert', name, fileContents])
      .then((result) => { return result.exitCode === 0; });
  },

  generateOtp: function (key) {
    let args = ['otp', key];
    return this.executePass(args)
      .then((result) => {
        if (result.exitCode !== 0) return;
        let lines = result.stdout.trim().split('\n');
        if (lines.length == 1) {
          let otp = lines[0];
          return otp;
        }
      });
  },

  generateNewPassword: function (name,
                                  length,
                                  includeSymbols,
                                  additionalInfo) {
    let args = ['generate', name, length.toString()];
    if (!includeSymbols) {
      args.push('-n');
    }
    return this.executePass(args)
      .then((result) => {
        if (result.exitCode !== 0) {
          return false;
        }
        if (additionalInfo) {
          return this.executePass([name])
            .then((result) => {
              if (result.exitCode !== 0) {
                return false;
              }
              let pass = result.stdout.split("\n")[0];
              return this.addNewPassword(name, pass, additionalInfo)
            });
        } else {
          return true;
        }
      });
  },

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data analysis %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  getItemsLeafs: function (items) {
    let leafs = [];
    leafs = leafs.concat(items.map(this.getItemLeafs));
    return leafs;
  },

  getItemLeafs: function (item) {
    let leafs = [];

    if (item.isLeaf) {
      if (!item.isField) {
        leafs.push(item);
      }
    } else {
      leafs = leafs.concat(
        item.children.map(this.getItemById).map(this.getItemLeafs));
    }

    return leafs;
  },

// %%%%%%%%%%%%% Implementation of 'display item' feature %%%%%%%%%%%%%%%%%%%%%%

  displayItem: util.backgroundFunction("Pass.displayItem", function (item) {
    this.getPasswordData(item)
      .then((passwordData) => {
        if (typeof passwordData === "undefined") return;
        displayItem = passwordData;
        return browser.windows.create({
            'url': browser.runtime.getURL('/content/itemMonitor.html'),
            'width': 640,
            'height': 251,
            'type': 'popup',
          })
          .then((win) => {
            setTimeout(() => browser.windows.update(win.id, { height: 250 }), 100);
          });
      });
  }),

  getDisplayItem: util.backgroundFunction("Pass.getDisplayItem", () => {
    // make sure passwordData can only be requested once
    let item = displayItem;
    displayItem = null;
    return item;
  }),

/* #############################################################################
* #############################################################################
*  Implementation of the 'new password' feature's UI
* #############################################################################
*/

  newPasswordUI: util.backgroundFunction("Pass.newPasswordUI", (context) => {
    let activeTab = null;
    return util.getActiveTab()
      .then((tab) => {
        activeTab = tab;
        return PassFF.Page.readLoginInput();
      })
      .then((tabLogin) => {
        let url = new URL(activeTab.url);
        addPasswordContext = {"fullKey": "/"};
        if (context instanceof Array && context.length > 0) {
          context = context[0];
        }
        if (context) {
          addPasswordContext["fullKey"] = context.fullKey;
        }
        addPasswordContext["fullKey"] = addPasswordContext["fullKey"].replace(/\/[^\/]*$/, '/');
        addPasswordContext["fullKey"] += url.host;
        addPasswordContext["tabUrl"] = activeTab.url;
        addPasswordContext["tabLogin"] = (
          (PassFF.Preferences.prefillLoginTab && tabLogin != "")
          ? tabLogin
          : PassFF.Preferences.prefillLoginDefault
        );
        return browser.windows.create({
          'url': browser.runtime.getURL('/content/passwordGenerator.html'),
          'width': 640,
          'height': 481,
          'type': 'popup',
        })
      })
      .then((win) => {
        setTimeout(() => browser.windows.update(win.id, { height: 480 }), 100);
      });
  }),

  getAddPasswordContext: util.backgroundFunction("Pass.getAddPasswordContext",
    function () { return addPasswordContext; }
  ),
};

function handlePasswordGeneration() {
  function _p(msg_id) {
    return _("passff_newpassword_" + msg_id);
  }

  function isPresent(field, errorMsg) {
    return function (inputData) {
      if (!inputData[field] || !/\S/.test(inputData[field])) {
        return errorMsg;
      }
    };
  }

  function matches(field1, field2, errorMsg) {
    return function (inputData) {
      if (inputData[field1] !== inputData[field2]) {
        return errorMsg;
      }
    };
  }

  function validateInput(validations, inputData) {
    return validations.reduce(function (errors, validatorFn) {
      let error = validatorFn(inputData);
      if (error) {
        errors.push(error);
      }
      return errors;
    }, []);
  }

  function emptyElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function onAddPassword() {
    let errorsContainer = document.getElementById("add-password-errors");
    let generate = document.getElementById("add-password-mode-gen").checked;
    let validations = [
      isPresent('name', _p("errors_name_is_required")),
    ];
    let inputData = {
      "name": document.getElementById('add-password-name').value,
      "additionalInfo": document.getElementById('add-password-info').value,
    }
    if (generate) {
      inputData["length"] = document.getElementById('add-password-gen-length').value;
      inputData["includeSymbols"] = document.getElementById('add-password-gen-symbols').checked;
    } else {
      validations.push(
        isPresent('name', _p("errors_name_is_required")),
        isPresent('password', _p("errors_password_is_required")),
        matches('password', 'passwordConfirmation', _p("errors_password_confirmation_mismatch")),
      );
      inputData["password"] = document.getElementById('add-password-ins').value;
      inputData["passwordConfirmation"] = (
        document.getElementById('add-password-ins-confirmation').value
      );
    }

    try {
      let errors = validateInput(validations, inputData);
      emptyElement(errorsContainer);
      if (errors.length > 0) {
        errors.forEach(function (errorMsg) {
          let errorLabel = document.createElement('p');
          errorLabel.textContent = errorMsg;
          errorsContainer.appendChild(errorLabel);
        });
      } else {
        if (PassFF.Pass.getItemByFullKey(inputData.name)) {
          log.debug(`Password name ${inputData.name} already taken.`);
          let confirmation = window.confirm(
            _p("inputs_overwrite_password_prompt")
          );
          if (!confirmation) {
            return;
          }
        }

        let addPasswordPromise = null;
        if (generate) {
          addPasswordPromise = PassFF.Pass.generateNewPassword(
            inputData.name,
            inputData.length,
            inputData.includeSymbols,
            inputData.additionalInfo,
          );
        } else {
          addPasswordPromise = PassFF.Pass.addNewPassword(
            inputData.name,
            inputData.password,
            inputData.additionalInfo,
          );
        }

        addPasswordPromise
          .then((result) => {
            if (result) {
              PassFF.refresh_all();
              browser.windows.getCurrent().then((win) => {
                browser.windows.remove(win.id);
              });
            } else if (result === false) {
              window.alert(
                _p("errors_pass_execution_failed") + ":\n" + JSON.stringify(result)
              );
            }
          });
      }
    } catch (e) {
      window.alert(
        _p("errors_unexpected_error") + ":\n" + e.name + ' ' + e.message
      );
    }
  }

  document.querySelectorAll("label,p.text,option,button").forEach(function (el) {
      el.textContent = _p(el.textContent);
  });

  document.getElementById("add-password-gen-length").value = PassFF.Preferences.defaultPasswordLength;
  document.getElementById("add-password-gen-symbols").checked = PassFF.Preferences.defaultIncludeSymbols;
  if (0 === PassFF.Preferences.preferInsert) {
      document.getElementById("add-password-mode-gen").setAttribute("checked", true);
  }

  let saveButton = document.getElementById("add-password-button");
  saveButton.addEventListener('click', onAddPassword);

  PassFF.Pass.getAddPasswordContext().then((context) => {
    document.getElementById('add-password-name').value = context["fullKey"];
    let addtlInfo = [];
    if (context["tabLogin"] != "") {
      addtlInfo.push(`${PassFF.Preferences.loginFieldNames[0]}: ${context["tabLogin"]}`);
    }
    if (PassFF.Preferences.prefillUrl) {
      let url = new URL(context["tabUrl"]);
      if (url.protocol !== "about:") {
        addtlInfo.push(`${PassFF.Preferences.urlFieldNames[0]}: ${context["tabUrl"]}`);
      }
    }
    document.getElementById('add-password-info').value = addtlInfo.join("\n");
  });
}
