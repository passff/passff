import {ItemObject, Pass} from './pass';
import {Preferences} from './preferences';
import {Page, Tab} from './page';
import {Menu} from "./menu";

declare let browser: any;

export class log {
  private static  logPrototype() {
    if (Preferences) {
      // jshint validthis: true
      this.apply(console, log.generateArguments(arguments));
    }
  }

  static generateArguments(args: IArguments) {
    var argsArray = Array.from(args);
    argsArray.unshift('[PassFF]');
    return argsArray;
  }
   static debug = log.logPrototype.bind(console.debug);
   static info  = log.logPrototype.bind(console.info);
   static warn  = log.logPrototype.bind(console.warn);
   static error = log.logPrototype.bind(console.error);
}

export function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true})
         .then((tabs: any) => { return tabs[0]; });
}

export interface MenuStateObject {
  context_url: string;
  search_val: string;
  items: ItemObject[];
}

export class PassFF {
  static Ids = {
    panel: 'passff-panel',
    button: 'passff-button',
    key: 'passff-key',
    keyset: 'passff-keyset',
    searchbox: 'passff-search-box',
    searchboxlabel: 'passff-search-box-label',
    entrieslist: 'passff-entries-list',
    contextlist: 'passff-context-list',
    optionsmenu: 'passff-options-menu',
    optionsmenupopup: 'passff-options-menupopup',
    rootbutton: 'passff-root-button',
    contextbutton: 'passff-context-button',
    buttonsbox: 'passff-buttonsbox',
    refreshmenuitem: 'passff-refresh-menuitem',
    prefsmenuitem: 'passff-prefs-menuitem',
    newpasswordmenuitem: 'passff-new-password-menuitem',
    menubar: 'passff-menubar',
    menu: 'passff-menu-',
  };

  private static tab_url: string = null;

  private static menu_state = new class {
    context_url: string = null;
    search_val: string = "";
    private _items: ItemObject[] = null;

    get items(): ItemObject[] {
      return this._items;
    };

    set items(new_items: ItemObject[]) {
      this._items = new_items;
      chrome.contextMenus.removeAll();
      chrome.contextMenus.create({
        id: "login-add",
        title: "Add login input name",
        contexts: ["editable"]
      });
      chrome.contextMenus.create({
        id: "sep",
        type: "separator",
        contexts: ["editable"]
      });
      if (this._items == null) {
        return;
      } else if (this._items instanceof Array) {
        this._items.slice(0, 3).forEach(this.addItemContext);
      } else {
        // TODO:
        // this seems to have been a bug - the call to Pass.getItemById(this._items) would always result in undefined
        // this.addItemContext(Pass.getItemById(this._items).toObject());
      }
    }

    addItemContext(i: ItemObject) {
      if (i.isLeaf) {
        chrome.contextMenus.create({
          id: "login-" + i.id,
          title: i.fullKey,
          contexts: ["editable"]
        });
      }
    }

    toObject(): MenuStateObject {
      return {
        'context_url': this.context_url,
        'search_val': this.search_val,
        'items': this.items
      };
    }
  };

  static gsfm(key: string, params: any = {}) {
    if (params) {
      return browser.i18n.getMessage(key, params);
    }
    return browser.i18n.getMessage(key);
  }

  static alert(msg: any) {
    browser.tabs.executeScript({code : 'alert(' + JSON.stringify(msg) + ');' });
  }

  static init(bgmode: boolean) {
    return Preferences.init(bgmode)
      .then(() => {
        if (bgmode) {
          return Pass.init()
            .then(() => {
              browser.tabs.onUpdated.addListener(PassFF.onTabUpdate);
              browser.tabs.onActivated.addListener(PassFF.onTabUpdate);
              PassFF.onTabUpdate();
              browser.runtime.onMessage.addListener(PassFF.bg_handle);
              browser.contextMenus.onClicked.addListener(Page.onContextMenu);
            });
        }
      }).catch((error) => {
        log.error("Error initializing preferences:", error);
      });
  };

  private static init_tab(tab: Tab) {
    // do nothing if called from a non-tab context
    if( ! tab || ! tab.url ) {
        return;
    }

    log.debug('Location changed', tab.url);
    PassFF.tab_url = tab.url;
    let items = Pass.getUrlMatchingItems(PassFF.tab_url);
    PassFF.menu_state.items = items.map((i) => { return i.toObject(true); });
    Page.tabAutoFill(tab);
  }

  private static onTabUpdate () {
    getActiveTab().then(PassFF.init_tab);
  }

  static bg_exec (action: string, ...params: any[]) {
    return browser.runtime.sendMessage({
      action: action,
      params: params
    }).then((msg: any) => {
      if (msg) {
        return msg.response;
      } else {
        return null;
      }
    }).catch((error: any) => {
      log.error("Runtime port has crashed:", error);
    });
  }

  private static bg_handle(request: {action:string, params?: any[]}, sender: any, sendResponse: Function) : void {
    if (request.action == "Pass.getUrlMatchingItems") {
      let items = Pass.rootItems;
      if (PassFF.tab_url !== null) {
        items = Pass.getUrlMatchingItems(PassFF.tab_url);
        if (items.length === 0) {
          items = Pass.rootItems;
        }
      }
      let itemObjects = items.map((i) => { return i.toObject(true); });
      PassFF.menu_state.context_url = PassFF.tab_url;
      PassFF.menu_state.search_val = "";
      PassFF.menu_state.items = itemObjects;
      sendResponse({ response: itemObjects });
    } else if (request.action == "Pass.getMatchingItems") {
      let val = request.params[0];
      let lim = request.params[1];
      let matchingItems = Pass.getMatchingItems(val, lim);
      let matchingItemObjects = matchingItems.map((i) => { return i.toObject(true); });
      PassFF.menu_state.context_url = PassFF.tab_url;
      PassFF.menu_state.search_val = val;
      PassFF.menu_state.items = matchingItemObjects;
      sendResponse({ response: matchingItemObjects });
    } else if (request.action == "Pass.rootItems") {
      let items = Pass.rootItems;
      let itemObjects = items.map((i) => { return i.toObject(true); });
      PassFF.menu_state.context_url = PassFF.tab_url;
      PassFF.menu_state.search_val = "";
      PassFF.menu_state.items = itemObjects;
      sendResponse({ response: itemObjects });
    } else if (request.action == "Pass.getItemById") {
      PassFF.menu_state.context_url = PassFF.tab_url;
      PassFF.menu_state.items = request.params[0];
      let item = Pass.getItemById(request.params[0]);
      sendResponse({ response: item.toObject(true) });
    } else if (request.action == "Pass.getPasswordData") {
      let item = Pass.getItemById(request.params[0]);
      Pass.getPasswordData(item).then((passwordData) => {
        log.debug("sending response");
        sendResponse({ response: passwordData });
      });
    } else if (request.action == "Pass.addNewPassword") {
      Pass.addNewPassword.apply(Pass, request.params)
      .then((result: any) => {
        sendResponse({ response: result });
      });
    } else if (request.action == "Pass.generateNewPassword") {
      Pass.generateNewPassword.apply(Pass, request.params)
      .then((result : any) => {
        sendResponse({ response: result });
      });
    } else if (request.action == "Pass.isPasswordNameTaken") {
      sendResponse({
        response: Pass.isPasswordNameTaken(request.params[0])
      });
    } else if (request.action == "Menu.restore") {
      if(PassFF.menu_state.context_url != PassFF.tab_url) {
        PassFF.menu_state.context_url = null;
        PassFF.menu_state.search_val = "";
        PassFF.menu_state.items = null;
      }
      sendResponse({
        response: PassFF.menu_state.toObject()
      });
    } else if (request.action == "Menu.onEnter") {
      let item = Pass.getItemById(request.params[0]);
      let shiftKey = request.params[1];
      log.debug("onEnter", item, shiftKey);
      switch (Preferences.enterBehavior) {
        case 0:
          //goto url, fill, submit
          Page.goToItemUrl(item, shiftKey, true, true);
          break;
        case 1:
          //goto url, fill
          Page.goToItemUrl(item, shiftKey, true, false);
          break;
        case 2:
          //fill, submit
          getActiveTab().then((tb: Tab) => {
            return Page.fillInputs(tb.id, item);
          }).then((tabId: number) => {
            Page.submit(tabId);
          });
          break;
        case 3:
          //fill
          getActiveTab().then((tb: Tab) => {
            Page.fillInputs(tb.id, item);
          });
          break;
      }
    } else if (request.action == "Page.goToItemUrl") {
      let item = Pass.getItemById(request.params[0]);
      Page.goToItemUrl(item, request.params[1], request.params[2], request.params[3]);
    } else if (request.action == "Page.fillInputs") {
      let item = Pass.getItemById(request.params[0]);
      let andSubmit = request.params[1];
      getActiveTab().then((tb: Tab) => {
        return Page.fillInputs(tb.id, item);
      }).then((tabId: number) => {
        if (andSubmit) Page.submit(tabId);
      });
    } else if (request.action == "Preferences.addInputName") {
      if (Preferences.addInputName(request.params[0], request.params[1])) {
        Preferences.init(true)
          .then(() => Pass.init());
      }
    } else if (request.action == "openOptionsPage") {
      browser.runtime.openOptionsPage();
    } else if (request.action == "refresh") {
      Preferences.init(true)
        .then(() => Pass.init())
        .then(() => sendResponse());
    }
  }
}
