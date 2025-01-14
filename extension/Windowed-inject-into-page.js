{
  // Alliases for different browsers
  let requestFullscreen_aliasses = ["requestFullscreen","mozRequestFullScreen","webkitRequestFullscreen","webkitRequestFullScreen","msRequestFullscreen"];
  let exitFullscreen_aliasses = ["exitFullscreen","webkitExitFullscreen","webkitCancelFullScreen","mozCancelFullScreen","msExitFullscreen"];
  let fullscreenelement_aliasses = ["fullscreenElement","webkitFullscreenElement","mozFullscreenElement","mozFullScreenElement","msFullscreenElement","webkitCurrentFullScreenElement"];
  let fullscreenchange_aliasses = ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"];

  const send_event = (element, type) => {
    const event = new Event(type, {
      bubbles: true,
      cancelBubble: false,
      cancelable: false,
    });
    // if (element[`on${type}`]) {
    //   element[`on${type}`](event);
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

  let make_tab_go_fullscreen = external_function(1);
  let make_tab_go_inwindow = external_function(2);

  let create_popup = external_function(3);

  let make_tab_exit_fullscreen = external_function(4);

  let exitFullscreen = async function(original) {
    let windowed_fullscreen = document.querySelector('[data-windowed_long_id_that_does_not_conflict_active], [data-windowed_long_id_that_does_not_conflict_shadowdom]');

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

  
  const requestFullscreen_windowed = async function(original, ...args) {
    const element = this;
    element.dataset['windowed_long_id_that_does_not_conflict_select'] = true;

    let shadowroot = element.getRootNode()
    while (shadowroot != null && shadowroot.host != null) {
        shadowroot.host.dataset['windowed_long_id_that_does_not_conflict_shadowdom'] = true;
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

    let element = document.querySelector('[data-windowed_long_id_that_does_not_conflict_select]');
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
        frame.dataset['windowed_long_id_that_does_not_conflict_select'] = "true";
        make_tab_go_inwindow();
      }
      if (message.data?.type === 'enter_fullscreen_iframe') {
        frame.dataset['windowed_long_id_that_does_not_conflict_select'] = "true";
        make_tab_go_fullscreen();
      }
      if (message.data?.type === 'exit_fullscreen_iframe') {
        // Call my exitFullscreen on the document
        exitFullscreen.call(document, original_exitFullscreen);
      }
    }
  });

  
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
}