// src/App.js
import React, { useEffect, useState } from 'react';
import { encryptData, decryptData, sha256 } from './crypto-utils';

export default function App() {
  const [folderHandle, setFolderHandle] = useState(null);
  const [password, setPassword] = useState('');
  const [metadataArray, setMetadataArray] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const promptForFolder = async () => {
    console.log('[promptForFolder] Prompting user to select a folder');
    setErrorMsg('');
    setPassword('');
    setMetadataArray([]);
    setFolderHandle(null);

    try {
      const handle = await window.showDirectoryPicker();
      console.log('[promptForFolder] Folder selected:', handle);
      setFolderHandle(handle);
    } catch (e) {
      console.error('[promptForFolder] Folder selection failed:', e);
    }
  };

  const loadOrInitMetadata = async () => {
    console.log('[loadOrInitMetadata] Starting...');
    if (!folderHandle) {
      console.warn('[loadOrInitMetadata] No folder selected');
      setErrorMsg('No folder selected.');
      return;
    }
    if (!password) {
      console.warn('[loadOrInitMetadata] No password provided');
      setErrorMsg('Please enter a password.');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    let metadata = [];

    try {
      const dataEncHandle = await folderHandle.getFileHandle('data.enc');
      const file = await dataEncHandle.getFile();
      const text = await file.text();
      console.log('[loadOrInitMetadata] data.enc read:', text);

      let parsed = JSON.parse(text);
      const decryptedBytes = await decryptData(parsed, password);
      const jsonStr = new TextDecoder().decode(decryptedBytes);
      metadata = JSON.parse(jsonStr);
      console.log('[loadOrInitMetadata] Metadata loaded:', metadata);
    } catch (e) {
      console.warn('[loadOrInitMetadata] Failed to read/decrypt data.enc:', e.message);
      if (e.message.startsWith('Incorrect password')) {
        setErrorMsg(e.message);
        setLoading(false);
        return;
      }
      console.log('[loadOrInitMetadata] Creating new empty data.enc');
      await writeMetadata(folderHandle, [], password);
      metadata = [];
    }

    setMetadataArray(metadata);
    setLoading(false);
    console.log('[loadOrInitMetadata] Done');
  };

  const writeMetadata = async (dirHandle, metadata, pwd) => {
    console.log('[writeMetadata] Writing metadata:', metadata);
    const text = JSON.stringify(metadata);
    const encObj = await encryptData(text, pwd);
    const handle = await dirHandle.getFileHandle('data.enc', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(encObj));
    await writable.close();
    console.log('[writeMetadata] Metadata written to data.enc');
  };

  const onUpload = async (evt) => {
    console.log('[onUpload] Uploading files...');
    if (!folderHandle || !password) {
      setErrorMsg('Load metadata (folder + password) first.');
      console.warn('[onUpload] No folder or password');
      return;
    }

    const fileList = Array.from(evt.target.files);
    if (fileList.length === 0) {
      console.log('[onUpload] No files selected');
      return;
    }

    setLoading(true);
    const updatedMeta = [...metadataArray];

    for (let file of fileList) {
      console.log('[onUpload] Processing file:', file.name);

      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      let randomID = '';
      randomBytes.forEach((b) => (randomID += b.toString(16).padStart(2, '0')));

      const composite = file.name + file.lastModified + randomID;
      const hash = await sha256(composite);
      console.log(`[onUpload] Generated hash for ${file.name}:`, hash);

      const arrayBuffer = await file.arrayBuffer();
      const encObj = await encryptData(arrayBuffer, password);

      const fHandle = await folderHandle.getFileHandle(`${hash}.enc`, { create: true });
      const writable = await fHandle.createWritable();
      await writable.write(JSON.stringify(encObj));
      await writable.close();
      console.log(`[onUpload] Encrypted file written: ${hash}.enc`);

      updatedMeta.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        date: new Date(file.lastModified || Date.now()).toISOString(),
        hash,
      });
    }

    await writeMetadata(folderHandle, updatedMeta, password);
    setMetadataArray(updatedMeta);
    setLoading(false);
    evt.target.value = '';
    console.log('[onUpload] Upload complete');
  };

  const onDownload = async (entry) => {
    console.log('[onDownload] Downloading entry:', entry);
    if (!folderHandle || !password) {
      setErrorMsg('No folder or password.');
      return;
    }

    setLoading(true);
    try {
      const fHandle = await folderHandle.getFileHandle(`${entry.hash}.enc`);
      const file = await fHandle.getFile();
      const text = await file.text();
      const encObj = JSON.parse(text);

      const decryptedBuf = await decryptData(encObj, password);
      const blob = new Blob([decryptedBuf], { type: entry.type });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      console.log('[onDownload] Download triggered for', entry.name);
    } catch (e) {
      console.error('[onDownload] Failed:', e);
      setErrorMsg('Failed to decrypt/download file. Possibly wrong password or missing file.');
    }

    setLoading(false);
  };

  const onDelete = async (entry) => {
    console.log('[onDelete] Attempting to delete:', entry);
    if (!folderHandle || !password) {
      setErrorMsg('No folder or password.');
      return;
    }

    const confirmDel = window.confirm(`Delete "${entry.name}" permanently?`);
    if (!confirmDel) {
      console.log('[onDelete] Deletion cancelled');
      return;
    }

    setLoading(true);
    try {
      await folderHandle.removeEntry(`${entry.hash}.enc`);
      const filtered = metadataArray.filter((m) => m.hash !== entry.hash);
      await writeMetadata(folderHandle, filtered, password);
      setMetadataArray(filtered);
      console.log('[onDelete] Deleted', entry.name);
    } catch (e) {
      console.error('[onDelete] Error:', e);
      setErrorMsg('Failed to delete file or update metadata.');
    }

    setLoading(false);
  };

  // Render logic (unchanged except for logs)
  if (!folderHandle) {
    console.log('[render] No folder selected');
    return (
      <div style={{ padding: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
        <p>Select (or create) a folder to store encrypted files:</p>
        <button onClick={promptForFolder}>Select Folder</button>
        {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
      </div>
    );
  }

  if (metadataArray.length === 0 && !loading) {
    console.log('[render] Folder selected, awaiting metadata load');
    return (
      <div style={{ padding: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
        <p>Folder selected. Enter your password to load (or initialize) metadata:</p>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginRight: '0.5rem' }}
          />
          <button onClick={loadOrInitMetadata}>Load Metadata</button>
        </div>
        {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
        {loading && <p>Loading…</p>}
      </div>
    );
  }

  console.log('[render] Metadata loaded, rendering file grid');
  return (
    <div style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      <div style={{ margin: '1rem 0' }}>
        <label>
          Upload new file(s):
          <input
            type="file"
            multiple
            onChange={onUpload}
            style={{ marginLeft: '0.5rem' }}
          />
        </label>
        {loading && <span style={{ marginLeft: '1rem' }}>Processing…</span>}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        {metadataArray.map((entry, idx) => (
          <div
            key={idx}
            style={{
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '0.75rem',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{entry.name}</h2>
            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0.25rem 0' }}>
              {entry.type || 'application/octet-stream'} ―{' '}
              {new Date(entry.date).toLocaleString()}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={() => onDownload(entry)}>Download</button>
              <button onClick={() => onDelete(entry)}>Delete</button>
            </div>
          </div>
        ))}
        {metadataArray.length === 0 && (
          <p style={{ fontStyle: 'italic' }}>No files uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
