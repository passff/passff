const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import('resource://gre/modules/Services.jsm');

function loadIntoWindow(window) {
  if (!window) return;
  let doc = window.document;
  let toolbox = doc.querySelector('#navigator-toolbox');
    let button = doc.createElement("toolbarbutton");
    button.setAttribute("id", "passff-button");
    button.setAttribute("label", "&passff.toolbar.button.label;");
    button.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
    button.setAttribute("type", "panel");
    button.setAttribute("orient", "horizontal");
    button.setAttribute("tooltiptext", "&passff.toolbar.button.tooltip;");
    //button.style.listStyleImage = "url(" + icon + ")";
    //button.addEventListener("command", main.action, false);
	toolbox.palette.appendChild(button);
}
 

function unloadFromWindow(window) {
  if (!window) return;
  let doc = window.document;
  let button = doc.querySelector('#passff-button');
  let toolbox = doc.querySelector('#navigator-toolbox');
  toolbox.palette.removeChild(button);
  // Remove any persistent UI elements
  // Perform any other cleanup
}

var windowListener = {
  onOpenWindow: function(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    domWindow.addEventListener("UIReady", function onLoad() {
      domWindow.removeEventListener("UIReady", onLoad, false);
      loadIntoWindow(domWindow);
    }, false);
  },
 
  onCloseWindow: function(aWindow) {},
  onWindowTitleChange: function(aWindow, aTitle) {}
};

function startup(aData, aReason) {
  // Load into any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }

  // Load into any new windows
  Services.wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN)
    return;

  // Stop listening for new windows
  Services.wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
}

function install(aData, aReason) {}
function uninstall(aData, aReason) {}
