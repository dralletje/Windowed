const fullscreen_id_class = `--Windowed-long-id-that-does-not-conflict--`;
const fullscreen_id_class_select_only = `${fullscreen_id_class}-select`
const fullscreen_parent = `${fullscreen_id_class}-parent`;
const body_class = `${fullscreen_id_class}-body`;
const transition_class = `${fullscreen_id_class}-transition`;
const transition_transition_class = `${fullscreen_id_class}-transition-transition`;

const max_z_index = '2147483647';

// Aliasses for different browsers (rest of aliasses are in the inserted script)
let fullscreenchange_aliasses = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
];

// Insert requestFullScreen mock
const code_to_insert_in_page = `{
  // Alliases for different browsers
  let requestFullscreen_aliasses = ["requestFullscreen", "mozRequestFullScreen", "webkitRequestFullscreen", "webkitRequestFullScreen", "msRequestFullscreen"];
  let exitFullscreen_aliasses = ["exitFullscreen", "webkitExitFullscreen", "webkitCancelFullScreen", "mozCancelFullScreen", "msExitFullscreen"];
  let fullscreenelement_aliasses = ["fullscreenElement", "webkitFullscreenElement", "mozFullscreenElement", "mozFullScreenElement", "msFullscreenElement", "webkitCurrentFullScreenElement"];

  let overwrite = (object, property, value) => {
    try {
      Object.defineProperty(object, property, {
        value: value,
        configurable: true,
        writable: true,
      });
    } catch (err) {
      // Nothing
    }
  }

  const set_fullscreen_element = (element = null) => {
    overwrite(document, 'webkitIsFullScreen', element != null); // Old old old
    for (let fullscreenelement_alias of fullscreenelement_aliasses) {
      overwrite(document, fullscreenelement_alias, element);
    }
  }

  const exitFullscreen = function() {
    if (document.fullscreenElement != null) {
      // If the fullscreen element is a frame, tell it to exit fullscreen too
      if (typeof document.fullscreenElement.postMessage === 'function') {
        document.fullscreenElement.postMessage.sendMessage({ type: "exit_fullscreen_iframe" });
      }

      window.postMessage({ type: "exit_fullscreen" }, "*");
      set_fullscreen_element(null);
    }
  }

  const requestFullscreen = function() {

    // Because youtube actually checks for those sizes?!
    const window_width = Math.max(window.outerWidth, window.innerWidth);
    const window_height = Math.max(window.outerHeight, window.innerHeight);
    overwrite(window.screen, 'width', window_width);
    overwrite(window.screen, 'height', window_height);

    const element = this;
    let rect = element.getBoundingClientRect();
    element.classList.add('${fullscreen_id_class_select_only}');
    set_fullscreen_element(element);

    // Tell extension code (outside of this block) to go into fullscreen
    window.postMessage({ type: "enter_fullscreen" }, "*");
  }

  window.onmessage = (message) => {
    const frame = [...document.querySelectorAll('iframe')].find(x => x.contentWindow === message.source);
    if (frame && message.data) {
      if (message.data.type === 'enter_fullscreen_iframe') {
        requestFullscreen.call(frame); // Call my requestFullscreen on the element
      }
      if (message.data.type === 'exit_fullscreen_iframe') {
        exitFullscreen.call(document); // Call my exitFullscreen on the document
      }
    }
  }

  requestFullscreen_aliasses.forEach(requestFullscreenAlias => {
    if (typeof Element.prototype[requestFullscreenAlias] === 'function') {
      Element.prototype[requestFullscreenAlias] = requestFullscreen;
    }
  });

  exitFullscreen_aliasses.forEach(exitFullscreenAlias => {
    if (typeof Document.prototype[exitFullscreenAlias] === 'function') {
      Document.prototype[exitFullscreenAlias] = exitFullscreen;
    }
  });
}`;

let elt = document.createElement('script');
elt.innerHTML = code_to_insert_in_page;
document.documentElement.appendChild(elt);
document.documentElement.removeChild(elt);

setTimeout(() => {
  return false;

  for (let stylesheet of document.styleSheets) {
    try {
      for (let rule of stylesheet.cssRules) {
        // Remove the css rule if the media query doesn't match,
        // Force match it when it does
        if (rule.media) {
          if (window.matchMedia(rule.media.mediaText).matches) {
            // console.log(`The media (${rule.media.mediaText}) matches!`);
            rule.media.__WINDOWED_FALLBACK_MEDIATEXT__ = rule.media.mediaText;
            rule.media.mediaText = "all";
          } else {
            // console.log(`The media (${rule.media.mediaText}) does not match!`);
            rule.media.__WINDOWED_FALLBACK_MEDIATEXT__ = rule.media.mediaText;
            rule.media.mediaText = "not all";
          }
        }
      }
    } catch (err) {
      console.warn(`WINDOWED: Couldn't read stylesheet rules because of CORS...`);
      console.log(`stylesheet:`, stylesheet)
    }
  }
}, 1000);

// console.log('Runs in proper sandbox:', document.documentElement.constructor === HTMLHtmlElement);
// NOTE On chrome, extensions run in a proper sandbox (above will log true),
// meaning that you can't get access to the actual prototype-s of the Document and Elements-s,
// hence the need for the ugly script insert above.
// On Firefox however, this is not the case, and I might (because firefox screws me with CSP)
// need to use this quirk to work on all pages

let remove_domnoderemoved_listener = () => {};

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
    .${body_class} .${fullscreen_id_class} {
      position: fixed !important;
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: 0 !important;
      width: 100%;
      height: 100%;
      z-index: ${max_z_index} !important;
    }

    .${body_class} .${fullscreen_parent} {
      /* This thing is css black magic */
      all: initial;
      z-index: ${max_z_index} !important;

      /* Debugging */
      background-color: rgba(0,0,0,.1) !important;
    }

    /* Not sure if this is necessary, but putting it here just in case */
    .${body_class} .${fullscreen_parent}::before,
    .${body_class} .${fullscreen_parent}::after {
      display: none;
    }

    .${body_class} {
      /* Prevent scrolling */
      overflow: hidden !important;

      /* For debugging, leaving this just in here so I see when something goes wrong */
      /* background-color: rgb(113, 0, 180); */
    }

    /*
    .${transition_transition_class} {
      background-color: black !important;
    }

    .${transition_transition_class} body {
      /* transition: opacity .5s; */
      opacity: 1;
    }

    .${transition_class} body {
      opacity: 0 !important;
    }
    */
  `;

  let styleEl = document.createElement('style');
  document.head.appendChild(styleEl);
  styleEl.appendChild(document.createTextNode(css));
};

const send_event = (element, type) => {
  const event = new Event(type, {
    bubbles: true,
    cancelBubble: false,
    cancelable: false,
  });
  if (element[`on${type}`]) {
    element[`on${type}`](event);
  }
  element.dispatchEvent(event);
};

const parent_elements = function*(element) {
  let el = element.parentElement;
  while (el) {
    yield el;
    el = el.parentElement;
  }
};

const send_fullscreen_events = (element) => {
  for (let fullscreenchange of fullscreenchange_aliasses) {
    send_event(element, fullscreenchange);
  }
  send_event(window, 'resize');
};

let send_chrome_message = (message) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, () => {
      resolve();
    });
  });
};

window.addEventListener('message', async (event) => {
  // We only accept messages from ourselves
  if (event.source != window) return;

  // Going INTO fullscreen
  if (event.data.type && event.data.type == 'enter_fullscreen') {
    create_style_rule();
    let element = document.querySelector(`.${fullscreen_id_class_select_only}`);

    document.addEventListener('DOMNodeRemoved', e => {
      if (e.target.contains(element)) {
        window.alert('The page removed the element that was supposed to be fullscreen... this makes it impossible to show this in fullscreen');
      }
    })

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

      element.classList.add(fullscreen_id_class);
      document.documentElement.classList.add(transition_class);
      document.documentElement.classList.add(transition_transition_class);

      await delay(10);
      await send_chrome_message({
        type: 'please_make_me_a_popup',
        position: {
          height: rect.height,
          width: ratio_width,
          top: rect.top + menubar_size,
          left: rect.left + width_diff / 2,
        },
      });
      await delay(10);
    }

    // Add fullscreen class to every parent of our fullscreen element
    for (let parent_element of parent_elements(element)) {
      parent_element.classList.add(fullscreen_parent);
    }

    // Send events
    send_fullscreen_events(element);

    // Add no scroll to the body and let everything kick in
    document.body.classList.add(body_class);
    document.documentElement.classList.remove(transition_class);

    await delay(500);
    document.documentElement.classList.remove(transition_transition_class);
  }

  // Going OUT fullscreen
  if (event.data.type && event.data.type == 'exit_fullscreen') {
    // Hide everything for a smooth transition
    document.documentElement.classList.add(transition_class);
    document.documentElement.classList.add(transition_transition_class);

    // Remove no scroll from body (and remove all styles)
    document.body.classList.remove(body_class);

    // Remove fullscreen class... from everything
    for (let element of document.querySelectorAll(`.${fullscreen_parent}`)) {
      element.classList.remove(fullscreen_parent);
    }

    const fullscreen_element = document.querySelector(`.${fullscreen_id_class_select_only}`);
    send_fullscreen_events(fullscreen_element);
    fullscreen_element.classList.remove(fullscreen_id_class_select_only);
    fullscreen_element.classList.remove(fullscreen_id_class);

    // If we are a frame, tell the parent frame to exit fullscreen
    // If we aren't (we are a popup), tell the background page to make me tab again
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'exit_fullscreen_iframe' }, '*');
    } else {
      await delay(10);
      await send_chrome_message({ type: 'please_make_me_a_tab_again' });
      await delay(500);
    }

    document.documentElement.classList.remove(transition_class);
    await delay(2000);
    document.documentElement.classList.remove(transition_transition_class);
  }
});
