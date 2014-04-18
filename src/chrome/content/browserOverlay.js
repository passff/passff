var EXPORTED_SYMBOLS = [];

Cu.import("resource://passff/common.js");
Cu.import("resource://passff/pass.js");

/**
* Controls the browser overlay for the PassFF extension.
*/
PassFF.BrowserOverlay = {
  _stringBundle : null,
  _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),

  init : function() {
    let stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
    this._stringBundle = stringBundleService.createBundle("chrome://passff/locale/strings.properties");

    this.createMenu();
  },

  installButton : function(toolbarId, id, afterId) {
    if (!document.getElementById(id)) {
      let toolbar = document.getElementById(toolbarId);

      // If no afterId is given, then append the item to the toolbar
      let before = null;
      if (afterId) {
        let elem = document.getElementById(afterId);
        if (elem && elem.parentNode == toolbar) before = elem.nextElementSibling;
      }

      toolbar.insertItem(id, before);
      toolbar.setAttribute("currentset", toolbar.currentSet);
      document.persist(toolbar.id, "currentset");

      if (toolbarId == "addon-bar") toolbar.collapsed = false;
    }
  },

  createMenu : function() {
    let menuPopup = document.getElementById("passff-menu");
    if (menuPopup) {
      while (menuPopup.hasChildNodes()) {
          menuPopup.removeChild(menuPopup.lastChild);
      }

      for (let i = 0 ; i < PassFF.Pass.rootItems.length ; i++) {
        let root = PassFF.Pass.rootItems[i];
        let rootMenu= this.createMenuInternal(root, root.key);
        if (rootMenu) menuPopup.appendChild(rootMenu);
      }

      let separator = document.createElement("menuseparator");
      separator.setAttribute("id", "menu-separator");
      menuPopup.appendChild(separator);

    }
  },

  searchKeyDown : function(event) {
    console.debug("[PassFF]", "Search keydown : " + event.keyCode);
    if(event.keyCode == 40) {
      console.debug("[PassFF]", "Arrow down")
      let listElm = document.getElementById("entries-list");
      if(listElm.firstChild) listElm.firstChild.selected = false;
      listElm.selectItem(listElm.firstChild)
      document.getElementById('entries-list').focus();
      return false;
    }
    if(event.keyCode == 13) {
      let listElm = document.getElementById("entries-list");
      let searchPanel = document.getElementById('search-panel');
      listElm.selectItem(listElm.firstChild)
      console.debug("[PassFF]", "Selected item", listElm.selectedItem)
      let item = PassFF.BrowserOverlay.getItem(listElm.selectedItem);
      PassFF.Page.itemToUse = item;
      PassFF.BrowserOverlay.goToItemUrl(item, event.shiftKey);
      searchPanel.hidePopup();
      //listElm.firefogg
    }
  },

  listItemkeyPress : function(event) {
    console.debug("[PassFF]", "List item keydown : ", event);
    let searchPanel = document.getElementById('search-panel');
    if(event.keyCode == 13) {
      let item = PassFF.BrowserOverlay.getItem(event.target.selectedItem);
      PassFF.Page.itemToUse = item;
      PassFF.BrowserOverlay.goToItemUrl(item, event.shiftKey);
      searchPanel.hidePopup();
    } else if (event.keyCode != 40 && event.keyCode !=38) {
      let inputText = searchPanel.getElementsByAttribute('id', 'search')[0]
      inputText.focus();
      //inputText.setSelectionRange(0, inputText.value.length)
    }
  },

  listItemClick : function(event) {
    console.debug("[PassFF]", "List item click : ", event);
    let searchPanel = document.getElementById('search-panel');
    let item = PassFF.BrowserOverlay.getItem(event.target.parentNode.parentNode.selectedItem);
    console.debug(item);
    PassFF.Page.itemToUse = item;
    PassFF.BrowserOverlay.goToItemUrl(item, event.shiftKey);
    searchPanel.hidePopup();
  },

  createMatchingSearchList : function(search) {
    let listElm = document.getElementById("entries-list");

    while (listElm.hasChildNodes()) {
      listElm.removeChild(listElm.firstChild);
    }

    let matchItems  = PassFF.Pass.getMatchingItems(search, 6);
    matchItems.forEach(function(item) {
      if (!item.isField()) {
        let listItemElm = document.createElement("richlistitem");
        listItemElm.item = item;
        let descElm = document.createElement("label")
        descElm.setAttribute("value", item.fullKey());
        listItemElm.appendChild(descElm);
        listElm.appendChild(listItemElm);
      }
    });
  },

  openSearchPanel : function() {
    let searchPanel = document.getElementById('search-panel');
    searchPanel.openPopup(document.getElementById('passff-button'), 'after_start', 0, 0, false, false);
  },

  onPanelShow : function() {
    let searchPanel = document.getElementById('search-panel');
    let inputText = searchPanel.getElementsByAttribute('id', 'search')[0]
    inputText.focus();
    inputText.setSelectionRange(0, inputText.value.length)
  },

  openPreferences : function() {
    if (null == this._preferencesWindow || this._preferencesWindow.closed) {
      let instantApply =
      Application.prefs.get("browser.preferences.instantApply");
      let features = "chrome,titlebar,toolbar,centerscreen" + (instantApply.value ? ",dialog=no" : ",modal");
      this._preferencesWindow = window.openDialog( "chrome://passff/content/preferencesWindow.xul", "passff-preferences-window", features);
    }

    this._preferencesWindow.focus();
  },
  createMenuInternal : function(item, label) {
    if(item.isField()) return null;
    let menu = document.createElement("menu");
    menu.item = item
    menu.setAttribute("label", label);
    //menu.setAttribute("oncommand","PassFF.BrowserOverlay.goToItemUrl(event)");
    menu.addEventListener("click", PassFF.BrowserOverlay.menuClick);
    let menuPopupDyn = document.createElement("menupopup");
    if (!item.isLeaf()) {
      if (item.hasFields()) {
        PassFF.BrowserOverlay.createCommandMenu(menuPopupDyn)
      }
      for (let i = 0 ; i < item.children.length ; i++) {
        let newMenu = this.createMenuInternal(item.children[i], item.children[i].key)
        if (newMenu) menuPopupDyn.appendChild(newMenu);
      }
    } else {
      PassFF.BrowserOverlay.createCommandMenu(menuPopupDyn)
    }

    menu.appendChild(menuPopupDyn);
    return menu;
  },

  createMenuPopup: function(attribute) {
    
  },

  createCommandMenu: function(menuPopupDyn) {
      let passwordLabel = this._stringBundle.GetStringFromName("passff.menu.copy_password");
      let loginLabel = this._stringBundle.GetStringFromName("passff.menu.copy_login");
      let fillLabel = this._stringBundle.GetStringFromName("passff.menu.fill");
      let fillAndSubmitLabel = this._stringBundle.GetStringFromName("passff.menu.fill_and_submit");
      let gotoFillAndSubmitLabel = this._stringBundle.GetStringFromName("passff.menu.goto_fill_and_submit");
      let displayLabel = this._stringBundle.GetStringFromName("passff.menu.display");

      menuPopupDyn.appendChild(this.createSubmenu(fillLabel, "fill", PassFF.BrowserOverlay.autoFillMenuClick));
      menuPopupDyn.appendChild(this.createSubmenu(fillAndSubmitLabel, "fill_and_submit", PassFF.BrowserOverlay.autoFillAndSubmitMenuClick));
      menuPopupDyn.appendChild(this.createSubmenu(gotoFillAndSubmitLabel, "goto_fill_and_submit", PassFF.BrowserOverlay.gotoAutoFillAndSubmitMenuClick));
      menuPopupDyn.appendChild(this.createSubmenu(loginLabel, "login", PassFF.BrowserOverlay.copyToClipboard));
      menuPopupDyn.appendChild(this.createSubmenu(passwordLabel, "password", PassFF.BrowserOverlay.copyToClipboard));
      menuPopupDyn.appendChild(this.createSubmenu(displayLabel, "display", PassFF.BrowserOverlay.display));
  },
  
  refresh : function() {
    (function() { PassFF.Preferences._init(); }).apply(PassFF.Preferences);
    (function() { PassFF.Pass.init(); }).apply(PassFF.Pass);
    PassFF.BrowserOverlay.createMenu();
    let matchItems  = PassFF.Pass.getUrlMatchingItems(window.content.location.href);
    PassFF.BrowserOverlay.createContextualMenu(matchItems);
  },

  createSubmenu : function(label, attribute, action) {
      let submenu = document.createElement("menuitem");
      submenu.setAttribute("label", label);
      submenu.dataKey = attribute;
      submenu.addEventListener("click", action);

    return submenu;
  },

  menuClick : function(event) {
    event.stopPropagation();
    let item = PassFF.BrowserOverlay.getItem(event.target);
    PassFF.BrowserOverlay.goToItemUrl(item, event.button != 0);
  },

  autoFillMenuClick : function(event) {
    event.stopPropagation();
    let item = PassFF.BrowserOverlay.getItem(event.target);
    PassFF.Page.fillInputs(item);
  },

  autoFillAndSubmitMenuClick : function(event) {
    event.stopPropagation();
    let item = PassFF.BrowserOverlay.getItem(event.target);
    PassFF.Page.fillInputs(item);
    PassFF.Page.submit(window.content.location.href);
  },

  gotoAutoFillAndSubmitMenuClick : function(event) {
    event.stopPropagation();
    let item = PassFF.BrowserOverlay.getItem(event.target);
    PassFF.Page.itemToUse = item;
    PassFF.BrowserOverlay.goToItemUrl(item, event.button != 0);
  },

  goToItemUrl: function(item, newTab) {
    if (item == null || item == undefined) return;

    let passwordData = PassFF.Pass.getPasswordData(item);
    let url = passwordData.url;
    if (url == null || url == undefined) url = item.key;
    if (!url.startsWith("http")) url = "http://" + url;
    if (url != null && url != undefined) {
      if (newTab) {
        gBrowser.selectedTab = gBrowser.addTab(url);
      } else {
        window.content.location.href = url;
      }
    }
  },

  display : function(event) {
    let item = PassFF.BrowserOverlay.getItem(event.target);
    let passwordData = PassFF.Pass.getPasswordData(item);
    let login = passwordData["login"];
    let password = passwordData["password"];
    let title = PassFF.BrowserOverlay._stringBundle.GetStringFromName("passff.display.title");
    let desc = PassFF.BrowserOverlay._stringBundle.formatStringFromName("passff.display.description", [login, password], 2);
    if(!PassFF.BrowserOverlay._promptService.alert(null, title, desc)) return;
  },
  
  copyToClipboard : function(event) {
    event.stopPropagation();
    let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    let clip = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
    let item = PassFF.BrowserOverlay.getItem(event.target);
    let passwordData = PassFF.Pass.getPasswordData(item);
    str.data = passwordData[event.target.dataKey];
    trans.addDataFlavor('text/unicode');
    trans.setTransferData('text/unicode', str, str.data.length * 2);
    clip.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
  },

  getItem : function(menuItem) {
    while (menuItem && menuItem.item == undefined) menuItem = menuItem.parentNode;
  
    return menuItem ? menuItem.item : null;
  },

  createContextualMenu : function(items) {
    let contextualMenu = document.getElementById("contextual-menu")

    while (contextualMenu.hasChildNodes()) {
      contextualMenu.removeChild(contextualMenu.lastChild);
    }

    for(let i = 0 ; i < items.length ; i++) {
      let item = items[i];
      let itemMenu = this.createMenuInternal(item, item.fullKey())
      if (itemMenu) contextualMenu.appendChild(itemMenu);
    }
  }
};

window.addEventListener("load", function load(event){
  (function() { this.init(); }).apply(PassFF.BrowserOverlay);
},false);

Application.getExtensions(function (extensions) {
  if (extensions.get("passff@invicem.pro").firstRun) {
    PassFF.BrowserOverlay.installButton("nav-bar", "passff-button");
    PassFF.BrowserOverlay.installButton("addon-bar", "passff-button");
  }
});
