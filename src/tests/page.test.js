import PassFF from "../modules/main.js";
import * as PageHelpers from "../modules/page.js";

beforeAll(() =>
  Object.defineProperty(global, "browser", { value: {}, writable: false }),
);

test("rateInputNames", () => {
  // mock an INPUT element
  const input = {
    type: "text",
    getAttribute: (n) => (n == "id" ? "opt_login" : ""),
    hasAttribute: (n) => n == "id",
  };
  let goodNames = ["login"].map((v) => v.toLowerCase());
  expect(PageHelpers.rateInputNames(input, goodNames)).toEqual(10);
  goodNames = ["opt_login"].map((v) => v.toLowerCase());
  expect(PageHelpers.rateInputNames(input, goodNames)).toEqual(20);
});

test("doAllSecurityChecks", () => {
  let passItemURL = ["https://example.com", "invalid"];
  let currTabURL = "https://cloud.example.com/login?ref=protocols";
  expect(PageHelpers.doAllSecurityChecks(passItemURL, currTabURL)).toEqual({
    errMessage: null,
    currUrl: currTabURL,
    currUrlValid: true,
    passUrl: passItemURL,
    passUrlValid: true,
    protocol: true,
    fullurl: false,
    subdomain: true,
    domain: true,
  });

  passItemURL = ["https://my.example.com"];
  expect(PageHelpers.doAllSecurityChecks(passItemURL, currTabURL)).toEqual({
    errMessage: null,
    currUrl: currTabURL,
    currUrlValid: true,
    passUrl: passItemURL,
    passUrlValid: true,
    protocol: true,
    fullurl: false,
    subdomain: false,
    domain: true,
  });

  passItemURL = ["invalid"];
  expect(PageHelpers.doAllSecurityChecks(passItemURL, currTabURL)).toEqual({
    errMessage: "Invalid URL: invalid",
    currUrl: currTabURL,
    currUrlValid: true,
    passUrl: passItemURL,
    passUrlValid: false,
    protocol: true,
    fullurl: false,
    subdomain: false,
    domain: false,
  });
});
