Components.utils.import("resource://passff/common.js");
Components.utils.import("resource://passff/pass.js");

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
    let repoMenu = document.createElement("menu");
    repoMenu.setAttribute("label", "All");
    let repoPopup = document.createElement("menupopup");
    repoMenu.appendChild(repoPopup);
    menuPopup.appendChild(repoMenu);
    if (menuPopup) {
      for (let i = 0 ; i < PassFF.Pass.rootItems.length ; i++) {
        let root = PassFF.Pass.rootItems[i];
        //root.print();
        repoPopup.appendChild(this.createMenuInternal(root, root.key));
      }
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
    menu.addEventListener("click", PassFF.BrowserOverlay.goToItemUrl);
    let menuPopupDyn = document.createElement("menupopup");
    if (item.children.length > 0) {
      for(let i = 0 ; i < item.children.length ; i++) {
        menuPopupDyn.appendChild(this.createMenuInternal(item.children[i], item.children[i].key));
      }
    } else {
      let passwordLabel = this._stringBundle.GetStringFromName("passff.menu.copy_password");
      let loginLabel = this._stringBundle.GetStringFromName("passff.menu.copy_login");
      menuPopupDyn.appendChild(this.createSubmenu(loginLabel, "login", PassFF.BrowserOverlay.copyToClipboard));
      menuPopupDyn.appendChild(this.createSubmenu(passwordLabel, "password", PassFF.BrowserOverlay.copyToClipboard));
    }

    menu.appendChild(menuPopupDyn);

    return menu;
  },
  
  createSubmenu : function(label, attribute, action) {
      let submenu = document.createElement("menuitem");
      submenu.setAttribute("label", label);
      submenu.dataKey = attribute;
      submenu.addEventListener("click", action);

    return submenu;
  },

  goToItemUrl : function(event) {
    event.stopPropagation();
    let item = event.target.item;
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
    let subMenu = event.target;
    let item = subMenu.parentNode.parentNode.item;
    let attribute = subMenu.dataKey
    let passwordData = PassFF.Pass.getPasswordData(item);
    str.data = passwordData[attribute];
    trans.addDataFlavor('text/unicode');
    trans.setTransferData('text/unicode', str, str.data.length * 2);
    clip.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
  },

  createContextualMenu : function(items) {
    let separator = document.getElementById("menu-separator")
    while (separator != null && separator.nextSibling) {
      separator.parentNode.removeChild(separator.nextSibling);
    }
    for(let i = 0 ; i < items.length ; i++) {

      let item = items[i];
      let labelItem = item;
      let label = "";
      while (labelItem != null) {
        label = labelItem.key + "/" + label
        labelItem = labelItem.parent;
      }
      separator.parentNode.appendChild(this.createMenuInternal(item, label));
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
