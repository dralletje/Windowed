// This file is by far the most important of the whole extension.
// This gets loaded into every single page you open, so I have to keep it as light as possible.
// Sounds a bit a weird, for a file with 1200 lines, but I want it to so light that I need
// more rather than less code. No modules or anything fance like that

/**
 * From https://github.com/fabiospampinato/noop-tag/blob/master/src/index.ts
 *
 * @param {TemplateStringsArray} strings
 * @param {unknown[]} expressions
 * @returns {string}
 */
const noop_template = (strings, ...expressions) => {
  let result = strings[0];
  for (let i = 1, l = strings.length; i < l; i++) {
    result += expressions[i - 1];
    result += strings[i];
  }
  return result;
};
let css = noop_template;
let html = noop_template;

// @ts-ignore
const browser = /** @type {import("webextension-polyfill").Browser} */ (
  globalThis.browser
);

const fullscreen_id_namespace = `windowed_long_id_that_does_not_conflict`;

const fullscreen_select = `${fullscreen_id_namespace}_select`;
const fullscreen_active = `${fullscreen_id_namespace}_active`;
const fullscreen_element_cloned = `${fullscreen_id_namespace}_ugly_hacky_cloned`;
const fullscreen_parent = `${fullscreen_id_namespace}_parent`;
const body_class = `${fullscreen_id_namespace}_body`;
const shadowdom_trail = `${fullscreen_id_namespace}_shadowdom`;

const max_z_index = "2147483647";

/**
 * @typedef PictureInPictureVideoElement
 * @type {HTMLVideoElement & {
 *  requestPictureInPicture(): Promise<void>,
 *  disablePictureInPicture: boolean,
 * }}
 */

// Aliasses for different browsers (rest of aliasses are in the inserted script)
let fullscreenchange_aliasses = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "MSFullscreenChange",
];
let requestFullscreen_aliasses = [
  "requestFullscreen",
  "mozRequestFullScreen",
  "webkitRequestFullscreen",
  "webkitRequestFullScreen",
  "msRequestFullscreen",
];
let exitFullscreen_aliasses = [
  "exitFullscreen",
  "webkitExitFullscreen",
  "webkitCancelFullScreen",
  "mozCancelFullScreen",
  "msExitFullscreen",
];
let fullscreenelement_aliasses = [
  "fullscreenElement",
  "webkitFullscreenElement",
  "mozFullscreenElement",
  "mozFullScreenElement",
  "msFullscreenElement",
  "webkitCurrentFullScreenElement",
];

let external_functions = {};
let next_id = 1;

let on_webpage = (strings, ...values) => {
  let result = strings[0];

  let value_index = 1;
  for (let value of values) {
    if (typeof value === "string") {
      result = result + value;
    }
    if (typeof value === "object") {
      result = result + JSON.stringify(value);
    }
    if (typeof value === "function") {
      external_functions[next_id] = value;
      result = result + `external_function(${next_id});`;
      next_id = next_id + 1;
    }
    result = result + strings[value_index];
    value_index = value_index + 1;
  }

  return result;
};

let all_communication_id = 0;
let external_function_parent =
  (function_id) =>
  async (...args) => {
    let request_id = `FROM_CONTENT:${all_communication_id}`;
    all_communication_id = all_communication_id + 1;

    if (window.parent === window) {
      return;
    }

    window.parent.postMessage(
      {
        type: "CUSTOM_WINDOWED_FROM_PAGE",
        request_id: request_id,
        function_id: function_id,
        args: args,
      },
      "*",
    );

    return new Promise((resolve, reject) => {
      let listener = (event) => {
        // We only accept messages from ourselves
        if (event.source != window.parent) return;
        if (event.data == null) return;

        if (event.data.type === "CUSTOM_WINDOWED_TO_PAGE") {
          if (event.data.request_id === request_id) {
            window.removeEventListener("message", listener);
            resolve(event.data.result);
          }
        }
      };
      window.addEventListener("message", listener);
    });
  };

let enable_selector = (element, key) => {
  element.dataset[key] = true;
};
let disable_selector = (element, key) => {
  delete element.dataset[key];
};

/**
 * @returns {Promise<{
 *  mode: import("./Background/BackgroundModule").WindowedMode,
 *  pip: boolean,
 * }>}
 */
let get_host_config_local = async () => {
  return await send_chrome_message({
    type: "get_windowed_config",
  });
};

/**
 * @param {ParentNode} root
 * @returns {HTMLElement}
 */
let get_fullscreen_select_element = (root = document) => {
  /** @type {HTMLElement} */
  let found_in_lightdom = root.querySelector(`[data-${fullscreen_select}]`);
  if (found_in_lightdom) return found_in_lightdom;

  // If not found in the lightdom, we follow the trail down the shadows
  let path_with_breadcrumb = root.querySelector(`[data-${shadowdom_trail}]`);
  if (path_with_breadcrumb?.shadowRoot != null) {
    return get_fullscreen_select_element(path_with_breadcrumb.shadowRoot);
  } else {
    throw new Error("Could not find the element that wants to be fullscreened");
  }
};

let Button = ({ icon, title, text, target }) => `
  <button data-target="${target}" title="${title}">
    <div class="icon mask-icon" style="mask-image: url(${icon})"></div>
    <span>${text}</span>
  </button>
`;

/**
 * @param {import("webextension-polyfill").Manifest.ThemeColor} color
 * @returns {string}
 */
let themecolor_to_string = (color) => {
  if (typeof color === "string") {
    return color;
  } else if (Array.isArray(color)) {
    if (color.length === 3) {
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    } else if (color.length === 4) {
      return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    } else {
      // prettier-ignore
      throw new Error(`Invalid theme color array: ${JSON.stringify(color)}`);
    }
  } else {
    throw new Error(`Invalid theme color: ${color}`);
  }
};

// Insert requestFullScreen mock
const code_to_insert_in_page = on_webpage`{
  // Alliases for different browsers
  let requestFullscreen_aliasses = ${JSON.stringify(
    requestFullscreen_aliasses,
  )};
  let exitFullscreen_aliasses = ${JSON.stringify(exitFullscreen_aliasses)};
  let fullscreenelement_aliasses = ${JSON.stringify(
    fullscreenelement_aliasses,
  )};
  let fullscreenchange_aliasses = ${JSON.stringify(fullscreenchange_aliasses)};

  const send_event = (element, type) => {
    const event = new Event(type, {
      bubbles: true,
      cancelBubble: false,
      cancelable: false,
    });
    // if (element[\`on\${type}\`]) {
    //   element[\`on\${type}\`](event);
    // }
    element.dispatchEvent(event);
  };

  const send_fullscreen_events = (element) => {
    for (let fullscreenchange of fullscreenchange_aliasses) {
      send_event(document, fullscreenchange);
    }
    send_event(window, 'resize');
  };

  let all_communication_id = 0;
  let external_function = (function_id) => async (...args) => {
    let request_id = all_communication_id;
    all_communication_id = all_communication_id + 1;

    window.postMessage({
      type: 'CUSTOM_WINDOWED_FROM_PAGE',
      request_id: request_id,
      function_id: function_id,
      args: args,
    }, '*');

    return new Promise((resolve, reject) => {
      let listener = (event) => {
        // We only accept messages from ourselves
        if (event.source != window) return;
        if (event.data == null) return;

        if (event.data.type === 'CUSTOM_WINDOWED_TO_PAGE') {
          if (event.data.request_id === request_id) {
            window.removeEventListener('message', listener);
            if (event.data.resultType === 'resolve') {
              resolve(event.data.result);
            } else {
              let err = new Error(event.data.result.message);
              err.stack = event.data.result.stack;
              reject(err);
            }
          }
        }
      }
      window.addEventListener('message', listener);
    });
  }

  let overwrite = (object, property, value) => {
    try {
      if (property in object) {
        Object.defineProperty(object, property, {
          value: value,
          configurable: true,
          writable: true,
        });
      }
    } catch (err) {
      // Nothing
    }
  }

  let set_fullscreen_element = (element = null) => {
    if (element == null) {
      throw new Error('WINDOWED: Got null in set_fullscreen_element');
    }

    overwrite(document, 'webkitIsFullScreen', true); // Old old old
    overwrite(document, 'fullscreen', true); // Old old old
    for (let fullscreenelement_alias of fullscreenelement_aliasses) {
      overwrite(document, fullscreenelement_alias, element);
    }
  }

  let make_tab_go_fullscreen = ${async () => {
    await go_into_fullscreen();
  }}
  let make_tab_go_inwindow = ${async () => {
    await go_in_window();
  }}

  let create_popup = ${async () => {
    clear_popup();

    let is_fullscreen = await external_function_parent("is_fullscreen")();
    if (is_fullscreen) {
      await go_out_of_fullscreen();
      return;
    }

    let element = get_fullscreen_select_element();

    // Find possible picture-in-picture video element
    let video_element = /** @type {PictureInPictureVideoElement} */ (
      element.querySelector("video:not([disablepictureinpicture])")
    );
    video_element =
      video_element != null &&
      video_element.requestPictureInPicture != null &&
      video_element.readyState >= 1 &&
      !video_element.disablePictureInPicture
        ? video_element
        : null;

    let { mode, pip } = is_shift_pressed
      ? /// Force the mode to be "ask" when shift is pressed
        { mode: "ask", pip: false }
      : await get_host_config_local();
    if (pip === true && video_element != null) {
      video_element.requestPictureInPicture();
      onEscapePress(() => {
        // @ts-ignore
        document.exitPictureInPicture();
      });
      return "PICTURE-IN-PICTURE";
    }

    if (mode === "fullscreen" || mode === "windowed" || mode === "in-window") {
      if (mode === "fullscreen") {
        let element = get_fullscreen_select_element();
        disable_selector(element, fullscreen_select);
        element.requestFullscreen();
        return "FULLSCREEN";
      }
      if (mode === "windowed") {
        await go_into_fullscreen();
        return "WINDOWED";
      }
      if (mode === "in-window") {
        await go_in_window();
        return "IN-WINDOW";
      }
    }

    let popup_div = document.createElement("div");
    let shadowRoot = popup_div.attachShadow({ mode: "open" });

    if (theme?.colors != undefined) {
      let root = popup_div;
      for (let [key, value] of Object.entries(theme.colors)) {
        if (value != undefined) {
          root.style.setProperty(`--theme-${key}`, themecolor_to_string(value));
        }
      }
    }

    shadowRoot.appendChild(
      createElementFromHTML(`<style>${popup_css}</style>`),
    );

    let clicked_element_still_exists =
      last_click_y != null && last_click_x != null; // && document.elementsFromPoint(last_click_x, last_click_y).includes(last_click_element)
    if (
      clicked_element_still_exists &&
      Date.now() - last_click_timestamp <
        CLICK_IS_CONSIDERED_FULLSCREEN_CLICK_DELAY
    ) {
      let top_vs_bottom =
        last_click_y < window.innerHeight / 2
          ? "translateY(0px)"
          : "translateY(-100%)";
      let left_vs_right =
        last_click_x < window.innerWidth / 2
          ? "translateX(0px)"
          : "translateX(-100%)";

      /// Popup that shows if there is a recent click
      let popup = createElementFromHTML(`
        <menu class="popup" tabIndex="1" style="
          position: absolute;
          top: ${last_click_y}px;
          left: ${last_click_x}px;
          transform: ${top_vs_bottom} ${left_vs_right};
        ">
          ${
            video_element
              ? `<li>
                ${Button({
                  icon: browser.runtime.getURL("Images/Icon_PiP@scalable.svg"),
                  text: "PiP",
                  title: "Picture-in-picture (p)",
                  target: "picture-in-picture",
                })}
              </li>`
              : ""
          }
          <li>
            ${Button({
              icon: browser.runtime.getURL(
                "Images/Icon_Windowed_Mono@scalable.svg",
              ),
              text: "Windowed",
              title: "Windowed (w)",
              target: "windowed",
            })}
          </li>
          <li>
            ${Button({
              icon: browser.runtime.getURL(
                "Images/Icon_InWindow_Mono@scalable.svg",
              ),
              text: "In-window",
              title: "In-window (i)",
              target: "in-window",
            })}
          </li>
          <li>
            ${Button({
              icon: browser.runtime.getURL(
                "Images/Icon_EnterFullscreen@scalable.svg",
              ),
              text: "Fullscreen",
              title: "Fullscreen (f)",
              target: "fullscreen",
            })}
          </li>
        </menu>
      `);
      shadowRoot.appendChild(popup);
    } else {
      /// Popup that shows if there is no recent click (centered in the screen)
      let popup = createElementFromHTML(`
        <div>
          <div
            style="
              position: fixed;
              top: 0; left: 0;
              right: 0; bottom: 0;
              background-color: rgba(0,0,0,.8);
              pointer-events: none;
              z-index: ${max_z_index};
            "
          ></div>

          <div class="popup" tabIndex="1" style="
            position: fixed;
            top: 25vh;
            left: 50vw;
            transform: translateX(-50%) translateY(-50%);
            font-size: 20px;
          ">
            <div style="padding: 1.25em; padding-bottom: 0.25em; padding-top: 0.25em">Enter fullscreen</div>
            <div style="height: 10px"></div>
            <menu style="display: flex; flex-direction: column; align-items: stretch;">
              ${
                video_element
                  ? `
                    <li>
                      <button data-target="picture-in-picture" title="Picture in picture (p)" class="flex flex-row">
                        <div class="icon mask-icon" style="mask-image: url(${browser.runtime.getURL("Images/Icon_PiP@scalable.svg")})"></div>
                        <span class="flex-1">PiP</span>
                        <kbd style="margin-left: 16px">p</kbd>
                      </button>
                    </li>
                  `
                  : ""
              }
              <li>
                <button data-target="windowed" title="Windowed (w)" class="flex flex-row">
                  <div class="icon mask-icon" style="mask-image: url(${browser.runtime.getURL("Images/Icon_Windowed_Mono@scalable.svg")})"></div>
                  <span class="flex-1">Windowed</span>
                  <kbd style="margin-left: 16px">w</kbd>
                </button>
              </li>
              <li>
                <button data-target="in-window" title="In-window (i)" class="flex flex-row">
                  <div class="icon mask-icon" style="mask-image: url(${browser.runtime.getURL("Images/Icon_InWindow_Mono@scalable.svg")})"></div>
                  <span class="flex-1">In-window</span>
                  <kbd style="margin-left: 16px">i</kbd>
                </button>
              </li>
              <li>
                <button data-target="fullscreen" title="Fullscreen (f)" class="flex flex-row">
                  <div class="icon mask-icon" style="mask-image: url(${browser.runtime.getURL("Images/Icon_EnterFullscreen@scalable.svg")})"></div>
                  <span class="flex-1">Fullscreen</span>
                  <kbd style="margin-left: 16px">f</kbd>
                </button>
              </li>
            </menu>
          </div>
        </div>
      `);
      shadowRoot.appendChild(popup);
    }

    /** @type {HTMLElement} */
    let popup_element = shadowRoot.querySelector(`.popup`);
    setTimeout(() => {
      popup_element.focus();
    }, 0);

    document.body.appendChild(popup_div);
    last_popup = popup_div;

    /** @type {"windowed" | "in-window" | "fullscreen" | "picture-in-picture" | "nothing" | "cool-pip"} */
    let result = await new Promise((resolve) => {
      popup_element.addEventListener("focusout", (event) => {
        // @ts-ignore
        if (!event.currentTarget.contains(event.relatedTarget)) {
          resolve("nothing");
        }
      });

      // For people who like keyboard shortcuts
      popup_element.addEventListener(
        "keydown",
        (/** @type {KeyboardEvent} */ event) => {
          if (event.key === "w" || event.key === "W") {
            event.stopPropagation();
            resolve("windowed");
          }
          if (event.key === "i" || event.key === "I") {
            event.stopPropagation();
            resolve("in-window");
          }
          if (event.key === "f" || event.key === "F") {
            event.stopPropagation();

            // I need this check here, because I can't call the original fullscreen from a
            // 'async' function (or anywhere async (eg. after `resolve()` is called))
            let element = get_fullscreen_select_element();
            disable_selector(element, fullscreen_select);
            element.requestFullscreen();

            resolve("fullscreen");
          }
          if (event.key === "p" || event.key === "P") {
            event.stopPropagation();
            resolve("picture-in-picture");
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            resolve("nothing");
          }
        },
      );

      for (let button of shadowRoot.querySelectorAll(`[data-target]`)) {
        button.addEventListener("click", (e) => {
          // @ts-ignore
          let target_keyword = button.dataset.target;
          if (target_keyword === "fullscreen") {
            // I need this check here, because I can't call the original fullscreen from a
            // 'async' function (or anywhere async (eg. after `resolve()` is called))
            let element = get_fullscreen_select_element();
            disable_selector(element, fullscreen_select);
            element.requestFullscreen();
          }
          resolve(target_keyword);
        });
      }
    });

    clear_popup();

    if (result === "fullscreen") {
      // NOTE This is now all done sync in the popup callback.
      // .... because firefox does not like it when I call it from a promise.
      return "FULLSCREEN";
    }
    if (result === "windowed") {
      await go_into_fullscreen();
      return "WINDOWED";
    }
    if (result === "in-window") {
      await go_in_window();
      return "IN-WINDOW";
    }
    if (result === "picture-in-picture") {
      video_element.requestPictureInPicture();

      onEscapePress(() => {
        // @ts-ignore
        document.exitPictureInPicture();
      });

      return "PICTURE-IN-PICTURE";
    }

    // if (result === "cool-pip") {
    //   await go_in_cool_pip();
    //   return "COOL-PIP";
    // }

    if (result === "nothing") {
      return "NOTHING";
    }
  }}

  let make_tab_exit_fullscreen = ${async () => {
    await go_out_of_fullscreen();
    send_fullscreen_events();
  }}

  let exitFullscreen = async function(original) {
    let windowed_fullscreen = document.querySelector('[data-${fullscreen_active}], [data-${shadowdom_trail}]');

    if (windowed_fullscreen) {
      // If the fullscreen element is a frame, tell it to exit fullscreen too
      if (typeof windowed_fullscreen.postMessage === 'function') {
        document.fullscreenElement.postMessage.sendMessage({ type: "exit_fullscreen_iframe" });
      }

      // Reset all the variables to their browser form
      delete window.screen.width;
      delete window.screen.height;
      delete document['webkitIsFullScreen'];
      delete document['fullscreen'];
      for (let fullscreenelement_alias of fullscreenelement_aliasses) {
        delete document[fullscreenelement_alias];
      }

      await make_tab_exit_fullscreen();
    } else {
      original();
    }
  }

  ${"" /* NOTE requestFullscreen */}
  const requestFullscreen_windowed = async function(original, ...args) {
    const element = this;
    element.dataset['${fullscreen_select}'] = true;

    let shadowroot = element.getRootNode()
    while (shadowroot != null && shadowroot.host != null) {
        shadowroot.host.dataset['${shadowdom_trail}'] = true;
        shadowroot = shadowroot.host.getRootNode()
    }

    // Tell extension code (outside of this block) to go into fullscreen
    // window.postMessage({ type: force ? "enter_fullscreen" : "show_fullscreen_popup" }, "*");
    // send_windowed_event(element, force ? "enter_fullscreen" : "show_fullscreen_popup");
    try {
      await create_popup();
    } catch (err) {
      // Anything gone wrong, we default to normal fullscreen
      console.error(err);
      console.error('[Windowed] Something went wrong, so I default to normal fullscreen:', err.stack);
      original();
    }
  }

  // Because firefox is super cool, it is also super frustrating...
  // So firefox does not allow fullscreen calls from promises, even if it is basically sync.
  // Therefor I need to first define this as sync, and from here call the async version.
  let MUTATE_is_windowed_enabled = true;
  let requestFullscreen = function(original, ...args) {
    if (MUTATE_is_windowed_enabled === false) {
      return original()
    } else {
      requestFullscreen_windowed.call(this, original, ...args);
    }
  }

  let finish_fullscreen = () => {
    // Because youtube actually checks for those sizes?!
    const window_width = Math.max(window.outerWidth, window.innerWidth);
    const window_height = Math.max(window.outerHeight, window.innerHeight);

    overwrite(window.screen, 'width', window_width);
    overwrite(window.screen, 'height', window_height);

    let element = document.querySelector('[data-${fullscreen_select}]');
    if (element == null) {
      console.warn('[WINDOWED] Strange, no fullscreen element shown');
      return;
    }

    document.body.focus();
    element.focus();
    set_fullscreen_element(element || document.body);
    send_fullscreen_events();
  }

  window.addEventListener("message", (message) => {
    // Message from content script or parent content script
    if (message.source === message.target || message.source === window.parent) {
      if (message.data?.type === 'WINDOWED-confirm-fullscreen') {
        finish_fullscreen();
      }

      if (message.data?.type === 'WINDOWED-exit-fullscreen') {
        exitFullscreen.call(document, original_exitFullscreen);
      }

      if (message.data?.type === 'WINDOWED-notify') {
        MUTATE_is_windowed_enabled = !message.data.disabled;
      }
    }

    // Message from frame inside the page (these are tricky not sure if I still know how this works)
    const frame = [...document.querySelectorAll('iframe')].find(x => x.contentWindow === message.source);
    if (frame != null) {
      if (message.data?.type === 'enter_inwindow_iframe') {
        frame.dataset['${fullscreen_select}'] = "true";
        make_tab_go_inwindow();
      }
      if (message.data?.type === 'enter_fullscreen_iframe') {
        frame.dataset['${fullscreen_select}'] = "true";
        make_tab_go_fullscreen();
      }
      if (message.data?.type === 'exit_fullscreen_iframe') {
        // Call my exitFullscreen on the document
        exitFullscreen.call(document, original_exitFullscreen);
      }
    }
  });

  ${
    "" /* NOTE Replace all the `requestFullscreen` aliasses with calls to my own version */
  }
  let original_requestFullscreen = null;
  for (let requestFullscreenAlias of requestFullscreen_aliasses) {
    if (typeof Element.prototype[requestFullscreenAlias] === 'function') {
      let original_function = Element.prototype[requestFullscreenAlias];
      original_requestFullscreen = original_function;
      Element.prototype[requestFullscreenAlias] = function(...args) {
        return requestFullscreen.call(this, original_function.bind(this), ...args);
      };
    }
  }

  ${
    "" /* NOTE Replace all the `exitFullscreen` aliasses with calls to my own version */
  }
  let original_exitFullscreen = null;
  for (let exitFullscreenAlias of exitFullscreen_aliasses) {
    if (typeof Document.prototype[exitFullscreenAlias] === 'function') {
      let original_function = Document.prototype[exitFullscreenAlias];
      original_exitFullscreen = original_function;
      Document.prototype[exitFullscreenAlias] = function(...args) {
        return exitFullscreen.call(this, original_function.bind(this), ...args);
      };
    }
  }
}`;

//// I used to insert the code directly as a <script>...</script> tag,
//// but that doesn't work nicely with some sites CSP.
//// Now I create this separate file with the contents of the script,
//// which is awkward if they aren't in sync... but I need to hack hack hack.
//// This also loads the script asynchronously.. but i think these scripts still execute in order.
//// I still need to do the `on_webpage` call, so the message listeners are set up.
// let elt = document.createElement("script");
// elt.innerHTML = code_to_insert_in_page;
// document.documentElement.appendChild(elt);
// document.documentElement.removeChild(elt);

/// No longer necessary as I insert this via manifest.json
// let elt = document.createElement("script");
// elt.src = browser.runtime.getURL("Windowed-inject-into-page.js");
// document.documentElement.appendChild(elt);
// document.documentElement.removeChild(elt);

//// This is just for myself as debugging, but it will tell me if the script that is inserted,
//// is actually the same as the script I am expecting it to be. (because debugging could get very frustrating)
let async = async (async) => async();
async(async () => {
  let response = await fetch(
    browser.runtime.getURL("Windowed-inject-into-page.js"),
  );
  let result = await response.text();
  if (result !== code_to_insert_in_page) {
    // prettier-ignore
    console.error("[WINDOWED] HEY MICHIEL! The script I am inserting is not the same as the script I expect it to be!");
    console.log("[WINDOWED] Code should actually be:");
    console.log(code_to_insert_in_page);
  }
});

const send_event = (element, type) => {
  const event = new Event(type, {
    bubbles: true,
    cancelable: false,
  });
  element.dispatchEvent(event);
};

const send_fullscreen_events = () => {
  for (let fullscreenchange of fullscreenchange_aliasses) {
    send_event(document, fullscreenchange);
  }
  send_event(window, "resize");
};

// setTimeout(() => {
//   for (let stylesheet of document.styleSheets) {
//     try {
//       for (let rule of stylesheet.cssRules) {
//         // Remove the css rule if the media query doesn't match,
//         // Force match it when it does
//         if (rule.media) {
//           if (window.matchMedia(rule.media.mediaText).matches) {
//             // console.log(`The media (${rule.media.mediaText}) matches!`);
//             rule.media.__WINDOWED_FALLBACK_MEDIATEXT__ = rule.media.mediaText;
//             rule.media.mediaText = "all";
//           } else {
//             // console.log(`The media (${rule.media.mediaText}) does not match!`);
//             rule.media.__WINDOWED_FALLBACK_MEDIATEXT__ = rule.media.mediaText;
//             rule.media.mediaText = "not all";
//           }
//         }
//       }
//     } catch (err) {
//       console.warn(`WINDOWED: Couldn't read stylesheet rules because of CORS...`);
//       console.log(`stylesheet:`, stylesheet)
//     }
//   }
// }, 1000);

// console.log('Runs in proper sandbox:', document.documentElement.constructor === HTMLHtmlElement);
// NOTE On chrome, extensions run in a proper sandbox (above will log true),
// meaning that you can't get access to the actual prototype-s of the Document and Elements-s,
// hence the need for the ugly script insert above.
// On Firefox however, this is not the case, and I might (because firefox screws me with CSP)
// need to use this quirk to work on all pages

let clear_listeners = () => {};

let delay = (ms) => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
};

let popup_css = css`
  /* Poor mans tailwind */
  .flex {
    display: flex;
  }
  .flex-col {
    flex-direction: column;
  }
  .flex-row {
    flex-direction: row;
  }
  .flex-1 {
    flex: 1;
  }

  :host {
    --theme-popup: #111;
    --theme-popup_border: #555;
    --theme-popup_text: white;
    --theme-popup_highlight: rgba(255, 255, 255, 0.1);
    --theme-popup_highlight_text: white;
  }

  .popup {
    background-color: var(--theme-popup, white);
    border-radius: 3px;
    border: solid #eee 1px;
    border-color: var(--theme-popup_border, #eee);
    /*box-shadow: 0px 2px 4px #00000026;*/
    padding-top: 5px;
    padding-bottom: 5px;
    font-size: 16px;
    color: var(--theme-popup_text, black);
    min-width: 150px;

    display: flex;
    flex-direction: column;
    align-items: stretch;

    font-family: sans-serif;

    z-index: ${max_z_index};
  }

  .popup:focus {
    outline: none;
  }

  /*@media (prefers-color-scheme: dark) {
    .popup {
      filter: invert(0.9);
    }
  }*/

  .popup [data-target] {
    text-align: inherit;
    cursor: pointer;
    padding: 1.25em;
    padding-top: 0.25em;
    padding-bottom: 0.25em;
    /*background-color: white;*/
    /*background-color: var(--theme-popup, white);*/
    background-color: transparent;
    color: var(--theme-popup_text, #eee);
    /* Force black for if the page has color: white */

    display: flex;
    flex-direction: row;
    align-items: center;

    font-size: inherit;
    border: none;
    box-shadow: none;

    white-space: nowrap;

    &:focus {
      /*filter: brightness(0.95);*/
      background-color: var(--theme-popup_highlight, white);
      color: var(--theme-popup_highlight_text, black);
    }
    &:hover {
      /*filter: brightness(0.9);*/
      background-color: var(--theme-popup_highlight, white);
      color: var(--theme-popup_highlight_text, black);
    }
    &:focus:not(:focus-visible) {
      outline: none;
    }

    & > img {
      height: 1.2em;
      width: 1.2em;
      margin-right: 1em;
    }
  }

  .icon {
    height: 1.2em;
    width: 1.2em;
    margin-right: 1em;
  }
  .mask-icon {
    background-color: currentColor;
    mask-size: contain;
  }

  [data-target]::-moz-focus-inner,
  .popup::-moz-focus-inner {
    border: 0;
    outline: 0;
  }

  li {
    display: contents;
  }
  menu {
    margin: 0;
    padding: 0;
    list-style-type: none;
  }

  kbd {
    font-size: 0.9em;
    background-color: #c0c0c0;
    padding-inline: 4px;
    border-radius: 4px;
    border: solid 1px #979797;
  }
`;

/**
 * @param {ParentNode} root
 */
let create_style_rule = (root = document) => {
  let css_text = css`
    [data-${fullscreen_parent}] {
      /* Neutralize only the properties that form a containing block for
         position: fixed (so the iframe can span the viewport) and win z-index.
         Avoid 'all: initial' here because it collapses ancestor layout, which
         confuses in-page controllers that observe their own wrapper (e.g.
         Google search's inline-video controller, which then auto-pauses the
         embedded YouTube player on every state change). */
      transform: none !important;
      perspective: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      clip-path: none !important;
      mask: none !important;
      contain: none !important;
      will-change: auto !important;
      z-index: ${max_z_index} !important;

      /* Debugging */
      /* background-color: rgba(0,0,0,.1) !important; */
    }

    /* Not sure if this is necessary, but putting it here just in case */
    [data-${fullscreen_parent}]::before,
    [data-${fullscreen_parent}]::after {
      display: none;
    }

    [data-${body_class}] {
      /* Prevent scrolling */
      overflow: hidden !important;

      /* For debugging, leaving this just in here so I see when something goes wrong */
      /* background-color: rgb(113, 0, 180); */
    }

    /* I know I want it to be generic, but still this is a youtube specific fix */
    #player-theater-container {
      min-height: 0 !important;
    }

    [data-${fullscreen_active}],
    [data-${shadowdom_trail}] {
      position: fixed !important;
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: initial !important;
      max-height: initial !important;
      z-index: ${max_z_index} !important;

      background-color: black;
    }
  `;

  let styleEl = document.createElement("style");
  if (root instanceof ShadowRoot) {
    root.appendChild(styleEl);
  } else if (root instanceof Document) {
    root.head.appendChild(styleEl);
  } else {
    throw new Error("[WINDOWED] Could not find a place to put the style");
  }
  styleEl.appendChild(document.createTextNode(css_text));

  let shadowroot_maybe = root.querySelector(`[data-${shadowdom_trail}`);
  if (shadowroot_maybe != null) {
    console.log(`element:`, shadowroot_maybe);
    create_style_rule(shadowroot_maybe.shadowRoot);
  }
};

/**
 * Youtube's embedded player advertises itself with a "Watch on YouTube" button:
 * in the top bar while playing, and again on the pause and ended overlays.
 * This content script also runs inside the embed frame, so just hide it there.
 */
let hide_watch_on_youtube_button = () => {
  let css_text = css`
    .watch-on-youtube-button-wrapper,
    .ytp-watch-on-youtube-button,
    a.ytp-impression-link {
      display: none !important;
    }
  `;

  let styleEl = document.createElement("style");
  styleEl.appendChild(document.createTextNode(css_text));
  // We run at document_start, so there isn't always a <head> yet
  (document.head ?? document.documentElement).appendChild(styleEl);
};

hide_watch_on_youtube_button();

/**
 * Youtube red is a give-away all by itself, so paint the progress bar cyan.
 * The classic player styles it with `ytp-` classes, the newer one with `yt`
 * prefixed ones; the wildcards are there because those newer names get
 * shuffled around now and then.
 */
let recolor_progress_bar = () => {
  let progress_color = "#00e5ff";

  let css_text = css`
    /* Classic player */
    .ytp-swatch-background-color,
    .ytp-play-progress,
    .ytp-scrubber-button,
    /* Newer player: the plain bar, and the chaptered one */
    .ytProgressBarLineProgressBarPlayed,
    .ytProgressBarPlayheadProgressBarPlayheadDot,
    .ytChapteredProgressBarChapteredPlayerBarChapterSeen,
    .ytChapteredProgressBarChapteredPlayerBarFill,
    /* The same, for whenever those names get shuffled around again */
    [class*="ProgressBarPlayed"],
    [class*="ProgressBarPlayheadDot"],
    [class*="ChapteredPlayerBarChapterSeen"],
    [class*="ChapteredPlayerBarFill"] {
      /* Shorthand, not background-color: the newer player paints the played
         line with a red-to-pink gradient that would otherwise cover it */
      background: ${progress_color} !important;
    }
  `;

  let styleEl = document.createElement("style");
  styleEl.appendChild(document.createTextNode(css_text));
  // We run at document_start, so there isn't always a <head> yet
  (document.head ?? document.documentElement).appendChild(styleEl);
};

recolor_progress_bar();

/**
 * @param {HTMLElement} element
 */
const parent_elements = function* (element) {
  let el = element;
  while (el) {
    let root_node = el.getRootNode();
    if (el.parentElement) {
      el = el.parentElement;
    } else if (root_node instanceof ShadowRoot) {
      el = /** @type {HTMLElement} */ (root_node.host);
    } else {
      break;
    }

    yield el;
  }
};

/**
 * @param {{ type: string, [key: string]: any }} message
 */
let send_chrome_message = async (message) => {
  // @ts-ignore
  let { type, value } = await browser.runtime.sendMessage(message);
  if (type === "resolve") {
    return value;
  } else {
    let err = new Error(value.message);
    err.stack = value.stack;
    // err.stack = [
    //   ...x.value.stack.split('\n'),
    //   'From postMessage to background page',
    //   ...stack,
    // ].join('\n');
    throw err;
  }
};

let CLICK_IS_CONSIDERED_FULLSCREEN_CLICK_DELAY = 1 * 1000;

let last_click_x = null;
let last_click_y = null;
let last_click_timestamp = 0;
let last_click_element = null;

let is_shift_pressed = false;

let last_popup = null;
let is_in_fullscreen = false;

let clear_popup = () => {
  if (last_popup != null) {
    try {
      document.body.removeChild(last_popup);
    } catch (err) {}
    last_popup = null;
    return true;
  }
  return false;
};

document.addEventListener("keydown", (event) => {
  is_shift_pressed = event.shiftKey;
  let { mode, pip } = current_mode;
  window.postMessage(
    {
      type: "WINDOWED-notify",
      disabled: is_shift_pressed
        ? false
        : mode === "fullscreen" && pip === false,
    },
    "*",
  );
});
document.addEventListener("keyup", (event) => {
  is_shift_pressed = event.shiftKey;
  let { mode, pip } = current_mode;
  window.postMessage(
    {
      type: "WINDOWED-notify",
      disabled: is_shift_pressed
        ? false
        : mode === "fullscreen" && pip === false,
    },
    "*",
  );
});

document.addEventListener(
  "click",
  (event) => {
    last_click_x = event.pageX;
    last_click_y = event.pageY;
    last_click_timestamp = Date.now();
    // last_click_element = event.target;

    if (
      last_popup != null &&
      (event.target === last_popup || last_popup.contains(event.target))
    ) {
      // Clicked inside popup
    } else {
      if (clear_popup()) {
        send_fullscreen_events();
      }
    }
  },
  { capture: true },
);

let exit_fullscreen_on_page = () => {
  window.postMessage(
    {
      type: "WINDOWED-exit-fullscreen",
    },
    "*",
  );
};

let createElementFromHTML = (htmlString) => {
  let div = document.createElement("div");
  div.innerHTML = htmlString.trim();

  return div.firstChild;
};

let go_in_window = async () => {
  create_style_rule();

  clear_listeners();
  let element = get_fullscreen_select_element();

  let unlisten_to_escape = onEscapePress(() => {
    exit_fullscreen_on_page();
  });

  let beforeunload_listener = (e) => {
    exit_fullscreen_on_page();
  };
  window.addEventListener("beforeunload", beforeunload_listener);

  clear_listeners = () => {
    unlisten_to_escape();
    window.removeEventListener("beforeunload", beforeunload_listener);
  };

  enable_selector(element, fullscreen_active);
  // Add fullscreen class to every parent of our fullscreen element
  for (let parent_element of parent_elements(element)) {
    enable_selector(parent_element, fullscreen_parent);
  }

  if (window.parent !== window) {
    // Ask parent-windowed code to become fullscreen too
    window.parent.postMessage({ type: "enter_inwindow_iframe" }, "*");
  }

  // Post back to in-page javascript
  window.postMessage({ type: "WINDOWED-confirm-fullscreen" }, "*");

  // Add no scroll to the body and let everything kick in
  enable_selector(document.body, body_class);
};

let go_into_fullscreen = async () => {
  create_style_rule();
  let element = get_fullscreen_select_element();
  let cloned = element.cloneNode(true);

  clear_listeners();
  var mutationObserver = new MutationObserver(async (mutations) => {
    for (let mutation of mutations) {
      for (let removed of mutation.removedNodes) {
        if (removed === element) {
          clear_listeners();

          enable_selector(cloned, fullscreen_element_cloned);
          enable_selector(cloned, fullscreen_select);
          document.body.appendChild(cloned);
          go_into_fullscreen();

          await delay(500);
          if (
            (cloned instanceof HTMLIFrameElement ||
              cloned instanceof HTMLObjectElement) &&
            cloned.contentWindow?.postMessage
          ) {
            cloned.contentWindow.postMessage(
              { type: "WINDOWED-confirm-fullscreen" },
              "*",
            );
          }
        }
      }
    }
  });

  if (element.parentElement) {
    mutationObserver.observe(element.parentElement, {
      childList: true,
    });
  }

  let unlisten_to_escape = onEscapePress(() => {
    exit_fullscreen_on_page();
  });

  let beforeunload_listener = (e) => {
    exit_fullscreen_on_page();
  };
  window.addEventListener("beforeunload", beforeunload_listener);

  clear_listeners = () => {
    mutationObserver.disconnect();
    unlisten_to_escape();
    window.removeEventListener("beforeunload", beforeunload_listener);
  };

  enable_selector(element, fullscreen_active);
  // Add fullscreen class to every parent of our fullscreen element
  for (let parent_element of parent_elements(element)) {
    enable_selector(parent_element, fullscreen_parent);
  }

  if (window.parent !== window) {
    // Ask parent-windowed code to become fullscreen too
    window.parent.postMessage({ type: "enter_fullscreen_iframe" }, "*");
  } else {
    // Send popup command to extension
    let menubar_size = window.outerHeight - window.innerHeight; // Asume there is just header, no browser footer

    let rect = element.getBoundingClientRect();
    let height = Math.max((rect.width * 9) / 16, rect.height);
    let ratio_width = Math.min((height / 9) * 16, rect.width); // 16:9
    let width_diff = rect.width - ratio_width;

    await send_chrome_message({
      type: "please_make_me_a_popup",
      position: {
        height: height,
        width: ratio_width,
        top: rect.top + menubar_size,
        left: rect.left + width_diff / 2,
      },
    });
  }

  // Post back to the javascript we put inside the page
  window.postMessage({ type: "WINDOWED-confirm-fullscreen" }, "*");

  // Add no scroll to the body and let everything kick in
  enable_selector(document.body, body_class);
  window.focus(); // idk
};

let go_out_of_fullscreen = async () => {
  // Remove no scroll from body (and remove all styles)
  disable_selector(document.body, body_class);

  clear_listeners();

  send_fullscreen_events();

  const fullscreen_element = get_fullscreen_select_element();
  disable_selector(fullscreen_element, fullscreen_select);
  disable_selector(fullscreen_element, fullscreen_active);

  // Remove fullscreen class... from everything
  for (let parent of parent_elements(fullscreen_element)) {
    disable_selector(parent, fullscreen_parent);
    disable_selector(parent, shadowdom_trail);
  }

  // If we are a frame, tell the parent frame to exit fullscreen
  // If we aren't (we are a popup), tell the background page to make me tab again
  if (window.parent !== window) {
    window.parent.postMessage({ type: "exit_fullscreen_iframe" }, "*");
  } else {
    await delay(10);
    await send_chrome_message({ type: "please_make_me_a_tab_again" });
    await delay(500);
  }

  let cloned = document.querySelector(`[data-${fullscreen_element_cloned}]`);
  if (cloned) {
    document.body.removeChild(cloned);
  }
};

external_functions.is_fullscreen = () => {
  const fullscreen_element = document.querySelector(
    `[data-${fullscreen_active}]`,
  );
  return fullscreen_element != null;
};

window.addEventListener("message", async (event) => {
  // We only accept messages from ourselves
  if (event.data == null) return;
  if (event.data.type === "CUSTOM_WINDOWED_FROM_PAGE") {
    let fn = external_functions[event.data.function_id];
    try {
      let result = await fn(...event.data.args);
      // @ts-ignore
      event.source.postMessage(
        {
          type: "CUSTOM_WINDOWED_TO_PAGE",
          request_id: event.data.request_id,
          resultType: "resolve",
          result: result,
        },
        // @ts-ignore
        "*",
      );
    } catch (err) {
      event.source.postMessage(
        {
          type: "CUSTOM_WINDOWED_TO_PAGE",
          request_id: event.data.request_id,
          resultType: "reject",
          result: {
            message: err.message,
            stack: err.stack,
          },
        },
        // @ts-ignore
        "*",
      );
    }
  }
});

let is_escape_locked = false;
// TODO Ask feedback from the Stadia community to find out what an helpful solution would be
// https://www.reddit.com/r/Stadia/comments/kibh2r/windowed_stadia_extension_what_could_i_improve/
// WELL one response isn't too bad, is it?
// ...
// const keyboard_lock_injection = on_webpage`{
//   let all_communication_id = 0;
//   let external_function = (function_id) => async (...args) => {
//     let request_id = all_communication_id;
//     all_communication_id = all_communication_id + 1;

//     window.postMessage({
//       type: 'CUSTOM_WINDOWED_FROM_PAGE',
//       request_id: request_id,
//       function_id: function_id,
//       args: args,
//     }, '*');

//     return new Promise((resolve, reject) => {
//       let listener = (event) => {
//         // We only accept messages from ourselves
//         if (event.source != window) return;
//         if (event.data == null) return;

//         if (event.data.type === 'CUSTOM_WINDOWED_TO_PAGE') {
//           if (event.data.request_id === request_id) {
//             window.removeEventListener('message', listener);
//             if (event.data.resultType === 'resolve') {
//               resolve(event.data.result);
//             } else {
//               let err = new Error(event.data.result.message);
//               err.stack = event.data.result.stack;
//               reject(err);
//             }
//           }
//         }
//       }
//       window.addEventListener('message', listener);
//     });
//   }

//   let old_lock = navigator.keyboard.lock.bind(navigator.keyboard);
//   let set_escape_locked = ${(is_locked) => {
//     is_escape_locked = is_locked;
//   }}
//   navigator.keyboard.lock = async (...args) => {
//     let keycodes = args[0]

//     if (keycodes == null || keycodes.includes('Escape')) {
//       try {
//         set_escape_locked(true)
//       } catch (err) {}
//     }
//     return old_lock(...args)
//   }
// }`;
// let keyboard_lock_script_element = document.createElement("script");
// keyboard_lock_script_element.innerHTML = keyboard_lock_injection;
// document.documentElement.appendChild(keyboard_lock_script_element);
// document.documentElement.removeChild(keyboard_lock_script_element);

let onEscapePress = (fn) => {
  let escape_timeout = null;
  let escape_listener = (e) => {
    if (!e.defaultPrevented && e.key === "Escape") {
      if (is_escape_locked) {
        escape_timeout = setTimeout(() => {
          fn();
        }, 1.2 * 1000);
      } else {
        fn();
      }
    }
  };

  let escape_up_listener = (e) => {
    if (!e.defaultPrevented && e.key === "Escape") {
      clearTimeout(escape_timeout);
    }
  };

  window.addEventListener("keydown", escape_listener);
  window.addEventListener("keyup", escape_up_listener);

  return () => {
    window.removeEventListener("keydown", escape_listener);
    window.removeEventListener("keyup", escape_up_listener);
  };
};

////////////////////////////////////////////////////////////////////////////////
// A-B repeat
//
// Switched on per site from the popup. While it is on, a small panel floats
// over the video with two points you can drag, A and B, and the video keeps
// looping between them. Dragging a point shows its time and seeks the video
// there, so you can pick the exact moment you meant.
////////////////////////////////////////////////////////////////////////////////

/** Never let the loop get so short there is no way out of it */
const AB_MIN_LOOP = 0.5;
/**
 * A seek lands on the nearest keyframe, which can be a little before the time
 * we asked for. Without some slack we'd keep seeking back to A forever.
 */
const AB_SEEK_SLACK = 0.5;
/** How far above the bottom of the video the panel floats, clear of the page's own controls */
const AB_PANEL_OFFSET = 56;
/** Below this height the video is too small to float anything on top of */
const AB_PANEL_MIN_VIDEO_HEIGHT = 160;
/** Same cyan as the progress bar, so it reads as one thing */
const AB_ACCENT_COLOR = "#00e5ff";

let ab_repeat_enabled = false;
/** @type {HTMLVideoElement} The video the panel is attached to */
let ab_video = null;
/** @type {{ [key: string]: any }} The panel, once it exists */
let ab_ui = null;
let ab_a = 0;
let ab_b = 0;
/** @type {"a" | "b"} Which point is being dragged right now, if any */
let ab_dragging = null;
let ab_animation_frame = null;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
let ab_clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * @param {number} seconds
 * @param {boolean} [precise] Tenths as well, for the loop points themselves
 */
let ab_format_time = (seconds, precise = false) => {
  if (!isFinite(seconds) || seconds < 0) return precise ? "--:--.-" : "--:--";
  let hours = Math.floor(seconds / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);
  let rest = seconds % 60;
  let whole = Math.floor(rest);
  let tenths = Math.floor((rest - whole) * 10);
  let seconds_text = `${String(whole).padStart(2, "0")}${precise ? `.${tenths}` : ""}`;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds_text}`
    : `${minutes}:${seconds_text}`;
};

let ab_panel_css = css`
  :host {
    all: initial;
    position: fixed;
    z-index: ${max_z_index};
    display: none;
    font-family: system-ui, sans-serif;
    font-size: 12px;
    line-height: 1;
    color: white;
  }

  .panel {
    box-sizing: border-box;
    padding: 14px 14px 10px;
    border-radius: 10px;
    background-color: rgba(17, 17, 17, 0.88);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
    user-select: none;
  }

  .track {
    position: relative;
    height: 18px;
    margin-bottom: 10px;
    cursor: pointer;
    touch-action: none;
  }
  /* The full length of the video */
  .track::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 7px;
    height: 4px;
    border-radius: 2px;
    background-color: rgba(255, 255, 255, 0.25);
  }
  /* The part that actually repeats */
  .range {
    position: absolute;
    top: 7px;
    height: 4px;
    border-radius: 2px;
    background-color: ${AB_ACCENT_COLOR};
  }
  .playhead {
    position: absolute;
    top: 2px;
    height: 14px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background-color: white;
  }

  .handle {
    position: absolute;
    top: 1px;
    height: 16px;
    width: 16px;
    margin-left: -8px;
    box-sizing: border-box;
    border: solid 2px #111;
    border-radius: 50%;
    background-color: ${AB_ACCENT_COLOR};
    color: #111;
    font-size: 9px;
    font-weight: bold;
    text-align: center;
    cursor: grab;
    touch-action: none;
  }
  .handle::after {
    content: attr(data-letter);
    line-height: 12px;
  }
  .handle:focus-visible {
    outline: solid 2px white;
    outline-offset: 1px;
  }
  .handle.dragging {
    cursor: grabbing;
  }

  /* The time of a point, right where you are dragging it */
  .bubble {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 3px 5px;
    border-radius: 4px;
    background-color: #111;
    color: white;
    font-weight: normal;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.1s;
    pointer-events: none;
  }
  .handle:hover .bubble,
  .handle:focus .bubble,
  .handle.dragging .bubble {
    opacity: 1;
  }

  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .spacer {
    flex: 1;
  }

  button {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    padding: 5px 7px;
    border-radius: 6px;
    background-color: rgba(255, 255, 255, 0.12);
    color: white;
    font-family: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover {
    background-color: rgba(255, 255, 255, 0.25);
  }
  button:focus-visible {
    outline: solid 2px white;
  }
  button b {
    color: ${AB_ACCENT_COLOR};
    margin-right: 4px;
  }
`;

let ab_panel_html = html`
  <div class="panel">
    <div class="track">
      <div class="range"></div>
      <div class="playhead"></div>
      <div
        class="handle handle-a"
        data-letter="A"
        tabindex="0"
        role="slider"
        aria-label="Start of the repeat"
      >
        <span class="bubble bubble-a"></span>
      </div>
      <div
        class="handle handle-b"
        data-letter="B"
        tabindex="0"
        role="slider"
        aria-label="End of the repeat"
      >
        <span class="bubble bubble-b"></span>
      </div>
    </div>
    <div class="row">
      <button class="set-a" title="Repeat from where the video is now">
        <b>A</b><span class="time-a"></span>
      </button>
      <button class="set-b" title="Repeat until where the video is now">
        <b>B</b><span class="time-b"></span>
      </button>
      <span class="spacer"></span>
      <button class="reset" title="Back to the whole video">&#8635;</button>
      <button class="close" title="Turn A-B repeat off">&#10005;</button>
    </div>
  </div>
`;

let render_ab_points = () => {
  if (ab_ui == null || ab_video == null) return;
  let duration = ab_video.duration;
  if (!isFinite(duration) || duration <= 0) return;

  let a_text = ab_format_time(ab_a, true);
  let b_text = ab_format_time(ab_b, true);

  ab_ui.handle_a.style.left = `${(ab_a / duration) * 100}%`;
  ab_ui.handle_b.style.left = `${(ab_b / duration) * 100}%`;
  ab_ui.range.style.left = `${(ab_a / duration) * 100}%`;
  ab_ui.range.style.width = `${((ab_b - ab_a) / duration) * 100}%`;

  ab_ui.time_a.textContent = a_text;
  ab_ui.time_b.textContent = b_text;
  ab_ui.bubble_a.textContent = a_text;
  ab_ui.bubble_b.textContent = b_text;
  ab_ui.handle_a.setAttribute("aria-valuetext", a_text);
  ab_ui.handle_b.setAttribute("aria-valuetext", b_text);
};

/**
 * Move one of the points, keeping A and B at least `AB_MIN_LOOP` apart
 * @param {"a" | "b"} which
 * @param {number} time
 * @param {boolean} [seek] Move the video there as well, to show what you picked
 */
let set_ab_point = (which, time, seek = false) => {
  if (ab_video == null) return;
  let duration = ab_video.duration;
  if (!isFinite(duration) || duration <= 0) return;

  if (which === "a") {
    ab_a = ab_clamp(time, 0, Math.max(0, ab_b - AB_MIN_LOOP));
  } else {
    ab_b = ab_clamp(time, Math.min(ab_a + AB_MIN_LOOP, duration), duration);
  }

  render_ab_points();
  if (seek) {
    ab_video.currentTime = which === "a" ? ab_a : ab_b;
  }
};

let reset_ab_points = () => {
  if (ab_video == null) return;
  ab_a = 0;
  ab_b = isFinite(ab_video.duration) ? ab_video.duration : 0;
  render_ab_points();
};

/** Keep the panel on top of the video, wherever the page decides to put it */
let position_ab_panel = () => {
  if (ab_ui == null || ab_video == null) return;
  let rect = ab_video.getBoundingClientRect();

  let is_in_view =
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;
  ab_ui.host.style.display = is_in_view ? "block" : "none";
  if (!is_in_view) return;

  let width = ab_clamp(rect.width - 32, 220, 420);
  let left = ab_clamp(
    rect.left + (rect.width - width) / 2,
    4,
    Math.max(4, window.innerWidth - width - 4),
  );

  ab_ui.host.style.width = `${Math.round(width)}px`;
  ab_ui.host.style.left = `${Math.round(left)}px`;

  if (rect.height >= AB_PANEL_MIN_VIDEO_HEIGHT) {
    // Floating inside the video, above whatever controls the page keeps there
    let bottom = window.innerHeight - rect.bottom + AB_PANEL_OFFSET;
    ab_ui.host.style.top = "auto";
    ab_ui.host.style.bottom = `${Math.round(ab_clamp(bottom, 8, Math.max(8, window.innerHeight - 80)))}px`;
  } else {
    // Too small to cover up, so hang underneath it instead
    ab_ui.host.style.bottom = "auto";
    ab_ui.host.style.top = `${Math.round(ab_clamp(rect.bottom + 8, 8, Math.max(8, window.innerHeight - 80)))}px`;
  }
};

/** The whole point: jump back to A whenever the video runs past B */
let enforce_ab_loop = () => {
  if (ab_video == null || ab_dragging != null) return;
  if (ab_video.paused || ab_video.seeking) return;
  let time = ab_video.currentTime;
  if (time >= ab_b || time < ab_a - AB_SEEK_SLACK) {
    ab_video.currentTime = ab_a;
  }
};

let ab_tick = () => {
  ab_animation_frame = null;
  if (!ab_repeat_enabled || ab_video == null || ab_ui == null) return;

  // Pages throw their video element away without telling anyone
  if (!ab_video.isConnected) {
    attach_ab_video(find_ab_video());
    return;
  }

  position_ab_panel();
  enforce_ab_loop();

  let duration = ab_video.duration;
  if (isFinite(duration) && duration > 0) {
    let played = (ab_video.currentTime / duration) * 100;
    ab_ui.playhead.style.left = `${ab_clamp(played, 0, 100)}%`;
  }

  ab_animation_frame = requestAnimationFrame(ab_tick);
};

let start_ab_ticking = () => {
  if (ab_animation_frame == null) {
    ab_animation_frame = requestAnimationFrame(ab_tick);
  }
};

/**
 * Native fullscreen only paints what is inside the fullscreen element,
 * so the panel has to move in there along with it
 */
let reparent_ab_panel = () => {
  if (ab_ui == null) return;
  let fullscreen_element = fullscreenelement_aliasses
    .map((alias) => document[alias])
    .find((element) => element != null);
  let parent =
    fullscreen_element instanceof HTMLElement &&
    !(fullscreen_element instanceof HTMLVideoElement)
      ? fullscreen_element
      : (document.body ?? document.documentElement);

  if (ab_ui.host.parentElement !== parent) {
    parent.appendChild(ab_ui.host);
  }
};

let create_ab_panel = () => {
  if (ab_ui != null) return;

  let host = document.createElement("windowed-ab-repeat");
  let shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${ab_panel_css}</style>${ab_panel_html}`;

  ab_ui = {
    host: host,
    track: shadow.querySelector(".track"),
    range: shadow.querySelector(".range"),
    playhead: shadow.querySelector(".playhead"),
    handle_a: shadow.querySelector(".handle-a"),
    handle_b: shadow.querySelector(".handle-b"),
    bubble_a: shadow.querySelector(".bubble-a"),
    bubble_b: shadow.querySelector(".bubble-b"),
    time_a: shadow.querySelector(".time-a"),
    time_b: shadow.querySelector(".time-b"),
  };

  /** @param {PointerEvent} event */
  let time_at_pointer = (event) => {
    let rect = ab_ui.track.getBoundingClientRect();
    let ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
    return ab_clamp(ratio, 0, 1) * (ab_video == null ? 0 : ab_video.duration);
  };

  for (let which of ["a", "b"]) {
    let handle = which === "a" ? ab_ui.handle_a : ab_ui.handle_b;

    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      ab_dragging = which;
      handle.classList.add("dragging");
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (ab_dragging !== which) return;
      set_ab_point(which, time_at_pointer(event), true);
    });
    let stop_dragging = () => {
      if (ab_dragging !== which) return;
      ab_dragging = null;
      handle.classList.remove("dragging");
    };
    handle.addEventListener("pointerup", stop_dragging);
    handle.addEventListener("pointercancel", stop_dragging);

    // For picking a point down to the tenth of a second
    handle.addEventListener("keydown", (event) => {
      let step = event.shiftKey ? 1 : 0.1;
      let from = which === "a" ? ab_a : ab_b;
      if (event.key === "ArrowLeft") {
        set_ab_point(which, from - step, true);
      } else if (event.key === "ArrowRight") {
        set_ab_point(which, from + step, true);
      } else {
        return;
      }
      event.preventDefault();
    });
  }

  // Clicking the track itself moves whichever point is closest
  ab_ui.track.addEventListener("pointerdown", (event) => {
    if (event.target !== ab_ui.track && event.target !== ab_ui.range) return;
    let time = time_at_pointer(event);
    set_ab_point(
      Math.abs(time - ab_a) <= Math.abs(time - ab_b) ? "a" : "b",
      time,
      true,
    );
  });

  shadow.querySelector(".set-a").addEventListener("click", () => {
    if (ab_video != null) set_ab_point("a", ab_video.currentTime);
  });
  shadow.querySelector(".set-b").addEventListener("click", () => {
    if (ab_video != null) set_ab_point("b", ab_video.currentTime);
  });
  shadow.querySelector(".reset").addEventListener("click", () => {
    reset_ab_points();
  });
  shadow.querySelector(".close").addEventListener("click", () => {
    set_ab_repeat_enabled(false);
    // Untick the checkbox as well, so the popup can turn it back on
    send_chrome_message({ type: "set_ab_repeat", value: false }).catch((err) => {
      // prettier-ignore
      console.warn(`[Windowed] Error while turning A-B repeat off`, err);
    });
  });

  reparent_ab_panel();
};

/** Playing to the very end never "runs past B", so pick it up here instead */
let ab_on_video_ended = () => {
  if (ab_video == null || ab_dragging != null) return;
  ab_video.currentTime = ab_a;
  ab_video.play().catch(() => {});
};

/** A new video in the same element: the old points mean nothing now */
let ab_on_loaded_metadata = () => {
  reset_ab_points();
};

/**
 * Streams refine their duration while they play, which is no reason to throw
 * away the points you picked: keep them, just don't let B run off the end.
 */
let ab_on_duration_change = () => {
  if (ab_video == null) return;
  let duration = ab_video.duration;
  if (!isFinite(duration) || duration <= 0) return;
  ab_b = Math.min(ab_b, duration);
  ab_a = Math.min(ab_a, Math.max(0, ab_b - AB_MIN_LOOP));
  render_ab_points();
};

/** @param {HTMLVideoElement} video */
let is_usable_ab_video = (video) =>
  video instanceof HTMLVideoElement &&
  isFinite(video.duration) &&
  video.duration > 1;

/** The biggest video on the page is nearly always the one you are watching */
let find_ab_video = () => {
  let found = null;
  let biggest = 0;
  for (let video of document.querySelectorAll("video")) {
    if (!is_usable_ab_video(video)) continue;
    let rect = video.getBoundingClientRect();
    let size = rect.width * rect.height;
    if (size > biggest) {
      found = video;
      biggest = size;
    }
  }
  return found;
};

/** @param {HTMLVideoElement} video */
let attach_ab_video = (video) => {
  if (video === ab_video) return;

  if (ab_video != null) {
    ab_video.removeEventListener("timeupdate", enforce_ab_loop);
    ab_video.removeEventListener("ended", ab_on_video_ended);
    ab_video.removeEventListener("loadedmetadata", ab_on_loaded_metadata);
    ab_video.removeEventListener("durationchange", ab_on_duration_change);
  }

  ab_video = video;
  if (ab_video == null) {
    if (ab_ui != null) ab_ui.host.style.display = "none";
    return;
  }

  // `timeupdate` only fires a few times a second, but unlike animation frames
  // it keeps firing while the tab is in the background
  ab_video.addEventListener("timeupdate", enforce_ab_loop);
  ab_video.addEventListener("ended", ab_on_video_ended);
  ab_video.addEventListener("loadedmetadata", ab_on_loaded_metadata);
  ab_video.addEventListener("durationchange", ab_on_duration_change);

  create_ab_panel();
  reparent_ab_panel();
  reset_ab_points();
  position_ab_panel();
  start_ab_ticking();
};

/** @param {Event} event */
let ab_on_media_event = (event) => {
  let video = /** @type {HTMLVideoElement} */ (event.target);
  if (!is_usable_ab_video(video)) return;
  // Whatever you just started playing is what you mean to repeat
  if (event.type === "play" || ab_video == null || !ab_video.isConnected) {
    attach_ab_video(video);
  }
};

/** @param {boolean} enabled */
let set_ab_repeat_enabled = (enabled) => {
  if (enabled === ab_repeat_enabled) return;
  ab_repeat_enabled = enabled;

  if (enabled) {
    // Neither of these bubbles, so we catch them on the way down instead
    document.addEventListener("play", ab_on_media_event, true);
    document.addEventListener("loadedmetadata", ab_on_media_event, true);
    for (let alias of fullscreenchange_aliasses) {
      document.addEventListener(alias, reparent_ab_panel);
    }
    attach_ab_video(find_ab_video());
  } else {
    document.removeEventListener("play", ab_on_media_event, true);
    document.removeEventListener("loadedmetadata", ab_on_media_event, true);
    for (let alias of fullscreenchange_aliasses) {
      document.removeEventListener(alias, reparent_ab_panel);
    }
    attach_ab_video(null);
    if (ab_animation_frame != null) cancelAnimationFrame(ab_animation_frame);
    ab_animation_frame = null;
    if (ab_ui != null) {
      ab_ui.host.remove();
      ab_ui = null;
    }
  }
};

let current_mode = { mode: "ask", pip: false };

let check_disabled_state = async () => {
  try {
    let { mode, pip, ab_repeat } = await get_host_config_local();
    current_mode = { mode, pip };
    set_ab_repeat_enabled(ab_repeat === true);
    window.postMessage(
      {
        type: "WINDOWED-notify",
        disabled: is_shift_pressed
          ? false
          : mode === "fullscreen" && pip === false,
      },
      "*",
    );
  } catch (err) {
    // prettier-ignore
    console.warn(`[Windowed] Error while checking if windowed is enabled or not`, err)
  }
};

check_disabled_state();

browser.runtime.onConnect.addListener(async (port) => {
  port.postMessage({ type: "I_exists_ping" });
  check_disabled_state();
});

let theme = null;
send_chrome_message({
  type: "get_theme",
}).then((x) => {
  theme = x;
});
