/**
* Controls the browser overlay for the PassFF extension.
*/
/* jshint node: true */
'use strict';

PassFF.Menu = {
  _currentMenuIndex: null,
  _stringBundle: null,
  _promptService: Cc['@mozilla.org/embedcomp/prompt-service;1']
                 .getService(Components.interfaces.nsIPromptService),

  createStaticMenu: function(doc) {
    let panel = doc.createElement('panelview');
    panel.setAttribute('id', PassFF.Ids.panel);

    let searchBox = doc.createElement('textbox');
    searchBox.setAttribute('id', PassFF.Ids.searchbox);
    searchBox.setAttribute('placeholder',
                               PassFF.gsfm('passff.toolbar.search.placeholder'));
    searchBox.setAttribute('clickSelectsAll', 'true');
    searchBox.addEventListener('keypress', PassFF.Menu.onSearchKeypress);
    searchBox.addEventListener('keyup', PassFF.Menu.onSearchKeyup);

    let showAllButton = doc.createElement('button');
    showAllButton.setAttribute('id', PassFF.Ids.rootbutton);
    showAllButton.setAttribute('label', PassFF.gsfm('passff.button.root.label'));
    showAllButton.addEventListener('command', PassFF.Menu.onRootButtonCommand);

    let showMatchingButton = doc.createElement('button');
    showMatchingButton.setAttribute('id', PassFF.Ids.contextbutton);
    showMatchingButton.setAttribute('label', PassFF.gsfm('passff.button.context.label'));
    showMatchingButton.addEventListener('command', PassFF.Menu.onContextButtonCommand);

    let showButtonsBox = doc.createElement('hbox');
    showButtonsBox.setAttribute('id', PassFF.Ids.buttonsbox);
    showButtonsBox.appendChild(showAllButton);
    showButtonsBox.appendChild(showMatchingButton);

    let entryList = doc.createElement('richlistbox');
    entryList.setAttribute('id', PassFF.Ids.entrieslist);
    entryList.addEventListener('keydown', PassFF.Menu.onListItemkeydown);
    entryList.addEventListener('keyup', PassFF.Menu.onListItemkeyup);

    let refreshButton = doc.createElement('button');
    refreshButton.setAttribute('id', PassFF.Ids.refreshmenuitem);
    refreshButton.setAttribute('label', PassFF.gsfm('passff.toolbar.refresh.label'));
    refreshButton.addEventListener('click', PassFF.Menu.onRefresh);

    let prefsButton = doc.createElement('button');
    prefsButton.setAttribute('id', PassFF.Ids.prefsmenuitem);
    prefsButton.setAttribute('label', PassFF.gsfm('passff.toolbar.preferences.label'));
    prefsButton.addEventListener('click', PassFF.Menu.onPreferences);

    let newPasswordButton = doc.createElement('button');
    newPasswordButton.setAttribute('id', PassFF.Ids.newpasswordmenuitem);
    newPasswordButton.setAttribute('label', PassFF.gsfm('passff.toolbar.new_password.label'));
    newPasswordButton.addEventListener('click', PassFF.Menu.onNewPassword);

    let lowerButtonsBox = doc.createElement('hbox');
    lowerButtonsBox.appendChild(refreshButton);
    lowerButtonsBox.appendChild(prefsButton);
    lowerButtonsBox.appendChild(newPasswordButton);

    panel.appendChild(searchBox);
    panel.appendChild(doc.createElement('menuseparator'));
    panel.appendChild(showButtonsBox);
    panel.appendChild(entryList);
    panel.appendChild(doc.createElement('menuseparator'));
    panel.appendChild(lowerButtonsBox);

    return panel;
  },

  onSearchKeypress: function(event) {
    log.debug('Search keydown', event);

    if (event.ctrlKey || event.altKey) {
      return false;
    }

    if (event.keyCode == 40 || event.keyCode == 13 || event.keyCode == 39) {
      log.debug('Select first child');

      let doc = event.target.ownerDocument;
      let listElm = doc.getElementById(PassFF.Ids.entrieslist);

      if (listElm.firstChild) {
        listElm.firstChild.selected = false;
        let item = listElm.firstChild;

        if (event.keyCode == 40) {
          item = item.nextSibling;
        }

        listElm.selectItem(item);
        item.selected = true;
      }

      if (event.keyCode != 39) {
        listElm.focus();
      }
      event.stopPropagation();
    }
    PassFF.Menu.keyPressManagement(event);

    return false;
  },

  onSearchKeyup: function(event) {
    log.debug('Search keyup', event);

    if (event.keyCode <= 46) {
      return false;
    }

    let doc = event.target.ownerDocument;
    let matchingItems = PassFF.Pass.getMatchingItems(event.target.value, 6);
    PassFF.Menu.createItemsMenuList(doc, matchingItems);
  },

  onListItemkeydown: function(event) {
    log.debug('List item keydown', event);
    PassFF.Menu.keyPressManagement(event);
  },

  onListItemkeyup: function(event) {
    log.debug('List item keyup', event);
    if (event.keyCode <= 46) {
      return false;
    }
    if (event.keyCode == 39) {
      let doc = event.target.ownerDocument;
      let searchInputElm = doc.getElementById(PassFF.Ids.searchbox);
      searchInputElm.focus();
      event.stopPropagation();
    }
  },

  keyPressManagement: function(event) {
    let doc = event.target.ownerDocument;
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    if (event.keyCode == 13) {
      if (listElm.selectedItem.onEnterPress) {
        listElm.selectedItem.onEnterPress(event);
      } else {
        listElm.selectedItem.click();
      }
    } else if (event.keyCode == 39) {
      let item = PassFF.Menu.getItem(listElm.selectedItem);
      let doc = event.target.ownerDocument;
      PassFF.Menu.createItemMenuList(doc, item);
    } else if (event.keyCode == 37) {
      let doc = event.target.ownerDocument;
      let item = PassFF.Menu.getItem(listElm.firstChild);
      if (item) {
        PassFF.Menu.createItemMenuList(doc, item);
      } else {
        PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
      }
    } else if (event.keyCode != 40 && event.keyCode != 38) {
      event.target.ownerDocument.getElementById(PassFF.Ids.searchbox).focus();
    }
  },

  onListItemSelected: function(event) {
    log.debug('List item selected', event);
    let doc = event.target.ownerDocument;
    let item = PassFF.Menu.getItem(event.target);

    if (item) {
      PassFF.Menu.createItemMenuList(doc, item);
    } else {
      PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
    }
  },

  onContextButtonCommand: function(event) {
    log.debug('Context button command', event);
    PassFF.Menu.createContextualMenu(event.target.ownerDocument,
                                     event.target.ownerGlobal.content.location.href);
  },

  onRootButtonCommand: function(event) {
    log.debug('Root button command', event);
    let doc = event.target.ownerDocument;
    PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
  },

  onRefresh: function(event) {
    log.debug('Refresh', event);
    (function() { PassFF.Preferences.init(); }).apply(PassFF.Preferences);
    (function() { PassFF.Pass.init(); }).apply(PassFF.Pass);

    PassFF.Menu.createContextualMenu(event.target.ownerDocument,
                                     event.target.ownerGlobal.content.location.href);
  },

  onPreferences: function(event) {
    event.target.ownerGlobal.openDialog('chrome://passff/content/preferencesWindow.xul',
                                        'passff-preferences-window',
                                        'chrome,titlebar,toolbar,modal');
  },

  onNewPassword: function(event) {
    let refreshFn = function() {
      PassFF.Menu.onRefresh(event);
    };
    event.target.ownerGlobal.openDialog('chrome://passff/content/newPasswordWindow.xul',
                                        'passff-new-password-window',
                                        'chrome,titlebar,toolbar,modal',
                                        PassFF.Pass,
                                        refreshFn);
  },

  onAutoFillMenuClick: function(event) {
    event.stopPropagation();

    CustomizableUI.hidePanelForNode(event.target);
    PassFF.Page.fillInputs(event.target.ownerGlobal.content.document,
                           PassFF.Menu.getItem(event.target));
  },

  onAutoFillAndSubmitMenuClick: function(event) {
    event.stopPropagation();

    CustomizableUI.hidePanelForNode(event.target);
    let doc = event.target.ownerGlobal.content.document;
    PassFF.Page.fillInputs(doc, PassFF.Menu.getItem(event.target));
    PassFF.Page.submit(doc, event.target.ownerGlobal.content.location.href);
  },

  onGoto: function(event) {
    event.stopPropagation();

    let item = PassFF.Menu.getItem(event.target);
    log.debug('Goto item url', item);
    CustomizableUI.hidePanelForNode(event.target);
    PassFF.Menu.goToItemUrl(item, event.button !== 0, false, false);
  },

  onGotoAutoFillAndSubmitMenuClick: function(event) {
    event.stopPropagation();

    let item = PassFF.Menu.getItem(event.target);
    log.debug('Goto item url fill and submit', item);
    CustomizableUI.hidePanelForNode(event.target);
    PassFF.Menu.goToItemUrl(item, event.button !== 0, true, true);
  },

  onDisplayItemData: function(event) {
    CustomizableUI.hidePanelForNode(event.target);
    let item = PassFF.Menu.getItem(event.target);
    let passwordData = PassFF.Pass.getPasswordData(item);
    let login = passwordData.login;
    let password = passwordData.password;
    let url = (passwordData.url) ? passwordData.url : '';
    let title = PassFF.gsfm('passff.display.title');
    let desc = PassFF.gsfm('passff.display.description', [login, password, url], 2);
    PassFF.Menu._promptService.alert(null, title, desc);
  },

  onCopyToClipboard: function(event) {
    event.stopPropagation();

    log.debug('copy to clipboard', event);
    CustomizableUI.hidePanelForNode(event.target);

    let str = Cc['@mozilla.org/supports-string;1']
              .createInstance(Ci.nsISupportsString);

    let trans = Cc['@mozilla.org/widget/transferable;1']
                .createInstance(Ci.nsITransferable);

    let clip = Cc['@mozilla.org/widget/clipboard;1']
               .getService(Ci.nsIClipboard);

    let item = PassFF.Menu.getItem(event.target);
    let passwordData = PassFF.Pass.getPasswordData(item);

    str.data = passwordData[PassFF.Menu.getDataKey(event.target)];

    trans.addDataFlavor('text/unicode');
    trans.setTransferData('text/unicode', str, str.data.length * 2);

    clip.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
  },

  clearMenuList: function(doc) {
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);
    while (listElm.hasChildNodes()) {
      listElm.removeChild(listElm.firstChild);
    }
    PassFF.Menu._currentMenuIndex = 0;
  },

  createItemMenuList: function(doc, item) {
    log.debug('Create item menu', item);

    PassFF.Menu.clearMenuList(doc);
    if (item.hasFields() || item.isLeaf()) {
      PassFF.Menu.createLeafMenuList(doc, item);
    }
    if (!item.isLeaf()) {
      PassFF.Menu.createItemsMenuList(doc, item.children, false);
    }

    let listElm = doc.getElementById(PassFF.Ids.entrieslist);
    let newItem = PassFF.Menu.createMenuItem(doc, item.parent, '..',
                                             PassFF.Menu.onListItemSelected);
    listElm.insertBefore(newItem, listElm.firstChild);
  },

  createContextualMenu: function(doc, url) {
    log.debug('createContextualMenu', url);
    let items = PassFF.Pass.getUrlMatchingItems(url);
    if (items.length === 0) {
      items = PassFF.Pass.rootItems;
    }
    PassFF.Menu.createItemsMenuList(doc, items);
  },

  createItemsMenuList: function(doc, items, cleanMenu) {
    log.debug('Create children menu list', items, cleanMenu);

    if (cleanMenu === undefined || cleanMenu) {
      PassFF.Menu.clearMenuList(doc);
    }

    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    items.forEach(function(item) {
      if (item.isField()) {
        return;
      }

      let onEnter = null;
      if (item.isLeaf() || item.hasFields()) {
        onEnter = function(event) {
          CustomizableUI.hidePanelForNode(event.target);
          let doc = event.target.ownerGlobal.content.document;
          switch (PassFF.Preferences.enterBehavior){
            case 0:
              //goto url, fill, submit
              PassFF.Menu.goToItemUrl(PassFF.Menu.getItem(this), event.shiftKey, true, true);
              break;
            case 1:
              //goto url, fill
              PassFF.Menu.goToItemUrl(PassFF.Menu.getItem(this), event.shiftKey, true, false);
              break;
            case 2:
              //fill, submit
              PassFF.Page.fillInputs(doc, PassFF.Menu.getItem(this));
              PassFF.Page.submit(doc, event.target.ownerGlobal.content.location.href);
              break;
            case 3:
              //fill
              PassFF.Page.fillInputs(doc, PassFF.Menu.getItem(this));
              break;
          }
        };
      }

      let label = item.fullKey();
      if (label != '..' && !item.isLeaf()) {
        label += '/';
      }

      listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, label,
                                                     PassFF.Menu.onListItemSelected,
                                                     null, onEnter));
    });
  },

  createLeafMenuList: function(doc, item) {
    PassFF.Menu.clearMenuList(doc);

    log.debug('Create leaf menu list', item);
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    [ ['passff.menu.fill', PassFF.Menu.onAutoFillMenuClick],
      ['passff.menu.fill_and_submit', PassFF.Menu.onAutoFillAndSubmitMenuClick],
      ['passff.menu.goto_fill_and_submit', PassFF.Menu.onGotoAutoFillAndSubmitMenuClick],
      ['passff.menu.goto', PassFF.Menu.onGoto],
      ['passff.menu.copy_login', PassFF.Menu.onCopyToClipboard, 'login'],
      ['passff.menu.copy_password', PassFF.Menu.onCopyToClipboard, 'password'],
      ['passff.menu.display', PassFF.Menu.onDisplayItemData]
    ].forEach(function(data) {
      let newItem = PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm(data[0]), data[1],
                                               data.length == 3 ? data[2] : undefined);
      listElm.appendChild(newItem);
    });
  },

  createMenuItem: function(doc, item, label, onClick, attribute, onEnterPress) {
    let descElm = doc.createElement('label');
    descElm.setAttribute('id', PassFF.Ids.menu + 'label' +
                               PassFF.Menu._currentMenuIndex);
    descElm.setAttribute('value', label);

    let xulName = doc.createElement('hbox');
    xulName.setAttribute('id', PassFF.Ids.menu + 'hbox' + PassFF.Menu._currentMenuIndex);
    xulName.appendChild(descElm);

    let listItemElm = doc.createElement('richlistitem');
    listItemElm.setAttribute('id', PassFF.Ids.menu + 'richlistitem' +
                                   PassFF.Menu._currentMenuIndex);
    listItemElm.item = item;
    listItemElm.dataKey = attribute;
    listItemElm.addEventListener('click', onClick);

    listItemElm.onEnterPress = onEnterPress;
    listItemElm.appendChild(xulName);

    PassFF.Menu._currentMenuIndex++;
    return listItemElm;
  },

  goToItemUrl: function(item, newTab, autoFill, submit) {
    if (!item) {
      return;
    }

    log.debug('go to item url', item, newTab, autoFill, submit);
    let passwordData = PassFF.Pass.getPasswordData(item);
    let url = passwordData.url;

    if (!url) {
      url = item.key;
    }

    if (!url.startsWith('http')) {
      url = 'http://' + url;
    }

    let window = Services.wm.getMostRecentWindow('navigator:browser');
    if (newTab) {
      window.gBrowser.selectedTab = window.gBrowser.addTab(url);
    } else {
      window.content.location.href = url;
    }

    if (!autoFill) {
      return;
    }

    PassFF.Page.autoFillAndSubmitPending = true;
    let currentTab = window.gBrowser.getBrowserForTab(window.gBrowser.selectedTab);

    currentTab.addEventListener('load', function load(event) {
      log.info('Start auto-fill');

      currentTab.removeEventListener('load', load, true);
      PassFF.Page.autoFillAndSubmitPending = false;

      let doc = event.originalTarget;
      PassFF.Page.fillInputs(doc, item);

      if (submit) {
        log.info('Start submit');
        PassFF.Page.submit(doc, url);
      }
    }, true);
  },

  getDataKey: function(node) {
    while (node && node.dataKey === undefined) {
      node = node.parentNode;
    }
    return node ? node.dataKey : null;
  },

  getItem: function(node) {
    while (node && node.item === undefined) {
      node = node.parentNode;
    }
    return node ? node.item : null;
  }
};
