// src/App.js

import React, { useState } from 'react';
import { encryptData, decryptData, sha256 } from './crypto-utils';

export default function App() {
  const [folderHandle, setFolderHandle] = useState(null);
  const [password, setPassword] = useState('');
  const [metadataArray, setMetadataArray] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [metadataLoaded, setMetadataLoaded] = useState(false);

  // ────────────────────────────────────────────────────────────────────
  // 1) Prompt user to pick (or create) directory
  // ────────────────────────────────────────────────────────────────────
  const promptForFolder = async () => {
    console.log('[promptForFolder] Asking user for a directory handle');
    setErrorMsg('');
    setPassword('');
    setMetadataArray([]);
    setFolderHandle(null);
    setMetadataLoaded(false);

    try {
      const handle = await window.showDirectoryPicker();
      console.log('[promptForFolder] Got directory handle:', handle);
      setFolderHandle(handle);
    } catch (e) {
      console.error('[promptForFolder] Directory selection failed or cancelled', e);
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // 2) Load existing data.enc or initialize if missing
  // ────────────────────────────────────────────────────────────────────
  const loadOrInitMetadata = async () => {
    console.log('[loadOrInitMetadata] Beginning metadata load/initialization');
    if (!folderHandle) {
      console.warn('[loadOrInitMetadata] No folderHandle present');
      setErrorMsg('No folder selected.');
      return;
    }
    if (!password) {
      console.warn('[loadOrInitMetadata] No password entered');
      setErrorMsg('Please enter a password.');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    let metadata = [];

    try {
      console.log('[loadOrInitMetadata] Attempting to read "data.enc"');
      const dataEncHandle = await folderHandle.getFileHandle('data.enc');
      const file = await dataEncHandle.getFile();
      const text = await file.text();
      console.log('[loadOrInitMetadata] Read data.enc contents:', text);

      const parsed = JSON.parse(text);
      const decryptedBuf = await decryptData(parsed, password);
      const jsonStr = new TextDecoder().decode(decryptedBuf);
      metadata = JSON.parse(jsonStr);
      console.log('[loadOrInitMetadata] Successfully decrypted metadata:', metadata);
    } catch (e) {
      console.warn('[loadOrInitMetadata] Could not read/decrypt data.enc:', e.message);
      // If wrong password (decryptData throws Error('Incorrect password...')), bubble up
      if (e.message.includes('Incorrect password')) {
        setErrorMsg(e.message);
        setLoading(false);
        return;
      }
      // Otherwise, create a new empty data.enc
      console.log('[loadOrInitMetadata] Creating brand-new data.enc with empty array');
      await writeMetadata(folderHandle, [], password);
      metadata = [];
    }

    setMetadataArray(metadata);
    setMetadataLoaded(true);
    setLoading(false);
    console.log('[loadOrInitMetadata] Finished; metadataLoaded=true');
  };

  // ────────────────────────────────────────────────────────────────────
  // Write metadataArray (JS object) → encrypted "data.enc"
  // ────────────────────────────────────────────────────────────────────
  const writeMetadata = async (dirHandle, metadata, pwd) => {
    console.log('[writeMetadata] Encrypting & writing metadata:', metadata);
    const text = JSON.stringify(metadata);
    const encObj = await encryptData(text, pwd);
    const handle = await dirHandle.getFileHandle('data.enc', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(encObj));
    await writable.close();
    console.log('[writeMetadata] data.enc has been overwritten');
  };

  // ────────────────────────────────────────────────────────────────────
  // 3) Upload new file(s): encrypt each under AES-GCM → "<hash>.enc" → update metadata
  // ────────────────────────────────────────────────────────────────────
  const onUpload = async (evt) => {
    console.log('[onUpload] Triggered. Files to process:', evt.target.files);
    if (!folderHandle || !password) {
      console.warn('[onUpload] Cannot upload before folder+password are set');
      setErrorMsg('Load metadata (folder + password) first.');
      return;
    }

    const fileList = Array.from(evt.target.files);
    if (fileList.length === 0) {
      console.log('[onUpload] No files were selected');
      return;
    }

    setLoading(true);
    let updatedMeta = [...metadataArray];

    for (const file of fileList) {
      console.log('[onUpload] Processing file:', file.name);

      // Generate randomID (8 random bytes in hex)
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      let randomID = '';
      randomBytes.forEach((b) => (randomID += b.toString(16).padStart(2, '0')));

      // Compute hash = sha256(filename + lastModified + randomID)
      const composite = file.name + file.lastModified + randomID;
      const hash = await sha256(composite);
      console.log(`[onUpload] SHA256 hash for "${file.name}":`, hash);

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Encrypt the raw buffer under AES-GCM with this.password
      const encObj = await encryptData(arrayBuffer, password);

      // Write "<hash>.enc" in the folder
      const fHandle = await folderHandle.getFileHandle(`${hash}.enc`, { create: true });
      const writable = await fHandle.createWritable();
      await writable.write(JSON.stringify(encObj));
      await writable.close();
      console.log(`[onUpload] Wrote encrypted file: ${hash}.enc`);

      // Add entry to metadata
      updatedMeta.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        date: new Date(file.lastModified || Date.now()).toISOString(),
        hash: hash,
      });
    }

    // Persist updated metadata
    await writeMetadata(folderHandle, updatedMeta, password);
    setMetadataArray(updatedMeta);
    setLoading(false);

    // Clear input so same file can be re-selected if needed
    evt.target.value = '';
    console.log('[onUpload] All files processed & metadata updated');
  };

  // ────────────────────────────────────────────────────────────────────
  // 4) Download entry: decrypt "<hash>.enc" → ArrayBuffer → Blob → auto-click download
  // ────────────────────────────────────────────────────────────────────
  const onDownload = async (entry) => {
    console.log('[onDownload] Starting for entry:', entry);
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

      console.log('[onDownload] Download should have started for', entry.name);
    } catch (e) {
      console.error('[onDownload] Failed to decrypt or download:', e);
      setErrorMsg('Failed to decrypt/download file. Possibly wrong password or missing file.');
    }
    setLoading(false);
  };

  // ────────────────────────────────────────────────────────────────────
  // 5) Delete entry: remove "<hash>.enc" + update data.enc
  // ────────────────────────────────────────────────────────────────────
  const onDelete = async (entry) => {
    console.log('[onDelete] Deleting entry:', entry);
    if (!folderHandle || !password) {
      setErrorMsg('No folder or password.');
      return;
    }

    const confirmDel = window.confirm(`Delete "${entry.name}" permanently?`);
    if (!confirmDel) {
      console.log('[onDelete] User cancelled deletion');
      return;
    }

    setLoading(true);
    try {
      await folderHandle.removeEntry(`${entry.hash}.enc`);
      const filtered = metadataArray.filter((m) => m.hash !== entry.hash);
      await writeMetadata(folderHandle, filtered, password);
      setMetadataArray(filtered);
      console.log('[onDelete] Successfully deleted', entry.name);
    } catch (e) {
      console.error('[onDelete] Error during deletion:', e);
      setErrorMsg('Failed to delete file or update metadata.');
    }
    setLoading(false);
  };

  // ────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────

  // 1) If no folder has been chosen yet
  if (!folderHandle) {
    console.log('[render] No folder selected yet');
    return (
      <div style={{ padding: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
        <p>Select (or create) a folder to store encrypted files:</p>
        <button onClick={promptForFolder}>Select Folder</button>
        {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
      </div>
    );
  }

  // 2) Folder selected but metadata not yet loaded (first time)
  if (!metadataLoaded && !loading) {
    console.log('[render] Folder selected; waiting for user to enter password');
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

  // 3) Metadata loaded (maybe empty) → show upload + grid
  console.log(
    '[render] Metadata loaded (array length:',
    metadataArray.length,
    '), rendering file grid'
  );
  return (
    <div style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      {/* Upload control */}
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

      {/* Grid of existing files */}
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
