const { ipcRenderer } = require('electron');

const API_URL = 'http://85.190.100.23:3055'; // Fallback to direct IP since CF Tunnel Ingress cannot be configured
const listEl = document.getElementById('widget-list');
const uploadBtn = document.getElementById('upload-btn');
const uploadFile = document.getElementById('upload-file');

async function loadWidgets() {
    try {
        const res = await fetch(`${API_URL}/widgets`);
        const widgets = await res.json();
        
        listEl.innerHTML = '';
        if (widgets.length === 0) {
            listEl.innerHTML = '<p>No widgets found in the marketplace.</p>';
            return;
        }

        widgets.forEach(w => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${w.name}</h3>
                <div class="author">By ${w.author}</div>
                <p>${w.description || 'No description provided.'}</p>
                <button class="btn" onclick="downloadWidget(${w.id}, '${w.name.replace(/'/g, "\\'")}')">Download & Install</button>
            `;
            listEl.appendChild(card);
        });
    } catch (e) {
        listEl.innerHTML = `<p style="color: red;">Failed to load marketplace: ${e.message}</p>`;
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
            alert(`Installed ${name}!`);
        } else {
            alert('Widget content not found.');
        }
    } catch(e) {
        alert('Download failed: ' + e.message);
    }
};

uploadBtn.addEventListener('click', () => {
    uploadFile.click();
});

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
            headers: {
                'Authorization': `Bearer ${auth}`
            },
            body: formData
        });
        
        const data = await res.json();
        if (data.success) {
            alert('Upload successful!');
            loadWidgets();
        } else {
            alert('Upload failed: ' + data.error);
        }
    } catch(e) {
        alert('Upload failed: ' + e.message);
    }
});

loadWidgets();
