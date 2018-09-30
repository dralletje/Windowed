const fullscreen_id_namespace = `windowed_long_id_that_does_not_conflict`;

const fullscreen_select = `${fullscreen_id_namespace}_select`
const fullscreen_active = `${fullscreen_id_namespace}_active`;
const fullscreen_element_cloned = `${fullscreen_id_namespace}_ugly_hacky_cloned`;
const fullscreen_parent = `${fullscreen_id_namespace}_parent`;
const body_class = `${fullscreen_id_namespace}_body`;

const popup_class = `${fullscreen_id_namespace}_popup`;

const max_z_index = '2147483647';

// Aliasses for different browsers (rest of aliasses are in the inserted script)
let fullscreenchange_aliasses = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
];
let requestFullscreen_aliasses = [
  'requestFullscreen',
  'mozRequestFullScreen',
  'webkitRequestFullscreen',
  'webkitRequestFullScreen',
  'msRequestFullscreen',
];
let exitFullscreen_aliasses = [
  'exitFullscreen',
  'webkitExitFullscreen',
  'webkitCancelFullScreen',
  'mozCancelFullScreen',
  'msExitFullscreen',
];
let fullscreenelement_aliasses = [
  'fullscreenElement',
  'webkitFullscreenElement',
  'mozFullscreenElement',
  'mozFullScreenElement',
  'msFullscreenElement',
  'webkitCurrentFullScreenElement',
];

let external_functions = {};
let next_id = 1;

let on_webpage = (strings, ...values) => {
  let result = strings[0];

  let value_index = 1;
  for (let value of values) {
    if (typeof value === 'string') {
      result = result + value;
    }
    if (typeof value === 'object') {
      result = result + JSON.stringify(value);
    }
    if (typeof value === 'function') {
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
let external_function_parent = (function_id) => async (...args) => {
  let request_id = `FROM_CONTENT:${all_communication_id}`;
  all_communication_id = all_communication_id + 1;

  if (window.parent === window) {
    return;
  }

  window.parent.postMessage({
    type: 'CUSTOM_WINDOWED_FROM_PAGE',
    request_id: request_id,
    function_id: function_id,
    args: args,
  }, '*');

  return new Promise((resolve, reject) => {
    let listener = (event) => {
      // We only accept messages from ourselves
      if (event.source != window.parent) return;
      if (event.data == null) return;

      if (event.data.type === 'CUSTOM_WINDOWED_TO_PAGE') {
        if (event.data.request_id === request_id) {
          window.removeEventListener('message', listener);
          resolve(event.data.result);
        }
      }
    }
    window.addEventListener('message', listener);
  });
}

let enable_selector = (element, key) => {
  element.dataset[key] = true;
}
let disable_selector = (element, key) => {
  delete element.dataset[key];
}

// Insert requestFullScreen mock
const code_to_insert_in_page = on_webpage`{
  // Alliases for different browsers
  let requestFullscreen_aliasses = ${JSON.stringify(
    requestFullscreen_aliasses
  )};
  let exitFullscreen_aliasses = ${JSON.stringify(exitFullscreen_aliasses)};
  let fullscreenelement_aliasses = ${JSON.stringify(
    fullscreenelement_aliasses
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
            resolve(event.data.result);
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

  let create_popup = ${async () => {
    create_style_rule();
    clear_popup();

    let is_fullscreen = await external_function_parent('is_fullscreen')();

    if (is_fullscreen) {
      await go_out_of_fullscreen();
      return 'EXIT';
    }

    let top_vs_bottom = last_click_y < 300 ? 'translateY(0px)' : 'translateY(-100%)';
    let left_vs_right = last_click_x < 300 ? 'translateX(0px)' : 'translateX(-100%)';

    let popup = createElementFromHTML(`
      <div class="${popup_class}" style="
        position: absolute;
        top: ${last_click_y}px;
        left: ${last_click_x}px;
        transform: ${top_vs_bottom} ${left_vs_right};
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
      ">
        <div data-target="windowed">
          <img
            src="${chrome.extension.getURL("Images/Icon_Windowed@scalable.svg")}"
          />
          <span>Windowed</span>
        </div>
        <div data-target="fullscreen">
          <img
            src="${chrome.extension.getURL("Images/Icon_EnterFullscreen@scalable.svg")}"
          />
          <span>Fullscreen</span>
        </div>
      </div>
    `);
    document.body.appendChild(popup);
    last_popup = popup;

    let result = await new Promise((resolve) => {
      for (let button of document.querySelectorAll(`.${popup_class} > div`)) {
        button.addEventListener(
          'click',
          () => {
            resolve(button.dataset.target);
          },
          {
            once: true,
          }
        );
      }
    });

    clear_popup();

    if (result === 'fullscreen') {
      let element = document.querySelector(
        `[data-${fullscreen_select}]`
      );
      disable_selector(element, fullscreen_select);

      // TODO This now spawns fullscreen that returns to a separate window
      // .... when removed, because it is opened from the extension.
      // .... Need to open this on the original window.
      // NOTE This is the original fullscreen (in chrome at least)
      element.webkitRequestFullScreen();
      return 'FULLSCREEN';
    }
    if (result === 'windowed') {
      await go_into_fullscreen();
      return 'WINDOWED';
    }
    if (result === 'exit') {
      await go_out_of_fullscreen();
      return 'EXIT';
    }
  }}

  let make_tab_exit_fullscreen = ${async () => {
    await go_out_of_fullscreen();
    send_fullscreen_events();
  }}

  let exitFullscreen = async function(original) {
    let windowed_fullscreen = document.querySelector('[data-${fullscreen_active}]');

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

  ${'' /* NOTE requestFullscreen */}
  const requestFullscreen = async function(original, force, ...args) {
    const element = this;
    element.dataset['${fullscreen_select}'] = true;

    // Tell extension code (outside of this block) to go into fullscreen
    // window.postMessage({ type: force ? "enter_fullscreen" : "show_fullscreen_popup" }, "*");
    // send_windowed_event(element, force ? "enter_fullscreen" : "show_fullscreen_popup");
    if (force) {
      await make_tab_go_fullscreen();
    } else {
      let next = await create_popup();
    }
  }

  let finish_fullscreen = () => {
    // Because youtube actually checks for those sizes?!
    const window_width = Math.max(window.outerWidth, window.innerWidth);
    const window_height = Math.max(window.outerHeight, window.innerHeight);
    overwrite(window.screen, 'width', window_width);
    overwrite(window.screen, 'height', window_height);

    let element = document.querySelector('[data-${fullscreen_select}]');
    set_fullscreen_element(element || document.body);
    send_fullscreen_events();
  }

  window.onmessage = (message) => {
    const frame = [...document.querySelectorAll('iframe')].find(x => x.contentWindow === message.source);

    if (frame || window.parent === message.source || message.target === message.source) {
      if (message.data && message.data.type === 'WINDOWED-confirm-fullscreen') {
        finish_fullscreen();
      }
    }
    if (frame || window.parent === message.source || message.target === message.source) {
      if (message.data && message.data.type === 'WINDOWED-exit-fullscreen') {
        exitFullscreen.call(document, original_exitFullscreen);
      }
    }

    if (frame != null && message.data) {
      if (message.data.type === 'enter_fullscreen_iframe') {
        // Call my requestFullscreen on the element
        requestFullscreen.call(frame, null, true);
      }
      if (message.data.type === 'exit_fullscreen_iframe') {
        // Call my exitFullscreen on the document
        exitFullscreen.call(document, original_exitFullscreen);
      }
    }
  }

  ${
    '' /* NOTE Replace all the `requestFullscreen` aliasses with calls to my own version */
  }
  let original_requestFullscreen = null;
  requestFullscreen_aliasses.forEach(requestFullscreenAlias => {
    if (typeof Element.prototype[requestFullscreenAlias] === 'function') {
      let original_function = Element.prototype[requestFullscreenAlias];
      original_requestFullscreen = original_function;
      Element.prototype[requestFullscreenAlias] = function(...args) {
        requestFullscreen.call(this, original_function.bind(this), ...args);
      };
    }
  });

  ${
    '' /* NOTE Replace all the `exitFullscreen` aliasses with calls to my own version */
  }
  let original_exitFullscreen = null;
  exitFullscreen_aliasses.forEach(exitFullscreenAlias => {
    if (typeof Document.prototype[exitFullscreenAlias] === 'function') {
      let original_function = Document.prototype[exitFullscreenAlias];
      original_exitFullscreen = original_function;
      Document.prototype[exitFullscreenAlias] = function(...args) {
        exitFullscreen.call(this, original_function.bind(this), ...args);
      };
    }
  });
}
`;

let elt = document.createElement('script');
elt.innerHTML = code_to_insert_in_page;
document.documentElement.appendChild(elt);
document.documentElement.removeChild(elt);

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

const send_fullscreen_events = () => {
  for (let fullscreenchange of fullscreenchange_aliasses) {
    send_event(document, fullscreenchange);
  }
  send_event(window, 'resize');
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

let has_style_created = false;
let create_style_rule = () => {
  if (has_style_created) {
    return;
  }
  has_style_created = true;

  let css = `
    [data-${body_class}] [data-${fullscreen_active}] {
      position: fixed !important;
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: 0 !important;
      width: 100%;
      height: 100%;
      z-index: ${max_z_index} !important;
    }

    [data-${body_class}] [data-${fullscreen_parent}] {
      /* This thing is css black magic */
      all: initial !important;
      z-index: ${max_z_index} !important;

      /* Debugging */
      background-color: rgba(0,0,0,.1) !important;
    }

    /* Not sure if this is necessary, but putting it here just in case */
    [data-${body_class}] [data-${fullscreen_parent}]::before,
    [data-${body_class}] [data-${fullscreen_parent}]::after {
      display: none;
    }

    [data-${body_class}] {
      /* Prevent scrolling */
      overflow: hidden !important;

      /* For debugging, leaving this just in here so I see when something goes wrong */
      /* background-color: rgb(113, 0, 180); */
    }

    .${popup_class} > div {
      cursor: pointer;
      padding: 20px;
      padding-top: 4px;
      padding-bottom: 4px;
      background-color: white;

      display: flex;
      flex-direction: row;
      align-items: center;
    }

    .${popup_class} > div > img {
      height: 19px;
      margin-right: 16px;
    }

    .${popup_class} > div:hover {
      filter: brightness(0.9);
    }
  `;

  let styleEl = document.createElement('style');
  document.head.appendChild(styleEl);
  styleEl.appendChild(document.createTextNode(css));
};

const parent_elements = function*(element) {
  let el = element.parentElement;
  while (el) {
    yield el;
    el = el.parentElement;
  }
};

let send_chrome_message = (message) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, () => {
      resolve();
    });
  });
};

let last_click_x = null;
let last_click_y = null;
let last_popup = null;
let is_in_fullscreen = false;

let clear_popup = () => {
  if (last_popup != null) {
    try {
      document.body.removeChild(last_popup);
    } catch (err) {}
    last_popup = null;
  }
};

document.onclick = function(e) {
  last_click_x = e.pageX;
  last_click_y = e.pageY;
  clear_popup();
};

let exit_fullscreen_on_page = () => {
  window.postMessage({
    type: 'WINDOWED-exit-fullscreen',
  }, '*')
}

let createElementFromHTML = (htmlString) => {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
};

let go_into_fullscreen = async () => {
  create_style_rule();
  let element = document.querySelector(`[data-${fullscreen_select}]`);
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
          if (cloned.contentWindow && cloned.contentWindow.postMessage) {
            cloned.contentWindow.postMessage(
              { type: 'WINDOWED-confirm-fullscreen' },
              '*'
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

  let escape_listener = (e) => {
    if (!e.defaultPrevented) {
      exit_fullscreen_on_page();
    }
  }
  window.addEventListener('keyup', escape_listener);

  let beforeunload_listener = (e) => {
    exit_fullscreen_on_page();
  }
  window.addEventListener('beforeunload', beforeunload_listener);

  clear_listeners = () => {
    mutationObserver.disconnect();
    window.removeEventListener('keyup', escape_listener);
    window.removeEventListener('beforeunload', beforeunload_listener);
  }

  enable_selector(element, fullscreen_active);
  // Add fullscreen class to every parent of our fullscreen element
  for (let parent_element of parent_elements(element)) {
    enable_selector(parent_element, fullscreen_parent)
  }

  if (window.parent !== window) {
    // Ask parent-windowed code to become fullscreen too
    window.parent.postMessage({ type: 'enter_fullscreen_iframe' }, '*');
  } else {
    // Send popup command to extension
    let menubar_size = window.outerHeight - window.innerHeight; // Asumme there is just header, no browser footer
    let rect = element.getBoundingClientRect();

    // rect.width
    let ratio_width = Math.min(rect.height / 9 * 16, rect.width); // 16:9
    let width_diff = rect.width - ratio_width;

    await send_chrome_message({
      type: 'please_make_me_a_popup',
      position: {
        height: rect.height,
        width: ratio_width,
        top: rect.top + menubar_size,
        left: rect.left + width_diff / 2,
      },
    });
  }


  window.postMessage({ type: 'WINDOWED-confirm-fullscreen' }, '*');

  // Add no scroll to the body and let everything kick in
  enable_selector(document.body, body_class)
};

let go_out_of_fullscreen = async () => {
  // Remove no scroll from body (and remove all styles)
  disable_selector(document.body, body_class)

  // Remove fullscreen class... from everything
  for (let element of document.querySelectorAll(`[data-${fullscreen_parent}]`)) {
    disable_selector(element, fullscreen_parent);
  }

  clear_listeners();


  send_fullscreen_events();

  const fullscreen_element = document.querySelector(
    `[data-${fullscreen_select}]`
  );
  disable_selector(fullscreen_element, fullscreen_select);
  disable_selector(fullscreen_element, fullscreen_active);

  // If we are a frame, tell the parent frame to exit fullscreen
  // If we aren't (we are a popup), tell the background page to make me tab again
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'exit_fullscreen_iframe' }, '*');
  } else {
    await delay(10);
    await send_chrome_message({ type: 'please_make_me_a_tab_again' });
    await delay(500);
  }

  let cloned = document.querySelector(`[data-${fullscreen_element_cloned}]`);
  if (cloned) {
    document.body.removeChild(cloned);
  }
};

external_functions.is_fullscreen = () => {
  const fullscreen_element = document.querySelector(
    `[data-${fullscreen_active}]`
  );
  return fullscreen_element != null;
}

window.addEventListener('message', async (event) => {
  // We only accept messages from ourselves
  if (event.data == null) return;
  if (event.data.type === 'CUSTOM_WINDOWED_FROM_PAGE') {
    let fn = external_functions[event.data.function_id];
    let result = await fn(...event.data.args);
    event.source.postMessage(
      {
        type: 'CUSTOM_WINDOWED_TO_PAGE',
        request_id: event.data.request_id,
        result: result,
      },
      '*'
    );
  }
});
