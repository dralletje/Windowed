# ![Windowed Logo](extension/Icons/Icon_32.png) Windowed

[Install in Chrome Webstore](https://chrome.google.com/webstore/detail/windowed-floating-youtube/gibipneadnbflmkebnmcbgjdkngkbklb)

A small extension for chrome and firefox I made because I don't really like normal fullscreen. It injects itself into every page, and replaces `HTMLElement.prototype.requestFullscreen` (or the browser specific version) with a popup to get into Windowed or In-window mode.

![Chromestore screenshot](Chromewebstore%20screenshot%20%231.png)

### but.. but.. Chrome has Picture-in-picture mode now?
Sure, and that's awesome!
Advantages include
- **Floating on top**, which is honestly the reason I use it for youtube now instead of my own extension, as I can not do floating-on-top in the extension
- **Window without bars**, for windowed I can't but show a status bar...
- **Native to the browser**, which is nice because people at Google are a lot better at making stable software then I am

buuuuuuttttttt

There is one big disadvantage, the only reason I'm still working on this extension even, is that it **only works on videos**, and only **without any website specific controls**. For youtube, that doesn't really stack up against the floating-on-top feature for me. Still, there are many websites that do put something else (not a video) in fullscreen, which picture-in-picture does not support.  
Either picture-in-picture needs to work for arbitrary elements, which would be really awesome, or chrome extensions should be able to make floating-on-top windows (they used to). Until then, we are stuck with too tools for just slightly different situations

### Why so much code
There are actually a lot of things that the websites need when I'm fullscreen-ing them.
1. There is mostly a lot of code for the popup that allows you choose between Windowed and fullscreen.
2. Some of them remove the component we want to fullscreen as soon as we resize, in which case I copy the element and try to show it anyway.
3. When clicking inside a frame, it should fullscreen that frame inside the parent window.
4. Need to be able to disable domain by clicking the Windowed toolbar button, and I want the icon to update accordingly on every tab.
5. Even just selecting the right window to restore the tab to after going out of windowed mode again takes more lines then you'd expect.
6. Firefox has some restrictions on requesting fullscreen from async functions, so had to work around that by using sync functions first where necessary.

### Hey I got a request or even got something that might be useful
Nice. Please open an issue or a PR. That'd be really cool. 😎

---

Thanks for reading,  
Michiel Dral
