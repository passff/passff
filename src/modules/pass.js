/* jshint node: true */
'use strict';

let Item = function(depth, key, parent, id) {
  this.children = [];
  this.depth = depth;
  this.key = key.replace(/\.gpg$/, '');
  this.parent = parent;
  this.id = id;
};

Item.prototype.isLeaf = function() {
  return this.children.length === 0;
};

Item.prototype.hasFields = function() {
  return this.children.some(function (element) {
    return element.isField();
  });
};

Item.prototype.isField = function() {
  return this.isLeaf() && (PassFF.Pass.isLoginField(this.key) ||
                           PassFF.Pass.isPasswordField(this.key) ||
                           PassFF.Pass.isUrlField(this.key));
};

Item.prototype.fullKey = function() {
  let fullKey = this.key;
  let loopParent = this.parent;
  while (loopParent !== null) {
    fullKey = loopParent.key + '/' + fullKey;
    loopParent = loopParent.parent;
  }
  return fullKey;
};

Item.prototype.toObject = function(export_children) {
  let children = [];
  if (export_children) {
    children = this.children.map(function (c) { return c.toObject(false); });
  }
  return {
    id: this.id,
    parent: (this.parent === null) ? null : this.parent.toObject(false),
    isLeaf: this.isLeaf(),
    isField: this.isField(),
    hasFields: this.hasFields(),
    fullKey: this.fullKey(),
    children: children
  };
};

PassFF.Pass = {
  _items: [],
  _rootItems: [],
  _stringBundle: null,

  env: {
    _environment: {},
    exists: function (key) { return this._environment.hasOwnProperty(key); },
    get: function (key) {
      if (this.exists(key)) return this._environment[key];
      else return "";
    }
  },

  init_env: function () {
    return browser.runtime.sendNativeMessage("passff", { command: "env" })
      .then((result) => { PassFF.Pass.env._environment = result; });
  },

  init: function() {
    return this.init_env().then(() => {
      return PassFF.Pass.initItems();
    });
  },

  initItems: function() {
    return this.executePass([]).then(((result) => {
    if (result.exitCode !== 0) {
      return;
    }

    this._rootItems = [];
    this._items = [];

    let stdout = result.stdout;
    // replace utf8 box characters with traditional ascii tree
    stdout = stdout.replace(/[\u2514\u251C]\u2500\u2500/g, '|--');
    //remove colors
    stdout = stdout.replace(/\x1B\[[^m]*m/g, '');

    let lines = stdout.split('\n');
    let re = /(.*[|`;])+-- (.*)/;
    let curParent = null;

    for (let i = 0; i < lines.length; i++) {
      let match = re.exec(lines[i]);

      if (!match) {
        continue;
      }

      let curDepth = (match[1].replace('&middot;', '`').length - 1) / 4;
      let key = match[2].replace(/\\ /g, ' ').replace(/ -> .*/g, '');

      while (curParent !== null && curParent.depth >= curDepth) {
        curParent = curParent.parent;
      }

      let item = new Item(curDepth, key, curParent, this._items.length);

      if (curParent !== null) {
        curParent.children.push(item);
      }

      curParent = item;
      this._items.push(item);

      if (item.depth === 0) {
        this._rootItems.push(item);
      }
    }
    log.debug('Found Items', this._rootItems);
    }).bind(this));
  },

  getPasswordData: function(item) {
    let result = {};

    if (item.isLeaf()) { // multiline-style item
      let args = [item.fullKey()];
      return this.executePass(args).then((executionResult) => {
      let gpgDecryptFailed = executionResult.stderr
                             .indexOf('gpg: decryption failed: No secret key') >= 0;

      while (executionResult.exitCode !== 0 && gpgDecryptFailed) {
        let title = PassFF.gsfm('passff.passphrase.title');
        let desc = PassFF.gsfm('passff.passphrase.description');

        if (!window.confirm(title + "\n" + desc)) {
          return;
        }

        executionResult = PassFF.Pass.executePass(args);
      }

      if (executionResult.exitCode !== 0) {
        return;
      }

      let lines = executionResult.stdout.split('\n');
      result.password = lines[0];

      for (let i = 1; i < lines.length; i++) {
        let line = lines[i];
        let splitPos = line.indexOf(':');

        if (splitPos >= 0) {
          let attributeName = line.substring(0, splitPos).toLowerCase();
          let attributeValue = line.substring(splitPos + 1);
          result[attributeName] = attributeValue.trim();
        }
      }

      PassFF.Pass.setLogin(result, item);
      PassFF.Pass.setPassword(result);
      PassFF.Pass.setOther(result);
      PassFF.Pass.setText(result, executionResult.stdout);
      return result;
      });
    } else { // hierarchical-style item
      item.children.forEach(function(child) {
        if (child.isField()) {
          result[child.key] = PassFF.Pass.getPasswordData(child).password;
        }
      });
      return Promise.all(result).then(function (results) {
      let result = {};
      for (let i = 0; i < item.children.length; i++) {
        let child = item.children[i];
        if (child.isField()) {
          result[child.key] = results[i].password;
        }
      }
      PassFF.Pass.setLogin(result, item);
      PassFF.Pass.setPassword(result);
      PassFF.Pass.setOther(result);
      return result;
      });
    }
  },

  setPassword: function(passwordData) {
    let password;
    for (let i = 0; i < PassFF.Preferences.passwordFieldNames.length; i++) {
      password = passwordData[PassFF.Preferences.passwordFieldNames[i].toLowerCase()];
      if (password) {
        break;
      }
    }
    passwordData.password = password;
  },

  setLogin: function(passwordData, item) {
    let login;
    for (let i = 0; i < PassFF.Preferences.loginFieldNames.length; i++) {
      login = passwordData[PassFF.Preferences.loginFieldNames[i].toLowerCase()];
      if (login) {
        break;
      }
    }
    if (!login) {
      login = item.key;
    }
    passwordData.login = login;
  },

  setOther: function(passwordData) {
    let other = {};
    Object.keys(passwordData).forEach(function(key) {
      if (!PassFF.Pass.isOtherField(key) || PassFF.Pass.isLoginOrPasswordInputName(key)) {
        return;
      }
      other[key] = passwordData[key];
    });
    passwordData._other = other;
  },

  setText: function(passwordData, fullText) {
    passwordData.fullText = output;
  },

  isLoginField: function(name) {
    return PassFF.Preferences.loginFieldNames.indexOf(name) >= 0;
  },

  isPasswordField: function(name) {
    return PassFF.Preferences.passwordFieldNames.indexOf(name) >= 0;
  },

  isUrlField: function(name) {
    return PassFF.Preferences.urlFieldNames.indexOf(name) >= 0;
  },

  isOtherField: function(name) {
    return !(PassFF.Pass.isLoginField(name) || PassFF.Pass.isPasswordField(name) || PassFF.Pass.isUrlField(name));
  },

  isLoginOrPasswordInputName: function(name) {
    return PassFF.Preferences.loginInputNames.indexOf(name) >= 0 ||
            PassFF.Preferences.passwordInputNames.indexOf(name) >= 0;
  },

  getMatchingItems: function(search, limit) {
    let searchRegex = '';

    for (let i = 0; i < search.length; i++) {
      searchRegex += search.charAt(i) + '.*';
    }

    let BreakException = {};
    let matches = [];

    try {
      this._items.forEach(function(item) {
        let flags = PassFF.Preferences.caseInsensitiveSearch ? 'i' : '';
        let regex = new RegExp(searchRegex, flags);

        if ((item.isLeaf() || item.hasFields()) && item.fullKey().search(regex) >= 0) {
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

  getUrlMatchingItems: function(urlStr) {
    let url = new URL(urlStr);
    log.debug('Search items for:', url);

    let matchingItems = this._items.map(function(item) {
      return PassFF.Pass.getItemQuality(item, urlStr);
    }).filter(function(item) {
      return item.quality >= 0;
    }).sort(function(item1, item2) {
      return item2.quality - item1.quality;
    }).map(function(item) {
      return item.item;
    });

    log.debug('Matching items:', matchingItems);

    return matchingItems;
  },

  getItemQuality: function(item, urlStr) {
    let url = new URL(urlStr);
    let hostGroupToMatch = url.host.replace(/^\.+/, '').replace(/\.+$/, '');
    let hostGroupToMatchSplit = hostGroupToMatch.split('\.+');
    let tldName = '';
    if (hostGroupToMatchSplit.length >= 2) {
      tldName = hostGroupToMatchSplit[hostGroupToMatchSplit.length - 1];
    }
    do {
      let itemQuality = hostGroupToMatch.split('\.+').length * 100 + hostGroupToMatch.split('\.+').length;
      let hostToMatch = hostGroupToMatch;
      /*
       * Return if item has children since it is a directory!
       */
      if (!item.isLeaf()) {
          break;
      }
      do {
        if (hostToMatch == tldName) {
          break;
        }

        let regex = new RegExp(hostToMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        if (item.fullKey().search(regex) >= 0) {
          return {item: item, quality: itemQuality};
        }

        if (hostToMatch.indexOf('.') < 0) {
          break;
        }

        hostToMatch = hostToMatch.replace(/[^\.]+\.+/, '');
        itemQuality--;
      } while (true);

      if (hostGroupToMatch.indexOf('.') < 0) {
        break;
      }
      hostGroupToMatch = hostGroupToMatch.replace(/\.+[^\.]+$/, '');

    } while (true);

    return {item: null,  quality: -1};
  },

  findBestFitItem: function(items, urlStr) {
    let url = new URL(urlStr);

    if (items.length === 0) {
      return null;
    }

    let bestItem = items[0];
    let bestQuality = -1;

    items.forEach(function(curItem) {
      if (curItem.isLeaf()) {
        return;
      }

      let curQuality = PassFF.Pass.getItemQuality(curItem, urlStr);

      if (curQuality.quality > bestQuality && curItem.key.length > bestItem.key.length) {
        bestItem = curItem;
        bestQuality = curQuality.quality;
      }
    });

    log.debug('Best fit item', bestItem);

    return bestItem;
  },

  getItemsLeafs: function(items) {
    let leafs = [];
    items.forEach(function(item) {
      leafs = leafs.concat(PassFF.Pass.getItemLeafs(item));
    });
    return leafs;
  },

  getItemLeafs: function(item) {
    let leafs = [];

    if (item.isLeaf()) {
      if (!item.isField()) {
        leafs.push(item);
      }
    } else {
      item.children.forEach(function(child) {
        leafs = leafs.concat(PassFF.Pass.getItemLeafs(child));
      });
    }

    return leafs;
  },

  isPasswordNameTaken: function(name) {
    name = name.replace(/^\//, '');
    for (let item of this._items) {
      if (item.fullKey() === name) {
        log.debug("Password name " + name + " already taken.");
        return true;
      }
    }
    return false;
  },

  addNewPassword: function(name, password, additionalInfo) {
    let fileContents = [password, additionalInfo].join('\n');
    return this.executePass(['insert', '-m', name], {
      stdin: password + '\n' + additionalInfo + '\n'
    }).then((result) => {
      return result.exitCode === 0;
    });
  },

  generateNewPassword: function(name, length, includeSymbols) {
    let args = ['generate', name, length.toString()];
    if (!includeSymbols) {
      args.push('-n');
    }
    return this.executePass(args).then((result) => {
      log.debug(result);
      return result.exitCode === 0;
    });
  },

  executePass: function(args, subprocessOverrides) {
    let result = null;
    let scriptArgs = [];
    let command = null;
    let environment = this.getEnvParams();

    if (PassFF.Preferences.callType == 'direct') {
      command = PassFF.Preferences.command;
      Object.assign(environment, this.getDirectEnvParams());
      PassFF.Preferences.commandArgs.forEach(function(val) {
        if (val && val.trim().length > 0) {
          scriptArgs.push(val);
        }
      });

      args.forEach(function(val) {
        scriptArgs.push(val);
      });
    } else { // through shell
      command = PassFF.Preferences.shell;
      let passCmd = PassFF.Preferences.command;
      PassFF.Preferences.commandArgs.forEach(function(val) {
        if (val && val.trim().length > 0) {
          passCmd += ' ' + val;
        }
      });
      args.forEach(function(val) {
        passCmd += ' ' + val;
      });
      PassFF.Preferences.shellArgs.forEach(function(val) {
        if (val && val.trim().length > 0) {
          scriptArgs.push(val);
        }
      });
      scriptArgs.push('-c');
      scriptArgs.push(passCmd.trim());
    }

    let params = {
      command: command,
      arguments: scriptArgs,
      environment: environment,
      charset: 'UTF-8',
      mergeStderr: false
    };

    Object.assign(params, subprocessOverrides);

    log.debug('Execute pass', params);
    return browser.runtime.sendNativeMessage("passff", params).then((result) => {
      if (result.exitCode !== 0) {
        log.warn('pass execution failed', result.exitCode, result.stderr, result.stdout);
      } else {
        log.info('pass script execution ok');
      }
      return result;
    }, (ex) => {
      log.error('Error executing pass script', ex);
      PassFF.alert('Error executing pass script' + "\n" + ex.message);
      return { exitCode: -1 };
    });
  },

  getEnvParams: function() {
    return {
      'HOME': PassFF.Preferences.home,
      'DISPLAY': (PassFF.Pass.env.exists('DISPLAY') ? PassFF.Pass.env.get('DISPLAY') : ':0.0'),
      'TREE_CHARSET': 'ISO-8859-1',
      'GNUPGHOME': PassFF.Preferences.gnupgHome
    };
  },

  getDirectEnvParams: function() {
    var params = { 'PATH': PassFF.Preferences.path };

    if (PassFF.Preferences.storeDir.trim().length > 0) {
      params['PASSWORD_STORE_DIR'] = PassFF.Preferences.storeDir;
    }

    if (PassFF.Preferences.storeGit.trim().length > 0) {
      params['PASSWORD_STORE_GIT'] = PassFF.Preferences.storeGit;
    }

    if (PassFF.Preferences.gpgAgentEnv !== null) {
      Object.assign(params, PassFF.Preferences.gpgAgentEnv);
    }

    return params;
  },

  getItemById: function (id) {
    if (id >= this._items.length) {
      return null;
    } else {
      return this._items[id];
    }
  },

  get rootItems() {
    return this._rootItems;
  }
};
