// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTENSION_FOCUS_UPDATE") {
        // เมื่อได้รับสัญญาณจาก Background ให้นำมายิง CustomEvent ใส่หน้าเว็บ
        const event = new CustomEvent('ExtensionFocusWarning', {
            detail: { isViolating: request.isViolation }
        });
        window.dispatchEvent(event);
    }
});