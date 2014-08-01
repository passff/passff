PassFF.Pass = {
  _items : [],
  _rootItems : [],
  _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),
  _stringBundle : null,
  //_pp : null,

  getPasswordData : function(item) {
    let result = {};
    if (!item.children || item.children.length === 0) { // multiline-style item
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
    } else { // hierarchical-style item
      item.children.forEach(function(child){
        if (child.isField()) {
          result[child.key] = PassFF.Pass.getPasswordData(child).password;
        }
      });
    }

    PassFF.Pass.setLogin(result, item);
    PassFF.Pass.setPassword(result);

    return result;
  },

  setPassword : function(passwordData) {
    let password = undefined;
    for(let i = 0 ; i < PassFF.Preferences.passwordFieldNames.length; i++) {
      password = passwordData[PassFF.Preferences.passwordFieldNames[i].toLowerCase()];
      if (password != undefined) break;
    }
    passwordData.password = password
  },

  setLogin : function(passwordData, item) {
    let login = undefined;
    for(let i = 0 ; i < PassFF.Preferences.loginFieldNames.length; i++) {
      login = passwordData[PassFF.Preferences.loginFieldNames[i].toLowerCase()];
      if (login != undefined) break;
    }
    if (login == undefined) login = item.key;
    passwordData.login = login
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
  initItems : function() {
    let result = this.executePass([]);
    if (result.exitCode != 0) return;

    let stdout = result.stdout;
    this._rootItems = [];
    this._items = [];
    //console.debug("[PassFF]", stdout);
    let lines = stdout.split("\n");
    let re = /(.*[|`])+-- (.*)/;
    let curParent = null;
    for(let i = 0 ; i < lines.length; i++) {
      let match = re.exec(lines[i]);
      if(match != null) {
        let curDepth = (match[1].length - 1) / 4;
        let key = match[2].replace(/\\ /g, ' ');
        while (curParent != null && curParent.depth >= curDepth) {
          curParent = curParent.parent;
        }
        let item = {
          depth : curDepth,
          key : key,
          children : new Array(),
          parent : curParent,
          isLeaf : function() { return this.children.length == 0;},
          hasFields : function() { return this.children.some(function(element) { return element.isField(); }); },
          isField: function() { return this.isLeaf() && (PassFF.Pass.isLoginField(this.key) || PassFF.Pass.isPasswordField(this.key) || PassFF.Pass.isUrlField(this.key)); },
          fullKey : function() {
            let fullKey = this.key;
            let loopParent = this.parent;
            while (loopParent != null) {
              fullKey = loopParent.key + "/" + fullKey;
              loopParent = loopParent.parent;
            }
            return fullKey;
          }
        }
        if(curParent != null) curParent.children.push(item);
        curParent = item;
        this._items.push(item);
        if (item.depth == 0) this._rootItems.push(item);
      }
    }
    console.debug("[PassFF]", "Found Items", this._rootItems);
  },

  getMatchingItems : function(search, limit) {
    let searchRegex = ''
    for(i=0; i<search.length; i++) searchRegex += search.charAt(i) + ".*";

    let BreakException= {};
    let result = new Array();
    try {
        this._items.forEach(function(item) {
          if ((item.isLeaf() || item.hasFields()) && item.fullKey().search(new RegExp(searchRegex)) >= 0) result.push(item);
          if (result.length == limit) throw BreakException;
        })
    } catch(e) {
        if (e!==BreakException) throw e;
    }
    return result;
  },

  getUrlMatchingItems : function(url) {
    return this._items.filter(function(item){
      let regExp = item.key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      return !item.isField() && url.search(new RegExp(regExp,"i")) >= 0;
    });
  },

  findBestFitItem : function(items, url) { return items[0]; },

  getItemsLeafs : function(items) {
    let leafs = new Array();
    items.forEach(function(item) { leafs = leafs.concat(PassFF.Pass.getItemLeafs(item)); });

    return leafs;
  },

  getItemLeafs : function(item) {
    let leafs = new Array();
    if (item.isLeaf()) {
      if(!item.isField()) leafs.push(item);
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
    console.debug("[PassFF]", "Execute pass", params);
    let p = subprocess.call(params);
    p.wait();
    if (result.exitCode != 0) {
      console.warn("[PassFF]", result.exitCode, result.stderr, result.stdout);
    } else {
      console.info("[PassFF]", "pass script execution ok");
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
