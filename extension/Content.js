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
const browser = /** @type {import("webextension-polyfill-ts").Browser} */ (
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
    <img src="${icon}" alt="" />
    <span>${text}</span>
  </button>
`;

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

    console.log(`element:`, element);

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
              icon: browser.runtime.getURL("Images/Icon_Windowed@scalable.svg"),
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
                        <img src="${browser.runtime.getURL("Images/Icon_PiP@scalable.svg")}" alt="" />
                        <span class="flex-1">PiP</span>
                        <kbd style="margin-left: 16px">p</kbd>
                      </button>
                    </li>
                  `
                  : ""
              }
              <li>
                <button data-target="windowed" title="Windowed (w)" class="flex flex-row">
                  <img src="${browser.runtime.getURL("Images/Icon_Windowed@scalable.svg")}" alt="" />
                  <span class="flex-1">Windowed</span>
                  <kbd style="margin-left: 16px">w</kbd>
                </button>
              </li>
              <li>
                <button data-target="in-window" title="In-window (i)" class="flex flex-row">
                  <img src="${browser.runtime.getURL("Images/Icon_InWindow_Mono@scalable.svg")}" alt="" />
                  <span class="flex-1">In-window</span>
                  <kbd style="margin-left: 16px">i</kbd>
                </button>
              </li>
              <li>
                <button data-target="fullscreen" title="Fullscreen (f)" class="flex flex-row">
                  <img src="${browser.runtime.getURL("Images/Icon_EnterFullscreen@scalable.svg")}" alt="" />
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
        requestFullscreen.call(this, original_function.bind(this), ...args);
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
        exitFullscreen.call(this, original_function.bind(this), ...args);
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

  .popup {
    background-color: white;
    border-radius: 3px;
    border: solid #eee 1px;
    box-shadow: 0px 2px 4px #00000026;
    padding-top: 5px;
    padding-bottom: 5px;
    font-size: 16px;
    color: black;
    min-width: 150px;
    z-index: ${max_z_index};

    display: flex;
    flex-direction: column;
    align-items: stretch;

    font-family: sans-serif;
  }

  .popup:focus {
    outline: none;
  }

  @media (prefers-color-scheme: dark) {
    .popup {
      filter: invert(0.9);
    }
  }

  .popup [data-target] {
    text-align: inherit;
    cursor: pointer;
    padding: 1.25em;
    padding-top: 0.25em;
    padding-bottom: 0.25em;
    background-color: white;
    color: black; /* Force black for if the page has color: white */

    display: flex;
    flex-direction: row;
    align-items: center;

    font-size: inherit;
    border: none;
    box-shadow: none;

    white-space: nowrap;
  }

  [data-target]::-moz-focus-inner,
  .popup::-moz-focus-inner {
    border: 0;
    outline: 0;
  }
  [data-target]:focus {
    filter: brightness(0.95);
  }
  [data-target]:focus:not(:focus-visible) {
    outline: none;
  }
  [data-target]:hover {
    filter: brightness(0.9);
  }

  [data-target] > img {
    height: 1.2em;
    width: 1.2em;
    margin-right: 1em;
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
      /* This thing is css black magic */
      all: initial !important;
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

let go_in_cool_pip = async () => {
  let element = get_fullscreen_select_element();

  // Open a Picture-in-Picture window.
  await globalThis.documentPictureInPicture.requestWindow();
  window.postMessage({ type: "WINDOWED-cool-pip" }, "*");
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

let current_mode = { mode: "ask", pip: false };

let check_disabled_state = async () => {
  try {
    let { mode, pip } = await get_host_config_local();
    current_mode = { mode, pip };
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
