"use strict";

import * as api from './api.js';
import { $ } from './utils.js';
import { showModal, showConfirm, showToast } from './modal.js';
import { armConfirmDelete } from './confirmDelete.js';

document.addEventListener('DOMContentLoaded', () => {
    loadSites();
    setupReturnLink();
    $('#addSiteBtn').addEventListener('click', handleAddNewSite);
    $('#checkAllSitesBtn').addEventListener('click', handleCheckAllSites);
    // 匯入 / 匯出（跟 kazi 同格式)
    $('#exportSitesBtn').addEventListener('click', handleExportSites);
    $('#downloadSitesBtn').addEventListener('click', handleDownloadSites);
    $('#importSitesBtn').addEventListener('click', handleImportSites);
    $('#importFileInput').addEventListener('change', handleImportFile);
    // 新增外觀設定表單事件
    loadSiteSettings();
    loadImageAccelSettings();
    $('#siteSettingsForm').addEventListener('submit', handleSiteSettingsSubmit);
    $('#faviconInput').addEventListener('change', handleFaviconPreview);
});

// 匯出成 kazi 相容的純 JSON 陣列(name/url/ssl_verify/enabled)
async function handleExportSites() {
    try {
        const arr = await api.exportSites();
        const text = JSON.stringify(arr, null, 2);
        await navigator.clipboard.writeText(text);
        showToast(`已複製 ${arr.length} 個站台到剪貼簿,可直接貼到 kazi 匯入`, 'success');
    } catch (err) {
        showModal('複製失敗,改用「下載備份檔」吧。', 'warning');
    }
}

async function handleDownloadSites() {
    try {
        const arr = await api.exportSites();
        const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'maccms-sites.json';
        // 手機瀏覽器下載是非同步的:要先掛進 DOM 才觸發得了,且 revoke 要延後,
        // 否則 blob 在下載真正開始前就被釋放 → 抓到 0 byte 空檔
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
        showModal('下載失敗: ' + err.message, 'error');
    }
}

async function applyImport(rawText) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (e) {
        showModal('解析失敗:這不是有效的 JSON。', 'error');
        return;
    }
    try {
        const res = await api.importSites(parsed);
        showToast(`匯入完成:新增 ${res.added} 個,略過 ${res.skipped} 個(重複/本站/無效)`, res.added > 0 ? 'success' : 'info');
        $('#importSitesText').value = '';
        loadSites();
    } catch (err) {
        showModal('匯入失敗: ' + err.message, 'error');
    }
}

function handleImportSites() {
    const text = $('#importSitesText').value.trim();
    if (!text) {
        showModal('請先貼上要匯入的 JSON(從 kazi 匯出或本站下載的備份)。', 'warning');
        return;
    }
    applyImport(text);
}

function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(String(reader.result));
    reader.readAsText(file);
    e.target.value = '';
}

function setupReturnLink() {
    // 為「返回主頁」連結添加點擊事件
    const returnLinks = document.querySelectorAll('.find-sites-link');
    returnLinks.forEach(link => {
        // 只為包含「返回主頁」文字的連結添加事件監聽器
        if (link.textContent.includes('返回主頁')) {
            link.addEventListener('click', (e) => {
                e.preventDefault(); // 阻止預設的導航行為
                // 設置標記，表示從其他頁面返回
                sessionStorage.setItem('fromOtherPage', 'true');
                // 使用 replace 模式導航到主頁，不會在歷史記錄中留下設定頁面
                window.location.replace('/');
            });
        }
    });
}



async function loadSites() {
    try {
        const sites = await api.fetchSites('setup');
        renderSiteList(sites);
    } catch (err) {
        console.error("無法載入站點列表:", err);
        showModal("無法載入站點列表: " + err.message, 'error');
    }
}

function renderSiteList(sites) {
    const siteList = $('#siteList');
    siteList.innerHTML = '';

    if (!sites || sites.length === 0) {
        siteList.innerHTML = '<li>沒有找到任何站點。</li>';
        return;
    }

    sites.forEach(site => {
        const li = document.createElement('li');
        li.className = 'site-item';
        li.dataset.siteId = site.id;

        // 格式化檢查時間
        let checkTimeDisplay = '';
        let checkStatusDisplay = '';
        if (site.last_check) {
            const checkTime = new Date(site.last_check);
            // 轉換UTC時間為本地時區顯示
            checkTimeDisplay = checkTime.toLocaleString('zh-TW', {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            if (site.check_status === 'success') {
                checkStatusDisplay = '<span class="check-success">✓ 正常</span>';
            } else if (site.check_status === 'failed') {
                checkStatusDisplay = '<span class="check-failed">✗ 失敗</span>';
            }
        }

        li.innerHTML = `
            <div class="site-info">
                <input type="text" class="site-name-input" value="${site.name}" placeholder="站點名稱">
                <input type="text" class="site-url-input" value="${site.url}" placeholder="站點URL">
                <input type="text" class="site-note-input" value="${site.note || ''}" placeholder="備註">
            </div>
            <div class="site-status">
                <div class="check-info">
                    <span class="check-result">${checkStatusDisplay}</span>
                    <span class="check-time">${checkTimeDisplay ? `檢查時間: ${checkTimeDisplay}` : '尚未檢查'}</span>
                </div>
            </div>
            <div class="site-controls">
                <label><input type="checkbox" class="site-enabled-toggle" ${site.enabled ? 'checked' : ''}><span>啟用</span></label>
                <label><input type="checkbox" class="site-ssl-toggle" ${site.ssl_verify ? 'checked' : ''}><span>SSL</span></label>
                <button class="btn-check-site" data-site-id="${site.id}">檢查</button>
                <button class="btn-update">更新</button>
                <button class="btn-delete">刪除</button>
                <button class="btn-move-up">↑</button>
                <button class="btn-move-down">↓</button>
            </div>
        `;

        li.querySelector('.btn-update').addEventListener('click', () => handleUpdateSite(site.id, li));
        armConfirmDelete(li.querySelector('.btn-delete'), () => handleDeleteSite(site.id));
        li.querySelector('.btn-move-up').addEventListener('click', () => handleMoveSite(site.id, 'up'));
        li.querySelector('.btn-move-down').addEventListener('click', () => handleMoveSite(site.id, 'down'));
        li.querySelector('.btn-check-site').addEventListener('click', () => handleCheckSingleSite(site.id, li));

        siteList.appendChild(li);
    });
}

async function handleCheckAllSites() {
    const checkBtn = $('#checkAllSitesBtn');
    const statusDiv = $('#checkStatus');
    const includeDisabled = $('#includeDisabledCheckbox').checked;

    try {
        checkBtn.disabled = true;
        checkBtn.textContent = '檢查中...';
        statusDiv.innerHTML = '<span class="checking">正在檢查站點...</span>';

        // 呼叫立即檢查API
        const result = await api.checkSitesNow(includeDisabled);

        if (result.status === 'success') {
            // 顯示檢查結果清單
            displayCheckResults(result.results);
        } else {
            statusDiv.innerHTML = `<span class="check-failed">檢查失敗: ${result.message}</span>`;
        }

        // 重新載入站點列表以顯示最新狀態
        loadSites();

    } catch (err) {
        statusDiv.innerHTML = `<span class="check-failed">檢查失敗: ${err.message}</span>`;
    } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = '檢查所有站點';
    }
}

async function handleCheckSingleSite(siteId, listItem) {
    const checkBtn = listItem.querySelector('.btn-check-site');
    const originalText = checkBtn.textContent;

    try {
        checkBtn.disabled = true;
        checkBtn.textContent = '檢查中...';

        const result = await api.checkSingleSite(siteId);

        if (result.status === 'success') {
            const checkResult = result.result;
            const statusClass = checkResult.status === 'success' ? 'check-success' :
                checkResult.status === 'failed' ? 'check-failed' : 'check-error';
            const statusIcon = checkResult.status === 'success' ? '✓' :
                checkResult.status === 'failed' ? '✗' : '⚠';

            // 顯示檢查結果
            const statusDiv = listItem.querySelector('.check-result');
            statusDiv.innerHTML = `<span class="${statusClass}">${statusIcon} ${checkResult.message}</span>`;

            // 更新檢查時間
            const timeDiv = listItem.querySelector('.check-time');
            const now = new Date().toLocaleString('zh-TW', {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            timeDiv.textContent = `檢查時間: ${now}`;

            // 顯示臨時提示
            showTemporaryMessage(`站點 ${checkResult.name} 檢查完成: ${checkResult.message}`, statusClass);
        } else {
            showTemporaryMessage(`檢查失敗: ${result.message}`, 'check-failed');
        }

        // 重新載入站點列表以顯示最新狀態
        loadSites();

    } catch (err) {
        showTemporaryMessage(`檢查失敗: ${err.message}`, 'check-failed');
    } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = originalText;
    }
}

function showTemporaryMessage(message, className) {
    const statusDiv = $('#checkStatus');
    statusDiv.innerHTML = `<span class="${className}">${message}</span>`;

    // 3秒後清除訊息
    setTimeout(() => {
        statusDiv.innerHTML = '';
    }, 3000);
}

function displayCheckResults(results) {
    const statusDiv = $('#checkStatus');

    if (!results || results.length === 0) {
        statusDiv.innerHTML = '<span class="check-success">沒有站點需要檢查</span>';
        return;
    }

    // 統計結果
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    let resultHtml = `
        <div class="check-results">
            <div class="check-summary">
                <span class="check-success">✓ 成功: ${successCount}</span>
                <span class="check-failed">✗ 失敗: ${failedCount}</span>
                <span class="check-error">⚠ 錯誤: ${errorCount}</span>
            </div>
            <div class="check-details">
    `;

    results.forEach(result => {
        const statusClass = result.status === 'success' ? 'check-success' :
            result.status === 'failed' ? 'check-failed' : 'check-error';
        const statusIcon = result.status === 'success' ? '✓' :
            result.status === 'failed' ? '✗' : '⚠';

        resultHtml += `
            <div class="check-item ${statusClass}">
                <span class="check-icon">${statusIcon}</span>
                <span class="check-name">${result.name}</span>
                <span class="check-message">${result.message}</span>
            </div>
        `;
    });

    resultHtml += `
            </div>
        </div>
    `;

    statusDiv.innerHTML = resultHtml;
}

async function handleAddNewSite() {
    const name = $('#newSiteName').value.trim();
    const url = $('#newSiteUrl').value.trim();
    if (!url) {
        showModal('站點URL不能為空', 'warning');
        return;
    }
    try {
        $('#addSiteBtn').disabled = true;
        await api.postNewSite(name, url);
        $('#newSiteName').value = '';
        $('#newSiteUrl').value = '';
        loadSites();
        showToast('站點新增成功！', 'success');
    } catch (err) {
        showModal(`新增失敗: ${err.message}`, 'error');
    } finally {
        $('#addSiteBtn').disabled = false;
    }
}

async function handleUpdateSite(siteId, listItem) {
    const name = listItem.querySelector('.site-name-input').value.trim();
    const url = listItem.querySelector('.site-url-input').value.trim();
    const note = listItem.querySelector('.site-note-input').value.trim();
    const enabled = listItem.querySelector('.site-enabled-toggle').checked;
    const ssl_verify = listItem.querySelector('.site-ssl-toggle').checked;

    if (!url) {
        showModal('站點URL不能為空', 'warning');
        return;
    }

    try {
        await api.updateSite(siteId, { name, url, note, enabled, ssl_verify });
        showToast('站點更新成功！', 'success');
        loadSites();
    } catch (err) {
        showModal(`更新失敗: ${err.message}`, 'error');
    }
}

async function handleDeleteSite(siteId) {
    // 確認交給按鈕的兩段式(見 renderSiteList 的 armConfirmDelete)
    try {
        await api.deleteSite(siteId);
        showToast('站點已刪除。', 'success');
        loadSites();
    } catch (err) {
        showModal('刪除失敗: ' + err.message, 'error');
    }
}

async function handleMoveSite(siteId, direction) {
    try {
        await api.moveSite(siteId, direction);
        loadSites();
    } catch (err) {
        showModal(`移動失敗: ${err.message}`, 'error');
    }
}

async function loadSiteSettings() {
    try {
        const res = await fetch('/settings');
        const data = await res.json();
        $('#siteTitleInput').value = data.site_title || '';
        // favicon 預覽
        if (data.favicon_ext && data.favicon_version !== undefined) {
            const url = `/favicon?v=${data.favicon_version}`;
            $('#faviconPreview').innerHTML = `<img src="${url}" alt="目前 Favicon" style="width:32px;height:32px;">` +
                `<button id="resetFaviconBtn" type="button" class="btn btn-secondary" style="margin-left:10px;">回復預設值</button>`;
            $('#resetFaviconBtn').onclick = handleResetFavicon;
        }
    } catch (err) {
        console.error('無法載入外觀設定:', err);
    }
}

async function handleResetFavicon() {
    showConfirm('確定要回復預設 Favicon 嗎？', async () => {
        try {
            const res = await fetch('/settings?reset_favicon=1', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                showToast('已回復預設 Favicon！', 'success');
                loadSiteSettings();
            } else {
                showModal(data.message || '操作失敗', 'error');
            }
        } catch (err) {
            showModal('操作失敗: ' + err.message, 'error');
        }
    });
}

function handleFaviconPreview(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        $('#faviconPreview').innerHTML = `<img src="${evt.target.result}" alt="預覽 Favicon" style="width:32px;height:32px;">`;
    };
    reader.readAsDataURL(file);
}

async function handleSiteSettingsSubmit(e) {
    e.preventDefault();
    const form = $('#siteSettingsForm');
    const formData = new FormData(form);
    // 若標題為空，自動設為預設值
    if (!formData.get('site_title') || formData.get('site_title').trim() === '') {
        formData.set('site_title', '資源站點管理器');
    }
    try {
        const res = await fetch('/settings', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast('外觀設定已儲存！', 'success');
            loadSiteSettings();
        } else {
            showModal(data.message || '儲存失敗', 'error');
        }
    } catch (err) {
        showModal('儲存失敗: ' + err.message, 'error');
    }
}



// ---- 图片加速设置 ----
async function loadImageAccelSettings() {
    try {
        const res = await fetch("/api/settings/image_accel");
        const data = await res.json();
        const toggle = document.getElementById("imageAccelToggle");
        if (!toggle) return;
        toggle.checked = data.enabled;
        document.getElementById("imageAccelOptions").style.display = data.enabled ? "" : "none";
        // restore saved node selection
        const savedNode = data.node || "";
        document.querySelectorAll('input[name="accelNode"]').forEach(function(r) { r.checked = r.value === savedNode; });
        // auto-run latency test and show results next to each node
        doLatencyTest();
        // toggle change
        toggle.addEventListener("change", async function() {
            var en = toggle.checked;
            document.getElementById("imageAccelOptions").style.display = en ? "" : "none";
            if (en) doLatencyTest();
        });
        // node radio change - auto save
        document.querySelectorAll('input[name="accelNode"]').forEach(function(r) {
            r.addEventListener("change", async function() {
                if (!r.checked) return;
                // just highlight, no auto-save
            });
        });
        // save button
        document.getElementById("saveAccelBtn").addEventListener("click", async function() {
            var en = document.getElementById("imageAccelToggle").checked;
            var node = "i0";
            document.querySelectorAll('input[name="accelNode"]').forEach(function(r) { if (r.checked) node = r.value; });
            if (!en) node = "i0";
            try {
                await fetch("/api/settings/image_accel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: en, node: node }) });
                showToast("\u4fdd\u5b58\u6210\u529f\uff01", "success");
            } catch (e) { showModal("\u4fdd\u5b58\u5931\u8d25: " + e.message, "error"); }
        });
    } catch (e) { console.error("\u52a0\u8f7d\u56fe\u7247\u52a0\u901f\u8bbe\u7f6e\u5931\u8d25:", e); }
}

function doLatencyTest() {
    var nodes = ["i0","i1","i2","i3"];
    var labels = {};
    document.querySelectorAll('input[name="accelNode"]').forEach(function(r) {
        var parent = r.parentNode;
        // remove old latency span if exists
        var old = parent.querySelector(".latency-span");
        if (old) old.remove();
        var span = document.createElement("span");
        span.className = "latency-span";
        span.style.cssText = "margin-left:6px;font-size:12px;color:var(--text-muted-color);";
        span.textContent = "\u6d4b\u901f\u4e2d...";
        parent.appendChild(span);
        labels[r.value] = span;
    });
    nodes.forEach(function(node) {
        browserPing(node).then(function(lat) {
            var span = labels[node];
            if (!span) return;
            if (lat !== null) {
                span.textContent = Math.round(lat) + "ms";
                span.style.color = "var(--success-hover, #4caf50)";
            } else {
                span.textContent = "\u5931\u8d25";
                span.style.color = "var(--danger-hover)";
            }
        });
    });
}
// ---- 首页显示设置 ----
async function loadPageSizeSettings() {
    try {
        var res = await fetch("/api/settings/page_size");
        var data = await res.json();
        document.getElementById("pageSizeInput").value = data.page_size || 24;
    } catch (e) { console.error(e); }
}

// wire up save button (called from init)
document.addEventListener("DOMContentLoaded", function() {
    // load page size after a delay
    setTimeout(loadPageSizeSettings, 200);
    
    var saveBtn = document.getElementById("savePageSizeBtn");
    if (saveBtn) {
        saveBtn.addEventListener("click", async function() {
            var val = parseInt(document.getElementById("pageSizeInput").value, 10) || 24;
            if (val < 6) val = 6;
            if (val > 96) val = 96;
            try {
                var res = await fetch("/api/settings/page_size", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ page_size: val })
                });
                var d = await res.json();
                if (d.status === "success") {
                    showToast("保存成功！刷新首页生效", "success");
                } else {
                    showModal(d.message || "保存失败", "error");
                }
            } catch (e) { showModal("保存失败: " + e.message, "error"); }
        });
    }
});

function browserPing(node) {
    return new Promise(function(resolve) {
        var url = "https://" + node + ".wp.com/favicon.ico?_=" + Date.now();
        var start = performance.now(); var img = new Image(); var resolved = false;
        img.onload = img.onerror = function() { if (!resolved) { resolved = true; resolve(performance.now() - start); } };
        setTimeout(function() { if (!resolved) { resolved = true; resolve(null); } }, 8000);
        img.src = url;
    });
}
