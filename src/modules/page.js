var EXPORTED_SYMBOLS = [];

Cu.import("resource://passff/common.js");
Cu.import("resource://passff/preferences.js");
Cu.import("resource://passff/pass.js");

PassFF.Page = {
  _console : Cu.import("resource://gre/modules/devtools/Console.jsm", {}).console,
  _autoSubmittedUrls : new Array(),
  itemToUse : null,
  init : function() {
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

    if (!PassFF.Preferences.autoFill || PassFF.Page.getPasswordInputs().length == 0) return;

    PassFF.Page._console.info("[PassFF]", "Start auto-fill")
    let bestFitItem = PassFF.Page.itemToUse;
    if (!bestFitItem) bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

    if(bestFitItem) {
      PassFF.Page.fillInputs(bestFitItem);
      if (PassFF.Page.itemToUse || PassFF.Pass.getItemsLeafs(matchItems).length == 1) PassFF.Page.submit(url);
    }
    PassFF.Page.itemToUse = null;
  },

  fillInputs : function(item) {
    PassFF.Page._console.debug("[PassFF]", "Fill inputs")
    let passwordData = PassFF.Pass.getPasswordData(item);
    if (passwordData) {
      PassFF.Page.setLoginInputs(passwordData.login);
      PassFF.Page.setPasswordInputs(passwordData.password);
    }
  },

  submit : function(url) {
    if (!PassFF.Page.removeFromArray(PassFF.Page._autoSubmittedUrls, url)) {

      PassFF.Page._console.debug("[PassFF]", "Url never submit. Submit it", url);
      let passwords = PassFF.Page.getPasswordInputs();
      if (PassFF.Preferences.autoFill &&passwords.length > 0) {
        let form = PassFF.Page.searchParentForm(passwords[0]);
        if (form) {
          PassFF.Page._console.debug("[PassFF]", "Found form to submit", form);
          PassFF.Page._autoSubmittedUrls.push(url);
          let submitBtn = PassFF.Page.getSubmitButton(form);
          if (submitBtn) {
            PassFF.Page._console.info("[PassFF]", "Click submit button");
            submitBtn.click();
          } else {
            PassFF.Page._console.info("[PassFF]", "Submit form");
            form.submit();
          }
        } else {
          PassFF.Page._console.debug("[PassFF]", "No form found to submit");
        }
      }
    } else {
      PassFF.Page._console.info("[PassFF]", "Url already submit. skip it");
    }
  },

  onTabSelect : function(event) {
    let matchItems  = PassFF.Pass.getUrlMatchingItems(gBrowser.contentDocument.location.href);
    PassFF.BrowserOverlay.createContextualMenu(matchItems);
  },

  setLoginInputs    : function(login)    { PassFF.Page.getLoginInputs().forEach(function(loginInput) { loginInput.value = login; }); },
  setPasswordInputs : function(password) { PassFF.Page.getPasswordInputs().forEach(function(passwordInput) { passwordInput.value = password; }); },
  getLoginInputs    : function()         { return Array.prototype.slice.call(content.document.getElementsByTagName("input")).filter(PassFF.Page.isLoginInput); },
  getPasswordInputs : function()         { return Array.prototype.slice.call(content.document.getElementsByTagName("input")).filter(PassFF.Page.isPasswordInput); },
  isPasswordInput   : function(input)    { return input.type == "password" || (input.type == "text" && PassFF.Page.hasGoodName(input.name, PassFF.Preferences.passwordInputNames)); },
  isLoginInput      : function(input)    { return (input.type == "text" || input.type == "email") && PassFF.Page.hasGoodName(input.name, PassFF.Preferences.loginInputNames); },

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
