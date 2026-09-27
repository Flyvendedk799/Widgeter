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

        // Setup button - only for widgets that need setup
        const needsSetup = widget.id.includes('github-prs');
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
        }
        
        widgetListEl.appendChild(card);
    });
}

// Widget-specific setup panel builders
function buildSetupPanel(widget) {
    if (widget.id.includes('github-prs')) {
        return buildGitHubSetupPanel(widget);
    }
    return '<p style="color: #a6adc8;">No setup needed for this widget.</p>';
}

function buildGitHubSetupPanel(widget) {
    const token = widget.config?.github_token || '';
    const repo = widget.config?.github_repo || '';
    
    return `
        <h4>🔑 GitHub Connection</h4>
        <p class="setup-description">Connect your GitHub account to view and manage pull requests directly from this widget.</p>
        <div class="form-group">
            <label>Personal Access Token</label>
            <input type="password" id="setup-token-${widget.id}" value="${token}" placeholder="ghp_xxxxxxxxxxxx" />
            <div class="hint">Requires <strong>repo</strong> scope. <a href="https://github.com/settings/tokens/new?scopes=repo&description=Widgeter" onclick="require('electron').shell.openExternal(this.href); return false;">Create token →</a></div>
        </div>
        <div class="form-group">
            <label>Repository</label>
            <input type="text" id="setup-repo-${widget.id}" value="${repo}" placeholder="owner/repo (e.g. facebook/react)" />
        </div>
        <div id="setup-result-${widget.id}"></div>
        <div class="setup-actions">
            <button class="btn" style="background-color: #45475a; color: #cdd6f4;" onclick="testGitHubConnection('${widget.id}')">Test Connection</button>
            <button class="btn" onclick="saveGitHubSetup('${widget.id}')">💾 Save</button>
            ${token ? '<button class="btn" style="background-color: #f38ba8;" onclick="clearGitHubSetup(\'' + widget.id + '\')">Disconnect</button>' : ''}
        </div>
    `;
}

function testGitHubConnection(widgetId) {
    const https = require('https');
    const token = document.getElementById(`setup-token-${widgetId}`).value.trim();
    const repo = document.getElementById(`setup-repo-${widgetId}`).value.trim();
    const resultEl = document.getElementById(`setup-result-${widgetId}`);
    
    if (!token || !repo) {
        resultEl.className = 'test-result error';
        resultEl.innerText = 'Both token and repository are required.';
        return;
    }
    
    resultEl.className = 'test-result';
    resultEl.style.color = '#f9e2af';
    resultEl.innerText = 'Testing connection...';
    
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${repo}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Widgeter',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    };
    
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                try {
                    const repoData = JSON.parse(data);
                    resultEl.className = 'test-result success';
                    resultEl.innerText = `✓ Connected to ${repoData.full_name} (${repoData.open_issues_count} open issues)`;
                } catch {
                    resultEl.className = 'test-result success';
                    resultEl.innerText = '✓ Connection successful';
                }
            } else {
                try {
                    const errData = JSON.parse(data);
                    resultEl.className = 'test-result error';
                    resultEl.innerText = `✗ ${errData.message || 'HTTP ' + res.statusCode}`;
                } catch {
                    resultEl.className = 'test-result error';
                    resultEl.innerText = `✗ HTTP ${res.statusCode}`;
                }
            }
        });
    });
    req.on('error', (err) => {
        resultEl.className = 'test-result error';
        resultEl.innerText = `✗ ${err.message}`;
    });
    req.end();
}

function saveGitHubSetup(widgetId) {
    const token = document.getElementById(`setup-token-${widgetId}`).value.trim();
    const repo = document.getElementById(`setup-repo-${widgetId}`).value.trim();
    
    if (!token || !repo) {
        alert('Both token and repository are required.');
        return;
    }
    
    const widget = widgetsData.find(w => w.id === widgetId);
    const newConfig = { ...(widget?.config || {}), github_token: token, github_repo: repo };
    ipcRenderer.send('update-widget-config', widgetId, newConfig);
    
    const resultEl = document.getElementById(`setup-result-${widgetId}`);
    resultEl.className = 'test-result success';
    resultEl.innerText = '✓ Saved! The widget will reload automatically.';
}

function clearGitHubSetup(widgetId) {
    const widget = widgetsData.find(w => w.id === widgetId);
    const newConfig = { ...(widget?.config || {}) };
    delete newConfig.github_token;
    delete newConfig.github_repo;
    ipcRenderer.send('update-widget-config', widgetId, newConfig);
    
    document.getElementById(`setup-token-${widgetId}`).value = '';
    document.getElementById(`setup-repo-${widgetId}`).value = '';
    const resultEl = document.getElementById(`setup-result-${widgetId}`);
    resultEl.className = 'test-result success';
    resultEl.innerText = '✓ Disconnected. Widget will show setup prompt.';
}

// Receive data from Main
ipcRenderer.on('dashboard-data', (event, data) => {
    widgetsData = data.widgets;
    launchOnBootCheckbox.checked = data.launchOnBoot;
    renderWidgets();
});

// Request initial data
ipcRenderer.send('request-dashboard-data');
