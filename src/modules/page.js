/* jshint node: true */
'use strict';

if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

PassFF.Page = {
  _autoSubmittedUrls: [],

  fillInputs: function(tabId, item) {
    return PassFF.Pass.getPasswordData(item).then((passwordData) => {
      if (passwordData) {
        this._exec(tabId, `processDoc(doc, {0}, 0);`.format(JSON.stringify(passwordData)));
      }
      return tabId;
    });
  },

  submit: function(tabId, passwordData) {
    this._exec(tabId, "submit();");
  },

  _exec: function (tabId, cmd) {
    let code = this._contentScriptTemplate.format(`
        loginInputNames = {0};
        passwordInputNames = {1};
        iframeSearchDepth = {2};
        {3}`.format(
            JSON.stringify(PassFF.Preferences.loginInputNames),
            JSON.stringify(PassFF.Preferences.passwordInputNames),
            JSON.stringify(PassFF.Preferences.iframeSearchDepth),
            cmd
        )
    );
    browser.tabs.executeScript(tabId, { code: code, runAt: "document_idle" });
  },

/******************************************************************************/
/*                 Template for injected content script                       */
/******************************************************************************/
    _contentScriptTemplate: `
var doc = document;
var loginInputNames = [];
var passwordInputNames = [];
var iframeSearchDepth = 0;

function getSubmitButton(form) {
  let buttons = form.querySelectorAll('button[type=submit]');

  if (buttons.length === 0) {
    buttons = Array.prototype.slice
                             .call(form.querySelectorAll('input[type=submit]'));
  }

  if (buttons.length === 0) {
    return null;
  }

  return Array.prototype.slice.call(buttons, buttons.length - 1, buttons.length)[0];
}

function searchParentForm(input) {
  while (input !== null && input.tagName.toLowerCase() != 'form') {
    input = input.parentNode;
  }
  return input;
}

function submit() {
  let passwords = getPasswordInputs();
  if (passwords.length === 0) {
    return;
  }

  let form = searchParentForm(passwords[0]);
  if (!form) {
    // No form found to submit
    return;
  }

  let submitBtn = getSubmitButton(form);
  if (submitBtn) {
    submitBtn.click();
  } else {
    form.submit();
  }
}

function hasGoodName(fieldName, goodFieldNames) {
  let goodName = false;
  for (let i = 0; i < goodFieldNames.length; i++) {
    goodName = fieldName.toLowerCase().indexOf(goodFieldNames[i].toLowerCase()) >= 0;
    if (goodName) {
      break;
    }
  }
  return goodName;
}

function isPasswordInput(input) {
  let hasGoodN = hasGoodName(input.name ? input.name : input.id, passwordInputNames);
  return (input.type == 'password' || (input.type == 'text' && hasGoodN));
}

function isLoginInput(input) {
  return ((input.type == 'text' || input.type == 'email' || input.type == 'tel') &&
          hasGoodName(input.name ? input.name : input.id, loginInputNames));
}

function isOtherInputCheck(other) {
  return function(input) {
    return ((input.type == 'text' || input.type == 'email' || input.type == 'tel') &&
           hasGoodName(input.name ? input.name : input.id, Object.keys(other)));
  }
}

function getLoginInputs() {
  return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                              .filter(isLoginInput);
}

function getPasswordInputs() {
  return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                              .filter(isPasswordInput);
}

function getOtherInputs(other) {
  return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                              .filter(isOtherInputCheck(other));
}

function setLoginInputs(login) {
  getLoginInputs().forEach(function(loginInput) {
    loginInput.value = login;
  });
}

function setPasswordInputs(password) {
  getPasswordInputs().forEach(function(passwordInput) {
    passwordInput.value = password;
  });
}

function setOtherInputs(other) {
  getOtherInputs(other).forEach(function(otherInput) {
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
}

function setInputs(passwordData) {
  setLoginInputs(passwordData.login);
  setPasswordInputs(passwordData.password);
  setOtherInputs(passwordData._other);
}

function processDoc(d, passwordData, depth) {
  setInputs(passwordData);
  if (depth <= iframeSearchDepth) {
    let iframes = d.getElementsByTagName('iframe');
    Array.prototype.slice.call(iframes).forEach(function(iframe) {
      processDoc(iframe.contentDocument, passwordData, depth++);
    });
  }
}
{0}`
/******************************************************************************/
/******************************************************************************/
};
