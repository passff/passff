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
  _autoFillAndSubmitPending: false,

  tabAutoFill: function(tb) {
    if (PassFF.Page._autoFillAndSubmitPending || !PassFF.Preferences.autoFill) {
      return;
    }

    if (tb.status != "complete") {
      browser.tabs.onUpdated.addListener(function f(tabId, changeInfo, tab) {
        if (tabId == tb.id && tab.status == "complete") {
          browser.tabs.onUpdated.removeListener(f);
          PassFF.Page.tabAutoFill(tab);
        }
      });
    } else {
      let url = tb.url;
      let matchItems = PassFF.Pass.getUrlMatchingItems(url);

      log.info('Start pref-auto-fill');
      let bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

      if (bestFitItem) {
        PassFF.Page.fillInputs(tb.id, bestFitItem).then(() => {
          if (PassFF.Preferences.autoSubmit &&
              PassFF.Pass.getItemsLeafs(matchItems).length == 1) {
            if (PassFF.Page.removeFromArray(PassFF.Page._autoSubmittedUrls, tab.url)) {
              log.info('Url already submit. skip it');
              return;
            }
            PassFF.Page.submit(tb);
            PassFF.Page._autoSubmittedUrls.push([tab.url, Date.now()]);
          }
        });
      }
    }
  },

  onContextMenu: function(info, tab) {
    if (info.menuItemId == "login-add") {
      PassFF.Page._exec(tab.id, "addInputName();");
    } else {
      let itemId = parseInt(info.menuItemId.split("-")[1]);
      let item = PassFF.Pass.getItemById(itemId);
      PassFF.Pass.getPasswordData(item).then((passwordData) => {
        PassFF.Page._exec(tab.id,
          "contextMenuFill({0});".format(JSON.stringify(passwordData))
        );
      });
    }
  },

  goToItemUrl: function(item, newTab, autoFill, submit) {
    if (!item) {
      return new Promise();
    }

    PassFF.Page._autoFillAndSubmitPending = true;
    let promised_tab = null;
    if (newTab) {
      promised_tab = browser.tabs.create({});
    } else {
      promised_tab = getActiveTab();
    }

    log.debug('go to item url', item, newTab, autoFill, submit);
    return PassFF.Pass.getPasswordData(item).then((passwordData) => {
      let url = passwordData.url;

      if (!url) {
        url = item.key;
      }

      if (!url.startsWith('http')) {
        url = 'http://' + url;
      }

      return promised_tab.then(function (tb) {
        return browser.tabs.update(tb.id, { "url": url });
      }).then(function (tb) {
        if (!autoFill) {
          return;
        }
        browser.tabs.onUpdated.addListener(function f(tabId, changeInfo, tab) {
          if (tabId == tb.id && tab.status == "complete") {
            browser.tabs.onUpdated.removeListener(f);
            log.info('Start auto-fill');
            PassFF.Page._autoFillAndSubmitPending = false;
            PassFF.Page.fillInputs(tabId, item).then(() => {
              if (submit) {
                log.info('Start submit');
                PassFF.Page.submit(tb);
              }
            });
          }
        });
      });
    });
  },

  fillInputs: function(tabId, item) {
    return PassFF.Pass.getPasswordData(item).then((passwordData) => {
      if (passwordData) {
        this._exec(tabId,
          "processDoc(doc, {0}, 0);".format(JSON.stringify(passwordData))
        );
      }
      return tabId;
    });
  },

  submit: function(tab, passwordData) {
    this._exec(tab.id, "submit();");
  },

  removeFromArray: function(array, value) {
    let index = array.find((val) => { return val[0] == value; });
    let result = 60000; // one minute
    if (index >= 0) {
      // How old is the deleted URL?
      result = Date.now() - array.splice(index, 1)[0][1];
    }
    return result < 20000; // Is the deleted URL younger than 20 seconds?
  },

  _exec: function (tabId, cmd) {
    let code = this._contentScriptTemplate.format(`
      loginInputNames = {0};
      passwordInputNames = {1};
      subpageSearchDepth = {2};
      {3}`.format(
        JSON.stringify(PassFF.Preferences.loginInputNames),
        JSON.stringify(PassFF.Preferences.passwordInputNames),
        JSON.stringify(PassFF.Preferences.subpageSearchDepth),
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
var loginInputTypes = ['text', 'email', 'tel'];
var loginInputNames = [];
var passwordInputNames = [];
var subpageSearchDepth = 0;

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
  return (loginInputTypes.indexOf(input.type) >= 0 &&
          hasGoodName(input.name ? input.name : input.id, loginInputNames));
}

function isOtherInputCheck(other) {
  return function(input) {
    return (hasGoodName(input.name ? input.name : input.id, Object.keys(other)));
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
    loginInput.dispatchEvent(new InputEvent('input'));
  });
}

function setPasswordInputs(password) {
  getPasswordInputs().forEach(function(passwordInput) {
    passwordInput.value = password;
    passwordInput.dispatchEvent(new InputEvent('input'));
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
      otherInput.dispatchEvent(new InputEvent('input'));
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
  if (depth <= subpageSearchDepth) {
    let subpages = [
      ...d.getElementsByTagName('iframe'),
      ...d.getElementsByTagName('frame')
    ];
    Array.prototype.slice.call(subpages).forEach(function(subpage) {
      processDoc(subpage.contentDocument, passwordData, depth++);
    });
  }
}

function contextMenuFill(passwordData) {
  document.activeElement.value = passwordData.login;
  setPasswordInputs(passwordData.password);
}

function addInputName() {
  let input = document.activeElement;
  if (input.tagName != "INPUT" || loginInputTypes.indexOf(input.type) < 0) {
    return;
  }
  let input_type = (input.type == "password") ? "password" : "login";
  browser.runtime.sendMessage({
    action: "Preferences.addInputName",
    params: [input_type, input.name ? input.name : input.id]
  });
}
{0}`
/******************************************************************************/
/******************************************************************************/
};
