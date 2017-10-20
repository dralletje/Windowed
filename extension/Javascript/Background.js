// console.log('hey');
// chrome.browserAction.onClicked.addListener( function(tab) {
//
// 	chrome.windows.create({ tabId: 	tab.id,
// 							type: 	"popup" });
//
// });
//
// chrome.runtime.sendMessage({greeting: "hello"}, function(response) {
//   console.log(response.farewell);
// });

const get_fallback_window = async (windowId) => {
	const first_fallback_window = await browser.windows.getLastFocused({
		windowTypes: ['normal'],
	});

	console.log('window, windowId:', first_fallback_window, windowId)

	if (first_fallback_window.id !== windowId) {
		return first_fallback_window;
	} else {
		const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
		const right_window = windows
			.filter(x => x.id !== windowId)
			.sort((a, b) => a.tabs.length - b.tabs.length)[0]

		console.log('right_window:', right_window)

		if (right_window) {
			return right_window;
		} else {
			return first_fallback_window;
		}
	}
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
	if (request.type === 'please_make_me_a_popup') {
		const created_window = await browser.windows.create({
			tabId: sender.tab.id,
			type: 'popup',
		});

		// created_window.onBoundsChanged.addListener(() => {
		// 	console.log('HEY');
		// 	if(created_window.isMaximized()) {
		// 		console.log('Heyyyy');
		// 	}
		// });
	}

	if (request.type === 'please_make_me_a_tab_again') {
		const fallback_window = await get_fallback_window(sender.tab.windowId);
		await browser.tabs.move(sender.tab.id, {
			windowId: fallback_window.id,
			index: -1,
		});
		await browser.tabs.update(sender.tab.id, { active: true });
	}
});
