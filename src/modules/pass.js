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
  var displayItem = null;
  var pendingRequests = {};

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
      if (login) break;
    }
    passwordData.login = (!login) ? item.key : login;
  }

  function setUrl(passwordData) {
    let url;
    for (let i = 0; i < PassFF.Preferences.urlFieldNames.length; i++) {
      url = passwordData[PassFF.Preferences.urlFieldNames[i]];
      if (url) break;
    }
    passwordData.url = url;
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

  function isOtherField(name) {
    return !(isLoginField(name) || isPasswordField(name) || isUrlField(name));
  }

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data analysis %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  let host_part_blacklist = ["www","login","accounts","edu","blog"];

  function hostMatchQuality(item, host) {
    /* Match quality is ranked based on host parts contained in item.fullKey:
     *
     *  'cloud.bob.usr.example.com' > 'bob.usr.example.com' > 'usr.example.com' > 'example.com' \
     *    > 'cloud.bob.usr.example' > 'bob.usr.example' > 'usr.example' > 'example' \
     *    > 'cloud.bob.usr' > 'bob.usr' > 'usr'
     *    > 'bob.usr' > 'usr'
     *    > 'bob'
     *
     * The last part of the domain name (here: 'com') is considered to be a tld
     * and *not* matched *alone*. Same applies to very short (less than 3 chars)
     * and some very generic parts like "www"
     */
    host = host.replace(/^\.+/, '').replace(/\.+$/, '');
    let host_parts = host.split(/\.+/);
    let tld = (host_parts.length >= 2) ? host_parts[host_parts.length-1] : "";
    do {
      // check a.b.c.d, then a.b.c, then a.b, ...
      let quality = host.split(/\.+/).length*100 + host.split(/\.+/).length;
      let subhost = host;
      do {
        // check a.b.c.d, then b.c.d, then c.d, ...
        if (subhost.length < 3 || subhost == tld
            || host_part_blacklist.indexOf(subhost) >= 0) break;

        let regex = new RegExp(subhost.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        if (item.fullKey.search(regex) >= 0) return quality;

        if (subhost.indexOf('.') < 0) break;
        subhost = subhost.replace(/[^\.]+\.+/, '');
        quality--;
      } while (true);
      if (host.indexOf('.') < 0) break;
      host = host.replace(/\.+[^\.]+$/, '');
    } while (true);
    return -1;
  }

  function pathMatchQuality(item, path) {
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');
    let parts = path.split(/\/+/);
    return parts.map((part) => part.replace(/\.(html|php|jsp|cgi|asp)$/, ""))
      .filter((part) => (part.length > 2))
      .filter((part) => (item.fullKey.search(part) >= 0)).length;
  }

  function queryMatchQuality(item, query) {
    query = query.replace(/^\?/, '').replace(/&$/, '');
    let parts = query.split(/[&=]+/);
    return parts.filter((part) => (part.length > 2))
      .filter((part) => (item.fullKey.search(part) >= 0)).length;
  }

  function getItemQuality(item, urlStr) {
    if (item.isField || (!item.isLeaf && !item.hasFields)) {
      return {item: null,  quality: -1};
    }
    let url = new URL(urlStr);
    let quality = 100*hostMatchQuality(item, url.host);
    if (quality <= 0) return { item: null,  quality: -1 };
    quality += pathMatchQuality(item, url.pathname);
    quality *= 100;
    quality += queryMatchQuality(item, url.search);
    return { item: item, quality: quality };
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
          if (PassFF.mode !== "background") contextItems = items[2];
          if (PassFF.mode === "itemMonitor") {
            let passOutputEl = document.getElementsByTagName("pre")[0];
            let restOutputEl = document.getElementsByTagName("pre")[1];
            document.querySelector("div:first-child > span").textContent
              = _("passff_display_hover");
            this.getDisplayItem()
              .then((passwordData) => {
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
            if (["insert","generate"].indexOf(args[0]) >= 0) {
                command = args[0];
            } else {
                command = "show";
            }
        }
        return browser.runtime.sendNativeMessage("passff", args)
          .then((result) => {
            let version = result.version || "0.0";
            if (version !== "1.0.1" && version !== "testing") {
              log.warn("The host app is outdated!", version);
              result.exitCode = -2;
            } else if (result.exitCode !== 0) {
              log.warn('Script execution failed',
                result.exitCode, result.stderr, result.stdout);
              PassFF.Page.notify("Script execution failed: \n" + result.stderr);
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
            log.error('Error executing pass script', ex);
            PassFF.Menu.state.lastResult = {
              'timestamp': new Date(),
              'stderr': "",
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
      if (!reload) return [allItems, rootItems, contextItems];
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
                                           || isUrlField(item.key));
            item.hasFields = item.children.some(c => allItems[c].isField);
          });

          return [allItems, rootItems];
        });
    }),

    loadContextItems: function (url) {
      contextItems = this.getUrlMatchingItems(url);
      if (contextItems.length === 0) {
        contextItems = rootItems;
      }
    },

    getPasswordData: function (item, meta2leaf) {
      let result = {};
      meta2leaf = meta2leaf || false;
      if (item.hasFields) { // hierarchical-style item
        let promised_results = item.children.map(c => {
            let child = this.getItemById(c);
            if (child.isField) {
              return this.getPasswordData(child);
            } else {
              return Promise.resolve(null);
            }
          });
        return Promise.all(promised_results).then((results) => {
          if (typeof results[0] === "undefined") return;
          let result = {};
          for (let i = 0; i < item.children.length; i++) {
            let child = this.getItemById(item.children[i]);
            if (child.isField) {
              result[child.key] = results[i].password;
            }
          }
          setLogin(result, item);
          setPassword(result);
          setUrl(result);
          setOther(result);
          return result;
        });
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

            if (noFields && lines.length > 1) {
                result.login = lines[1];
            }

            setLogin(result, item);
            setPassword(result);
            setUrl(result);
            setOther(result);
            setText(result, executionResult.stdout);
            return result;
          });
      }
    },

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data filtering %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    getMatchingItems: function (search, limit) {
      let searchRegex = '';

      for (let i = 0; i < search.length; i++) {
        searchRegex += search.charAt(i) + '.*';
      }

      let BreakException = {};
      let matches = [];

      try {
        allItems.forEach(function (item) {
          let flags = PassFF.Preferences.caseInsensitiveSearch ? 'i' : '';
          let regex = new RegExp(searchRegex, flags);

          if ((item.isLeaf || item.hasFields) && item.fullKey.search(regex) >= 0) {
            matches.push(item);
          }

          if (matches.length == limit) {
            throw BreakException;
          }
        });
      } catch (e) {
        if (e !== BreakException) {
          throw e;
        }
      }
      return matches;
    },

    getUrlMatchingItems: function (urlStr) {
      let url = new URL(urlStr);
      let matchingItems = allItems
        .map(i => getItemQuality(i, urlStr))
        .filter(i => (i.quality >= 0))
        .sort((i1,i2) => (i2.quality - i1.quality))
        .map(i => i.item);
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
      return this.executePass(['insert', name, fileContents])
        .then((result) => { return result.exitCode === 0; });
    },

    generateNewPassword: function (name, length, includeSymbols) {
      let args = ['generate', name, length.toString()];
      if (!includeSymbols) {
        args.push('-n');
      }
      return this.executePass(args)
        .then((result) => { return result.exitCode === 0; });
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
              'url': browser.extension.getURL('/content/itemMonitor.html'),
              'width': 640,
              'height': 251,
              'type': 'popup',
            })
            .then((win) => {
              return browser.windows.update(win.id, { height: 250 });
            });
        });
    }),

    getDisplayItem: background_function("Pass.getDisplayItem", () => {
      return displayItem;
    }),

/* #############################################################################
 * #############################################################################
 *  Implementation of the 'new password' feature's UI
 * #############################################################################
 */

    newPasswordUI: background_function("Pass.newPasswordUI", () => {
      return browser.windows.create({
        'url': browser.extension.getURL('/content/passwordGenerator.html'),
        'width': 640,
        'height': 481,
        'type': 'popup'
      })
      .then((win) => {
        return browser.windows.update(win.id, { height: 480 });
      });
    }),
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

  function makePasswordAdder(validations, errorsContainerId, getInput, addPassword) {
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
        additionalInfo       : document.getElementById('add-additional-info').value,
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
      };
    },
    function (inputData) {
      return PassFF.Pass.generateNewPassword(
        inputData.name, inputData.length, inputData.includeSymbols);
    }
  );

  let saveButton = document.getElementById("save-button");
  saveButton.addEventListener('click', onAddPassword);
  let genSaveButton = document.getElementById("gen-save-button");
  genSaveButton.addEventListener('click', onGeneratePassword);
}
