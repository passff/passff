declare let browser: any;
import {PassFF, log} from './main';
import {Preferences} from './preferences';

export interface HostAppReturnValue {
  [key: string]: string | number
  exitCode: number
  stdout?: string
  stderr?: string
  other?: string
}

export interface Dict<V> {
  [key: string]: V
}

export interface ItemObject {
  id: number
  parent?: ItemObject
  isLeaf: boolean
  isField: boolean
  hasFields: boolean
  fullKey: string
  children: ItemObject[]
}

interface PasswordData extends Dict<string | Dict<string>> {
  login?: string
  password?: string
  fullText?: string
  _other?: Dict<string>
}

export class Item {

  children: Item[] = [];

  constructor(public depth: number, public key: string, public parent: Item, public id: number) {
    this.key = key.replace(/\.gpg$/, '');
  }

  isLeaf(): boolean {
    return this.children.length === 0;
  }

  hasFields(): boolean {
    return this.children.some(function (element) {
      return element.isField();
    });
  }

  isField(): boolean {
    return this.isLeaf() && (Pass.isLoginField(this.key) ||
      Pass.isPasswordField(this.key) ||
      Pass.isUrlField(this.key));
  }

  fullKey() {
    let fullKey = this.key;
    let loopParent = this.parent;
    while (loopParent !== null) {
      fullKey = loopParent.key + '/' + fullKey;
      loopParent = loopParent.parent;
    }
    return fullKey;
  }

  toObject(export_children: boolean): ItemObject {
    let children: ItemObject[] = [];
    if (export_children) {
      children = this.children.map(function (c) {
        return c.toObject(false);
      });
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
  }
}


export class Pass {

  static _items: Item[] = [];
  static _rootItems: Item[] = [];

  static env = class {
    static _environment: Dict<string> = {};

    static exists(key: string) {
      return this._environment.hasOwnProperty(key);
    }

    static get(key: string) {
      if (this.exists(key)) return this._environment[key];
      else return "";
    }
  };

  static init_env() {
    return browser.runtime.sendNativeMessage("passff", {command: "env"})
      .then((result: Dict<string>) => {
        Pass.env._environment = result;
      });
  }

  static init() {
    return this.init_env().then(() => {
      return Pass.initItems();
    });
  }

  static initItems() {
    return this.executePass([]).then(((result: HostAppReturnValue) => {
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

        let item: Item = new Item(curDepth, key, curParent, this._items.length);

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
  }

  static getPasswordData(item: Item): Promise<Dict<string>> {
    let result: Dict<string> = {};

    if (item.isLeaf()) { // multiline-style item
      let args = [item.fullKey()];
      return this.executePass(args).then((executionResult) => new Promise((resolve, reject) => {
        let gpgDecryptFailed = executionResult.stderr
            .indexOf('gpg: decryption failed: No secret key') >= 0;

        while (executionResult.exitCode !== 0 && gpgDecryptFailed) {
          let title = PassFF.gsfm('passff.passphrase.title');
          let desc = PassFF.gsfm('passff.passphrase.description');
          /* We skip this for now since we don't have 'window.confirm' ...
           if (!window.confirm(title + "\n" + desc)) {
           return;
           }

           executionResult = Pass.executePass(args);
           */
        }

        if (executionResult.exitCode !== 0) {
          reject("pass exection failed");
        }

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

        Pass.setLogin(result, item);
        Pass.setPassword(result);
        Pass.setOther(result);
        Pass.setText(result, executionResult.stdout);
        resolve(result);
      }));
    } else { // hierarchical-style item
      let promised_results = new Array(item.children.length);
      for (let i = 0; i < item.children.length; i++) {
        let child = item.children[i];
        if (child.isField()) {
          promised_results[i] = Pass.getPasswordData(child);
        } else {
          promised_results[i] = Promise.resolve();
        }
      }
      return Promise.all(promised_results).then(function (results) {
        let result: Dict<string> = {};
        for (let i = 0; i < item.children.length; i++) {
          let child = item.children[i];
          if (child.isField()) {
            result[child.key] = results[i].password;
          }
        }
        Pass.setLogin(result, item);
        Pass.setPassword(result);
        Pass.setOther(result);
        return result;
      });
    }
  }

  static setPassword(passwordData: PasswordData) {
    let password;
    for (let i = 0; i < Preferences.passwordFieldNames.length; i++) {
      password = <string>passwordData[Preferences.passwordFieldNames[i].toLowerCase()];
      if (password) {
        break;
      }
    }
    passwordData.password = password;
  }

  static setLogin(passwordData: PasswordData, item: Item) {
    let login;
    for (let i = 0; i < Preferences.loginFieldNames.length; i++) {
      login = <string>passwordData[Preferences.loginFieldNames[i].toLowerCase()];
      if (login) {
        break;
      }
    }
    if (!login) {
      login = item.key;
    }
    passwordData.login = login;
  }

  static setOther(passwordData: PasswordData) {
    let other: Dict<string> = {};
    Object.keys(passwordData).forEach(function (key) {
      if (!Pass.isOtherField(key) || Pass.isLoginOrPasswordInputName(key)) {
        return;
      }
      other[key] = <string>passwordData[key];
    });
    passwordData._other = other;
  }

  static setText(passwordData: PasswordData, fullText: string) {
    passwordData.fullText = fullText;
  }

  static isLoginField(name: string) {
    return Preferences.loginFieldNames.indexOf(name) >= 0;
  }

  static isPasswordField(name: string) {
    return Preferences.passwordFieldNames.indexOf(name) >= 0;
  }

  static isUrlField(name: string) {
    return Preferences.urlFieldNames.indexOf(name) >= 0;
  }

  static isOtherField(name: string) {
    return !(Pass.isLoginField(name) || Pass.isPasswordField(name) || Pass.isUrlField(name));
  }

  static isLoginOrPasswordInputName(name: string) {
    return Preferences.loginInputNames.indexOf(name) >= 0 ||
      Preferences.passwordInputNames.indexOf(name) >= 0;
  }

  static getMatchingItems(search: string, limit: number) {
    let searchRegex = '';

    for (let i = 0; i < search.length; i++) {
      searchRegex += search.charAt(i) + '.*';
    }

    let BreakException = {};
    let matches: Item[] = [];

    try {
      this._items.forEach(function (item) {
        let flags = Preferences.caseInsensitiveSearch ? 'i' : '';
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
  }

  static getUrlMatchingItems(urlStr: string) {
    let url = new URL(urlStr);
    log.debug('Search items for:', url);

    let matchingItems = this._items.map(function (item) {
      return Pass.getItemQuality(item, urlStr);
    }).filter(function (item) {
      return item.quality >= 0;
    }).sort(function (item1, item2) {
      return item2.quality - item1.quality;
    }).map(function (item) {
      return item.item;
    });

    log.debug('Matching items:', matchingItems);

    return matchingItems;
  }

  static getItemQuality(item: Item, urlStr: string) {
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

    return {item: null, quality: -1};
  }

  static findBestFitItem(items: Item[], urlStr: string) {
    let url = new URL(urlStr);

    if (items.length === 0) {
      return null;
    }

    let bestItem = items[0];
    let bestQuality = -1;

    items.forEach(function (curItem) {
      if (curItem.isLeaf()) {
        return;
      }

      let curQuality = Pass.getItemQuality(curItem, urlStr);

      if (curQuality.quality > bestQuality && curItem.key.length > bestItem.key.length) {
        bestItem = curItem;
        bestQuality = curQuality.quality;
      }
    });

    log.debug('Best fit item', bestItem);

    return bestItem;
  }

  static getItemsLeafs(items: Item[]) {
    let leafs: Item[] = [];
    items.forEach(function (item) {
      leafs = leafs.concat(Pass.getItemLeafs(item));
    });
    return leafs;
  }

  static getItemLeafs(item: Item) {
    let leafs: Item[] = [];

    if (item.isLeaf()) {
      if (!item.isField()) {
        leafs.push(item);
      }
    } else {
      item.children.forEach(function (child) {
        leafs = leafs.concat(Pass.getItemLeafs(child));
      });
    }

    return leafs;
  }

  static isPasswordNameTaken(name: string) {
    name = name.replace(/^\//, '');
    for (let item of this._items) {
      if (item.fullKey() === name) {
        log.debug("Password name " + name + " already taken.");
        return true;
      }
    }
    return false;
  }

  static addNewPassword(name: string, password: string, additionalInfo: string) {
    let fileContents = [password, additionalInfo].join('\n');
    return this.executePass(['insert', '-m', name], {
      stdin: password + '\n' + additionalInfo + '\n'
    }).then((result) => {
      return result.exitCode === 0;
    });
  }

  static generateNewPassword(name: string, length: number, includeSymbols: boolean) {
    let args = ['generate', name, length.toString()];
    if (!includeSymbols) {
      args.push('-n');
    }
    return this.executePass(args).then((result) => {
      log.debug(result);
      return result.exitCode === 0;
    });
  }

  static executePass(args: string[] = [], subprocessOverrides = {}): Promise<HostAppReturnValue> {
    let result = null;
    let scriptArgs: string[] = [];
    let command = null;
    let environment = this.getEnvParams();

    if (Preferences.callType == 'direct') {
      command = Preferences.command;
      Object.assign(environment, this.getDirectEnvParams());
      Preferences.commandArgs.forEach(function (val) {
        if (val && val.trim().length > 0) {
          scriptArgs.push(val);
        }
      });

      args.forEach(function (val) {
        scriptArgs.push(val);
      });
    } else { // through shell
      command = Preferences.shell;
      let passCmd = Preferences.command;
      Preferences.commandArgs.forEach(function (val) {
        if (val && val.trim().length > 0) {
          passCmd += ' ' + val;
        }
      });
      args.forEach(function (val) {
        passCmd += ' ' + val;
      });
      Preferences.shellArgs.forEach(function (val) {
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
    return browser.runtime.sendNativeMessage("passff", params).then((result: HostAppReturnValue) => {
      if (result.exitCode !== 0) {
        PassFF.alert('pass execution failed!' + "\n" + result.stderr + "\n" + result.stdout);
        log.warn('pass execution failed', result.exitCode, result.stderr, result.stdout);
      } else {
        log.info('pass script execution ok');
      }
      return result;
    }, (ex: any) => {
      log.error('Error executing pass script', ex);
      PassFF.alert('Error executing pass script' + "\n" + ex.message);
      return {exitCode: -1};
    });
  }

  static getEnvParams() {
    return {
      'HOME': Preferences.home,
      'DISPLAY': (Pass.env.exists('DISPLAY') ? Pass.env.get('DISPLAY') : ':0.0'),
      'TREE_CHARSET': 'ISO-8859-1',
      'GNUPGHOME': Preferences.gnupgHome
    };
  }

  static getDirectEnvParams() {
    var params: Dict<string> = {'PATH': Preferences.path};

    if (Preferences.storeDir.trim().length > 0) {
      params['PASSWORD_STORE_DIR'] = Preferences.storeDir;
    }

    if (Preferences.storeGit.trim().length > 0) {
      params['PASSWORD_STORE_GIT'] = Preferences.storeGit;
    }

    if (Preferences.gpgAgentEnv !== null) {
      Object.assign(params, Preferences.gpgAgentEnv);
    }

    return params;
  }

  static getItemById(id: number) {
    if (id >= this._items.length) {
      return null;
    } else {
      return this._items[id];
    }
  }

  static get rootItems() {
    return this._rootItems;
  }

}
