declare let browser: any;
import {Preferences} from './preferences';
import {Pass, Item} from './pass';
import {log, getActiveTab} from './main';

export interface Tab {
  url?: string
  id?: number
  status?: string
}

interface String {
  format(): string;
}

function format(string: string, ...args: string[]) {
    return string.replace(/{(\d+)}/g, function(match:string, number:number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
}

type SubmittedUrl = [string, number];

export class Page {
  private static _autoSubmittedUrls : SubmittedUrl[] = [];
  private static _autoFillAndSubmitPending = false;

  static tabAutoFill(tb: Tab) {
    if (Page._autoFillAndSubmitPending || !Preferences.autoFill) {
      return;
    }

    if (tb.status != "complete") {
      browser.tabs.onUpdated.addListener(function f(tabId: number, changeInfo: any, tab:Tab) {
        if (tabId == tb.id && tab.status == "complete") {
          browser.tabs.onUpdated.removeListener(f);
          Page.tabAutoFill(tab);
        }
      });
    } else {
      let url = tb.url;
      let matchItems = Pass.getUrlMatchingItems(url);

      log.info('Start pref-auto-fill');
      let bestFitItem = Pass.findBestFitItem(matchItems, url);

      if (bestFitItem) {
        Page.fillInputs(tb.id, bestFitItem).then(() => {
          if (Preferences.autoSubmit &&
              Pass.getItemsLeafs(matchItems).length == 1) {
            // TODO: variable "tab" is never set?
            let tab = {url: "dummy"};
            if (Page.removeFromArray(Page._autoSubmittedUrls, tab.url)) {
              log.info('Url already submit. skip it');
              return;
            }
            Page.submit(tb);
            // TODO: variable "tab" is never set?
            Page._autoSubmittedUrls.push([tab.url, Date.now()]);
          }
        });
      }
    }
  }

  static onContextMenu(info: any, tab: Tab) {
    if (info.menuItemId == "login-add") {
      Page._exec(tab.id, "addInputName();");
    } else {
      let itemId = parseInt(info.menuItemId.split("-")[1]);
      let item = Pass.getItemById(itemId);
      Pass.getPasswordData(item).then((passwordData) => {
        Page._exec(tab.id,
          format("contextMenuFill({0});", JSON.stringify(passwordData))
        );
      });
    }
  }

  static goToItemUrl(item: Item, newTab: boolean, autoFill: boolean, submit: boolean) {
    if (!item) {
      return new Promise(() => void 0);
    }

    Page._autoFillAndSubmitPending = true;
    let promised_tab : Promise<Tab> = null;
    if (newTab) {
      promised_tab = browser.tabs.create({});
    } else {
      promised_tab = getActiveTab();
    }

    log.debug('go to item url', item, newTab, autoFill, submit);
    return Pass.getPasswordData(item).then((passwordData) => {
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
        browser.tabs.onUpdated.addListener(function f(tabId: number, changeInfo: any, tab: Tab) {
          if (tabId == tb.id && tab.status == "complete") {
            browser.tabs.onUpdated.removeListener(f);
            log.info('Start auto-fill');
            Page._autoFillAndSubmitPending = false;
            Page.fillInputs(tabId, item).then(() => {
              if (submit) {
                log.info('Start submit');
                Page.submit(tb);
              }
            });
          }
        });
      });
    });
  }

  static fillInputs(tabId: number, item: Item) {
    return Pass.getPasswordData(item).then((passwordData) => {
      if (passwordData) {
        this._exec(tabId,
          format("processDoc(doc, {0}, 0);", JSON.stringify(passwordData))
        );
      }
      return tabId;
    });
  }

  static submit(tab: Tab, passwordData : any = null) {
    this._exec(tab.id, "submit();");
  }

  private static removeFromArray(array: SubmittedUrl[] , value: string) {
    // TODO this method makes no sense using find - should it be findIndex?
    let index = array.findIndex((val) => { return val[0] == value; });
    let result = 60000; // one minute
    if (index >= 0) {
      // How old is the deleted URL?
      result = Date.now() - array.splice(index, 1)[0][1];
    }
    return result < 20000; // Is the deleted URL younger than 20 seconds?
  }

  private static  _exec(tabId: number, cmd: string) {
    let code = format(this._contentScriptTemplate, format(`
      loginInputNames = {0};
      passwordInputNames = {1};
      subpageSearchDepth = {2};
      {3}`,
        JSON.stringify(Preferences.loginInputNames),
        JSON.stringify(Preferences.passwordInputNames),
        JSON.stringify(Preferences.subpageSearchDepth),
        cmd
      )
    );
    browser.tabs.executeScript(tabId, { code: code, runAt: "document_idle" });
  }

/******************************************************************************/
/*                 Template for injected content script                       */
/******************************************************************************/
    private static _contentScriptTemplate = `
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
    return (loginInputTypes.indexOf(input.type) >= 0 &&
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
}
