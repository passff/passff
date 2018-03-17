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
      password = passwordData[PassFF.Preferences.passwordFieldNames[i].toLowerCase()];
      if (password) break;
    }
    passwordData.password = password;
  }

  function setLogin(passwordData, item) {
    let login;
    for (let i = 0; i < PassFF.Preferences.loginFieldNames.length; i++) {
      login = passwordData[PassFF.Preferences.loginFieldNames[i].toLowerCase()];
      if (login) break;
    }
    passwordData.login = (!login) ? item.key : login;
  }

  function setUrl(passwordData) {
    let url;
    for (let i = 0; i < PassFF.Preferences.urlFieldNames.length; i++) {
      url = passwordData[PassFF.Preferences.urlFieldNames[i].toLowerCase()];
      if (url) break;
    }
    passwordData.url = url;
  }

  function setOther(passwordData) {
    let other = {};
    Object.keys(passwordData).forEach(function (key) {
      if (!isOtherField(key) || isLoginOrPasswordInputName(key)) {
        return;
      }
      other[key] = passwordData[key];
    });
    passwordData._other = other;
  }

  function setText(passwordData, fullText) {
    passwordData.fullText = fullText;
  }

  function isLoginField(name) {
    return PassFF.Preferences.loginFieldNames.indexOf(name) >= 0;
  }

  function isPasswordField(name) {
    return PassFF.Preferences.passwordFieldNames.indexOf(name) >= 0;
  }

  function isUrlField(name) {
    return PassFF.Preferences.urlFieldNames.indexOf(name) >= 0;
  }

  function isOtherField(name) {
    return !(isLoginField(name) || isPasswordField(name) || isUrlField(name));
  }

  function isLoginOrPasswordInputName(name) {
    return PassFF.Preferences.loginInputNames.indexOf(name) >= 0 ||
            PassFF.Preferences.passwordInputNames.indexOf(name) >= 0;
  }

// %%%%%%%%%%%%%%%%%%%%%%%%%% Data analysis %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  function getItemQuality(item, urlStr) {
    let url = new URL(urlStr);
    let hostGroupToMatch = url.host.replace(/^\.+/, '').replace(/\.+$/, '');
    let hostGroupToMatchSplit = hostGroupToMatch.split(/\.+/);
    let tldName = '';
    if (hostGroupToMatchSplit.length >= 2) {
      tldName = hostGroupToMatchSplit[hostGroupToMatchSplit.length - 1];
    }
    do {
      if (item.isField) break;
      let itemQuality = hostGroupToMatch.split(/\.+/).length * 100 + hostGroupToMatch.split(/\.+/).length;
      let hostToMatch = hostGroupToMatch;
      // Return if item has children since it is a directory!
      if (!item.isLeaf && !item.hasFields) break;
      do {
        if (hostToMatch == tldName) break;

        let regex = new RegExp(hostToMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        if (item.fullKey.search(regex) >= 0) {
          return {item: item, quality: itemQuality};
        }

        if (hostToMatch.indexOf('.') < 0) break;
        hostToMatch = hostToMatch.replace(/[^\.]+\.+/, '');
        itemQuality--;
      } while (true);
      if (hostGroupToMatch.indexOf('.') < 0) break;
      hostGroupToMatch = hostGroupToMatch.replace(/\.+[^\.]+$/, '');
    } while (true);
    return {item: null,  quality: -1};
  }

/* #############################################################################
 * #############################################################################
 *  Pass script interaction
 * #############################################################################
 */

  function getPassExecPromise(key) {
    if (!pendingRequests.hasOwnProperty(key)) {
      pendingRequests[key] = PassFF.Pass.executePass([key], {}, true)
        .then((result) => {
          delete pendingRequests[key];
          return result;
        });
    }
    return pendingRequests[key];
  }

// %%%%%%%%%%%%%%%%%%%% Helper for `pass` command environment %%%%%%%%%%%%%%%%%%

  function getEnvParams() {
    let params = { 'TREE_CHARSET': 'ISO-8859-1' };
    PassFF.Preferences.commandEnv.forEach((keyval) => {
        params[keyval[0]] = keyval[1];
    });
    return params;
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
      function (args, subprocessOverrides) {
        let result = null;
        let scriptArgs = [];
        let command = null;
        let environment = getEnvParams();

        command = PassFF.Preferences.command;
        PassFF.Preferences.commandArgs.forEach(function (val) {
          if (val && val.trim().length > 0) {
            scriptArgs.push(val);
          }
        });

        args.forEach(function (val) {
          scriptArgs.push(val);
        });

        let params = {
          command: command,
          arguments: scriptArgs,
          environment: environment,
          charset: PassFF.Preferences.shellCharset,
        };

        Object.assign(params, subprocessOverrides);
        return browser.runtime.sendNativeMessage("passff", params)
          .then((result) => {
            if (result.exitCode !== 0) {
              log.warn('Script execution failed',
                result.exitCode, result.stderr, result.stdout);
            } else {
              log.debug('Script execution ok');
            }
            return result;
          }, (ex) => {
            log.error('Error executing pass script', ex);
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
          if (result.exitCode !== 0) return;

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
      return this.executePass(['insert', '-m', name], {
        stdin: password + '\n' + additionalInfo + '\n'
      }).then((result) => {
        return result.exitCode === 0;
      });
    },

    generateNewPassword: function (name, length, includeSymbols) {
      let args = ['generate', name, length.toString()];
      if (!includeSymbols) {
        args.push('-n');
      }
      return this.executePass(args).then((result) => {
        return result.exitCode === 0;
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
