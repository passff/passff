import {ItemObject} from "./pass";
/**
* Controls the browser overlay for the PassFF extension.
*/
declare let browser: any;
import {PassFF, log, MenuStateObject} from './main';
import {Preferences} from './preferences'
import {Dict} from './pass'

let logAndDisplayError = (errorMessage: string) => {
  return (error: any) => {
    log.error(errorMessage, ":", error);
    Menu.addMessage(PassFF.gsfm("passff.errors.unexpected_error"));
  };
};

export class Menu {
  static _currentMenuIndex : number = null;

  private static init() {
    log.debug("Initializing Menu");
    let doc = document;
    Menu.createStaticMenu(doc);
    PassFF.bg_exec('Menu.restore')
      .then((menu_state : MenuStateObject) => {
        if(menu_state['items'] == null) {
          Menu.createContextualMenu(doc);
        } else {
          let searchInput = <HTMLInputElement>doc.getElementById(PassFF.Ids.searchbox);
          searchInput.value = menu_state['search_val'];
          //if(menu_state['items'] instanceof Array) {
            Menu.createItemsMenuList(doc, menu_state['items']);
            searchInput.focus();
          //}
          // TODO: why is this here?
          // else {
          //
          //  Menu.createItemMenuList(doc, menu_state['items']);
          //  searchInput.focus();
          //}
        }
      }).catch(logAndDisplayError("Error restoring menu"));
  }

  private static createStaticMenu(doc: HTMLDocument) {
    let panel = doc.querySelector('body')
    panel.setAttribute('id', PassFF.Ids.panel);

    let searchBox = doc.querySelector('.searchbar input[type=text]');
    searchBox.setAttribute('id', PassFF.Ids.searchbox);
    searchBox.setAttribute('placeholder',
                               PassFF.gsfm('passff.toolbar.search.placeholder'));
    searchBox.addEventListener('click', function (e) { (<HTMLInputElement>e.target).select(); });
    searchBox.addEventListener('keypress', Menu.onSearchKeypress);
    searchBox.addEventListener('keyup', Menu.onSearchKeyup);

    let showAllButton = doc.querySelector('.actions div:nth-child(1) > button');
    showAllButton.setAttribute('id', PassFF.Ids.rootbutton);
    showAllButton.textContent = PassFF.gsfm('passff.button.root.label');
    showAllButton.addEventListener('click', Menu.onRootButtonCommand);

    let showMatchingButton = doc.querySelector('.actions div:nth-child(2) > button');
    showMatchingButton.setAttribute('id', PassFF.Ids.contextbutton);
    showMatchingButton.textContent = PassFF.gsfm('passff.button.context.label');
    showMatchingButton.addEventListener('click', Menu.onContextButtonCommand);

    let entryList = doc.querySelector('.results select');
    entryList.setAttribute('id', PassFF.Ids.entrieslist);
    entryList.addEventListener('keydown', Menu.onListItemkeydown);

    let refreshButton = doc.querySelector('.actions button.reload');
    refreshButton.setAttribute('id', PassFF.Ids.refreshmenuitem);
    refreshButton.setAttribute('title', PassFF.gsfm('passff.toolbar.refresh.label'));
    refreshButton.addEventListener('click', Menu.onRefresh);

    let prefsButton = doc.querySelector('.actions button.config');
    prefsButton.setAttribute('id', PassFF.Ids.prefsmenuitem);
    prefsButton.setAttribute('title', PassFF.gsfm('passff.toolbar.preferences.label'));
    prefsButton.addEventListener('click', Menu.onPreferences);

    let newPasswordButton = doc.querySelector('.actions button.add');
    newPasswordButton.setAttribute('id', PassFF.Ids.newpasswordmenuitem);
    newPasswordButton.setAttribute('title', PassFF.gsfm('passff.toolbar.new_password.label'));
    newPasswordButton.addEventListener('click', Menu.onNewPassword);

    return panel;
  }

  private static onSearchKeypress(event: KeyboardEvent) {
    log.debug('Search keydown', event);

    if (event.ctrlKey || event.altKey) {
      return false;
    }

    if (event.keyCode == 40 || event.keyCode == 13 || event.keyCode == 39) {
      /* DOWN ARROW, RETURN, RIGHT ARROW */
      let doc = (<Node>event.target).ownerDocument;
      let listElm = <HTMLSelectElement>doc.getElementById(PassFF.Ids.entrieslist);

      if (listElm.firstChild) {
        log.debug('Select first child');
        (<HTMLOptionElement>listElm.firstChild).selected = true;
        if (event.keyCode != 39) {
          listElm.focus();
        }
      }

      event.stopPropagation();
    }
    Menu.keyPressManagement(event);

    return false;
  }

  private static onSearchKeyup(event: KeyboardEvent): boolean {
    log.debug('Search keyup', event);

    if (event.keyCode <= 46 && event.keyCode != 8) {
      /* non-alphanumeric and not BACKSPACE */
      return false;
    }

    let doc = (<HTMLInputElement>event.target).ownerDocument;
    if("" == (<HTMLInputElement>event.target).value) {
      Menu.createContextualMenu(doc);
      return false;
    }
    PassFF.bg_exec('Pass.getMatchingItems', (<HTMLInputElement>event.target).value, 6)
      .then((matchingItems : ItemObject[] ) => {
        Menu.createItemsMenuList(doc, matchingItems);
      }).catch(logAndDisplayError("Error getting metching items"));
    return true;
  }

  private static onListItemkeydown(event: KeyboardEvent) {
    log.debug('List item keydown', event);
    Menu.keyPressManagement(event);
  }

  private static keyPressManagement(event: KeyboardEvent) {
    let doc = (<Node>event.target).ownerDocument;
    let listElm = <HTMLSelectElement>doc.getElementById(PassFF.Ids.entrieslist);

    if (event.keyCode == 13) {
      /* RETURN */
      if (listElm.selectedIndex < 0) {
        return;
      } else if (listElm[listElm.selectedIndex].onEnterPress) {
        listElm[listElm.selectedIndex].onEnterPress(event);
      } else {
        listElm[listElm.selectedIndex].click();
      }
    } else if (event.keyCode == 39) {
      /* RIGHT ARROW */
      let item = Menu.getItem(listElm[listElm.selectedIndex]);
      if (item) {
        Menu.createItemMenuList(doc, item);
      }
    } else if (event.keyCode == 37) {
      /* LEFT ARROW */
      let item = Menu.getItem(listElm.firstChild);
      if (item) {
        Menu.createItemMenuList(doc, item);
      } else {
        PassFF.bg_exec('Pass.rootItems').then((rootItems : ItemObject[]) => {
          Menu.createItemsMenuList(doc, rootItems);
        }).catch(logAndDisplayError("Error getting root items"));
      }
    } else if (!event.shiftKey && event.keyCode != 40 && event.keyCode != 38) {
      /* NOT: SHIFT, DOWN ARROW, UP ARROW */
      doc.getElementById(PassFF.Ids.searchbox).focus();
    }
  }

  private static onListItemSelected(event: MouseEvent) {
    log.debug('List item selected', event);
    let doc = (<Node>event.target).ownerDocument;
    let item = Menu.getItem(event.target);

    if (item !== null) {
      Menu.createItemMenuList(doc, item);
    } else {
      PassFF.bg_exec('Pass.rootItems').then((rootItems : ItemObject[]) => {
        Menu.createItemsMenuList(doc, rootItems);
      }).catch(logAndDisplayError("Error getting root items on list item selected"));
    }
  }

  private static onContextButtonCommand(event: MouseEvent) {
    log.debug('Context button command', event);
    Menu.createContextualMenu((<Node>event.target).ownerDocument);
  }

  private static onRootButtonCommand(event: MouseEvent) {
    log.debug('Root button command', event);
    let doc = (<Node>event.target).ownerDocument;
    PassFF.bg_exec('Pass.rootItems').then((rootItems : ItemObject[]) => {
      Menu.createItemsMenuList(doc, rootItems);
      let searchInput = <HTMLInputElement>doc.querySelector("input[type='text']");
      searchInput.value = "";
      searchInput.focus();
    }).catch(logAndDisplayError("Error getting root items on button press"));
  }

  private static onRefresh(event: MouseEvent) {
    log.debug('Refresh', event);

    // remove any lingering messages
    let messages = <HTMLCollectionOf<HTMLDivElement>>document.getElementsByClassName('message');
    Array.prototype.forEach.call(messages, (el : any) => {
      el.parentNode().removeChild(el);
    });

    // update preferences and passwords
    Preferences.init();
    PassFF.bg_exec('refresh')
      .then(() => {
        Menu.createContextualMenu((<Node>event.target).ownerDocument);
      }).catch(logAndDisplayError("Error refreshing menu"));
  }

  private static onPreferences(event: MouseEvent) {
    PassFF.bg_exec('openOptionsPage').catch(logAndDisplayError("Error opening preferences"));
    window.close()
  }

  private static onNewPassword(event: MouseEvent) {
    browser.windows.create({
      'url': browser.extension.getURL('content/newPasswordWindow.html'),
      'width': 450,
      'height': 330,
      'type': 'popup'
    });
    window.close();
  }

  private static onAutoFillMenuClick(event: MouseEvent) {
    event.stopPropagation();
    PassFF.bg_exec('Page.fillInputs', Menu.getItem(event.target), false)
      .catch(logAndDisplayError("Error on auto-fill button press"));
    window.close();
  }

  private static onAutoFillAndSubmitMenuClick(event: MouseEvent) {
    event.stopPropagation();

    PassFF.bg_exec('Page.fillInputs', Menu.getItem(event.target), true)
      .catch(logAndDisplayError("Error on auto-fill-and-submit button press"));
    window.close();
  }

  private static onGoto(event: MouseEvent) {
    event.stopPropagation();

    let item = Menu.getItem(event.target);
    log.debug("Goto item url", item);
    PassFF.bg_exec('Page.goToItemUrl', item, event.button !== 0, false, false)
      .catch(logAndDisplayError("Error on goto button press"));
    window.close();
  }

  private static onGotoAutoFillAndSubmitMenuClick(event: MouseEvent) {
    event.stopPropagation();

    let item = Menu.getItem(event.target);
    log.debug("Goto item url fill and submit", item);
    PassFF.bg_exec('Page.goToItemUrl', item, event.button !== 0, true, true)
      .catch(logAndDisplayError("Error on goto-auto-fill-and-submit button press"));
    window.close();
  }

  private static onDisplayItemData(event: MouseEvent) {
    PassFF
      .bg_exec('Pass.getPasswordData', Menu.getItem(event.target))
      .then((passwordData: Dict<string>) => window.alert(passwordData.fullText))
      .catch(logAndDisplayError("Error getting password data on display item"));
  }

  private static onCopyToClipboard(event: MouseEvent) {
    event.stopPropagation();

    log.debug("copy to clipboard", event);
    let doc = (<Node>event.target).ownerDocument;
    let item = Menu.getItem(event.target);
    let dataKey = Menu.getDataKey(event.target);
    PassFF.bg_exec('Pass.getPasswordData', item)
      .then((passwordData: Dict<string>) => {
        let field = <HTMLInputElement>doc.getElementById('clipboard-field');
        field.value = passwordData[dataKey];
        field.select();
        doc.execCommand('copy', false, null);
        window.close();
      }).catch(logAndDisplayError("Error getting password data on copy to clipboard"));
  }

  private static clearMenuList(doc: HTMLDocument) {
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);
    while (listElm.hasChildNodes()) {
      listElm.removeChild(listElm.firstChild);
    }
    Menu._currentMenuIndex = 0;
  }

  private static createItemMenuList(doc: HTMLDocument, item_id: number) {
    PassFF.bg_exec('Pass.getItemById', item_id)
      .then((item: ItemObject) => {
        log.debug("Create item menu", item);

        Menu.clearMenuList(doc);
        if (item.hasFields || item.isLeaf) {
          Menu.createLeafMenuList(doc, item);
        }
        if (!item.isLeaf) {
          Menu.createItemsMenuList(doc, item.children, false);
        }

        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        let newItem = Menu.createMenuItem(doc, item.parent, '..',
          Menu.onListItemSelected);
        listElm.insertBefore(newItem, listElm.firstChild);
      }).catch(logAndDisplayError("Error getting item by id while creating item menu list"));
  }

  private static createContextualMenu(doc: HTMLDocument) {
    if (doc === null) {
      doc = document;
    }
    log.debug("Create contextual menu");
    PassFF.bg_exec('Pass.getUrlMatchingItems')
      .then((items: ItemObject[]) => {
        Menu.createItemsMenuList(doc, items);
        let searchInput = <HTMLInputElement>doc.getElementById(PassFF.Ids.searchbox);
        searchInput.value = "";
        searchInput.focus();
      }).catch(logAndDisplayError("Error getting matching items on create contextual menu"));
  }

  private static createItemsMenuList(doc: HTMLDocument, items: ItemObject[] = [], cleanMenu: boolean = true) {
    log.debug("Create children menu list", items, cleanMenu);

    if (cleanMenu) {
      Menu.clearMenuList(doc);
    }

    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    items.forEach(function(item) {
      if (item.isField) {
        return;
      }

      let onEnter = null;
      if (item.isLeaf || item.hasFields) {
        onEnter = function(event: KeyboardEvent) {
          PassFF.bg_exec('Menu.onEnter', Menu.getItem(this), event.shiftKey)
            .catch(logAndDisplayError("Error entering menu"));
          window.close();
        };
      }

      let label = item.fullKey;
      if (label != '..' && !item.isLeaf) {
        label += '/';
      }

      listElm.appendChild(Menu.createMenuItem(doc, item, label,
                                                     Menu.onListItemSelected,
                                                     null, onEnter));
    });
  }

  private static createLeafMenuList(doc: HTMLDocument, item: ItemObject) {
    Menu.clearMenuList(doc);

    log.debug('Create leaf menu list', item);
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    [ ['passff.menu.fill', Menu.onAutoFillMenuClick],
      ['passff.menu.fill_and_submit', Menu.onAutoFillAndSubmitMenuClick],
      ['passff.menu.goto_fill_and_submit', Menu.onGotoAutoFillAndSubmitMenuClick],
      ['passff.menu.goto', Menu.onGoto],
      ['passff.menu.copy_login', Menu.onCopyToClipboard, 'login'],
      ['passff.menu.copy_password', Menu.onCopyToClipboard, 'password'],
      ['passff.menu.display', Menu.onDisplayItemData]
    ].forEach(function(data: [string, any]) {
      let newItem = Menu.createMenuItem(doc, item, PassFF.gsfm(data[0]), data[1],
                                               data.length == 3 ? data[2] : void 0);
      listElm.appendChild(newItem);
    });
  }

  private static createMenuItem(doc: HTMLDocument, item: ItemObject, label: string, onClick: (e: MouseEvent)=>void, attribute:string=void 0, onEnterPress: (e: KeyboardEvent)=>void = void 0) {
    let listItemElm = <HTMLOptionElement>doc.createElement('option');
    listItemElm.setAttribute('id', PassFF.Ids.menu + 'richlistitem' +
                                   Menu._currentMenuIndex);
    (<any>listItemElm).item = (item === null) ? null : item.id;
    (<any>listItemElm).dataKey = attribute;
    listItemElm.addEventListener('click', onClick);

    (<any>listItemElm).onEnterPress = onEnterPress;
    listItemElm.textContent = label;

    Menu._currentMenuIndex++;
    return listItemElm;
  }

  private static getDataKey(node: any) {
    while (node && node.dataKey === undefined) {
      node = node.parentNode;
    }
    return node ? node.dataKey : null;
  }

  private static getItem(node: any) {
    while (node && node.item === undefined) {
      node = node.parentNode;
    }
    return node ? node.item : null;
  }

  static addMessage(message: string, severity: string = "error") {
    let body  = document.body,
        panel = document.createElement('div'),
        dismissControl = document.createElement('a'),
        messageNode = document.createTextNode(message);
    panel.classList.add('message', severity);
    dismissControl.classList.add('dismiss');
    dismissControl.innerHTML = '&times;';
    dismissControl.addEventListener('click', () => body.removeChild(panel));
    panel.appendChild(dismissControl);
    panel.appendChild(messageNode);
    body.insertAdjacentElement('beforeend', panel);
  }
}
