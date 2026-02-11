// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTENSION_FOCUS_UPDATE") {
        const event = new CustomEvent('ExtensionFocusWarning', {
            detail: { isViolating: request.isViolation }
        });
        window.dispatchEvent(event);
    }
});

// ฟังเสียง Ping ที่เว็บ Reading Time ส่งมาเพื่อเช็คสถานะ
window.addEventListener('GuardianPing', () => {
    try {
        // ส่งข้อความไปถาม background.js ว่าตอนนี้สวิตช์เปิดหรือปิดอยู่
        chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                // ตรวจเจอ Extension แต่เชื่อมต่อ Background ไม่ได้ (อาจจะพัง)
                window.dispatchEvent(new CustomEvent('GuardianPong', {
                    detail: { connected: true, isEnabled: false, error: true }
                }));
            } else {
                // ตอบกลับหน้าเว็บว่า "เชื่อมต่อสำเร็จ" พร้อมส่งสถานะสวิตช์ไปให้
                window.dispatchEvent(new CustomEvent('GuardianPong', {
                    detail: { connected: true, isEnabled: response.isEnabled }
                }));
            }
        });
    } catch (e) {
        // หากเกิด Error แบบรุนแรง แสดงว่าเชื่อมต่อไม่ได้
        window.dispatchEvent(new CustomEvent('GuardianPong', { detail: { connected: false } }));
    }
});