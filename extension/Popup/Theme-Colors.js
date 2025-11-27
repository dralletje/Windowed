import { themecolor_to_string } from "../utilities/themecolor-to-string.js";
import { browser } from "../Vendor/Browser.js";

if (browser.theme) {
  let theme = await browser.theme.getCurrent();

  if (theme.colors != undefined) {
    let root = document.documentElement;
    console.log(`Object.entries(theme.colors):`, Object.entries(theme.colors));

    for (let [key, value] of Object.entries(theme.colors)) {
      console.log(`key:`, key);
      if (value != undefined) {
        root.style.setProperty(`--theme-${key}`, themecolor_to_string(value));
      }
    }
  }
}
