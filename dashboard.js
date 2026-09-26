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

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    for (const f of e.dataTransfer.files) {
        if (f.name.endsWith('.widget') || f.name.endsWith('.json')) {
            ipcRenderer.send('install-widget', f.path);
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
        
        actions.appendChild(settingsBtn);
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
        
        widgetListEl.appendChild(card);
    });
}

// Receive data from Main
ipcRenderer.on('dashboard-data', (event, data) => {
    widgetsData = data.widgets;
    launchOnBootCheckbox.checked = data.launchOnBoot;
    renderWidgets();
});

// Request initial data
ipcRenderer.send('request-dashboard-data');
