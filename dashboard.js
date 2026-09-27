const { ipcRenderer } = require('electron');

// --- Tab Navigation ---
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        // Remove active class from all
        navItems.forEach(n => n.classList.remove('active'));
        tabPanes.forEach(t => t.classList.remove('active'));
        
        // Add active class to clicked
        item.classList.add('active');
        const targetId = item.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
        
        if (targetId === 'tab-marketplace') {
            loadMarketplaceWidgets();
        }
    });
});

// --- Dashboard Logic (My Widgets) ---
const widgetListEl = document.getElementById('widget-list');
const dropZone = document.getElementById('drop-zone');
const settingBootCheckbox = document.getElementById('setting-boot');

let widgetsData = [];

// Handle Drag and Drop
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

// Settings Checkbox
settingBootCheckbox.addEventListener('change', (e) => {
    ipcRenderer.send('set-launch-on-boot', e.target.checked);
});

// Restart App
document.getElementById('btn-restart-app').addEventListener('click', () => {
    // We can restart by telling main process, but closing dashboard + quit works
    alert("Restart the app manually from the tray."); // Or implement an IPC restart
});

function renderWidgets() {
    widgetListEl.innerHTML = '';
    
    if (widgetsData.length === 0) {
        widgetListEl.innerHTML = '<div style="text-align: center; color: #a6adc8; padding: 20px;">No widgets installed yet. Drag and drop a .widget file above!</div>';
        return;
    }

    widgetsData.forEach(widget => {
        const card = document.createElement('div');
        card.className = 'widget-card';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        
        const cardHeader = document.createElement('div');
        cardHeader.style.display = 'flex';
        cardHeader.style.justifyContent = 'space-between';
        cardHeader.style.alignItems = 'center';
        
        const info = document.createElement('div');
        info.className = 'widget-info';
        info.innerHTML = `<h3>${widget.name}</h3><p>${widget.id}</p>`;
        
        const actions = document.createElement('div');
        actions.className = 'widget-actions';
        
        // Sticky Toggle
        const stickyLabel = document.createElement('label');
        stickyLabel.style.display = 'flex';
        stickyLabel.style.alignItems = 'center';
        stickyLabel.style.gap = '5px';
        stickyLabel.style.cursor = 'pointer';
        stickyLabel.style.fontSize = '13px';
        stickyLabel.style.color = '#a6adc8';
        
        const stickyInput = document.createElement('input');
        stickyInput.type = 'checkbox';
        stickyInput.checked = widget.sticky;
        stickyInput.onchange = (e) => ipcRenderer.send('set-widget-sticky', widget.id, e.target.checked);
        
        stickyLabel.appendChild(stickyInput);
        stickyLabel.appendChild(document.createTextNode('Sticky'));

        // Setup Button
        const setupBtn = document.createElement('button');
        setupBtn.className = 'btn';
        setupBtn.style.backgroundColor = '#cba6f7';
        setupBtn.innerText = '⚙ Setup';
        setupBtn.onclick = () => {
            const panel = document.getElementById(`setup-${widget.id}`);
            panel.classList.toggle('active');
        };

        // Edit Code Button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn';
        editBtn.style.backgroundColor = '#f9e2af';
        editBtn.innerText = '📝 Edit Code';
        editBtn.onclick = () => {
            // Read file from disk via IPC or simply switch to creator tab with content
            const fs = require('fs');
            const path = require('path');
            const { app } = require('electron').remote || { app: { getPath: () => process.env.APPDATA + '\\Widgeter' } };
            // Let's just ask main for config file via ipc if needed, or we can use Node fs since nodeIntegration is true.
            try {
                const widgetDir = path.join(process.env.APPDATA, 'Widgeter', 'widgets');
                const content = fs.readFileSync(path.join(widgetDir, widget.id), 'utf8');
                document.getElementById('create-json').value = content;
                document.getElementById('create-name').value = widget.id.replace('.widget', '');
                document.querySelector('[data-tab="tab-creator"]').click();
            } catch (e) {
                alert("Could not load widget code.");
            }
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.innerText = 'Delete';
        deleteBtn.onclick = () => {
            if (confirm(`Are you sure you want to delete ${widget.name}?`)) {
                ipcRenderer.send('delete-widget', widget.id);
            }
        };

        // Enable/Disable Toggle
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-switch';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = widget.enabled;
        toggleInput.onchange = (e) => ipcRenderer.send('toggle-widget', widget.id, e.target.checked);
        
        const slider = document.createElement('span');
        slider.className = 'slider';
        
        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(slider);
        
        actions.appendChild(stickyLabel);
        actions.appendChild(setupBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        actions.appendChild(toggleLabel);
        
        cardHeader.appendChild(info);
        cardHeader.appendChild(actions);
        card.appendChild(cardHeader);
        
        // Setup panel
        const setupPanel = document.createElement('div');
        setupPanel.id = `setup-${widget.id}`;
        setupPanel.className = 'panel';
        setupPanel.innerHTML = buildSetupPanel(widget);
        card.appendChild(setupPanel);
        
        if (widget.setupJs) {
            setTimeout(() => {
                try {
                    new Function('widget', 'ipcRenderer', widget.setupJs)(widget, ipcRenderer);
                } catch (e) {
                    console.error('Error in setupJs for widget ' + widget.id, e);
                }
            }, 0);
        }
        
        widgetListEl.appendChild(card);
    });
}

function buildSetupPanel(widget) {
    let html = '';
    
    // Widget-specific setup (e.g. GitHub token, ServerHoster SSH) goes first
    if (widget.setupHtml) {
        html += '<div class="setup-section">' + widget.setupHtml + '</div>';
        html += '<hr style="border: none; border-top: 1px solid #313244; margin: 20px 0;">';
    }
    
    // Universal Display Settings — every widget gets this automatically
    const config = widget.config || {};
    const autoResize = config._autoResize !== false; // default true
    const maxHeight = config.maxHeight || 900;
    const maxWidth = config.maxWidth || 800;
    const opacity = config._opacity !== undefined ? config._opacity : 1.0;
    
    html += `
        <div class="setup-section">
            <h4 style="margin-top:0; color:#89b4fa; font-size: 15px;">📐 Display Settings</h4>
            
            <div class="display-setting-row">
                <div class="display-setting-label">
                    <span>Resize Mode</span>
                    <span class="display-setting-hint">How this widget handles its size</span>
                </div>
                <select id="resize-mode-${widget.id}" class="display-select" onchange="onResizeModeChange('${widget.id}')">
                    <option value="auto" ${autoResize ? 'selected' : ''}>Auto (fit content)</option>
                    <option value="fixed" ${!autoResize ? 'selected' : ''}>Fixed (manual size)</option>
                </select>
            </div>
            
            <div id="auto-limits-${widget.id}" class="auto-limits-group" style="display: ${autoResize ? 'block' : 'none'};">
                <div class="display-setting-row">
                    <div class="display-setting-label">
                        <span>Max Height</span>
                        <span class="display-setting-hint">Widget won't grow taller than this</span>
                    </div>
                    <div class="slider-group">
                        <input type="range" id="max-height-${widget.id}" min="150" max="1200" value="${maxHeight}" class="display-slider" oninput="updateSliderLabel('max-height-${widget.id}')">
                        <span id="max-height-${widget.id}-label" class="slider-value">${maxHeight}px</span>
                    </div>
                </div>
                
                <div class="display-setting-row">
                    <div class="display-setting-label">
                        <span>Max Width</span>
                        <span class="display-setting-hint">Widget won't grow wider than this</span>
                    </div>
                    <div class="slider-group">
                        <input type="range" id="max-width-${widget.id}" min="150" max="1200" value="${maxWidth}" class="display-slider" oninput="updateSliderLabel('max-width-${widget.id}')">
                        <span id="max-width-${widget.id}-label" class="slider-value">${maxWidth}px</span>
                    </div>
                </div>
            </div>
            
            <div class="display-setting-row">
                <div class="display-setting-label">
                    <span>Opacity</span>
                    <span class="display-setting-hint">How transparent the widget appears</span>
                </div>
                <div class="slider-group">
                    <input type="range" id="opacity-${widget.id}" min="10" max="100" value="${Math.round(opacity * 100)}" class="display-slider" oninput="updateSliderLabel('opacity-${widget.id}', '%')">
                    <span id="opacity-${widget.id}-label" class="slider-value">${Math.round(opacity * 100)}%</span>
                </div>
            </div>
            
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button class="btn btn-success" onclick="saveDisplaySettings('${widget.id}')">💾 Save Display Settings</button>
                <button class="btn" style="background-color: #585b70;" onclick="resetDisplaySettings('${widget.id}')">↺ Reset to Defaults</button>
            </div>
        </div>
    `;
    
    return html;
}

window.updateSliderLabel = function(id, suffix) {
    const slider = document.getElementById(id);
    const label = document.getElementById(id + '-label');
    if (slider && label) {
        label.innerText = slider.value + (suffix || 'px');
    }
};

window.onResizeModeChange = function(widgetId) {
    const mode = document.getElementById('resize-mode-' + widgetId).value;
    const limitsGroup = document.getElementById('auto-limits-' + widgetId);
    limitsGroup.style.display = mode === 'auto' ? 'block' : 'none';
};

window.saveDisplaySettings = function(widgetId) {
    const widget = widgetsData.find(w => w.id === widgetId);
    const mode = document.getElementById('resize-mode-' + widgetId).value;
    const maxHeight = parseInt(document.getElementById('max-height-' + widgetId).value);
    const maxWidth = parseInt(document.getElementById('max-width-' + widgetId).value);
    const opacity = parseInt(document.getElementById('opacity-' + widgetId).value) / 100;
    
    const newConfig = { ...(widget?.config || {}) };
    newConfig.maxHeight = maxHeight;
    newConfig.maxWidth = maxWidth;
    newConfig._autoResize = mode === 'auto';
    newConfig._opacity = opacity;
    
    ipcRenderer.send('update-widget-config', widgetId, newConfig);
    ipcRenderer.send('apply-display-settings', widgetId, { autoResize: mode === 'auto', opacity });
    
    // Show save confirmation inline
    const btn = event.target;
    const origText = btn.innerText;
    btn.innerText = '✓ Saved!';
    btn.style.backgroundColor = '#94e2d5';
    setTimeout(() => { btn.innerText = origText; btn.style.backgroundColor = '#a6e3a1'; }, 1500);
};

window.resetDisplaySettings = function(widgetId) {
    const widget = widgetsData.find(w => w.id === widgetId);
    const newConfig = { ...(widget?.config || {}) };
    delete newConfig.maxHeight;
    delete newConfig.maxWidth;
    delete newConfig._autoResize;
    delete newConfig._opacity;
    
    ipcRenderer.send('update-widget-config', widgetId, newConfig);
    ipcRenderer.send('apply-display-settings', widgetId, { autoResize: true, opacity: 1.0 });
    
    alert('Display settings reset to defaults.');
};

window.saveServerHosterSetup = function(widgetId) {
    const sshKey = document.getElementById('setup-ssh-key-' + widgetId).value.trim();
    const vpsUser = document.getElementById('setup-vps-user-' + widgetId).value.trim();
    const widget = widgetsData.find(w => w.id === widgetId);
    const newConfig = { ...(widget?.config || {}), ssh_key: sshKey, vps_user: vpsUser };
    ipcRenderer.send('update-widget-config', widgetId, newConfig);
    alert('ServerHoster configuration saved!');
};

// Receive data from Main
ipcRenderer.on('dashboard-data', (event, data) => {
    widgetsData = data.widgets;
    settingBootCheckbox.checked = data.launchOnBoot;
    renderWidgets();
});

// Request initial data
ipcRenderer.send('request-dashboard-data');


// --- Marketplace Logic ---
const API_URL = 'http://85.190.100.23:3055'; 
const marketplaceGrid = document.getElementById('marketplace-grid');
const uploadBtn = document.getElementById('upload-btn');
const uploadFile = document.getElementById('upload-file');

async function loadMarketplaceWidgets() {
    marketplaceGrid.innerHTML = '<div style="text-align: center; color: #a6adc8; padding: 40px; grid-column: 1 / -1;">Loading widgets from community...</div>';
    try {
        const res = await fetch(`${API_URL}/widgets`);
        const widgets = await res.json();
        
        marketplaceGrid.innerHTML = '';
        if (widgets.length === 0) {
            marketplaceGrid.innerHTML = '<div style="text-align: center; color: #a6adc8; padding: 40px; grid-column: 1 / -1;">No widgets found in the marketplace.</div>';
            return;
        }

        widgets.forEach(w => {
            const card = document.createElement('div');
            card.className = 'market-card';
            
            // Check if installed
            const isInstalled = widgetsData.some(installed => installed.id === w.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.widget' || installed.name === w.name);
            
            card.innerHTML = `
                <h3>${w.name}</h3>
                <div class="author">By ${w.author}</div>
                <p>${w.description || 'No description provided.'}</p>
                <button class="btn ${isInstalled ? 'btn-success' : 'btn'}" onclick="downloadWidget(${w.id}, '${w.name.replace(/'/g, "\\'")}')" ${isInstalled ? 'disabled' : ''}>
                    ${isInstalled ? '✓ Installed' : '⬇️ Download & Install'}
                </button>
            `;
            marketplaceGrid.appendChild(card);
        });
    } catch (e) {
        marketplaceGrid.innerHTML = `<div style="color: #f38ba8; padding: 40px; grid-column: 1 / -1;">Failed to load marketplace: ${e.message}</div>`;
    }
}

window.downloadWidget = async (id, name) => {
    try {
        const res = await fetch(`${API_URL}/widgets/${id}`);
        const data = await res.json();
        if (data.json_content) {
            ipcRenderer.send('install-widget-content', {
                name: name,
                content: data.json_content
            });
            alert(`Installed ${name}! Check My Widgets.`);
            loadMarketplaceWidgets(); // Refresh to show Installed badge
        } else {
            alert('Widget content not found.');
        }
    } catch(e) {
        alert('Download failed: ' + e.message);
    }
};

uploadBtn.addEventListener('click', () => uploadFile.click());

uploadFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const auth = prompt('Enter Admin Password to upload (For now, you are the only one who can upload):');
    if (!auth) return;

    const formData = new FormData();
    formData.append('widgetFile', file);
    formData.append('name', file.name.replace('.widget', '').replace('.json', ''));
    
    try {
        const res = await fetch(`${API_URL}/widgets`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${auth}` },
            body: formData
        });
        
        const data = await res.json();
        if (data.success) {
            alert('Upload successful!');
            loadMarketplaceWidgets();
        } else {
            alert('Upload failed: ' + data.error);
        }
    } catch(e) {
        alert('Upload failed: ' + e.message);
    }
});

// --- Widget Creator Logic ---
document.getElementById('create-save-btn').addEventListener('click', () => {
    const name = document.getElementById('create-name').value.trim() || 'Custom_Widget';
    const jsonStr = document.getElementById('create-json').value;
    
    try {
        // Validate JSON
        JSON.parse(jsonStr);
        
        ipcRenderer.send('install-widget-content', {
            name: name,
            content: jsonStr
        });
        
        alert("Widget saved and installed!");
        document.querySelector('[data-tab="tab-dashboard"]').click();
        
    } catch (e) {
        alert("Invalid JSON: " + e.message);
    }
});
