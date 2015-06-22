PassFF.Page = {
  _autoSubmittedUrls: [],
  autoFillAndSubmitPending: false,

  fillInputs: function(doc, item) {
    let passwordData = PassFF.Pass.getPasswordData(item);
    if (passwordData) {
      PassFF.Page.processDoc(doc, passwordData, 0);
    }
  },

  processDoc: function(doc, passwordData, depth) {
    PassFF.Page.setInputs(doc, passwordData);
    if (depth <= PassFF.Preferences.iframeSearchDepth) {
      let iframes = doc.getElementsByTagName('iframe');
      Array.prototype.slice.call(iframes).forEach(function(iframe) {
        PassFF.Page.processDoc(iframe.contentDocument, passwordData, depth++);
      });
    }
  },

  submit: function(doc, url) {
    if (PassFF.Page.removeFromArray(PassFF.Page._autoSubmittedUrls, url)) {
      log.info('Url already submit. skip it');
      return;
    }

    let passwords = PassFF.Page.getPasswordInputs(doc);
    if (passwords.length === 0) {
      return;
    }

    log.debug('Url never submit. Submit it', url);

    let form = PassFF.Page.searchParentForm(passwords[0]);
    if (!form) {
      log.debug('No form found to submit');
      return;
    }

    log.debug('Found form to submit', form);
    PassFF.Page._autoSubmittedUrls.push(url);
    let submitBtn = PassFF.Page.getSubmitButton(form);

    if (submitBtn) {
      log.info('Click submit button');
      submitBtn.click();
    } else {
      log.info('Submit form');
      form.submit();
    }
  },

  setInputs: function(doc, passwordData) {
    PassFF.Page.setLoginInputs(doc, passwordData.login);
    PassFF.Page.setPasswordInputs(doc, passwordData.password);
  },

  setLoginInputs: function(doc, login) {
    PassFF.Page.getLoginInputs(doc).forEach(function(loginInput) {
      loginInput.value = login;
    });
  },

  setPasswordInputs: function(doc, password) {
    PassFF.Page.getPasswordInputs(doc).forEach(function(passwordInput) {
      passwordInput.value = password;
    });
  },

  isPasswordInput: function(input) {
    let hasGoodName = PassFF.Page.hasGoodName(input.name,
                                              PassFF.Preferences.passwordInputNames);
    return (input.type == 'password' || (input.type == 'text' && hasGoodName));
  },

  isLoginInput: function(input) {
    return ((input.type == 'text' || input.type == 'email' || input.type == 'tel') &&
            PassFF.Page.hasGoodName(input.name, PassFF.Preferences.loginInputNames));
  },

  getLoginInputs: function(doc) {
    return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                                .filter(PassFF.Page.isLoginInput);
  },

  getPasswordInputs: function(doc) {
    return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                                .filter(PassFF.Page.isPasswordInput);
  },

  /**
   * Return a copy of the last submit button found in `form`
   *
   * XXX why does this return a copy?
   */
  getSubmitButton: function(form) {
    let origButtons = form.querySelectorAll('button[type=submit]');

    if (origButtons.length === 0) {
      origButtons = Array.prototype.slice
                                   .call(form.querySelectorAll('input[type=submit]'));
    }

    if (origButtons.length === 0) {
      return null;
    }

    return Array.prototype.slice.call(buttons, buttons.length - 1, buttons.length)[0];
  },

  searchParentForm: function(input) {
    while (input !== null && input.tagName.toLowerCase() != 'form') {
      input = input.parentNode;
    }
    return input;
  },

  hasGoodName: function(fieldName, goodFieldNames) {
    let goodName = false;
    for (let i = 0; i < goodFieldNames.length; i++) {
      goodName = fieldName.toLowerCase().indexOf(goodFieldNames[i].toLowerCase()) >= 0;
      if (goodName) {
        break;
      }
    }
    return goodName;
  },

  removeFromArray: function(array, value) {
    let index = array.indexOf(value);
    if (index >= 0) {
      array.splice(index, 1);
    }
    return index >= 0;
  }
};
