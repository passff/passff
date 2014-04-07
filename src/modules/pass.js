var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://passff/common.js");
Cu.import("resource://passff/preferences.js");
Cu.import("resource://passff/subprocess/subprocess.jsm");

const consoleJSM = Cu.import("resource://gre/modules/devtools/Console.jsm", {});

PassFF.Pass = {
  _console : Cu.import("resource://gre/modules/devtools/Console.jsm", {}).console,
  _items : [],
  _rootItems : [],
  _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),
  _stringBundle : null,
  //_pp : null,

  getPasswordData : function(item) {
    let args = new Array();
    args.push(item.fullKey());
    let executionResult = this.executePass(args);
    while (executionResult.exitCode != 0 && executionResult.stderr.indexOf("gpg: decryption failed: No secret key") >= 0) {
      let title = PassFF.Pass._stringBundle.GetStringFromName("passff.passphrase.title");
      let desc = PassFF.Pass._stringBundle.GetStringFromName("passff.passphrase.description");
      if(!PassFF.Pass._promptService.confirm(null, title, desc)) return;
      executionResult = PassFF.Pass.executePass(args);
    }
    if (executionResult.exitCode != 0) {
       PassFF.Pass._promptService.alert(null, "Error", executionResult.stderr);
      return;
    }
    let lines = executionResult.stdout.split("\n");
    let result = {};
    result.password = lines[0];
    for (let i = 1 ; i < lines.length; i++) {
      let line = lines[i];
      let splitPos = line.indexOf(":");
      if (splitPos >= 0) {
        let attributeName = line.substring(0, splitPos).toLowerCase();
        let attributeValue = line.substring(splitPos + 1)
        result[attributeName] = attributeValue.trim();
      }
    }
    result.login = PassFF.Pass.searchLogin(result);

    return result;
  },

  searchLogin : function(passwordData) {
    //console.log(JSON.stringify(passwordData));
    for(let i = 0 ; i < PassFF.Preferences.loginFieldNames.length; i++) {
      let login = passwordData[PassFF.Preferences.loginFieldNames[i].toLowerCase()];
      if (login != undefined) return login;
    }
    return null;
  },

  initItems : function() {
    let result = this.executePass([]);
    if (result.exitCode != 0) return;
  
    let stdout = result.stdout;
    this._rootItems = [];
    this._items = [];
    this._console.debug("[PassFF]", stdout);
    let lines = stdout.split("\n");
    let re = /(.*[|`])+-- (.*)/;
    let curParent = null;
    for(let i = 0 ; i < lines.length; i++) {
      let match = re.exec(lines[i]);
      if(match != null) {
        let curDepth = (match[1].length - 1) / 4;
        while (curParent != null && curParent.depth >= curDepth) {
          curParent = curParent.parent;
        }
        let item = {
          depth : curDepth,
          key : match[2],
          children : new Array(),
          parent : curParent,
          isLeaf : function() { return this.children.length == 0; },
          fullKey : function() {
            let fullKey = this.key;
            let loopParent = this.parent;
            while (loopParent != null) {
              fullKey = loopParent.key + "/" + fullKey;
              loopParent = loopParent.parent;
            }
            return fullKey;
          },
          print : function() {
            let spaces = "";
            for (i = 0 ; i < this.depth ; i++) {
              spaces += "  ";
            }
            for (let i = 0 ; i < this.children.length ; i++) {
              this.children[i].print();
            }
          }
        }
        if(curParent != null) curParent.children.push(item);
        curParent = item;
        this._items.push(item);
        if (item.depth == 0) this._rootItems.push(item);
      }
    }
    this._console.debug("[PassFF]", "Found Items", this._rootItems);
  },

  getUrlMatchingItems : function(url) {
    return this._items.filter(function(item){
      return url.search(new RegExp(item.key,"i")) >= 0;
    });
  },

  findBestFitItem : function(items, url) {
    let leafs = PassFF.Pass.getItemsLeafs(items);
    PassFF.Pass._console.info("[PassFF]", "Found best fit items : ", leafs);
    return leafs.length > 0 ? leafs[0] : null;
  },

  getItemsLeafs : function(items) {
    let leafs = new Array();
    items.forEach(function(item) { leafs = leafs.concat(PassFF.Pass.getItemLeafs(item)); });

    return leafs;
  },

  getItemLeafs : function(item) {
    let leafs = new Array();
    if (item.isLeaf()) {
      leafs.push(item);
    } else {
      item.children.forEach(function(child) { leafs = leafs.concat(PassFF.Pass.getItemLeafs(child)); });
    }

    return leafs;
  },

  executePass : function(arguments) {
    
    let result = null;
    let params = {
      command     : PassFF.Preferences.command,
      arguments   : arguments,
      environment : this.getEnvParams(),
      charset     : 'UTF-8',
      workdir     : PassFF.Preferences.home,
      //stdout      : function(data) { output += data },
      mergeStderr : false,
      done        : function(data) { result = data }
    }
    PassFF.Pass._console.debug("[PassFF]", "Execute pass", params);
    let p = subprocess.call(params);
    p.wait();
    if (result.exitCode != 0) {
      PassFF.Pass._console.warn("[PassFF]", result.stderr, result.stdout);
    } else {
      PassFF.Pass._console.info("[PassFF]", "pass script execution ok");
    }
    return result;
  },

  init : function() {
    this.initItems();
    let stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
    this._stringBundle = stringBundleService.createBundle("chrome://passff/locale/strings.properties");

  },

  getEnvParams : function() {
    var params = ["HOME=" + PassFF.Preferences.home, "DISPLAY=:0.0"];
    if (PassFF.Preferences.storeDir.trim().length > 0) params.push("PASSWORD_STORE_DIR=" + PassFF.Preferences.storeDir);
    if (PassFF.Preferences.storeGit.trim().length > 0) params.push("PASSWORD_STORE_GIT=" + PassFF.Preferences.storeGit);
    if (PassFF.Preferences.gpgAgentEnv != null) params = params.concat(PassFF.Preferences.gpgAgentEnv);

    return params;
  },
  get rootItems() {return this._rootItems;}

};

(function() { this.init() }).apply(PassFF.Pass);
