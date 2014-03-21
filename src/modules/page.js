var EXPORTED_SYMBOLS = [];

Components.utils.import("resource://passff/common.js");

PassFF.Page = {
  _this : null,
  _autoSubmittedUrls : new Array(),
  itemToUse : null,
  init : function() {
    _this = this;
    if(typeof(gBrowser) != "undefined") {
      gBrowser.addEventListener("DOMContentLoaded", this.onPageLoad, false);
      gBrowser.tabContainer.addEventListener("TabSelect", this.onTabSelect, false);
    }
  },

  onPageLoad : function(event) {

    let doc = event.originalTarget;
    let win = doc.defaultView;
    // if (doc.nodeName == "#document") return;
    if (win != win.top) return;
    // if (win.frameElement) return;

    let url = win.location.href
    let matchItems = PassFF.Pass.getUrlMatchingItems(url);

    PassFF.BrowserOverlay.createContextualMenu(matchItems);

    if (_this.getPasswordInputs().length == 0) return;

    let bestFitItem = _this.itemToUse;
    if (!bestFitItem) bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

    if(bestFitItem) {
      
      let passwordData = PassFF.Pass.getPasswordData(bestFitItem);
      if (passwordData) {
        _this.fillInputs(passwordData);
        if (_this.itemToUse || PassFF.Pass.getItemsLeafs(matchItems).length == 1) _this.submit(url);
      }
    }
    _this.itemToUse = null;
  },

  fillInputs : function(passwordData) {
    _this.setLoginInputs(passwordData.login);
    _this.setPasswordInputs(passwordData.password);
  },

  submit : function(url) {
    if (!_this.removeFromArray(_this._autoSubmittedUrls, url)) {
      let passwords = _this.getPasswordInputs();
      if (passwords.length > 0) {
        let form = _this.searchParentForm(passwords[0]);
        if (form) {
          _this._autoSubmittedUrls.push(url);
          let submitBtn = _this.getSubmitButton(form);
          if (submitBtn) {
            submitBtn.click();
            //form.onclick.apply(form);
          } else {
            form.submit();
          }
        }
      }
    }
  },

  onTabSelect : function(event) {
    let matchItems  = PassFF.Pass.getUrlMatchingItems(gBrowser.contentDocument.location.href);
    PassFF.BrowserOverlay.createContextualMenu(matchItems);
  },

  setLoginInputs    : function(login)    { _this.getLoginInputs().forEach(function(loginInput) { loginInput.value = login; }); },
  setPasswordInputs : function(password) { _this.getPasswordInputs().forEach(function(passwordInput) { passwordInput.value = password; }); },
  getLoginInputs    : function()         { return Array.prototype.slice.call(content.document.getElementsByTagName("input")).filter(_this.isLoginInput); },
  getPasswordInputs : function()         { return Array.prototype.slice.call(content.document.getElementsByTagName("input")).filter(_this.isPasswordInput); },
  isPasswordInput   : function(input)    { return input.type == "password" || (input.type == "text" && _this.hasGoodName(input.name, PassFF.Preferences.passwordInputNames)); },
  isLoginInput      : function(input)    { return (input.type == "text" || input.type == "email") && _this.hasGoodName(input.name, PassFF.Preferences.loginInputNames); },

  getSubmitButton : function(form) {
    let submitBtns = Array.prototype.slice.call(form.getElementsByTagName("button")).filter( function(input) { return input.type == "submit" } )
    if (submitBtns.length == 0) submitBtns = Array.prototype.slice.call(form.getElementsByTagName("input")).filter( function(input) { return input.type == "submit" } )
    if (submitBtns.length > 0) return submitBtns[submitBtns.length - 1]
    return null;
  },

  searchLogin : function(passwordData) {
    for(let i = 0 ; i < PassFF.Preferences.loginFieldNames.length; i++) {
      let login = passwordData[PassFF.Preferences.loginFieldNames[i].toLowerCase()];
      if (login != undefined) return login;
    }
    return null;
  },

  searchParentForm : function(input) {
    while(input != null && input.tagName.toLowerCase() != 'form') {
      input = input.parentNode;
    }
    return input;
  },

  hasGoodName : function(fieldName, goodFieldNames) {
    let goodName = false;
    for(let i = 0 ; i < goodFieldNames.length ; i++) {
      goodName = fieldName.toLowerCase().indexOf(goodFieldNames[i].toLowerCase()) >= 0;
      if (goodName) break;
    }
    return goodName;
  },

  removeFromArray : function(array, value) {
    let index = array.indexOf(value);
    if (index >= 0) {
      array.splice(index, 1);
    }
    return index >= 0;
  }
};

(function() { this.init() }).apply(PassFF.Page);
