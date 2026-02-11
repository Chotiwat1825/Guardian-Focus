document.addEventListener('DOMContentLoaded', () => {
    const masterToggle = document.getElementById('masterToggle');
    const currentDomainLabel = document.getElementById('currentDomainLabel');
    const siteStatusBox = document.getElementById('siteStatusBox');
    const siteStatusText = document.getElementById('siteStatusText');
    const toggleAllowBtn = document.getElementById('toggleAllowBtn');
    const siteList = document.getElementById('siteList');
    const countBadge = document.getElementById('countBadge');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');

    // ★ ค่าพื้นฐานของเว็บที่บังคับอนุญาตเสมอ
    const DEFAULT_SITE = 'comed.edu.npu.ac.th';
    const LOCAL_SITE = 'localhost';
    const LOCAL_IP_SITE = '127.0.0.1';

    let currentDomain = '';

    // โหลดข้อมูล
    chrome.storage.local.get(['isEnabled', 'allowedSites'], (data) => {
        const isEnabled = data.isEnabled ?? true;
        masterToggle.checked = isEnabled;
        updateMasterUI(isEnabled);

        let allowedSites = data.allowedSites || [DEFAULT_SITE, LOCAL_SITE, LOCAL_IP_SITE];
        renderSiteList(allowedSites);

        // ดึงเว็บปัจจุบัน
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].url) {
                try {
                    const url = new URL(tabs[0].url);
                    currentDomain = url.hostname;

                    // ★ ดักจับแท็บเปล่า (newtab) เพื่อแสดง UI สีเทาและซ่อนปุ่มบล็อก ★
                    if (currentDomain === 'newtab' || url.protocol === 'chrome:' || url.protocol === 'edge:') {
                        currentDomainLabel.textContent = "แท็บเปล่า (New Tab)";
                        toggleAllowBtn.style.display = 'none';
                        siteStatusText.textContent = "ละเว้นการตรวจสอบ 🟢";
                        siteStatusBox.style.background = '#F3F4F6'; // สีเทาอ่อน
                        siteStatusBox.style.borderColor = '#D1D5DB';
                        siteStatusBox.style.color = '#6B7280';
                    } else {
                        currentDomainLabel.textContent = currentDomain;
                        checkCurrentSiteStatus(currentDomain, allowedSites);
                    }
                } catch (e) {
                    currentDomainLabel.textContent = "หน้าของระบบ / Chrome";
                    toggleAllowBtn.style.display = 'none';
                    siteStatusText.textContent = "ไม่สามารถบล็อกได้";
                }
            }
        });
    });

    function updateMasterUI(isOn) {
        statusText.textContent = isOn ? 'ระบบป้องกันเปิดอยู่' : 'ระบบป้องกันปิดอยู่';
        statusText.style.color = isOn ? 'var(--success)' : 'var(--text-sub)';
        statusDot.style.backgroundColor = isOn ? 'var(--success)' : 'var(--text-sub)';
    }

    // สลับสีและข้อความตามสถานะการบล็อก
    function checkCurrentSiteStatus(domain, allowedSites) {
        if (allowedSites.includes(domain)) {
            siteStatusBox.style.background = '#DEF7EC';
            siteStatusBox.style.borderColor = '#31C48D';
            siteStatusBox.style.color = '#03543F';
            siteStatusText.textContent = "เว็บนี้ปลอดภัย (Allowed) ✅";
            siteStatusText.style.color = '#03543F';

            toggleAllowBtn.textContent = "บล็อกเว็บนี้";
            toggleAllowBtn.style.color = "var(--danger)";
            toggleAllowBtn.style.border = "1px solid var(--danger)";
        } else {
            siteStatusBox.style.background = '#FDE8E8';
            siteStatusBox.style.borderColor = '#F98080';
            siteStatusBox.style.color = '#9B1C1C';
            siteStatusText.textContent = "เว็บนี้ถูกบล็อก ❌";
            siteStatusText.style.color = '#9B1C1C';

            toggleAllowBtn.textContent = "+ อนุญาตเว็บนี้";
            toggleAllowBtn.style.color = "var(--success)";
            toggleAllowBtn.style.border = "1px solid var(--success)";
        }
    }

    masterToggle.addEventListener('change', () => {
        const isOn = masterToggle.checked;
        chrome.storage.local.set({ isEnabled: isOn });
        updateMasterUI(isOn);
    });

    // ปุ่มสำหรับ อนุญาต/บล็อก เว็บปัจจุบัน
    toggleAllowBtn.addEventListener('click', () => {
        if (currentDomain === DEFAULT_SITE || currentDomain === LOCAL_SITE || currentDomain === LOCAL_IP_SITE) {
            alert('ไม่สามารถบล็อกเว็บไซต์หลักของระบบได้ครับ');
            return;
        }

        chrome.storage.local.get(['allowedSites'], (data) => {
            let allowedSites = data.allowedSites || [DEFAULT_SITE, LOCAL_SITE, LOCAL_IP_SITE];

            if (allowedSites.includes(currentDomain)) {
                // ถ้ามีอยู่แล้ว ให้ลบออก
                allowedSites = allowedSites.filter(d => d !== currentDomain);
            } else {
                // ถ้าไม่มี ให้เพิ่มเข้าไป
                allowedSites.push(currentDomain);
            }

            chrome.storage.local.set({ allowedSites: allowedSites });
            checkCurrentSiteStatus(currentDomain, allowedSites);
            renderSiteList(allowedSites);
        });
    });

    // ล้างค่าที่จำไว้ทั้งหมด
    document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('ต้องการล้างรายการทั้งหมด ยกเว้นเว็บไซต์หลักใช่หรือไม่?')) {
            const defaults = [DEFAULT_SITE, LOCAL_SITE, LOCAL_IP_SITE];
            chrome.storage.local.set({ allowedSites: defaults });
            renderSiteList(defaults);

            // อัปเดตสถานะถ้าไม่ได้อยู่หน้าแท็บเปล่า
            if (currentDomain !== 'newtab' && !currentDomain.includes('chrome')) {
                checkCurrentSiteStatus(currentDomain, defaults);
            }
        }
    });

    // แสดงรายการเว็บ และผูกฟังก์ชันการ "กดลบ"
    function renderSiteList(sites) {
        siteList.innerHTML = '';
        countBadge.textContent = `${sites.length} เว็บ`;

        if (sites.length === 0) {
            siteList.innerHTML = '<div class="empty-state">ยังไม่มีเว็บไซต์ที่อนุญาต</div>';
            return;
        }

        sites.forEach(domain => {
            const div = document.createElement('div');
            div.className = 'list-item';

            let displayName = domain;
            if (domain === DEFAULT_SITE || domain === LOCAL_SITE || domain === LOCAL_IP_SITE) {
                displayName = domain + ' (เว็บหลัก)';
            }

            div.innerHTML = `
                <div class="flex-center gap-2" style="overflow: hidden;">
                    <span>🌐</span>
                    <span class="domain-text" style="font-size:13px; font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                        ${displayName}
                    </span>
                </div>
                <button class="delete-btn" title="ลบเว็บนี้">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                </button>
            `;

            // เพิ่ม Event กดลบ
            div.querySelector('.delete-btn').addEventListener('click', () => {
                if (domain === DEFAULT_SITE || domain === LOCAL_SITE || domain === LOCAL_IP_SITE) {
                    alert('ไม่สามารถลบเว็บไซต์หลักของระบบได้ครับ');
                    return;
                }
                const newSites = sites.filter(s => s !== domain);
                chrome.storage.local.set({ allowedSites: newSites });
                renderSiteList(newSites);

                if (currentDomain !== 'newtab' && !currentDomain.includes('chrome')) {
                    checkCurrentSiteStatus(currentDomain, newSites);
                }
            });

            siteList.appendChild(div);
        });
    }
});