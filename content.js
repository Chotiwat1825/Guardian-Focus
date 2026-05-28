// content.js
const DEFAULT_MAIN_URL = 'comed.edu.npu.ac.th';
let activeTargetEndTime = null;
let activeWarningSeconds = null;
let strictModeTimerInterval = null;
let activeGamepadSettings = null;

const defaultGamepadSettings = {
    vibrateEnable: true,
    intensity: 80,
    triggerStartEnd: true,
    triggerModeToggle: true,
    triggerRestOvertime: true,
    triggerBreakEnding: true,
    triggerFocusEnded: true,
    triggerAchievement: true
};

window.addEventListener('gamepadconnected', (e) => {
    console.log("Extension blocker tab: gamepad connected:", e.gamepad.id);
});

window.addEventListener('gamepaddisconnected', (e) => {
    console.log("Extension blocker tab: gamepad disconnected:", e.gamepad.id);
});

checkAndBlockSelf();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        checkAndBlockSelf();
    }
});

function checkAndBlockSelf() {
    chrome.storage.local.get(['isEnabled', 'allowedSites', 'isStrictMode', 'isBreakMode', 'isTimerRunning', 'isReadingMode', 'targetEndTime', 'warningSeconds', 'gamepadSettings'], (data) => {
        activeTargetEndTime = data.targetEndTime || null;
        activeWarningSeconds = data.warningSeconds !== undefined ? data.warningSeconds : null;
        activeGamepadSettings = data.gamepadSettings ? { ...defaultGamepadSettings, ...data.gamepadSettings } : defaultGamepadSettings;
        
        const isEnabled = data.isEnabled ?? true;
        const isStrictMode = data.isStrictMode || false;
        const isBreakMode = data.isBreakMode || false; // 🌟 โหลดค่าโหมดพักเบรก
        const isTimerRunning = data.isTimerRunning || false;
        const isReadingMode = data.isReadingMode ?? true;
        const allowedSites = data.allowedSites || [DEFAULT_MAIN_URL, 'localhost', '127.0.0.1'];

        const currentDomain = window.location.hostname;

        if (!currentDomain || currentDomain === 'newtab' || window.location.protocol.includes('chrome') || window.location.protocol.includes('edge')) {
            return;
        }

        // 🌟 ปลดล็อกทันทีถ้าปิดสวิตช์ หรือไม่ได้อยู่ในระหว่างการจับเวลา หรืออยู่ในช่วงพักเบรก หรือไม่ได้อยู่ในโหมดโฟกัส
        if (!isEnabled || !isTimerRunning || !isReadingMode || isBreakMode) {
            removeStrictModeBlocker();
            return;
        }

        const isViolation = !allowedSites.includes(currentDomain);

        if (isViolation && isStrictMode) {
            injectStrictModeBlocker();
            updateCountdownDisplay(); // อัปเดตการแสดงผลทันทีที่ข้อมูลเปลี่ยน
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

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== 'reading-time-web-app') return;

    if (message.type === 'GuardianPing') {
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
    } else if (message.type === 'GuardianSetBreakMode') {
        try {
            chrome.runtime.sendMessage({ action: "SET_BREAK_MODE", isBreak: message.isBreak });
        } catch (err) { }
    } else if (message.type === 'GuardianTimerState') {
        try {
            chrome.runtime.sendMessage({
                action: "SET_TIMER_STATE",
                isTimerRunning: message.isTimerRunning,
                isReadingMode: message.isReadingMode,
                targetEndTime: message.targetEndTime || null
            });
        } catch (err) { }
    } else if (message.type === 'GuardianFocusWarningCount') {
        try {
            chrome.runtime.sendMessage({
                action: "SET_WARNING_SECONDS",
                seconds: message.seconds !== undefined ? message.seconds : null
            });
        } catch (err) { }
    } else if (message.type === 'GuardianGamepadSettings') {
        try {
            chrome.runtime.sendMessage({
                action: "SET_GAMEPAD_SETTINGS",
                settings: message.settings
            });
        } catch (err) { }
    }
});

// 🌟 ตรวจสอบและเชื่อมต่อพอร์ตไปยัง background.js หากเป็นหน้าเว็บจับเวลา
if (document.getElementById('mainAppCard')) {
    connectToBackground();
}

function connectToBackground() {
    try {
        const port = chrome.runtime.connect({ name: "reading-time" });
        port.onDisconnect.addListener(() => {
            // ลองเชื่อมต่อใหม่หลังจาก 5 วินาทีหากขาดการติดต่อ
            setTimeout(connectToBackground, 5000);
        });
    } catch (e) {
        // ส่วนขยายอาจถูกรีโหลด
    }
}

// ==========================================
// ฟังก์ชันสำหรับบังหน้าเว็บ (Strict Mode Overlay)
// ==========================================
// ฟังก์ชันสำหรับสั่นจอยเกมในหน้าเว็บบล็อกเกอร์ส่วนขยาย
function triggerExtensionGamepadVibration(duration, intensity) {
    console.log("Extension: triggerExtensionGamepadVibration called:", { duration, intensity, settings: activeGamepadSettings, hidden: document.hidden });
    if (document.hidden) return; // 🌟 ห้ามสั่นหากแท็บนี้เป็นแท็บเบื้องหลัง (Background Tab)
    
    // 🌟 ตรวจสอบว่าเปิดระบบสั่นของจอยเกมอยู่หรือไม่
    const settings = activeGamepadSettings || defaultGamepadSettings;
    if (settings.vibrateEnable === false) {
        console.warn("Extension: vibration disabled by settings");
        return;
    }

    if (!navigator.getGamepads) {
        console.warn("Extension: navigator.getGamepads not supported");
        return;
    }
    try {
        // 🌟 คำนวณความแรงตามเป้าหมายระดับความแรงสั่น (intensity) จากการตั้งค่า
        const factor = (settings.intensity !== undefined) 
            ? settings.intensity / 100 
            : 0.8; // ค่าเริ่มต้น 80% หากยังไม่มีข้อมูล
        const finalIntensity = Math.min(1.0, Math.max(0.0, intensity * factor));
        console.log("Extension: vibration factor calculated:", { factor, finalIntensity });

        const gps = navigator.getGamepads();
        console.log("Extension: gamepads found:", gps);
        let vibrationTriggered = false;
        for (const gp of gps) {
            if (gp) {
                console.log("Extension: checking gamepad:", gp.id, "vibrationActuator:", gp.vibrationActuator);
                if (gp.vibrationActuator) {
                    vibrationTriggered = true;
                    gp.vibrationActuator.playEffect("dual-rumble", {
                        startDelay: 0,
                        duration: duration,
                        strongMagnitude: finalIntensity,
                        weakMagnitude: finalIntensity
                    }).then(() => {
                        console.log("Extension: playEffect success");
                    }).catch((err) => {
                        console.error("Extension: playEffect error:", err);
                    });
                }
            }
        }
        if (!vibrationTriggered) {
            console.warn("Extension: no gamepad with vibrationActuator found/active");
        }
    } catch (e) {
        console.error("Extension: error in playEffect:", e);
    }
}

function updateCountdownDisplay() {
    const warningSecEl = document.getElementById('guardian-warning-seconds');

    if (warningSecEl) {
        const displaySecs = (activeWarningSeconds !== null && activeWarningSeconds !== undefined && activeWarningSeconds >= 0) 
            ? activeWarningSeconds 
            : 0; // 🌟 หากเป็น null/undefined ให้เริ่มต้นเป็น 0 แทนที่จะเป็น 10
        warningSecEl.innerText = displaySecs;
        
        // สั่นจอยสะกิดเตือนทุกวินาทีระหว่างเวลานับถอยหลังของเว็บบล็อกเกอร์
        // 🌟 ต้องแน่ใจว่า activeWarningSeconds ไม่เป็น null/undefined และมีค่าเตือน > 0
        if (activeWarningSeconds !== null && activeWarningSeconds !== undefined && displaySecs > 0 && displaySecs <= 10) {
            triggerExtensionGamepadVibration(250, 0.7);
        }
    }
}

function injectStrictModeBlocker() {
    if (document.getElementById('guardian-strict-blocker')) return;

    // โหลดฟอนต์ Sarabun เพื่อให้การแสดงผลภาษาไทยสวยงามในทุกเว็บไซต์
    if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Sarabun"]')) {
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap';
        document.head.appendChild(fontLink);
    }

    chrome.storage.local.get(['targetEndTime', 'warningSeconds'], (res) => {
        activeTargetEndTime = res.targetEndTime || null;
        activeWarningSeconds = res.warningSeconds !== undefined ? res.warningSeconds : null;

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
            <div style="font-size: 80px; margin-bottom: 20px; animation: pulse 2s infinite; user-select: none;">🛑</div>
            <h1 style="font-size: 36px; font-weight: bold; margin: 0 0 10px 0; color: #ef4444; text-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);">คุณกำลังอยู่ในโหมด "ตั้งใจเรียน"</h1>
            <p style="font-size: 18px; color: #cbd5e1; max-width: 500px; margin-bottom: 25px; line-height: 1.6;">
                หน้าเว็บนี้ไม่อยู่ในรายชื่อที่อนุญาตให้อ่าน<br>กรุณากลับไปโฟกัสเนื้อหาหลักของคุณ!
            </p>
            
            <div id="guardian-warning-box" style="margin-bottom: 30px; padding: 25px 50px; background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 16px; backdrop-filter: blur(10px); display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5); animation: pulse-warning 1.5s infinite;">
                <div style="font-size: 16px; font-weight: bold; color: #ef4444; display: flex; align-items: center; gap: 6px; justify-content: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">⚠️ ตรวจพบเว็บอื่น!</div>
                <div style="font-size: 14px; color: #fca5a5; margin-bottom: 12px;">จะสลับเป็นพักใน</div>
                <div style="font-size: 48px; font-weight: 800; color: #ef4444; font-family: monospace; letter-spacing: 1px; text-shadow: 0 0 15px rgba(239, 68, 68, 0.6);"><span id="guardian-warning-seconds" style="font-weight: 800;">10</span> วินาที</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 10px; font-style: italic;">(กดปุ่มใดๆ บนจอยเกมของคุณเพื่อจำลองเปิดใช้งานมอเตอร์สั่น)</div>
            </div>

            <div style="display: flex; gap: 15px;">
                <button id="guardian-go-back-btn" style="padding: 12px 24px; font-size: 16px; font-weight: bold; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2); outline: none;">
                    ⬅️ ถอยกลับไป
                </button>
                <button id="guardian-close-tab-btn" style="padding: 12px 24px; font-size: 16px; font-weight: bold; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.2); outline: none;">
                    ❌ ปิดแท็บนี้
                </button>
            </div>

            <style>
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @keyframes pulse-warning {
                    0%, 100% { transform: scale(1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5); }
                    50% { transform: scale(1.03); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(239, 68, 68, 0.4); }
                }
                #guardian-go-back-btn:hover {
                    background-color: #2563eb !important;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4), 0 4px 6px -2px rgba(59, 130, 246, 0.2) !important;
                }
                #guardian-go-back-btn:active {
                    transform: translateY(0) scale(0.98);
                }
                #guardian-close-tab-btn:hover {
                    background-color: #dc2626 !important;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.4), 0 4px 6px -2px rgba(239, 68, 68, 0.2) !important;
                }
                #guardian-close-tab-btn:active {
                    transform: translateY(0) scale(0.98);
                }
            </style>
        `;

        document.documentElement.appendChild(blocker);
        document.documentElement.style.overflow = 'hidden';

        document.getElementById('guardian-go-back-btn').addEventListener('click', () => {
            // 🌟 หยุดสั่นจอยทันทีก่อนที่จะนำทางกลับ
            try {
                if (navigator.getGamepads) {
                    const gps = navigator.getGamepads();
                    for (const gp of gps) {
                        if (gp && gp.vibrationActuator && gp.vibrationActuator.reset) {
                            gp.vibrationActuator.reset().catch(() => {});
                        }
                    }
                }
            } catch (e) {}
            window.history.back();
        });
        document.getElementById('guardian-close-tab-btn').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: "CLOSE_CURRENT_TAB" });
        });

        // Start countdown timer loop
        updateCountdownDisplay();
        strictModeTimerInterval = setInterval(updateCountdownDisplay, 1000);
    });
}

function removeStrictModeBlocker() {
    const blocker = document.getElementById('guardian-strict-blocker');
    if (blocker) {
        blocker.remove();
        document.documentElement.style.overflow = '';
    }
    if (strictModeTimerInterval) {
        clearInterval(strictModeTimerInterval);
        strictModeTimerInterval = null;
    }
    // 🌟 หยุดสั่นจอยทันทีเมื่อปลดบล็อก/ปิดหน้าต่างบล็อกเกอร์
    try {
        if (navigator.getGamepads) {
            const gps = navigator.getGamepads();
            for (const gp of gps) {
                if (gp && gp.vibrationActuator && gp.vibrationActuator.reset) {
                    gp.vibrationActuator.reset().catch(() => {});
                }
            }
        }
    } catch (e) {}
}
