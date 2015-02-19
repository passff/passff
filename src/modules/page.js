PassFF.Page = {
  _autoSubmittedUrls : new Array(),
  autoFillAndSubmitPending : false,
  init : function() { },

  fillInputs : function(doc, item) {
    let passwordData = PassFF.Pass.getPasswordData(item);
    if (passwordData) {
      log.debug("Fill inputs", item)
      PassFF.Page.setInputs(doc, passwordData);
      log.debug("Found iframes size : ", doc.getElementsByTagName("iframe").length);
      Array.prototype.slice.call(doc.getElementsByTagName("iframe")).forEach(function(iframe) {
        log.debug("Fill iframe inputs", iframe)
        PassFF.Page.setInputs(iframe.contentDocument, passwordData);
      });
    }
  },

  submit : function(doc, url) {
    if (!PassFF.Page.removeFromArray(PassFF.Page._autoSubmittedUrls, url)) {

      let passwords = PassFF.Page.getPasswordInputs(doc);
      if (passwords.length > 0) {
        log.debug("Url never submit. Submit it", url);
        let form = PassFF.Page.searchParentForm(passwords[0]);
        if (form) {
          log.debug("Found form to submit", form);
          PassFF.Page._autoSubmittedUrls.push(url);
          let submitBtn = PassFF.Page.getSubmitButton(form);
          if (submitBtn) {
            log.info("Click submit button");
            submitBtn.click();
          } else {
            log.info("Submit form");
            form.submit();
          }
        } else {
          log.debug("No form found to submit");
        }
      }
    } else {
      log.info("Url already submit. skip it");
    }
  },

  setInputs         : function(doc, passwordData) { PassFF.Page.setLoginInputs(doc, passwordData.login); PassFF.Page.setPasswordInputs(doc, passwordData.password); },
  setLoginInputs    : function(doc, login)        { PassFF.Page.getLoginInputs(doc).forEach(function(loginInput) { loginInput.value = login; }); },
  setPasswordInputs : function(doc, password)     { PassFF.Page.getPasswordInputs(doc).forEach(function(passwordInput) { passwordInput.value = password; }); },
  isPasswordInput   : function(input)             { return input.type == "password" || (input.type == "text" && PassFF.Page.hasGoodName(input.name, PassFF.Preferences.passwordInputNames)); },
  isLoginInput      : function(input)             { return (input.type == "text" || input.type == "email" || input.type == "tel") && PassFF.Page.hasGoodName(input.name, PassFF.Preferences.loginInputNames); },
  getLoginInputs    : function(doc)               { return Array.prototype.slice.call(doc.getElementsByTagName("input")).filter(PassFF.Page.isLoginInput); },
  getPasswordInputs : function(doc)               { return Array.prototype.slice.call(doc.getElementsByTagName("input")).filter(PassFF.Page.isPasswordInput); },

  getSubmitButton : function(form) {
    let submitBtns = Array.prototype.slice.call(form.getElementsByTagName("button")).filter( function(input) { return input.type == "submit" } )
    if (submitBtns.length == 0) submitBtns = Array.prototype.slice.call(form.getElementsByTagName("input")).filter( function(input) { return input.type == "submit" } )
    if (submitBtns.length > 0) return submitBtns[submitBtns.length - 1]
    return null;
  },

  searchParentForm : function(input) {
    while(input != null && input.tagName.toLowerCase() != 'form') input = input.parentNode;
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
    if (index >= 0) array.splice(index, 1);
    return index >= 0;
  }
};
