/* jshint node: true */
'use strict';

Cu.importGlobalProperties(['URL']);

let env = Components.classes["@mozilla.org/process/environment;1"].
          getService(Components.interfaces.nsIEnvironment);

let Item = function(depth, key, parent) {
  this.children = [];
  this.depth = depth;
  this.key = key;
  this.parent = parent;
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

PassFF.Pass = {
  _items: [],
  _rootItems: [],
  _promptService: Cc['@mozilla.org/embedcomp/prompt-service;1']
                 .getService(Components.interfaces.nsIPromptService),
  _stringBundle: null,

  init: function() {
    subprocess.registerDebugHandler(function(m) {
      log.debug('[subprocess]', m);
    });
    subprocess.registerLogHandler(function(m) {
      log.error('[subprocess]', m);
    });

    this.initItems();

    let stringBundleService = Cc['@mozilla.org/intl/stringbundle;1']
                             .getService(Ci.nsIStringBundleService);

    this._stringBundle = stringBundleService
                        .createBundle('chrome://passff/locale/strings.properties');
  },

  initItems: function() {
    let result = this.executePass([]);
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

      let item = new Item(curDepth, key, curParent);

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
  },

  getPasswordData: function(item) {
    let result = {};

    if (item.isLeaf()) { // multiline-style item
      let args = [item.fullKey()];
      let executionResult = this.executePass(args);
      let gpgDecryptFailed = executionResult.stderr
                             .indexOf('gpg: decryption failed: No secret key') >= 0;

      while (executionResult.exitCode !== 0 && gpgDecryptFailed) {
        let title = PassFF.gsfm('passff.passphrase.title');
        let desc = PassFF.gsfm('passff.passphrase.description');

        if (!PassFF.Pass._promptService.confirm(null, title, desc)) {
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
    } else { // hierarchical-style item
      item.children.forEach(function(child) {
        if (child.isField()) {
          result[child.key] = PassFF.Pass.getPasswordData(child).password;
        }
      });
    }

    PassFF.Pass.setLogin(result, item);
    PassFF.Pass.setPassword(result);

    return result;
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

  isLoginField: function(name) {
    return PassFF.Preferences.loginFieldNames.indexOf(name) >= 0;
  },

  isPasswordField: function(name) {
    return PassFF.Preferences.passwordFieldNames.indexOf(name) >= 0;
  },

  isUrlField: function(name) {
    return PassFF.Preferences.urlFieldNames.indexOf(name) >= 0;
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
    let hostGroupToMatch = url.host;
    let hostGroupToMatchSplit = hostGroupToMatch.split('\.');
    let tldName = '';
    if (hostGroupToMatchSplit.length >= 2) {
      tldName = hostGroupToMatchSplit[hostGroupToMatchSplit.length - 1];
    }
    do {
      let itemQuality = hostGroupToMatch.split('\.').length * 100 +
                        hostGroupToMatch.split('\.').length;
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

        let regex = new RegExp(hostToMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'),
                               'i');
        if (item.fullKey().search(regex) >= 0) {
          return {item: item, quality: itemQuality};
        }

        if (hostToMatch.indexOf('.') < 0) {
          break;
        }

        hostToMatch = hostToMatch.replace(/[^\.]+\./, '');
        itemQuality--;
      } while (true);

      if (hostGroupToMatch.indexOf('.') < 0) {
        break;
      }
      hostGroupToMatch = hostGroupToMatch.replace(/\.[^\.]+$/, '');

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

  executePass: function(args) {
    let result = null;
    let scriptArgs = [];
    let command = null;
    let environment = this.getEnvParams();

    if (PassFF.Preferences.callType == 'direct') {
      command = PassFF.Preferences.command;
      environment = environment.concat(this.getDirectEnvParams());
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
      mergeStderr: false,
      done: function(data) {
        result = data;
      }
    };

    log.debug('Execute pass', params);
    try {
      let p = subprocess.call(params);
      p.wait();
      if (result.exitCode !== 0) {
        log.warn('pass execution failed', result.exitCode, result.stderr, result.stdout);
      } else {
        log.info('pass script execution ok');
      }
    } catch (ex) {
      PassFF.Pass._promptService.alert(null, 'Error executing pass script', ex.message);
      log.error('Error executing pass script', ex);
      result = { exitCode: -1 };
    }
    return result;
  },

  getEnvParams: function() {
    return [
      'HOME=' + PassFF.Preferences.home,
      'DISPLAY=' + (env.exists('DISPLAY') ? env.get('DISPLAY') : ':0.0'),
      'TREE_CHARSET=ISO-8859-1',
      'GNUPGHOME=' + PassFF.Preferences.gnupgHome
    ];
  },

  getDirectEnvParams: function() {
    var params = ['PATH=' + PassFF.Preferences.path];

    if (PassFF.Preferences.storeDir.trim().length > 0) {
      params.push('PASSWORD_STORE_DIR=' + PassFF.Preferences.storeDir);
    }

    if (PassFF.Preferences.storeGit.trim().length > 0) {
      params.push('PASSWORD_STORE_GIT=' + PassFF.Preferences.storeGit);
    }

    if (PassFF.Preferences.gpgAgentEnv !== null) {
      params = params.concat(PassFF.Preferences.gpgAgentEnv);
    }

    return params;
  },

  get rootItems() {
    return this._rootItems;
  }
};
