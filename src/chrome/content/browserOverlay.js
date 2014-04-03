Components.utils.import("resource://passff/common.js");

/**
* Controls the browser overlay for the PassFF extension.
*/
PassFF.BrowserOverlay = {
  _stringBundle : null,

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

      let repoMenu = document.createElement("menu");
      let allLabel = this._stringBundle.GetStringFromName("passff.menu.all");
      repoMenu.setAttribute("label", allLabel);
      let repoPopup = document.createElement("menupopup");
      repoMenu.appendChild(repoPopup);
      menuPopup.appendChild(repoMenu);

      for (let i = 0 ; i < PassFF.Pass.rootItems.length ; i++) {
        let root = PassFF.Pass.rootItems[i];
        //root.print();
        repoPopup.appendChild(this.createMenuInternal(root, root.key));
      }

      let refreshMenu = document.createElement("menuitem");
      let refreshLabel = this._stringBundle.GetStringFromName("passff.menu.refresh");
      refreshMenu.setAttribute("label", refreshLabel);
      refreshMenu.addEventListener("click", PassFF.BrowserOverlay.refresh);
      menuPopup.appendChild(refreshMenu);

      let separator = document.createElement("menuseparator");
      separator.setAttribute("id", "menu-separator");
      menuPopup.appendChild(separator);
    }
  },

  createMenuInternal : function(item, label) {
    //item.print()
    let menu = document.createElement("menu");
    menu.item = item
      menu.setAttribute("label", label);
    //menu.setAttribute("oncommand","PassFF.BrowserOverlay.goToItemUrl(event)");
    menu.addEventListener("click", PassFF.BrowserOverlay.menuClick);
    let menuPopupDyn = document.createElement("menupopup");
    if (item.children.length > 0) {
      for(let i = 0 ; i < item.children.length ; i++) {
        menuPopupDyn.appendChild(this.createMenuInternal(item.children[i], item.children[i].key));
      }
    } else {
      let passwordLabel = this._stringBundle.GetStringFromName("passff.menu.copy_password");
      let loginLabel = this._stringBundle.GetStringFromName("passff.menu.copy_login");
      let fillLabel = this._stringBundle.GetStringFromName("passff.menu.fill");
      let fillAndSubmitLabel = this._stringBundle.GetStringFromName("passff.menu.fill_and_submit");
      let gotoFillAndSubmitLabel = this._stringBundle.GetStringFromName("passff.menu.goto_fill_and_submit");

      menuPopupDyn.appendChild(this.createSubmenu(fillLabel, "fill", PassFF.BrowserOverlay.autoFill));
      menuPopupDyn.appendChild(this.createSubmenu(fillAndSubmitLabel, "fill_and_submit", PassFF.BrowserOverlay.autoFillAndSubmit));
      menuPopupDyn.appendChild(this.createSubmenu(gotoFillAndSubmitLabel, "goto_fill_and_submit", PassFF.BrowserOverlay.gotoAutoFillAndSubmit));
      menuPopupDyn.appendChild(this.createSubmenu(loginLabel, "login", PassFF.BrowserOverlay.copyToClipboard));
      menuPopupDyn.appendChild(this.createSubmenu(passwordLabel, "password", PassFF.BrowserOverlay.copyToClipboard));
    }

    menu.appendChild(menuPopupDyn);

    return menu;
  },
  
  refresh : function() {
    PassFF.Pass.initItems();
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
    PassFF.BrowserOverlay.goToItemUrl(event.target.item, event);
  },

  autoFill : function(event) {
    event.stopPropagation();
    PassFF.Page.fillInputs(PassFF.BrowserOverlay.getPasswordData(event));
  },

  autoFillAndSubmit : function(event) {
    PassFF.BrowserOverlay.autoFill(event);
    PassFF.Page.submit(window.content.location.href);
  },

  gotoAutoFillAndSubmit : function(event) {
    let item = event.target.parentNode.parentNode.item;
    PassFF.Page.itemToUse = item;
    PassFF.BrowserOverlay.goToItemUrl(item, event);
  },

  goToItemUrl : function(item, event) {
    event.stopPropagation();
    if (item == null || item == undefined) return;

    let passwordData = PassFF.Pass.getPasswordData(item);
    let url = passwordData.url;
    if (url == null || url == undefined) url = item.key;
    if (!url.startsWith("http")) url = "http://" + url;
    if (url != null && url != undefined) {
      if (event.button == 0) {
        window.content.location.href = url;
      } else {
        gBrowser.selectedTab = gBrowser.addTab(url);
      }
    }
  },
  
  copyToClipboard : function(event) {
    event.stopPropagation();
    let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    let clip = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
    let passwordData = PassFF.BrowserOverlay.getPasswordData(event);
    str.data = passwordData[event.target.dataKey];
    trans.addDataFlavor('text/unicode');
    trans.setTransferData('text/unicode', str, str.data.length * 2);
    clip.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
  },

  getPasswordData : function(event) {
    return PassFF.Pass.getPasswordData(event.target.parentNode.parentNode.item);
  },

  createContextualMenu : function(items) {
    let separator = document.getElementById("menu-separator")
    while (separator != null && separator.nextSibling) {
      separator.parentNode.removeChild(separator.nextSibling);
    }
    for(let i = 0 ; i < items.length ; i++) {
      let item = items[i];
      separator.parentNode.appendChild(this.createMenuInternal(item, item.fullKey()));
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
