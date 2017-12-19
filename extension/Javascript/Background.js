// Get a window to put our tab on: either the last focussed, a random, or none;
// In case of none being found, null is returned and the caller should make a new window himself (with the tab attached)
const get_fallback_window = async (windowId) => {
	const first_fallback_window = await browser.windows.getLastFocused({
		windowTypes: ['normal'],
	});

	if (first_fallback_window.id !== windowId) {
		return first_fallback_window;
	} else {
		const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
		const right_window = windows
			.filter(x => x.id !== windowId)
			.sort((a, b) => a.tabs.length - b.tabs.length)[0]

		if (right_window) {
			return right_window;
		} else {
			return null;
		}
	}
}

chrome.runtime.onMessage.addListener(async (request, sender) => {
	/*
		Detatch the current tab and put it into a standalone popup window
	*/
	if (request.type === 'please_make_me_a_popup') {
		const created_window = await browser.windows.create({
			tabId: sender.tab.id,
			type: 'popup',
		});
	}

	/*
		Take the current tab, and put it into a tab-ed window again.
		1. Last focussed window
		2. Other tab-containing window (not popups without tab bar)
		3. New window we create
	*/
	if (request.type === 'please_make_me_a_tab_again') {
		const fallback_window = await get_fallback_window(sender.tab.windowId);

		if (fallback_window) {
			await browser.tabs.move(sender.tab.id, {
				windowId: fallback_window.id,
				index: -1,
			});
			await browser.tabs.update(sender.tab.id, { active: true });
		} else {
			// No other window open: create a new window with tabs
			const create_window_with_tabs = await browser.windows.create({
				tabId: sender.tab.id,
				type: 'normal',
			});
		}
	}
});

// TODO Chance CSP headers on firefox to allow script injection?
// browser.webRequest.onBeforeRequest.addListener(request => {
// 	console.log('HEY~', request);
// 	var headers = details.responseHeaders;
// 	return {
// 		responseHeaders: headers.map(header => {
// 			const name = header.name.toLowerCase();
// 			console.log(`header:`, header)
// 			if (name !== "content-security-policy" && name !== "x-webkit-csp") {
// 				return header;
// 			} else {
// 				return header;
// 			}
// 		}),
// 	};
// }, { urls: ["<all_urls>"], types: ['main_frame', 'sub_frame'] }, ['blocking', 'responseHeaders']);
