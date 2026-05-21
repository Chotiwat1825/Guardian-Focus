// background.js
let webAppTabIds = new Set();

// 🌟 อัปเดตและแจ้งเตือนสถานะเมื่อสลับแท็บหรือเปลี่ยน URL
function checkActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const activeTab = tabs[0];
        if (!activeTab.url) return;

        chrome.storage.local.get(['isEnabled', 'allowedSites', 'isStrictMode', 'isBreakMode', 'isTimerRunning', 'isReadingMode'], (data) => {
            const isEnabled = data.isEnabled ?? true;
            const isStrictMode = data.isStrictMode || false;
            const isBreakMode = data.isBreakMode || false;
            const isTimerRunning = data.isTimerRunning || false;
            const isReadingMode = data.isReadingMode ?? true;
            const allowedSites = data.allowedSites || ['comed.edu.npu.ac.th', 'localhost', '127.0.0.1'];

            // ตรวจสอบว่าโดเมนปัจจุบันเป็นโดเมนที่ไม่อนุญาตหรือไม่
            let isViolation = false;
            try {
                const url = new URL(activeTab.url);
                const currentDomain = url.hostname;

                if (currentDomain && currentDomain !== 'newtab' && url.protocol !== 'chrome:' && url.protocol !== 'edge:') {
                    isViolation = !allowedSites.includes(currentDomain);
                }
            } catch (e) {
                // ข้าม URL ที่ไม่ถูกต้อง
            }

            // ระบบป้องกันต้องทำงานและจับเวลาอยู่ และไม่ได้อยู่ในโหมดพักเบรก
            const shouldEnforce = isEnabled && isTimerRunning && isReadingMode && !isBreakMode;
            const actualViolation = shouldEnforce && isViolation;

            // ส่งข้อมูลแจ้งเตือนไปยังแท็บเว็บจับเวลาทั้งหมดที่เปิดอยู่
            webAppTabIds.forEach(tabId => {
                chrome.tabs.sendMessage(tabId, {
                    action: "EXTENSION_FOCUS_UPDATE",
                    isViolation: actualViolation
                }, () => {
                    if (chrome.runtime.lastError) {
                        // แท็บอาจจะปิดไปแล้ว สามารถละเว้น Error ได้
                    }
                });
            });
        });
    });
}

// ตรวจจับการเชื่อมต่อ Port จาก content.js (แท็บเว็บจับเวลา)
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "reading-time" && port.sender && port.sender.tab) {
        const tabId = port.sender.tab.id;
        webAppTabIds.add(tabId);

        port.onDisconnect.addListener(() => {
            webAppTabIds.delete(tabId);
            if (webAppTabIds.size === 0) {
                // หากแท็บเว็บจับเวลาถูกปิดทั้งหมด ให้รีเซ็ตสถานะทันที ป้องกันการบล็อกค้าง
                chrome.storage.local.set({
                    isTimerRunning: false,
                    isReadingMode: false,
                    isBreakMode: false
                });
            }
        });
    }
});

// ฟังข้อความจาก content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_STATUS") {
        chrome.storage.local.get(['isEnabled'], (data) => {
            sendResponse({ isEnabled: data.isEnabled ?? true });
        });
        return true; // ยอมรับการทำงานแบบ Async
    }

    if (request.action === "SET_BREAK_MODE") {
        chrome.storage.local.set({ isBreakMode: request.isBreak }, () => {
            checkActiveTab();
        });
        sendResponse({ success: true });
    }

    if (request.action === "SET_TIMER_STATE") {
        const { isTimerRunning, isReadingMode } = request;
        const isBreakMode = isTimerRunning ? !isReadingMode : false;

        chrome.storage.local.set({
            isTimerRunning,
            isReadingMode,
            isBreakMode
        }, () => {
            checkActiveTab();
        });
        
        if (sender.tab) {
            webAppTabIds.add(sender.tab.id);
        }
        sendResponse({ success: true });
    }
});

// เมื่อผู้ใช้สลับแท็บ
chrome.tabs.onActivated.addListener(() => {
    checkActiveTab();
});

// เมื่อโหลดหน้าเว็บเสร็จ
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        checkActiveTab();
    }
});
