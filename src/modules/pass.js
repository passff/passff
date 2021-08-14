/* jshint node: true */
'use strict';

PassFF.Pass = (function () {
  /**
    * This object provides access to the items stored in the password store.
    * It comes with convenient functions like filtering/search capabilities and
    * keeps track of the items matching the current context/url.
    */

  var allItems = [];
  var rootItems = [];
  var contextItems = [];
  var metaUrls = null;
  var displayItem = null;
  var pendingRequests = {};
  var addPasswordContext = '/';

/* #############################################################################
 * #############################################################################
 *  Helpers for password data setup
 * #############################################################################
 */

  function setPassword(passwordData) {
    let password;
    for (let i = 0; i < PassFF.Preferences.passwordFieldNames.length; i++) {
      password = passwordData[PassFF.Preferences.passwordFieldNames[i]];
      if (password) break;
    }
    passwordData.password = password;
  }

  function setLogin(passwordData, item) {
    let login;
    for (let i = 0; i < PassFF.Preferences.loginFieldNames.length; i++) {
      login = passwordData[PassFF.Preferences.loginFieldNames[i]];
      if (login !== undefined) break;
    }
    passwordData.login = (login === undefined) ? item.key : login;
  }

  function setUrl(passwordData) {
    let url;
    for (let i = 0; i < PassFF.Preferences.urlFieldNames.length; i++) {
      url = passwordData[PassFF.Preferences.urlFieldNames[i]];
      if (url) break;
    }
    passwordData.url = url;
  }

  function setOtpauth(passwordData) {
    let otpauth;
    for (let i = 0; i < PassFF.Preferences.otpauthFieldNames.length; i++) {
      otpauth = passwordData[PassFF.Preferences.otpauthFieldNames[i]];
      if (otpauth) break;
    }
    passwordData.otpauth = !!otpauth;
  }

  function setOther(passwordData) {
    let other = {};
    Object.keys(passwordData)
      .filter(isOtherField)
      .forEach((key) => { other[key] = passwordData[key]; });
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
    return !(isLoginField(name) || isPasswordField(name) || isUrlField(name) || isOtpauthField(name));
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
    host = host.replace(/^\.+/, '').replace(/\.+$/, '');
    let host_parts = host.split(/\.+/);
    let suffix = (host_parts.length >= 2) ? host_parts[host_parts.length-1] : "";
    if (/^[0-9]+$/.test(suffix)) {
      // this is probably an IPv4 address (no suffix)
      suffix = "";
    }
    PassFF.Preferences.recognisedSuffixes
      .map((s) => s.trim())
      .filter((s) => host.endsWith(s))
      .forEach((s) => suffix = s);
    do {
      // check a.b.c.d, then a.b.c, then a.b, ...
      let quality = host.split(/\.+/).length*100 + host.split(/\.+/).length;
      let subhost = host;
      do {
        // check a.b.c.d, then b.c.d, then c.d, ...
        if (subhost.length < 3 || subhost == suffix
            || host_part_blacklist.indexOf(subhost) >= 0) break;

        let regex = ci_search_regex(subhost);
        if (item.fullKey.search(regex) >= 0
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
    if (itemMetaUrls === undefined || itemMetaUrls.length === 0) {
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

  function getItemQuality(item, urlStr) {
    if (item.isField || (!item.isLeaf && !item.hasFields)) {
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

/* #############################################################################
 * #############################################################################
 *  Main interface
 * #############################################################################
 */

  return {
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
          rootItems = items[1];
          if (PassFF.mode !== "background") {
            contextItems = items[2];
            metaUrls = items[3];
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
                    restOutputEl.textContent = otherData.substring(sep+1);
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

    executePass: background_function("Pass.executePass",
      function (args) {
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
              return version === "testing" || semver.gte(version, MIN_VERSION);
            })(version);
            if (!compatible) {
              log.warn("The host app is outdated!", version);
              result.exitCode = -2;
              result.stderr = `The host app (v${version}) is outdated!`;
            } else if (command === "otp" && version !== "testing"
                       && semver.gt("1.1.0", version)) {
              log.warn("This version of the host app does not support OTP!",
                version);
              PassFF.Page.notify(_("passff_error_otp_host_version",
                [PASSFF_URL_GIT_HOST]));
            } else if (command === "grepMetaUrls" && version !== "testing"
                       && semver.gt("1.2.0", version)) {
              log.warn("This version of the host app does not support "
                + "indexing meta urls!", version);
              PassFF.Page.notify(_("passff_error_grep_host_version",
                [PASSFF_URL_GIT_HOST]));
            } else if (result.exitCode !== 0) {
              if (command === "otp" && result.stderr.trim() === "Error: "
                  + "otp is not in the password store.") {
                log.warn("pass-otp plugin is not installed, "
                         + "but entry contains otpauth.");
              } else {
                log.warn('Script execution failed',
                  result.exitCode, result.stderr, result.stdout);
                PassFF.Page.notify(_("passff_error_script_failed",
                  [result.stderr]));
              }
            } else {
              log.debug('Script execution ok');
            }
            PassFF.Menu.state.lastResult = {
              'timestamp': new Date(),
              'stderr': result.stderr,
              'exitCode': result.exitCode,
              'command': command
            };
            return result;
          }, (ex) => {
            log.error('PassFF failed to execute the host app', ex);
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
      return rootItems;
    },

    get contextItems() {
      return contextItems;
    },

    loadItems: background_function("Pass.loadItems", function (reload) {
      if (!reload) return [allItems, rootItems, contextItems, metaUrls];
      return this.executePass([])
        .then((result) => {
          if (result.exitCode !== 0) {
            PassFF.Menu.state.error = true;
            return;
          }

          PassFF.Menu.state.error = false;
          allItems = [];
          rootItems = [];

          let stdout = result.stdout;
          // replace utf8 box characters with traditional ascii tree
          stdout = stdout.replace(/[\u2514\u251C]\u2500\u2500/g, '|--');
          //remove colors
          stdout = stdout.replace(/\x1B\[[^m]*m/g, '');

          let lines = stdout.split('\n');
          let re = /(.*[|`;])+-- (.*)/;
          let curParent = null;
          let item = null;

          lines.forEach(function (line) {
            let match = re.exec(line);
            if (!match) return;

            let curDepth = (match[1].replace('&middot;', '`').length - 1) / 4;
            let key = match[2].replace(/\\ /g, ' ').replace(/ -> .*/g, '');
            key = key.replace(/\.gpg$/, '');

            if (curDepth === 0) {
              curParent = null;
            } else {
              while (curParent.depth >= curDepth) {
                curParent = allItems[curParent.parent];
              }
            }

            item = {
              id: allItems.length,
              key: key,
              depth: curDepth,
              parent: (curDepth === 0) ? null : curParent.id,
              isLeaf: null,
              isField: null,
              hasFields: null,
              isMeta: null,
              hasMeta: null,
              fullKey: (curDepth === 0) ? key : curParent.fullKey + '/' + key,
              isHidden: null,
              children: []
            };

            if (curParent !== null) {
              curParent.children.push(item.id);
            }

            curParent = item;
            allItems.push(item);

            if (item.depth === 0) {
              rootItems.push(item);
            }
          });

          var isHiddenRegex = new RegExp(PassFF.Preferences.filterPathRegex.join("|"), 'i');

          allItems.slice().reverse().forEach(item => {
            let siblings = rootItems;
            if (item.parent !== null) {
              siblings = allItems[item.parent].children.map(c => allItems[c]);
            }
            item.isMeta = (item.key.substr(-5) === ".meta") &&
              siblings.some(s => s.key + ".meta" === item.key);
            item.hasMeta = (!item.isMeta) &&
              siblings.some(s => s.key === item.key + ".meta");
            item.isLeaf = (item.children.length === 0) && !item.isMeta;
            item.isField = item.isLeaf && (isLoginField(item.key)
                                           || isPasswordField(item.key)
                                           || isUrlField(item.key)
                                           || isOtpauthField(item.key));
            item.hasFields = item.children.some(c => allItems[c].isField);
            item.isHidden = isHiddenRegex.test(item.fullKey);
          });

          this.indexMetaUrls();
          return [allItems, rootItems];
        });
    }),

    indexMetaUrls: background_function("Pass.indexMetaUrls", function () {
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
          //remove escape codes
          stdout = stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

          let lines = stdout.split("\n");

          let fullKey = "";
          let urls = [];

          // build RegExp for detecting metaTag lines
          let metaTagURLPart = PassFF.Preferences.urlFieldNames.join('|');
          metaTagURLPart = metaTagURLPart || "host|url";  // fallback
          let metaTagRegexp = new RegExp("^("+metaTagURLPart+"):",'i');

          for (let line of stdout.split("\n")) {
            if (!metaTagRegexp.test(line)) {
              //reached next fullKey in output
              if (urls.length > 0) {
                metaUrls.set(fullKey, urls);
              }

              //current line ends with a colon which we need to strip
              fullKey = line.substring(0, line.length - 1);
              urls = [];
            } else {
              //current line is an url matching the last found fullKey
              //'host:' or 'url:" needs to be stripped
              let url = line.replace(metaTagRegexp, "").trim();
              urls.push(url);
            }
          }
          if (urls.length > 0) {
            metaUrls.set(fullKey, urls);
          }
          log.debug(`Finished indexing meta urls, found ${metaUrls.size} `
            + `entries that include urls`);
          browser.tabs.query({}).then((tabs) => {
            tabs.forEach((t) => browser.tabs.sendMessage(t.id, "refresh"));
          });
        });
    }),

    loadContextItems: function (url) {
      contextItems = this.getUrlMatchingItems(url);
      if (contextItems.length === 0) {
        contextItems = rootItems;
      }
    },

    getPasswordData: async function (item, meta2leaf) {
      let result = {};
      meta2leaf = meta2leaf || false;
      if (item.hasFields) { // hierarchical-style item
        let results = [];
        for (let child of item.children.map(this.getItemById)) {
          if (child.isField) {
            let data = await this.getPasswordData(child);
            if (typeof data === "undefined") return;
            results.push(data);
          } else {
            results.push(null);
          }
        }
        if (typeof results[0] === "undefined") return;
        let result = {};
        let otpauthkey;
        for (let i = 0; i < item.children.length; i++) {
          let child = this.getItemById(item.children[i]);
          if (isOtpauthField(child.key)) {
            otpauthkey = child.fullKey;
          } else if (child.isField) {
            result[child.key] = results[i].password;
          }
        }
        setLogin(result, item);
        setPassword(result);
        setUrl(result);
        setOther(result);

        if (!!otpauthkey) {
          let otp = await this.generateOtp(otpauthkey);
          log.debug('Generating OTP token');
          result.otp = otp;
        }
        return result;
      } else if (item.hasMeta && !meta2leaf) { // item with corresponding *.meta
        let promised_results = [Promise.resolve(null), Promise.resolve(null)];
        promised_results[0] = this.getPasswordData(item, true);
        let siblings = this.rootItems;
        if (item.parent !== null) {
          siblings = this.getItemById(item.parent).children;
          siblings = siblings.map(this.getItemById);
        }
        promised_results[1] = siblings
          .filter(sib => item.key + ".meta" === sib.key)
          .map(this.getPasswordData)[0];
        return Promise.all(promised_results).then((results) => {
          if (typeof results[0] === "undefined") return;
          let result = Object.assign({}, results[0], results[1]);
          result.password = results[0].password;
          result.login = results[1].password;
          if (!result.hasOwnProperty("url")) {
            result.url = item.key;
          }
          setLogin(result, item);
          setPassword(result);
          setUrl(result);
          setOther(result);
          return result;
        });
      } else { // multiline-style item
        let key = item.fullKey;
        return getPassExecPromise(key)
          .then((executionResult) => {
            if (executionResult.exitCode !== 0) return;

            let lines = executionResult.stdout.split('\n');
            result.password = lines[0];

            let noFields = true;
            for (let i = 1; i < lines.length; i++) {
              let line = lines[i];
              let splitPos = line.indexOf(':');

              if (splitPos >= 0) {
                let attributeName = line.substring(0, splitPos).toLowerCase();
                let attributeValue = line.substring(splitPos + 1);
                result[attributeName] = attributeValue.trim();
                noFields = false;
              }
            }

            if (noFields && lines.length > 1 && lines[1] != "") {
                result.login = lines[1];
            }

            setLogin(result, item);
            setPassword(result);
            setUrl(result);
            setOtpauth(result);
            setOther(result);
            setText(result, executionResult.stdout);

            if (result.otpauth) {
              return this.generateOtp(key)
                .then((otp) => {
                  log.debug('Generating OTP token');
                  result.otp = otp;
                  return result;
                });
            }

            return result;
          });
      }
    },

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data filtering %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    getMatchingItems: function (search, limit) {
      return allItems
        .filter(i => (i.isLeaf && !i.isField || i.hasFields))
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

    getUrlMatchingItems: function (urlStr) {
      let url = new URL(urlStr);
      let matchingItems = allItems
        .map(i => getItemQuality(i, urlStr))
        .filter(i => (i.quality >= 0))
        .sort((i1, i2) => (i2.quality - i1.quality))
        .map(i => i.item)
        .filter(i => !i.isHidden);
      log.debug(matchingItems.length, 'matches for', urlStr);
      return matchingItems;
    },

    findBestFitItem: function (items, urlStr) {
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

        let curQuality = getItemQuality(curItem, urlStr);

        if (curQuality.quality > bestQuality && curItem.key.length > bestItem.key.length) {
          bestItem = curItem;
          bestQuality = curQuality.quality;
        }
      });

      log.debug('Best fit item', bestItem.fullKey, "for", urlStr);
      return bestItem;
    },

    isPasswordNameTaken: function (name) {
      name = name.replace(/^\//, '');
      for (let item of allItems) {
        if (item.fullKey === name) {
          log.debug("Password name " + name + " already taken.");
          return true;
        }
      }
      return false;
    },

    getItemById: function (id) {
      if (id === null || id >= allItems.length) {
        return null;
      } else {
        return allItems[id];
      }
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
                var pass = result.stdout.split("\n")[0];
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

    displayItem: background_function("Pass.displayItem", function (item) {
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

    getDisplayItem: background_function("Pass.getDisplayItem", () => {
      // make sure passwordData can only be requested once
      var item = displayItem;
      displayItem = null;
      return item;
    }),

/* #############################################################################
 * #############################################################################
 *  Implementation of the 'new password' feature's UI
 * #############################################################################
 */

    newPasswordUI: background_function("Pass.newPasswordUI", (context) => {
      addPasswordContext = '/';
      if (context instanceof Array && context.length > 0) {
        context = context[0];
      }
      if (context) addPasswordContext += context.fullKey;
      addPasswordContext = addPasswordContext.replace(/\/[^\/]*$/, '/');
      return browser.windows.create({
        'url': browser.runtime.getURL('/content/passwordGenerator.html'),
        'width': 640,
        'height': 481,
        'type': 'popup'
      })
      .then((win) => {
        setTimeout(() => browser.windows.update(win.id, { height: 480 }), 100);
      });
    }),

    getAddPasswordContext: background_function("Pass.getAddPasswordContext",
      function () { return addPasswordContext; }
    ),
  };
})();

function handlePasswordGeneration() {
  function _(msg_id) {
    return window._("passff_newpassword_" + msg_id);
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

  function makePasswordAdder(validations,
                             errorsContainerId,
                             getInput,
                             addPassword) {
    return function () {
      try {
        let inputData = getInput(),
            errorsContainer = document.getElementById(errorsContainerId),
            errors = validateInput(validations, inputData);

        emptyElement(errorsContainer);

        if (errors.length > 0) {
          errors.forEach(function (errorMsg) {
            let errorLabel = document.createElement('p');
            errorLabel.textContent = errorMsg;
            errorsContainer.appendChild(errorLabel);
          });
        } else {
          if (PassFF.Pass.isPasswordNameTaken(inputData.name)) {
            let confirmation = window.confirm(
              _("inputs_overwrite_password_prompt")
            );
            if (!confirmation) {
              return;
            }
          }
          addPassword(inputData)
            .then((result) => {
              if (result) {
                PassFF.refresh_all();
                browser.windows.getCurrent().then((win) => {
                  browser.windows.remove(win.id);
                });
              } else if (result === false) {
                window.alert(
                  _("errors_pass_execution_failed") + ":\n" + JSON.stringify(result)
                );
              }
            });
        }
      } catch (e) {
        window.alert(
          _("errors_unexpected_error") + ":\n" + e.name + ' ' + e.message
        );
      }
    };
  }

  document.querySelectorAll("label,p.text,option,button").forEach(function (el) {
      el.textContent = _(el.textContent);
  });

  document.getElementById("gen-password-length").value = PassFF.Preferences.defaultPasswordLength;
  document.getElementById("gen-include-symbols").checked = PassFF.Preferences.defaultIncludeSymbols;
  if (0 === PassFF.Preferences.preferInsert) {
      document.getElementById("tab0").setAttribute("checked", true);
  }

  let addValidations = [
    isPresent('name', _("errors_name_is_required")),
    isPresent('password', _("errors_password_is_required")),
    matches('password', 'passwordConfirmation', _("errors_password_confirmation_mismatch")),
  ];

  let genValidations = [
    isPresent('name', _("errors_name_is_required")),
  ];

  var onAddPassword = makePasswordAdder(
    addValidations,
    'add-errors-container',
    function () {
      return {
        name                 : document.getElementById('add-password-name').value,
        password             : document.getElementById('add-password').value,
        passwordConfirmation : document.getElementById('add-password-confirmation').value,
        additionalInfo       : document.getElementById('add-additional-info-insert').value,
      };
    },
    function (inputData) {
      return PassFF.Pass.addNewPassword(
        inputData.name, inputData.password, inputData.additionalInfo);
    }
  );

  var onGeneratePassword = makePasswordAdder(
    genValidations,
    'gen-errors-container',
    function () {
      return {
        name           : document.getElementById('gen-password-name').value,
        length         : document.getElementById('gen-password-length').value,
        includeSymbols : document.getElementById('gen-include-symbols').checked,
        additionalInfo : document.getElementById('add-additional-info-generate').value,
      };
    },
    function (inputData) {
      return PassFF.Pass.generateNewPassword(
        inputData.name, inputData.length, inputData.includeSymbols, inputData.additionalInfo);
    }
  );

  let saveButton = document.getElementById("save-button");
  saveButton.addEventListener('click', onAddPassword);
  let genSaveButton = document.getElementById("gen-save-button");
  genSaveButton.addEventListener('click', onGeneratePassword);

  PassFF.Pass.getAddPasswordContext().then((path) => {
    document.getElementById('add-password-name').value = path;
    document.getElementById('gen-password-name').value = path;
  });
}
