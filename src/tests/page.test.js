import PassFF from "../modules/main.js";
import * as PageHelpers from "../modules/page.js";

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
