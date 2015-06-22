# PassFF Javascript Conventions

Please follow these conventions and amend to them when necessary.

## Indentation

Two spaces.

## Line length

At most 90 characters.

## Semicolons

Always terminate statements with semicolons.

## In-line functions

Please don't.

```
// good
toggleKey.addEventListener('command', function(event) {
  event.target.ownerDocument.getElementById(PassFF.Ids.button).click();
}, true);

// bad
toggleKey.addEventListener('command', function(event) {event.target.ownerDocument.getElementById(PassFF.Ids.button).click();}, true);
```

## Braces

On the same line as the statement.

```
// good
if (true) {
  // your code here
}

// bad
if (true)
{
  // your code here
}
```

## Line breaking

When breaking statements into multiple lines:

* Place function arguments one character to the right of the opening paranthesis.
```
PassFF.Menu.createContextualMenu(aBrowser.ownerDocument,
                                 aBrowser.ownerGlobal.content.location.href);
```

* Break chained function calls before the connecting dot, and align the dot
  with the last dot on the previous line.
```
let domWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                          .getInterface(Ci.nsIDOMWindow);
```

