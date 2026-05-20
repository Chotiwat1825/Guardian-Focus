// content.js
const DEFAULT_MAIN_URL = 'comed.edu.npu.ac.th';

checkAndBlockSelf();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        checkAndBlockSelf();
    }
});

function checkAndBlockSelf() {
    chrome.storage.local.get(['isEnabled', 'allowedSites', 'isStrictMode', 'isBreakMode'], (data) => {
        const isEnabled = data.isEnabled ?? true;
        const isStrictMode = data.isStrictMode || false;
        const isBreakMode = data.isBreakMode || false; // 🌟 โหลดค่าโหมดพักเบรก
        const allowedSites = data.allowedSites || [DEFAULT_MAIN_URL, 'localhost', '127.0.0.1'];

        const currentDomain = window.location.hostname;

        if (!currentDomain || currentDomain === 'newtab' || window.location.protocol.includes('chrome') || window.location.protocol.includes('edge')) {
            return;
        }

        // 🌟 ปลดล็อกทันทีถ้าอยู่ในโหมด "พักเบรก" หรือปิดสวิตช์
        if (!isEnabled || isBreakMode) {
            removeStrictModeBlocker();
            return;
        }

        const isViolation = !allowedSites.includes(currentDomain);

        if (isViolation && isStrictMode) {
            injectStrictModeBlocker();
        } else {
            removeStrictModeBlocker();
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTENSION_FOCUS_UPDATE") {
        const event = new CustomEvent('ExtensionFocusWarning', {
            detail: { isViolating: request.isViolation }
        });
        window.dispatchEvent(event);
    }

    if (request.action === "STRICT_MODE_COMMAND") {
        if (request.isViolation && request.isStrictMode) {
            chrome.storage.local.get(['isBreakMode'], (data) => {
                // เช็คซ้ำอีกรอบว่าไม่ได้อยู่ในช่วงพักเบรก
                if (!data.isBreakMode) injectStrictModeBlocker();
            });
        } else {
            removeStrictModeBlocker();
        }
    }
});

window.addEventListener('GuardianPing', () => {
    try {
        chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                window.dispatchEvent(new CustomEvent('GuardianPong', {
                    detail: { connected: true, isEnabled: false, error: true }
                }));
            } else {
                window.dispatchEvent(new CustomEvent('GuardianPong', {
                    detail: { connected: true, isEnabled: response.isEnabled }
                }));
            }
        });
    } catch (e) {
        window.dispatchEvent(new CustomEvent('GuardianPong', { detail: { connected: false } }));
    }
});

// 🌟 ฟังคำสั่งจากเว็บ Reading Time เมื่อมีการกด "พักเบรก" หรือ "กลับมาอ่านหนังสือ"
window.addEventListener('GuardianSetBreakMode', (e) => {
    try {
        const isBreak = e.detail.isBreak;
        chrome.runtime.sendMessage({ action: "SET_BREAK_MODE", isBreak: isBreak });
    } catch (err) { }
});

// ==========================================
// ฟังก์ชันสำหรับบังหน้าเว็บ (Strict Mode Overlay)
// ==========================================
function injectStrictModeBlocker() {
    if (document.getElementById('guardian-strict-blocker')) return;

    const blocker = document.createElement('div');
    blocker.id = 'guardian-strict-blocker';

    Object.assign(blocker.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.98)',
        backdropFilter: 'blur(15px)',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: '"Sarabun", sans-serif',
        textAlign: 'center'
    });

    blocker.innerHTML = `
        <div style="font-size: 80px; margin-bottom: 20px;">🛑</div>
        <h1 style="font-size: 36px; font-weight: bold; margin: 0 0 10px 0; color: #ef4444;">คุณกำลังอยู่ในโหมด "ตั้งใจเรียน"</h1>
        <p style="font-size: 18px; color: #cbd5e1; max-width: 500px; margin-bottom: 30px;">
            หน้าเว็บนี้ไม่อยู่ในรายชื่อที่อนุญาตให้อ่าน<br>กรุณากลับไปโฟกัสเนื้อหาหลักของคุณ!
        </p>
        <div style="display: flex; gap: 15px;">
            <button id="guardian-go-back-btn" style="padding: 12px 24px; font-size: 16px; font-weight: bold; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; transition: 0.3s;">
                ⬅️ ถอยกลับไป
            </button>
            <button id="guardian-close-tab-btn" style="padding: 12px 24px; font-size: 16px; font-weight: bold; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; transition: 0.3s;">
                ❌ ปิดแท็บนี้
            </button>
        </div>
    `;

    document.documentElement.appendChild(blocker);
    document.documentElement.style.overflow = 'hidden';

    document.getElementById('guardian-go-back-btn').addEventListener('click', () => window.history.back());
    document.getElementById('guardian-close-tab-btn').addEventListener('click', () => window.close());
}

function removeStrictModeBlocker() {
    const blocker = document.getElementById('guardian-strict-blocker');
    if (blocker) {
        blocker.remove();
        document.documentElement.style.overflow = '';
    }
}
