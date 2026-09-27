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
    if (widget.setupHtml) {
        return widget.setupHtml;
    } else if (widget.id.includes('serverhoster')) {
        const sshKey = widget.config?.ssh_key || 'C:/Users/tobia/.ssh/serverhoster_key';
        const vpsUser = widget.config?.vps_user || 'administrator@85.190.100.23';
        return `
            <h4 style="margin-top:0;color:#cba6f7;">🖥️ ServerHoster Connection</h4>
            <div class="form-group">
                <label>SSH Key Path</label>
                <input type="text" id="setup-ssh-key-${widget.id}" value="${sshKey}" />
            </div>
            <div class="form-group">
                <label>VPS User & Host</label>
                <input type="text" id="setup-vps-user-${widget.id}" value="${vpsUser}" />
            </div>
            <button class="btn btn-success" onclick="saveServerHosterSetup('${widget.id}')">💾 Save Config</button>
        `;
    }
    return `
        <h4 style="margin-top:0;color:#cba6f7;">⚙ JSON Config Override</h4>
        <div class="form-group">
            <textarea id="setup-json-${widget.id}" style="height: 100px; font-family: monospace;">${JSON.stringify(widget.config || {}, null, 2)}</textarea>
        </div>
        <button class="btn btn-success" onclick="saveGenericSetup('${widget.id}')">💾 Save JSON</button>
    `;
}

window.saveGenericSetup = function(widgetId) {
    try {
        const val = document.getElementById(`setup-json-${widgetId}`).value;
        const parsed = JSON.parse(val);
        ipcRenderer.send('update-widget-config', widgetId, parsed);
        alert('Saved!');
    } catch(e) {
        alert('Invalid JSON');
    }
};

window.saveServerHosterSetup = function(widgetId) {
    const sshKey = document.getElementById(`setup-ssh-key-${widgetId}`).value.trim();
    const vpsUser = document.getElementById(`setup-vps-user-${widgetId}`).value.trim();
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
