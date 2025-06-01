import { useState } from 'react';

import "./crypto-utils.js"
import "./file-access.js"

export default function App() {
  const [folderHandle, setFolderHandle] = useState(null);
  const [password, setPassword] = useState('');
  const [files, setFiles] = useState([]);
  const [sortKey, setSortKey] = useState('name');
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');

  const saveMetadata = async (metadataArray) => {
    const encrypted = await encryptAESGCM(JSON.stringify(metadataArray), password);
    const dataEncHandle = await folderHandle.getFileHandle('data.enc', { create: true });
    const writable = await dataEncHandle.createWritable();
    await writable.write(JSON.stringify(encrypted));
    await writable.close();
  };

  const loadFiles = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setFolderHandle(handle);
      let metadataArray = [];

      try {
        const dataEncHandle = await handle.getFileHandle('data.enc');
        const file = await dataEncHandle.getFile();
        const jsonEnc = JSON.parse(await file.text());
        const decryptedText = await decryptAESGCM(jsonEnc, password);
        metadataArray = JSON.parse(decryptedText);
      } catch (err) {
        await saveMetadata([]); // Initialize if missing
        alert('No data.enc found. Initialized new encrypted metadata file.');
      }

      const filesWithData = [];
      for (const meta of metadataArray) {
        const hash = await sha256(meta.name);
        try {
          const fileHandle = await handle.getFileHandle(`${hash}.enc`);
          const file = await fileHandle.getFile();
          const enc = JSON.parse(await file.text());
          const content = await decryptAESGCM(enc, password);
          filesWithData.push({ ...meta, content });
        } catch { }
      }
      setFiles(filesWithData);
    } catch (err) {
      console.error(err);
      alert('Failed to load or decrypt files.');
    }
  };

  const createFile = async () => {
    if (!folderHandle || !newFileName || !newFileContent) return;
    const newMeta = { name: newFileName, type: 'text/plain', date: new Date().toISOString() };
    const hash = await sha256(newFileName);
    const encrypted = await encryptAESGCM(newFileContent, password);
    const fileHandle = await folderHandle.getFileHandle(`${hash}.enc`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(encrypted));
    await writable.close();
    const updatedFiles = [...files, { ...newMeta, content: newFileContent }];
    setFiles(updatedFiles);
    await saveMetadata(updatedFiles.map(({ name, type, date }) => ({ name, type, date })));
    setNewFileName('');
    setNewFileContent('');
  };

  const sortedFiles = [...files].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'type') return a.type.localeCompare(b.type);
    if (sortKey === 'date') return new Date(a.date) - new Date(b.date);
    return 0;
  });

  return (
    <div style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button onClick={loadFiles}>Select Folder</button>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="name">Name</option>
          <option value="type">Type</option>
          <option value="date">Date</option>
        </select>
      </div>

      {folderHandle && (
        <div style={{ marginBottom: '1rem' }}>
          <h2>Create New File</h2>
          <input
            type="text"
            placeholder="File name"
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
          />
          <textarea
            placeholder="File content"
            value={newFileContent}
            onChange={e => setNewFileContent(e.target.value)}
            rows={4}
            style={{ width: '100%', marginTop: '0.5rem' }}
          />
          <button onClick={createFile}>Create File</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {sortedFiles.map((file, idx) => (
          <div key={idx} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '600' }}>{file.name}</h2>
            <p style={{ fontSize: '0.85rem', color: '#666' }}>{file.type} — {new Date(file.date).toLocaleString()}</p>
            <pre style={{ marginTop: '0.5rem', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{file.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
