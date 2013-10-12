Components.utils.import("resource://passff/common.js");
Components.utils.import("resource://passff/preferences.js");
Components.utils.import("resource://passff/pass.js");

PassFF.Page = {
  _this : null,
  _autoSubmittedUrls : new Array(),
  init : function() {
    _this = this;
    if(gBrowser) gBrowser.addEventListener("DOMContentLoaded", this.onPageLoad, false);
  },

  onPageLoad : function(event) {

    if (!_this.hasPasswordInput()) return;

    let doc = event.originalTarget; // d c is document that triggered the event
    let win = doc.defaultView; // win is the window for the doc
    // test desired conditions and do something
    // if (doc.nodeName == "#document") return; // only documents
    if (win != win.top) return; //only top window.
    // if (win.frameElement) return; // skip iframes/frames

    let match = PassFF.Pass.getUrlMatchingItems(win.location.href);
    if(match.length > 0) {
      let passwordData = PassFF.Pass.getPasswordData(match[0]);
      if(passwordData) {
        let login = _this.searchLogin(passwordData);
        _this.setLoginInputs(login);
        let input = _this.setPasswordInputs(passwordData.password);
        if (!_this.removeFromArray(_this._autoSubmittedUrls, win.location.href)) {
          let form = _this.searchParentForm(input);
          if (form) {
            _this._autoSubmittedUrls.push(win.location.href);
            form.submit();
          }
        }
      }
    }
  },

  setLoginInputs : function(login) {
    let inputs = content.document.getElementsByTagName("input");
    for(let i = 0 ; i < inputs.length ; i++) {
      let input = inputs[i]
      if (_this.isLoginInput(input)) input.value = login;
    }
  },

  setPasswordInputs : function(password) {
    let inputs = content.document.getElementsByTagName("input");
    let input = null;
    for(let i = 0 ; i < inputs.length ; i++) {
      input = inputs[i]
      if (_this.isPasswordInput(input)) input.value = password;
    }

    return input;
  },

  hasPasswordInput : function() {
    let inputs = content.document.getElementsByTagName("input");
    for(let i = 0 ; i < inputs.length ; i++) {
      input = inputs[i]
      if (_this.isPasswordInput(input)) return true;
    }
    return false;
  },

  isPasswordInput : function(input) {
      return input.type == "password" || (input.type == "text" && _this.hasGoodName(input.name, PassFF.Preferences.passwordInputNames));
  },

  isLoginInput : function(input) {
      return input.type == "text" && _this.hasGoodName(input.name, PassFF.Preferences.loginInputNames);
  },

  searchLogin : function(passwordData) {
    //console.log(JSON.stringify(passwordData));
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
