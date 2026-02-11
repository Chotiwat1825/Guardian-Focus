// background.js

const DEFAULT_MAIN_URL = 'comed.edu.npu.ac.th';

// ตรวจสอบ Tab ทุกครั้งที่มีการขยับ/สลับหน้าต่าง
chrome.tabs.onActivated.addListener(checkCurrentTab);
chrome.windows.onFocusChanged.addListener(checkCurrentTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) checkCurrentTab();
});

async function checkCurrentTab() {
    const data = await chrome.storage.local.get(['isEnabled', 'allowedSites']);
    if (!data.isEnabled) {
        notifyReadingTimeApp(false);
        return;
    }

    const allowedSites = data.allowedSites || [DEFAULT_MAIN_URL, 'localhost', '127.0.0.1'];

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) return;

        const activeUrl = new URL(tabs[0].url);
        const domain = activeUrl.hostname;

        // ★ เพิ่ม 'newtab' และเบราว์เซอร์อื่น เข้าไปในเงื่อนไขการละเว้นการตรวจสอบ ★
        if (activeUrl.protocol === 'chrome:' ||
            activeUrl.protocol === 'chrome-extension:' ||
            activeUrl.protocol === 'about:' ||
            activeUrl.protocol === 'edge:' ||
            domain === 'newtab' ||
            !domain) {
            return;
        }

        // ถ้าเว็บปัจจุบ้น ไม่อยู่ในรายชื่อที่อนุญาต = ทำผิดกฎ (isViolation = true)
        const isViolation = !allowedSites.includes(domain);
        notifyReadingTimeApp(isViolation);

    } catch (e) {
        // เงียบไว้กรณีเข้าเว็บแปลกๆ หรือแท็บเปล่าที่อ่านค่าไม่ได้
    }
}

async function notifyReadingTimeApp(isViolation) {
    // ส่งข้อความไปหา Tab ที่กำลังเปิดเว็บ Reading Time
    const readingTimeTabs = await chrome.tabs.query({ url: "*://comed.edu.npu.ac.th/*" });
    const localhostTabs = await chrome.tabs.query({ url: "*://localhost/*" });
    const localIpTabs = await chrome.tabs.query({ url: "*://127.0.0.1/*" });

    // รวม Tab ทั้ง 3 แหล่งเข้าด้วยกัน
    const allReadingTabs = [...readingTimeTabs, ...localhostTabs, ...localIpTabs];

    for (const tab of allReadingTabs) {
        chrome.tabs.sendMessage(tab.id, {
            action: "EXTENSION_FOCUS_UPDATE",
            isViolation: isViolation
        }).catch(() => { });
    }
}