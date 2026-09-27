const { ipcRenderer } = require('electron');

const widgetListEl = document.getElementById('widget-list');
const dropZone = document.getElementById('drop-zone');
const launchOnBootCheckbox = document.getElementById('launch-on-boot');

let widgetsData = [];

// Handle Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

const marketplaceBtn = document.getElementById('marketplace-btn');
if (marketplaceBtn) {
    marketplaceBtn.addEventListener('click', () => {
        window.location.href = 'marketplace.html';
    });
}

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

// Settings
launchOnBootCheckbox.addEventListener('change', (e) => {
    ipcRenderer.send('set-launch-on-boot', e.target.checked);
});

// Render list
function renderWidgets() {
    widgetListEl.innerHTML = '';
    
    if (widgetsData.length === 0) {
        widgetListEl.innerHTML = '<p>No widgets installed yet.</p>';
        return;
    }

    widgetsData.forEach(widget => {
        const card = document.createElement('div');
        
        // Widget Card
        const cardContent = document.createElement('div');
        cardContent.className = 'widget-card';
        
        const info = document.createElement('div');
        info.className = 'widget-info';
        info.innerHTML = `<h3>${widget.name}</h3><p>${widget.id}</p>`;
        
        const actions = document.createElement('div');
        actions.className = 'widget-actions';
        
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'btn btn-settings';
        settingsBtn.innerText = 'Settings';
        settingsBtn.onclick = () => {
            const panel = document.getElementById(`settings-${widget.id}`);
            panel.classList.toggle('active');
        };
        
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-switch';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = widget.enabled;
        toggleInput.onchange = (e) => {
            ipcRenderer.send('toggle-widget', widget.id, e.target.checked);
        };
        
        const slider = document.createElement('span');
        slider.className = 'slider';
        
        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(slider);
        
        const stickyLabel = document.createElement('label');
        stickyLabel.style.display = 'flex';
        stickyLabel.style.alignItems = 'center';
        stickyLabel.style.gap = '5px';
        stickyLabel.style.cursor = 'pointer';
        stickyLabel.style.fontSize = '0.9em';
        stickyLabel.style.color = '#a6adc8';
        
        const stickyInput = document.createElement('input');
        stickyInput.type = 'checkbox';
        stickyInput.checked = widget.sticky;
        stickyInput.onchange = (e) => {
            ipcRenderer.send('set-widget-sticky', widget.id, e.target.checked);
        };
        
        stickyLabel.appendChild(stickyInput);
        stickyLabel.appendChild(document.createTextNode('Sticky'));

        // Setup button - available for all widgets
        const needsSetup = true;
        let setupBtn = null;
        if (needsSetup) {
            setupBtn = document.createElement('button');
            setupBtn.className = 'btn btn-setup';
            setupBtn.innerText = '⚙ Setup';
            setupBtn.onclick = () => {
                const panel = document.getElementById(`setup-${widget.id}`);
                panel.classList.toggle('active');
            };
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.backgroundColor = '#f38ba8';
        deleteBtn.style.color = '#1e1e2e';
        deleteBtn.style.marginLeft = '5px';
        deleteBtn.style.marginRight = '5px';
        deleteBtn.innerText = 'Delete';
        deleteBtn.onclick = () => {
            if (confirm(`Are you sure you want to delete ${widget.name}?`)) {
                ipcRenderer.send('delete-widget', widget.id);
            }
        };

        actions.appendChild(stickyLabel);
        if (setupBtn) actions.appendChild(setupBtn);
        actions.appendChild(settingsBtn);
        actions.appendChild(deleteBtn);
        actions.appendChild(toggleLabel);
        
        cardContent.appendChild(info);
        cardContent.appendChild(actions);
        card.appendChild(cardContent);
        
        // Settings Panel
        const settingsPanel = document.createElement('div');
        settingsPanel.id = `settings-${widget.id}`;
        settingsPanel.className = 'settings-panel';
        
        const configKeys = Object.keys(widget.config || {});
        
        // We can allow users to add new config keys or edit existing ones.
        // For simplicity, we just provide a JSON text area or dynamic inputs.
        // Let's create a generic JSON editor for config
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.innerHTML = '<label>Configuration (JSON):</label>';
        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100px';
        textarea.style.backgroundColor = '#313244';
        textarea.style.color = '#cdd6f4';
        textarea.style.border = '1px solid #45475a';
        textarea.style.padding = '8px';
        textarea.value = JSON.stringify(widget.config || {}, null, 2);
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn';
        saveBtn.innerText = 'Save Settings';
        saveBtn.style.marginTop = '10px';
        saveBtn.onclick = () => {
            try {
                const parsed = JSON.parse(textarea.value);
                ipcRenderer.send('update-widget-config', widget.id, parsed);
                alert('Saved successfully.');
            } catch(e) {
                alert('Invalid JSON.');
            }
        };
        
        formGroup.appendChild(textarea);
        formGroup.appendChild(saveBtn);
        settingsPanel.appendChild(formGroup);
        
        card.appendChild(settingsPanel);

        // Setup panel - widget-specific setup UI
        if (needsSetup) {
            const setupPanel = document.createElement('div');
            setupPanel.id = `setup-${widget.id}`;
            setupPanel.className = 'setup-panel';
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
        }
        
        widgetListEl.appendChild(card);
    });
}

function buildSetupPanel(widget) {
    if (widget.setupHtml) {
        return widget.setupHtml;
    } else if (widget.id.includes('serverhoster')) {
        return buildServerHosterSetupPanel(widget);
    }
    return buildGenericSetupPanel(widget);
}

function buildServerHosterSetupPanel(widget) {
    const sshKey = widget.config?.ssh_key || 'C:/Users/tobia/.ssh/serverhoster_key';
    const vpsUser = widget.config?.vps_user || 'administrator@85.190.100.23';
    return `
        <h4>🖥️ ServerHoster Connection</h4>
        <p class="setup-description">Configure the SSH connection for ServerHoster.</p>
        <div class="form-group">
            <label>SSH Key Path</label>
            <input type="text" id="setup-ssh-key-${widget.id}" value="${sshKey}" placeholder="C:/Users/tobia/.ssh/id_rsa" />
        </div>
        <div class="form-group">
            <label>VPS User & Host</label>
            <input type="text" id="setup-vps-user-${widget.id}" value="${vpsUser}" placeholder="user@1.2.3.4" />
        </div>
        <div class="setup-actions">
            <button class="btn" onclick="saveServerHosterSetup('${widget.id}')">💾 Save</button>
        </div>
    `;
}

function saveServerHosterSetup(widgetId) {
    const sshKey = document.getElementById(`setup-ssh-key-${widgetId}`).value.trim();
    const vpsUser = document.getElementById(`setup-vps-user-${widgetId}`).value.trim();
    const widget = widgetsData.find(w => w.id === widgetId);
    const newConfig = { ...(widget?.config || {}), ssh_key: sshKey, vps_user: vpsUser };
    require('electron').ipcRenderer.send('update-widget-config', widgetId, newConfig);
    alert('ServerHoster configuration saved!');
}

function buildGenericSetupPanel(widget) {
    return `
        <h4>⚙ Basic Setup</h4>
        <p class="setup-description">This widget does not require specific setup. Use the Settings button for advanced JSON configuration.</p>
    `;
}



// Receive data from Main
ipcRenderer.on('dashboard-data', (event, data) => {
    widgetsData = data.widgets;
    launchOnBootCheckbox.checked = data.launchOnBoot;
    renderWidgets();
});

// Request initial data
ipcRenderer.send('request-dashboard-data');
