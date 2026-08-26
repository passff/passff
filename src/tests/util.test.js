import * as util from "../modules/util.js";
import PassFF from "../modules/main.js";

beforeAll(() =>
  Object.defineProperty(global, "browser", { value: {}, writable: false }),
);

test("semver", () => {
  expect(util.semver.gt("1.1.6", "1.4.0")).toBe(false);
  expect(util.semver.gt("1.19", "1.18.4")).toBe(true);
  expect(util.semver.gt("4.3.92", "4.3.92")).toBe(false);
  expect(util.semver.gte("1.19", "1.18.4")).toBe(true);
  expect(util.semver.gte("4.3.92", "4.3.92")).toBe(true);
  expect(util.semver.eq("1.19", "1.19-beta")).toBe(true);
});

test("parseMarkdown", () => {
  document.body.innerHTML = `<p></p>`;
  let obj = document.body.getElementsByTagName("p")[0];
  obj.textContent =
    "Hello world!\nClick [here](https://www.example.com)" +
    " to continue to our **new** homepage* and see our exclusive `content`:" +
    ' ```<input type="text" value="Username" />``` <b>And so on...</b>.';
  util.parseMarkdown(obj);
  expect(obj.innerHTML).toBe(
    'Hello world!<br>Click <a href="https://www.example.com">here</a>' +
      " to continue to our <b>new</b> homepage* and see our exclusive <code>content</code>:" +
      ' <code class="block">&lt;input type="text" value="Username" /&gt;</code>' +
      " &lt;b&gt;And so on...&lt;/b&gt;.",
  );
});

test("getFunctionFromStr", () => {
  let [fobj, fname] = util.getFunctionFromStr("Page.getActiveInput");
  expect(fobj).toBe(PassFF.Page);
  expect(fname).toBe("getActiveInput");

  [fobj, fname] = util.getFunctionFromStr("refreshAll");
  expect(fobj).toBe(PassFF);
  expect(fname).toBe("refreshAll");
});

test("(sub)domain handling", () => {
  expect(util.sanitizeDomain("sub.example.com")).toBe("sub.example.com");
  expect(util.sanitizeDomain("..example.com.")).toBe("example.com");
  expect(util.getDomainSuffix("example.com")).toBe("com");
  expect(util.getDomainSuffix("ex.co.uk")).toBe("co.uk");
  expect(util.getDomainSuffix("crazy.town")).toBe("town");
  expect(util.getMainDomain("www.dev.html.info")).toBe("html.info");
  expect(util.getMainDomain("codeberg.org")).toBe("codeberg.org");
  expect(util.getMainDomain("www.example.org.uk")).toBe("example.org.uk");
  expect(util.checkIsSubdomain("www.example.org.uk", "example.com")).toBe(
    false,
  );
  expect(util.checkIsSubdomain("www.example.com.au", "example.com.au")).toBe(
    true,
  );
  expect(
    util.checkIsSubdomain("www.sub.beta.front.page", "beta.front.page"),
  ).toBe(true);
  expect(
    util.checkDomainsHaveSameMain(
      "www.sub.alpha.front.page",
      "beta.front.page",
    ),
  ).toBe(true);
  expect(
    util.checkDomainsHaveSameMain("www.sub.beta.front.com", "beta.front.page"),
  ).toBe(false);
});
