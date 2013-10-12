Components.utils.import("resource://passff/common.js");
Components.utils.import("resource://passff/pass.js");
Components.utils.import("resource://passff/messageCount.js");

/**
* Controls the browser overlay for the PassFF extension.
*/
PassFF.BrowserOverlay = {
  init : function() {
    this.createMenu();
  },

  installButton : function(toolbarId, id, afterId) {
    if (!document.getElementById(id)) {
      let toolbar = document.getElementById(toolbarId);

      // If no afterId is given, then append the item to the toolbar
    let before = null;
      if (afterId) {
        let elem = document.getElementById(afterId);
        if (elem && elem.parentNode == toolbar)
          before = elem.nextElementSibling;
      }

      toolbar.insertItem(id, before);
      toolbar.setAttribute("currentset", toolbar.currentSet);
      document.persist(toolbar.id, "currentset");

      if (toolbarId == "addon-bar")
        toolbar.collapsed = false;
    }
  },

  createMenu : function() {
    let menuPopup = document.getElementById("passff-menu");
    if (menuPopup) {
      for (let i = 0 ; i < PassFF.Pass.rootItems.length ; i++) {
        let root = PassFF.Pass.rootItems[i];
        root.print();
        menuPopup.appendChild(this.createMenuInternal(root));
      }
    }
  },

  createMenuInternal : function(key) {
    key.print()
    let menu = null;
    if (key.children.length > 0) {
      menu = document.createElement("menu");
      let menuPopupDyn = document.createElement("menupopup");
      for(let i = 0 ; i < key.children.length ; i++) {
        menuPopupDyn.appendChild(this.createMenuInternal(key.children[i]));
      }
      menu.appendChild(menuPopupDyn);
    } else {
      menu = document.createElement("menuitem");
    }
    menu.setAttribute("label", key.key);
    //menu.setAttribute("tooltiptext","Show all items");
    //menu.setAttribute("oncommand","filterExt(this); event.preventBubble();");
    return menu;
  }
};

window.addEventListener("load", function load(event){
  //window.removeEventListener("load", load, false); //remove listener, no longer needed
  (function() { this.init(); }).apply(PassFF.BrowserOverlay);
},false);

Application.getExtensions(function (extensions) {
  if (extensions.get("passff@invicem.pro").firstRun) {
    PassFF.BrowserOverlay.installButton("nav-bar", "passff-button");
    PassFF.BrowserOverlay.installButton("addon-bar", "passff-button");
  }
});
