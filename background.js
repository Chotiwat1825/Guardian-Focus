const DEFAULT_MAIN_URL = 'comed.edu.npu.ac.th';

chrome.tabs.onActivated.addListener(checkCurrentTab);
chrome.windows.onFocusChanged.addListener(checkCurrentTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) checkCurrentTab();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') checkCurrentTab();
});

async function checkCurrentTab() {
    const data = await chrome.storage.local.get(['isEnabled', 'allowedSites', 'isStrictMode', 'isBreakMode']);

    // 🌟 ถ้าปิดระบบ หรือ อยู่ในโหมดพักเบรก จะไม่ส่งคำสั่งบล็อก
    if (!data.isEnabled || data.isBreakMode) {
        notifyReadingTimeApp(false);
        return;
    }

    const allowedSites = data.allowedSites || [DEFAULT_MAIN_URL, 'localhost', '127.0.0.1'];
    const isStrictMode = data.isStrictMode || false;

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) return;

        const currentTab = tabs[0];
        if (!currentTab.url) return;

        const activeUrl = new URL(currentTab.url);
        const domain = activeUrl.hostname;

        if (activeUrl.protocol === 'chrome:' ||
            activeUrl.protocol === 'chrome-extension:' ||
            activeUrl.protocol === 'about:' ||
            activeUrl.protocol === 'edge:' ||
            domain === 'newtab' ||
            !domain) {
            return;
        }

        const isViolation = !allowedSites.includes(domain);

        notifyReadingTimeApp(isViolation);
        sendBlockerCommand(currentTab.id, isViolation, isStrictMode);

    } catch (e) { }
}

async function notifyReadingTimeApp(isViolation) {
    const readingTimeTabs = await chrome.tabs.query({ url: "*://comed.edu.npu.ac.th/*" });
    const localhostTabs = await chrome.tabs.query({ url: "*://localhost/*" });
    const localIpTabs = await chrome.tabs.query({ url: "*://127.0.0.1/*" });

    const allReadingTabs = [...readingTimeTabs, ...localhostTabs, ...localIpTabs];

    for (const tab of allReadingTabs) {
        chrome.tabs.sendMessage(tab.id, {
            action: "EXTENSION_FOCUS_UPDATE",
            isViolation: isViolation
        }).catch(() => { });
    }
}

function sendBlockerCommand(tabId, isViolation, isStrictMode) {
    chrome.tabs.sendMessage(tabId, {
        action: "STRICT_MODE_COMMAND",
        isViolation: isViolation,
        isStrictMode: isStrictMode
    }).catch(() => { });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_STATUS") {
        chrome.storage.local.get(['isEnabled'], (data) => {
            sendResponse({ isEnabled: data.isEnabled ?? true });
        });
        return true;
    }

    // 🌟 รับสถานะการพักเบรกจาก content.js (ที่รับต่อมาจากหน้าเว็บอีกที)
    if (request.action === "SET_BREAK_MODE") {
        chrome.storage.local.set({ isBreakMode: request.isBreak });
        return true;
    }
});