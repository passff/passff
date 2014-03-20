var EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://passff/common.js");
Components.utils.import("resource://passff/preferences.js");
Components.utils.import("resource://passff/subprocess/subprocess.jsm");

PassFF.Pass = {
  _items : [],
  _rootItems : [],
  _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),
  _stringBundle : null,
  //_pp : null,

  getPasswordData : function(item) {
    let args = new Array();
    /*if (this._pp == null) {
      let pw = {value: null};
      let check = {value: true};
      let ok = promptService.promptPassword(null, "Title", "Enter password:", pw, null, check);
      if (!ok) return;
      this._pp = pw.value;
    }
    if (this._pp && this._pp.trim().length > 0) {
      args.push("-p");
      args.push(this._pp);
    }*/
    args.push(item.fullKey());
    let executionResult = this.executePass(args);
    while (executionResult.exitCode != 0 && executionResult.stderr.indexOf("gpg: decryption failed: No secret key") >= 0) {
      Components.utils.reportError(executionResult.stderr);
      let title = this._stringBundle.GetStringFromName("passff.passphrase.title");
      let desc = this._stringBundle.GetStringFromName("passff.passphrase.description");
      if(!this._promptService.confirm(null, title, desc)) return;
      executionResult = this.executePass(args);
    }
    if (executionResult.exitCode != 0) {
      this._promptService.alert(null, "Error", executionResult.stderr);
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
    result.login = this.searchLogin(result);

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
    let lines = this.executePass([]).stdout.split("\n");
    let re = /(.*[|`])+-- (.*)/;
    let curParent = null;
    let roots = new Array();
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
  },

  getUrlMatchingItems : function(url) {
    return this._items.filter(function(item){
      return url.search(item.key) >= 0;
    });
  },

  executePass : function(arguments) {
    
    let result = null;
    let p = subprocess.call({
      command     : PassFF.Preferences.command,
      arguments   : arguments,
      environment : this.getEnvParams(),
      charset     : 'UTF-8',
      workdir     : PassFF.Preferences.home,
      //stdout      : function(data) { output += data },
      mergeStderr : false,
      done        : function(data) { result = data }
    });
    p.wait();
    //Components.utils.reportError(JSON.stringify(result));
    return result;
  },

  init : function() {
    this.initItems();
    let stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
    this._stringBundle = stringBundleService.createBundle("chrome://passff/locale/strings.properties");
    //Components.utils.reportError(JSON.stringify(this._stringBundle));

  },

  getEnvParams : function() {
    var params = ["HOME=" + PassFF.Preferences.home, "DISPLAY=:0.0"];
    if (PassFF.Preferences.gpgAgentEnv != null) params = params.concat(PassFF.Preferences.gpgAgentEnv);

    return params;
  },
  get rootItems() {return this._rootItems;}

};

(function() { this.init() }).apply(PassFF.Pass);
