/* jshint node: true */
'use strict';

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
    if (depth <= PassFF.Preferences.subpageSearchDepth) {
      let subpages = [
          ...doc.getElementsByTagName('iframe'),
          ...doc.getElementsByTagName('frame')
      ];
      Array.prototype.slice.call(subpages).forEach(function(subpages) {
        PassFF.Page.processDoc(subpages.contentDocument, passwordData, depth++);
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
    PassFF.Page.setOtherInputs(doc, passwordData._other);
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

  setOtherInputs: function(doc, other) {
    PassFF.Page.getOtherInputs(doc, other).forEach(function(otherInput) {
      let value;
      if (other.hasOwnProperty(otherInput.name)) {
        value = other[otherInput.name];
      } else if (other.hasOwnProperty(otherInput.id)) {
        value = other[otherInput.id];
      }
      if (value) {
        otherInput.value = value;
      }
    });
  },

  isPasswordInput: function(input) {
    let hasGoodName = PassFF.Page.hasGoodName(input.name ? input.name : input.id,
                                              PassFF.Preferences.passwordInputNames);
    return (input.type == 'password' || (input.type == 'text' && hasGoodName));
  },

  isLoginInput: function(input) {
    return ((input.type == 'text' || input.type == 'email' || input.type == 'tel') &&
            PassFF.Page.hasGoodName(input.name ? input.name : input.id,
                                    PassFF.Preferences.loginInputNames));
  },

  isOtherInputCheck: function(other) {
    return function(input) {
      return ((input.type == 'text' || input.type == 'email' || input.type == 'tel') &&
              PassFF.Page.hasGoodName(input.name ? input.name : input.id,
                                      Object.keys(other)));
    }
  },

  getLoginInputs: function(doc) {
    return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                                .filter(PassFF.Page.isLoginInput);
  },

  getPasswordInputs: function(doc) {
    return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                                .filter(PassFF.Page.isPasswordInput);
  },

  getOtherInputs: function(doc, other) {
    return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                                .filter(PassFF.Page.isOtherInputCheck(other));
  },

  /**
   * Return a copy of the last submit button found in `form`
   *
   * XXX why does this return a copy?
   */
  getSubmitButton: function(form) {
    let buttons = form.querySelectorAll('button[type=submit]');

    if (buttons.length === 0) {
      buttons = Array.prototype.slice
                                   .call(form.querySelectorAll('input[type=submit]'));
    }

    if (buttons.length === 0) {
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
