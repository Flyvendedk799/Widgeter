const { ipcRenderer } = require('electron');
const { splitEven } = require('./engine/resize-math');

const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        tabPanes.forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
        if (targetId === 'tab-marketplace') loadMarketplaceWidgets();
        if (targetId === 'tab-layouts') loadLayoutsTab();
    });
});

const widgetListEl = document.getElementById('widget-list');
const dropZone = document.getElementById('drop-zone');
const settingBootCheckbox = document.getElementById('setting-boot');
const displayTimers = new Map();

let widgetsData = [];
let marketplaceCache = [];
let marketplaceLoaded = false;

function toast(message) {
    const wrap = document.getElementById('toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3400);
}

function badgeInfo(widget) {
    if (widget.clickThrough) return { cls: 'ghost', text: 'Click-through' };
    if (widget.autoResize) return { cls: 'smart', text: 'Smart resize' };
    return { cls: 'fixed', text: 'Fixed size' };
}

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const { webUtils } = require('electron');
    for (const f of e.dataTransfer.files) {
        if (f.name.endsWith('.widget') || f.name.endsWith('.json')) {
            const pathValue = webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(f) : f.path;
            ipcRenderer.send('install-widget', pathValue);
        }
    }
});

dropZone.addEventListener('click', () => {
    ipcRenderer.send('pick-widget-file');
});

settingBootCheckbox.addEventListener('change', (e) => {
    ipcRenderer.send('set-launch-on-boot', e.target.checked);
});

document.getElementById('btn-restart-app').addEventListener('click', () => {
    ipcRenderer.send('restart-app');
});

document.getElementById('btn-open-folder').addEventListener('click', () => {
    ipcRenderer.send('open-widgets-folder');
});

function renderWidgets() {
    const openPanels = new Set(
        [...document.querySelectorAll('.panel.active')].map((el) => el.id)
    );
    widgetListEl.innerHTML = '';

    if (widgetsData.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; color: #a6adc8; padding: 20px;';
        empty.textContent = 'No widgets installed yet. Drop a .widget file above, or click to browse.';
        widgetListEl.appendChild(empty);
        return;
    }

    widgetsData.forEach(widget => {
        const card = document.createElement('div');
        card.className = 'widget-card';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.gap = '12px';

        const cardHeader = document.createElement('div');
        cardHeader.style.display = 'flex';
        cardHeader.style.justifyContent = 'space-between';
        cardHeader.style.alignItems = 'center';
        cardHeader.style.gap = '12px';

        const info = document.createElement('div');
        info.className = 'widget-info';
        const title = document.createElement('h3');
        title.textContent = widget.name;
        const file = document.createElement('p');
        file.textContent = widget.id;
        const badge = document.createElement('span');
        const look = badgeInfo(widget);
        badge.id = 'mode-badge-' + widget.id;
        badge.className = 'mode-badge ' + look.cls;
        badge.textContent = look.text;
        info.append(title, file, badge);

        const actions = document.createElement('div');
        actions.className = 'widget-actions';

        const stickyLabel = document.createElement('label');
        stickyLabel.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;color:#a6adc8;';
        const stickyInput = document.createElement('input');
        stickyInput.type = 'checkbox';
        stickyInput.checked = !!widget.sticky;
        stickyInput.addEventListener('change', (e) => ipcRenderer.send('set-widget-sticky', widget.id, e.target.checked));
        stickyLabel.append(stickyInput, document.createTextNode('Sticky'));

        const setupBtn = document.createElement('button');
        setupBtn.className = 'btn';
        setupBtn.style.backgroundColor = '#cba6f7';
        setupBtn.textContent = 'Setup';
        setupBtn.addEventListener('click', () => {
            document.getElementById('setup-' + widget.id).classList.toggle('active');
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'btn';
        editBtn.style.backgroundColor = '#f9e2af';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => openWidgetInCreator(widget.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            if (confirm('Delete ' + widget.name + '?')) ipcRenderer.send('delete-widget', widget.id);
        });

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-switch';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = widget.enabled !== false;
        toggleInput.addEventListener('change', (e) => ipcRenderer.send('toggle-widget', widget.id, e.target.checked));
        const slider = document.createElement('span');
        slider.className = 'slider';
        toggleLabel.append(toggleInput, slider);

        actions.append(stickyLabel, setupBtn, editBtn, deleteBtn, toggleLabel);
        cardHeader.append(info, actions);
        card.appendChild(cardHeader);

        const setupPanel = document.createElement('div');
        setupPanel.id = 'setup-' + widget.id;
        setupPanel.className = 'panel' + (openPanels.has(setupPanel.id) ? ' active' : '');
        setupPanel.innerHTML = buildSetupPanel(widget);
        card.appendChild(setupPanel);
        widgetListEl.appendChild(card);
        bindDisplayPanel(widget.id, setupPanel);

        if (widget.setupJs) {
            setTimeout(() => {
                try {
                    new Function('widget', 'ipcRenderer', widget.setupJs)(widget, ipcRenderer);
                } catch (e) {
                    console.error('Error in setupJs for widget ' + widget.id, e);
                }
            }, 0);
        }
    });
}

function rangeBound(value, min, max) {
    const v = Number(value);
    const safe = Number.isFinite(v) ? v : min;
    return { min: Math.min(min, safe), max: Math.max(max, safe), value: safe };
}

function buildSetupPanel(widget) {
    const autoResize = !!widget.autoResize;
    const limits = {
        minWidth: rangeBound(widget.minWidth, 80, 800),
        maxWidth: rangeBound(widget.maxWidth, 200, 2000),
        minHeight: rangeBound(widget.minHeight, 50, 800),
        maxHeight: rangeBound(widget.maxHeight, 80, 2000)
    };
    const opacity = Math.round((widget.opacity != null ? widget.opacity : 1) * 100);
    let html = '';

    if (widget.setupHtml) {
        html += '<div class="setup-section">' + widget.setupHtml + '</div>';
        html += '<hr style="border: none; border-top: 1px solid #313244; margin: 20px 0;">';
    }

    html += `
        <div class="setup-section">
            <h4 style="margin-top:0; color:#89b4fa; font-size: 15px;">Display</h4>
            <p class="display-setting-hint" style="margin-top:0;">Changes apply immediately. Smart resize fits the height to the content and keeps the width unless the content overflows. Drag the corner of the widget to resize it.</p>
            <div class="display-setting-row">
                <div class="display-setting-label">
                    <span>Resize mode</span>
                    <span class="display-setting-hint">Smart follows content. Fixed keeps the size you drag.</span>
                </div>
                <select id="resize-mode-${widget.id}" class="display-select">
                    <option value="auto" ${autoResize ? 'selected' : ''}>Smart (fit height)</option>
                    <option value="fixed" ${autoResize ? '' : 'selected'}>Fixed</option>
                </select>
            </div>
            ${limitRow('Min width', 'Smallest the corner grip and smart resize will go', 'min-width-' + widget.id, limits.minWidth)}
            ${limitRow('Max width', 'Widest smart resize will grow', 'max-width-' + widget.id, limits.maxWidth)}
            ${limitRow('Min height', 'Shortest the widget will become', 'min-height-' + widget.id, limits.minHeight)}
            ${limitRow('Max height', 'Taller content scrolls inside the widget', 'max-height-' + widget.id, limits.maxHeight)}
            <div class="display-setting-row">
                <div class="display-setting-label">
                    <span>Opacity</span>
                    <span class="display-setting-hint">How solid the widget looks</span>
                </div>
                <div class="slider-group">
                    <input type="range" id="opacity-${widget.id}" min="10" max="100" value="${opacity}" class="display-slider">
                    <span id="opacity-${widget.id}-label" class="slider-value">${opacity}%</span>
                </div>
            </div>
            <div class="display-setting-row">
                <div class="display-setting-label">
                    <span>Click-through</span>
                    <span class="display-setting-hint">Mouse clicks pass to the windows behind. Ctrl+Shift+X turns this off.</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="click-through-${widget.id}" ${widget.clickThrough ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div style="margin-top: 15px;">
                <button class="btn" type="button" data-reset-display style="background-color: #585b70;">Reset display</button>
            </div>
        </div>
    `;
    return html;
}

function limitRow(title, hint, id, range) {
    return `
        <div class="display-setting-row">
            <div class="display-setting-label">
                <span>${title}</span>
                <span class="display-setting-hint">${hint}</span>
            </div>
            <div class="slider-group">
                <input type="range" id="${id}" min="${range.min}" max="${range.max}" value="${range.value}" class="display-slider">
                <span id="${id}-label" class="slider-value">${range.value}px</span>
            </div>
        </div>
    `;
}

function bindDisplayPanel(widgetId, panel) {
    const mode = document.getElementById('resize-mode-' + widgetId);
    mode.addEventListener('change', () => {
        queueDisplay(widgetId, { autoResize: mode.value === 'auto' });
    });

    bindLimit(widgetId, 'min-width-' + widgetId, 'minWidth');
    bindLimit(widgetId, 'max-width-' + widgetId, 'maxWidth');
    bindLimit(widgetId, 'min-height-' + widgetId, 'minHeight');
    bindLimit(widgetId, 'max-height-' + widgetId, 'maxHeight');

    const opacity = document.getElementById('opacity-' + widgetId);
    opacity.addEventListener('input', () => {
        document.getElementById('opacity-' + widgetId + '-label').textContent = opacity.value + '%';
        queueDisplay(widgetId, { opacity: Number(opacity.value) / 100 });
    });

    document.getElementById('click-through-' + widgetId).addEventListener('change', (e) => {
        queueDisplay(widgetId, { clickThrough: e.target.checked });
    });

    panel.querySelector('[data-reset-display]').addEventListener('click', () => {
        const defaults = {
            autoResize: false,
            opacity: 1,
            clickThrough: false,
            minWidth: 160,
            maxWidth: 800,
            minHeight: 80,
            maxHeight: 900
        };
        const widget = widgetsData.find(w => w.id === widgetId);
        if (widget) Object.assign(widget, defaults);
        applyControlState(widgetId, { ...defaults, widgetId });
        ipcRenderer.send('apply-display-settings', widgetId, defaults);
        toast('Display settings reset');
    });
}

function bindLimit(widgetId, elementId, key) {
    const slider = document.getElementById(elementId);
    slider.addEventListener('input', () => {
        document.getElementById(elementId + '-label').textContent = slider.value + 'px';
        queueDisplay(widgetId, { [key]: Number(slider.value) });
    });
}

function queueDisplay(widgetId, patch) {
    const widget = widgetsData.find(w => w.id === widgetId);
    if (widget) Object.assign(widget, patch);
    updateModeBadge(widgetId);
    const pending = displayTimers.get(widgetId) || { timer: null, patch: {} };
    Object.assign(pending.patch, patch);
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
        ipcRenderer.send('apply-display-settings', widgetId, pending.patch);
        displayTimers.delete(widgetId);
    }, 70);
    displayTimers.set(widgetId, pending);
}

function updateModeBadge(widgetId) {
    const widget = widgetsData.find(w => w.id === widgetId);
    const badge = document.getElementById('mode-badge-' + widgetId);
    if (!widget || !badge) return;
    const look = badgeInfo(widget);
    badge.className = 'mode-badge ' + look.cls;
    badge.textContent = look.text;
}

function applyControlState(widgetId, state) {
    const mode = document.getElementById('resize-mode-' + widgetId);
    if (mode && document.activeElement !== mode) mode.value = state.autoResize ? 'auto' : 'fixed';
    setSliderIfIdle('min-width-' + widgetId, state.minWidth, 'px');
    setSliderIfIdle('max-width-' + widgetId, state.maxWidth, 'px');
    setSliderIfIdle('min-height-' + widgetId, state.minHeight, 'px');
    setSliderIfIdle('max-height-' + widgetId, state.maxHeight, 'px');
    setSliderIfIdle('opacity-' + widgetId, Math.round(state.opacity * 100), '%');
    const click = document.getElementById('click-through-' + widgetId);
    if (click && document.activeElement !== click) click.checked = !!state.clickThrough;
    updateModeBadge(widgetId);
}

function setSliderIfIdle(id, value, suffix) {
    const slider = document.getElementById(id);
    const label = document.getElementById(id + '-label');
    if (!slider || value == null) return;
    if (document.activeElement !== slider) slider.value = value;
    if (label) label.textContent = slider.value + suffix;
}

window.saveServerHosterSetup = function(widgetId) {
    const keyEl = document.getElementById('setup-ssh-key-' + widgetId);
    const userEl = document.getElementById('setup-vps-user-' + widgetId);
    if (!keyEl || !userEl) return;
    const widget = widgetsData.find(w => w.id === widgetId);
    const newConfig = { ...(widget?.config || {}), ssh_key: keyEl.value.trim(), vps_user: userEl.value.trim() };
    ipcRenderer.send('update-widget-config', widgetId, newConfig);
    toast('ServerHoster configuration saved');
};

function paintShortcuts(shortcuts) {
    if (!shortcuts) return;
    const boss = document.getElementById('shortcut-boss');
    const click = document.getElementById('shortcut-click');
    boss.textContent = shortcuts.boss ? 'Active' : 'Unavailable';
    boss.classList.toggle('off', !shortcuts.boss);
    click.textContent = shortcuts.clickThrough ? 'Active' : 'Unavailable';
    click.classList.toggle('off', !shortcuts.clickThrough);
}

ipcRenderer.on('dashboard-data', (event, data) => {
    widgetsData = data.widgets;
    settingBootCheckbox.checked = !!data.launchOnBoot;
    paintShortcuts(data.shortcuts);
    renderWidgets();
    if (marketplaceLoaded && document.getElementById('tab-marketplace').classList.contains('active')) {
        renderMarketplace(filterMarketplace());
    }
});

ipcRenderer.on('widget-display-updated', (event, state) => {
    const widget = widgetsData.find(w => w.id === state.widgetId);
    if (!widget) return;
    Object.assign(widget, state);
    applyControlState(state.widgetId, state);
});

ipcRenderer.send('request-dashboard-data');

const API_URL = 'http://85.190.100.23:3055';
const marketplaceGrid = document.getElementById('marketplace-grid');
const uploadBtn = document.getElementById('upload-btn');
const uploadFile = document.getElementById('upload-file');
const marketSearch = document.getElementById('market-search');

function filterMarketplace() {
    const q = marketSearch.value.trim().toLowerCase();
    if (!q) return marketplaceCache;
    return marketplaceCache.filter(w => {
        return [w.name, w.author, w.description].join(' ').toLowerCase().includes(q);
    });
}

function renderMarketplace(list) {
    marketplaceGrid.innerHTML = '';
    if (!list.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;color:#a6adc8;padding:40px;grid-column:1 / -1;';
        empty.textContent = marketplaceCache.length ? 'No widgets match that search.' : 'No widgets found in the marketplace.';
        marketplaceGrid.appendChild(empty);
        return;
    }

    list.forEach(w => {
        const card = document.createElement('div');
        card.className = 'market-card';
        const title = document.createElement('h3');
        title.textContent = w.name || 'Untitled';
        const author = document.createElement('div');
        author.className = 'author';
        author.textContent = 'By ' + (w.author || 'Unknown');
        const desc = document.createElement('p');
        desc.textContent = w.description || 'No description provided.';
        const expected = String(w.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.widget';
        const installed = widgetsData.some(item => item.id === expected || item.name === w.name);
        const btn = document.createElement('button');
        btn.className = 'btn' + (installed ? ' btn-success' : '');
        btn.textContent = installed ? 'Installed' : 'Download & Install';
        btn.disabled = installed;
        btn.addEventListener('click', () => downloadWidget(w.id, w.name));
        card.append(title, author, desc, btn);
        marketplaceGrid.appendChild(card);
    });
}

async function loadMarketplaceWidgets() {
    marketplaceGrid.textContent = '';
    const loading = document.createElement('div');
    loading.style.cssText = 'text-align:center;color:#a6adc8;padding:40px;grid-column:1 / -1;';
    loading.textContent = 'Loading widgets from the community...';
    marketplaceGrid.appendChild(loading);
    try {
        const res = await fetch(API_URL + '/widgets');
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const widgets = await res.json();
        if (!Array.isArray(widgets)) throw new Error('Unexpected marketplace response');
        marketplaceCache = widgets;
        marketplaceLoaded = true;
        renderMarketplace(filterMarketplace());
    } catch (e) {
        marketplaceGrid.textContent = '';
        const err = document.createElement('div');
        err.style.cssText = 'color:#f38ba8;padding:40px;grid-column:1 / -1;';
        err.textContent = 'Failed to load marketplace: ' + e.message;
        marketplaceGrid.appendChild(err);
    }
}

marketSearch.addEventListener('input', () => {
    if (marketplaceLoaded) renderMarketplace(filterMarketplace());
});

window.downloadWidget = async (id, name) => {
    try {
        const res = await fetch(API_URL + '/widgets/' + id);
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const data = await res.json();
        if (!data.json_content) throw new Error('Widget content not found');
        ipcRenderer.send('install-widget-content', { name: name || data.name || 'widget', content: data.json_content });
        toast('Installed ' + (name || 'widget') + '.');
    } catch (e) {
        toast('Download failed: ' + e.message);
    }
};

uploadBtn.addEventListener('click', () => uploadFile.click());

uploadFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const auth = prompt('Enter the marketplace admin password:');
    if (!auth) return;

    const formData = new FormData();
    formData.append('widgetFile', file);
    formData.append('name', file.name.replace('.widget', '').replace('.json', ''));

    try {
        const res = await fetch(API_URL + '/widgets', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + auth },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            toast('Upload successful');
            loadMarketplaceWidgets();
        } else {
            toast('Upload failed: ' + (data.error || 'unknown error'));
        }
    } catch (err) {
        toast('Upload failed: ' + err.message);
    }
});

const DEFAULT_WIDGET = {
    name: 'My New Widget',
    width: 300,
    height: 300,
    html: "<div class='container'><h1>Hello</h1><p id='status'>Ready</p></div>",
    css: "body { background: rgba(20,20,25,0.92); color: white; margin: 0; padding: 16px; font-family: 'Segoe UI', sans-serif; border-radius: 12px; border: 1px solid #444; } h1 { font-size: 16px; margin: 0 0 8px; }",
    js: "document.getElementById('status').textContent = 'Widget loaded';"
};

let editingWidgetId = null;
let creatorExtra = {};
let creatorMode = 'form';

function fillCreatorForm(config) {
    document.getElementById('field-name').value = config.name || '';
    document.getElementById('field-width').value = config.width || 300;
    document.getElementById('field-height').value = config.height || 300;
    document.getElementById('field-html').value = config.html || '';
    document.getElementById('field-css').value = config.css || '';
    document.getElementById('field-js').value = config.js || '';
}

function readCreatorForm() {
    const width = Number(document.getElementById('field-width').value);
    const height = Number(document.getElementById('field-height').value);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
        throw new Error('Width and height must be numbers');
    }
    return {
        ...creatorExtra,
        name: document.getElementById('field-name').value.trim() || 'Custom Widget',
        width,
        height,
        html: document.getElementById('field-html').value,
        css: document.getElementById('field-css').value,
        js: document.getElementById('field-js').value
    };
}

function loadCreatorFromObject(obj, id) {
    const copy = { ...obj };
    const name = copy.name;
    const width = copy.width;
    const height = copy.height;
    const html = copy.html;
    const css = copy.css;
    const js = copy.js;
    delete copy.name;
    delete copy.width;
    delete copy.height;
    delete copy.html;
    delete copy.css;
    delete copy.js;
    creatorExtra = copy;
    editingWidgetId = id || null;
    fillCreatorForm({ name, width, height, html, css, js });
    document.getElementById('create-json').value = JSON.stringify(obj, null, 2);
    const banner = document.getElementById('creator-editing');
    const cancel = document.getElementById('creator-cancel');
    if (editingWidgetId) {
        banner.style.display = 'block';
        banner.textContent = 'Editing ' + editingWidgetId + '. Saving writes this file in place.';
        cancel.style.display = 'inline-block';
    } else {
        banner.style.display = 'none';
        cancel.style.display = 'none';
    }
}

function setCreatorMode(mode) {
    if (mode === 'form' && creatorMode === 'json') {
        try {
            loadCreatorFromObject(JSON.parse(document.getElementById('create-json').value), editingWidgetId);
        } catch (e) {
            toast('That JSON is invalid: ' + e.message);
            return;
        }
    }
    if (mode === 'json' && creatorMode === 'form') {
        try {
            document.getElementById('create-json').value = JSON.stringify(readCreatorForm(), null, 2);
        } catch (e) {
            toast(e.message);
            return;
        }
    }
    creatorMode = mode;
    document.getElementById('creator-form').style.display = mode === 'form' ? 'block' : 'none';
    document.getElementById('creator-json-wrap').style.display = mode === 'json' ? 'block' : 'none';
    document.getElementById('creator-mode-form').classList.toggle('mode-on', mode === 'form');
    document.getElementById('creator-mode-json').classList.toggle('mode-on', mode === 'json');
}

async function openWidgetInCreator(widgetId) {
    try {
        const content = await ipcRenderer.invoke('read-widget-file', widgetId);
        loadCreatorFromObject(JSON.parse(content), widgetId);
        setCreatorMode('form');
        document.querySelector('[data-tab="tab-creator"]').click();
    } catch (e) {
        toast('Could not open this widget: ' + e.message);
    }
}

document.getElementById('creator-mode-form').addEventListener('click', () => setCreatorMode('form'));
document.getElementById('creator-mode-json').addEventListener('click', () => setCreatorMode('json'));
document.getElementById('creator-cancel').addEventListener('click', () => {
    loadCreatorFromObject(DEFAULT_WIDGET, null);
    setCreatorMode('form');
    toast('Edit cancelled');
});

document.getElementById('create-save-btn').addEventListener('click', () => {
    try {
        const obj = creatorMode === 'json'
            ? JSON.parse(document.getElementById('create-json').value)
            : readCreatorForm();
        ipcRenderer.send('save-widget-file', {
            id: editingWidgetId,
            content: JSON.stringify(obj)
        });
    } catch (e) {
        toast('Invalid widget: ' + e.message);
    }
});

ipcRenderer.on('widget-saved', (event, info) => {
    toast('Saved ' + (info.name || info.id));
    if (!editingWidgetId) editingWidgetId = info.id;
    const banner = document.getElementById('creator-editing');
    banner.style.display = 'block';
    banner.textContent = 'Editing ' + info.id + '. Saving writes this file in place.';
    document.getElementById('creator-cancel').style.display = 'inline-block';
});

ipcRenderer.on('widget-save-error', (event, message) => {
    toast('Save failed: ' + message);
});

loadCreatorFromObject(DEFAULT_WIDGET, null);
setCreatorMode('form');

const LAYOUT_TEMPLATES = [
    {
        name: 'Sidebar Right',
        icon: '▐',
        description: 'Stack widgets down the right edge, filling the height.',
        generate: (ids) => columnLayout(ids, 75, 25)
    },
    {
        name: 'Sidebar Left',
        icon: '▌',
        description: 'Stack widgets down the left edge, filling the height.',
        generate: (ids) => columnLayout(ids, 0, 25)
    },
    {
        name: 'Top Bar',
        icon: '▀',
        description: 'Spread widgets across the top of the screen.',
        generate: (ids) => rowLayout(ids, 0, 30)
    },
    {
        name: 'Bottom Bar',
        icon: '▄',
        description: 'Spread widgets across the bottom of the screen.',
        generate: (ids) => rowLayout(ids, 70, 30)
    },
    {
        name: 'Grid',
        icon: '⊞',
        description: 'Tile widgets evenly across the whole screen.',
        generate: (ids) => {
            const count = ids.length;
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
            const colW = splitEven(cols, 100);
            const rowH = splitEven(rows, 100);
            let y = 0;
            const yPos = rowH.map(h => { const p = y; y += h; return p; });
            let x = 0;
            const xPos = colW.map(w => { const p = x; x += w; return p; });
            return ids.map((id, i) => {
                const c = i % cols;
                const r = Math.floor(i / cols);
                return { widgetId: id, x: xPos[c], y: yPos[r], width: colW[c], height: rowH[r] };
            });
        }
    },
    {
        name: 'Corners',
        icon: '⊡',
        description: 'Place the first four widgets in the corners. Extras stack on the right.',
        generate: (ids) => {
            const corners = [
                { x: 0, y: 0 },
                { x: 75, y: 0 },
                { x: 0, y: 70 },
                { x: 75, y: 70 }
            ];
            return ids.map((id, i) => {
                const c = corners[i] || { x: 75, y: Math.min(i * 15, 85) };
                return { widgetId: id, x: c.x, y: c.y, width: 25, height: 30 };
            });
        }
    },
    {
        name: 'Center Stack',
        icon: '◫',
        description: 'Stack widgets in a column in the middle of the screen.',
        generate: (ids) => {
            const heightPer = Math.min(Math.floor(80 / ids.length), 25);
            const parts = splitEven(ids.length, heightPer * ids.length || 25);
            const used = parts.reduce((a, b) => a + b, 0);
            let y = Math.max(0, Math.round((100 - used) / 2));
            return ids.map((id, i) => {
                const item = { widgetId: id, x: 30, y, width: 40, height: parts[i] };
                y += parts[i];
                return item;
            });
        }
    }
];

function columnLayout(ids, x, width) {
    const parts = splitEven(ids.length, 100);
    let y = 0;
    return ids.map((id, i) => {
        const item = { widgetId: id, x, y, width, height: parts[i] };
        y += parts[i];
        return item;
    });
}

function rowLayout(ids, y, height) {
    const parts = splitEven(ids.length, 100);
    let x = 0;
    return ids.map((id, i) => {
        const item = { widgetId: id, x, y, width: parts[i], height };
        x += parts[i];
        return item;
    });
}

async function loadLayoutsTab() {
    const templatesGrid = document.getElementById('layout-templates');
    const activeIds = await ipcRenderer.invoke('get-active-widget-ids');
    templatesGrid.innerHTML = '';
    LAYOUT_TEMPLATES.forEach((tmpl, idx) => {
        const card = document.createElement('div');
        card.className = 'market-card';
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:36px;margin-bottom:10px;text-align:center;color:#89b4fa;';
        icon.textContent = tmpl.icon;
        const title = document.createElement('h3');
        title.style.color = '#cba6f7';
        title.textContent = tmpl.name;
        const desc = document.createElement('p');
        desc.textContent = tmpl.description;
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.disabled = activeIds.length === 0;
        btn.textContent = activeIds.length === 0 ? 'No open widgets' : 'Apply layout';
        btn.addEventListener('click', () => applyTemplate(idx));
        card.append(icon, title, desc, btn);
        templatesGrid.appendChild(card);
    });

    const layoutData = await ipcRenderer.invoke('get-layouts');
    const savedList = document.getElementById('saved-layouts-list');
    savedList.innerHTML = '';
    if (!layoutData.saved.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;color:#6c7086;padding:20px;';
        empty.textContent = 'No saved layouts yet. Arrange your widgets, name the layout, then save it.';
        savedList.appendChild(empty);
        return;
    }

    layoutData.saved.forEach((layout, idx) => {
        const card = document.createElement('div');
        card.className = 'widget-card';
        const info = document.createElement('div');
        info.className = 'widget-info';
        const title = document.createElement('h3');
        title.textContent = layout.name;
        const meta = document.createElement('p');
        const when = layout.createdAt ? new Date(layout.createdAt).toLocaleDateString() : '';
        meta.textContent = layout.positions.length + ' widget(s)' + (when ? ' · ' + when : '');
        info.append(title, meta);
        const actions = document.createElement('div');
        actions.className = 'widget-actions';
        const apply = document.createElement('button');
        apply.className = 'btn';
        apply.textContent = 'Apply';
        apply.addEventListener('click', () => applySavedLayout(idx));
        const del = document.createElement('button');
        del.className = 'btn btn-danger';
        del.textContent = 'Delete';
        del.addEventListener('click', () => deleteSavedLayout(idx));
        actions.append(apply, del);
        card.append(info, actions);
        savedList.appendChild(card);
    });
}

async function applyTemplate(templateIdx) {
    const activeIds = await ipcRenderer.invoke('get-active-widget-ids');
    if (!activeIds.length) {
        toast('Open a widget before applying a layout');
        return;
    }
    const positions = LAYOUT_TEMPLATES[templateIdx].generate(activeIds);
    ipcRenderer.send('apply-layout', positions);
}

async function applySavedLayout(index) {
    const layoutData = await ipcRenderer.invoke('get-layouts');
    const layout = layoutData.saved[index];
    if (!layout) return;
    ipcRenderer.send('apply-layout', layout.positions);
}

async function deleteSavedLayout(index) {
    if (!confirm('Delete this saved layout?')) return;
    ipcRenderer.send('delete-custom-layout', index);
}

document.getElementById('btn-save-layout').addEventListener('click', () => {
    const name = document.getElementById('layout-save-name').value.trim();
    if (!name) {
        toast('Name the layout before saving it');
        return;
    }
    ipcRenderer.send('save-custom-layout', name);
    document.getElementById('layout-save-name').value = '';
});

ipcRenderer.on('layout-saved', (event, name) => {
    toast('Saved layout "' + name + '"');
    loadLayoutsTab();
});

ipcRenderer.on('layout-save-error', (event, message) => {
    toast(message);
});

ipcRenderer.on('layout-applied', (event, result) => {
    const skipped = result.skipped && result.skipped.length
        ? ' ' + result.skipped.length + ' widget(s) from the layout are not open.'
        : '';
    toast('Arranged ' + result.applied + ' widget(s).' + skipped);
});

ipcRenderer.on('layouts-changed', () => {
    loadLayoutsTab();
});
