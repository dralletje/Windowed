const fullscreen_id_class = `--Windowed-long-id-that-does-not-conflict--`;
const fullscreen_parent = `${fullscreen_id_class}-parent`;
const body_class = `${fullscreen_id_class}-body`;
const max_z_index = '2147483647';

// Insert requestFullScreen mock
var elt = document.createElement("script");
elt.innerHTML = `
  let overwrite = (object, property, value) => {
    Object.defineProperty(object, property, {
      value: value,
      configurable: true,
    });
  }

  const set_fullscreen_element = (element = null) => {
    overwrite(document, 'webkitIsFullScreen', element != null);
    overwrite(document, 'webkitCurrentFullScreenElement', element);
    overwrite(document, 'webkitFullscreenElement', element)
  }

  const exitFullscreen = function() {
    if (document.webkitIsFullScreen) {
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
    element.classList.add('${fullscreen_id_class}');
    set_fullscreen_element(element);
    window.postMessage({ type: "enter_fullscreen" }, "*");
  }

  Element.prototype.webkitRequestFullscreen = requestFullscreen;
  Element.prototype.webkitRequestFullScreen = requestFullscreen;

  Document.prototype.webkitExitFullscreen = exitFullscreen;
  Document.prototype.webkitCancelFullScreen = exitFullscreen;
`;
document.documentElement.appendChild(elt);

let has_style_created = false;
let create_style_rule = () => {
  if (has_style_created) {
    return;
  }
  has_style_created = true;

  let styleEl = document.createElement('style');
  document.head.appendChild(styleEl);
  let styleSheet = styleEl.sheet;

  styleSheet.insertRule(`
    .${fullscreen_id_class} {
      position: fixed !important;
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: 0 !important;
      z-index: ${max_z_index} !important;
    }
  `)
  styleSheet.insertRule(`
    .${fullscreen_parent} {
      z-index: ${max_z_index} !important;
    }
  `)
  styleSheet.insertRule(`
    .${body_class} {
      overflow: hidden !important;
    }
  `)
}

const send_event = (element, type) => {
  const event = new Event(type, {
    bubbles: true,
    cancelBubble: false,
    cancelable: false,
  });
  if (element[`on${type}`]) {
    element[`on${type}`](event);
  }
  element.dispatchEvent(event)
}

window.addEventListener("message", function(event) {
  // We only accept messages from ourselves
  if (event.source != window)
      return;

  // Going INTO fullscreen
  if (event.data.type && (event.data.type == "enter_fullscreen")) {
    create_style_rule();
    const element = document.querySelector(`.${fullscreen_id_class}`);

    // Add no scroll to the body
    document.body.classList.add(body_class);

    // Add fullscreen class to every parent of our fullscreen element
    let el = element;
    while (el) {
      el.classList.add(fullscreen_parent);
      el = el.parentElement;
    }

    // Send events
    send_event(element, 'webkitfullscreenchange');
    send_event(window, 'resize');

    // Send popup command to extension
    chrome.runtime.sendMessage({ type: 'please_make_me_a_popup' });
  }

  // Going OUT fullscreen
  if (event.data.type && (event.data.type == "exit_fullscreen")) {
    // Remove no scroll from body
    document.body.classList.remove(body_class);

    // Remove fullscreen class... from everything
    document.querySelectorAll(`.${fullscreen_parent}`).forEach(element => {
      element.classList.remove(fullscreen_parent);
    });

    const fullscreen_element = document.querySelector(`.${fullscreen_id_class}`);
    fullscreen_element.classList.remove(fullscreen_id_class);

    send_event(fullscreen_element, 'webkitfullscreenchange');
    send_event(window, 'resize');

    chrome.runtime.sendMessage({ type: 'please_make_me_a_tab_again' });
  }
});
