// src/App.js
import React, { useEffect, useState } from 'react';
import {
  encryptData,
  decryptData,
  sha256
} from './crypto-utils';

/**
 * ───────────────────────────────────────────────────────────────────────────────
 *  “Hidden FS” React App (Pure JavaScript)
 *
 *  • On mount: force user to select a folder + enter password.
 *  • Checks for data.enc:
 *     – If exists → try decrypt; on invalid password or invalid JSON → ask again.
 *     – If missing → create a new, empty data.enc (“[]”).
 *  • Once metadata is loaded, let user:
 *     – Upload new files (any type). Each file:
 *         • Compute hash := sha256(filename + lastModified + randomID)
 *         • Encrypt its ArrayBuffer under AES-256-GCM.
 *         • Write <hash>.enc → folder.
 *         • Add metadata { name, type, date, hash } → metadataArray.
 *         • Overwrite data.enc with encrypted JSON(metadataArray).
 *     – View a grid of existing metadata.
 *       • Download: decrypt <hash>.enc → Blob → download link.
 *       • Delete: remove <hash>.enc and re‐write data.enc.
 *
 *  Browser requirement: Chromium‐based (needs File System Access API).
 * ───────────────────────────────────────────────────────────────────────────────
 */

export default function App() {
  // ─────────────────────────────────────────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const [folderHandle, setFolderHandle] = useState(null);
  const [password, setPassword] = useState('');
  const [metadataArray, setMetadataArray] = useState([]); // array of { name, type, date, hash }
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ─────────────────────────────────────────────────────────────────────────────
  //  1) Prompt for folder → set folderHandle
  // ─────────────────────────────────────────────────────────────────────────────
  const promptForFolder = async () => {
    setErrorMsg('');
    setPassword('');
    setMetadataArray([]);
    setFolderHandle(null);

    try {
      const handle = await window.showDirectoryPicker();
      setFolderHandle(handle);
    } catch (e) {
      console.error('Folder selection cancelled or failed', e);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  2) Once folderHandle is set, user enters password + clicks “Load Metadata”
  // ─────────────────────────────────────────────────────────────────────────────
  const loadOrInitMetadata = async () => {
    if (!folderHandle) {
      setErrorMsg('No folder selected.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter a password.');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    let metadata = [];

    // Try reading data.enc
    try {
      const dataEncHandle = await folderHandle.getFileHandle('data.enc');
      const file = await dataEncHandle.getFile();
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('data.enc is not valid JSON.');
      }

      let decryptedBytes;
      try {
        decryptedBytes = await decryptData(parsed, password);
      } catch {
        throw new Error('Incorrect password or corrupt data.enc.');
      }

      let jsonStr;
      try {
        jsonStr = new TextDecoder().decode(decryptedBytes);
        metadata = JSON.parse(jsonStr);
      } catch {
        throw new Error('Decrypted data is not valid JSON.');
      }
    } catch (e) {
      // data.enc did not exist or failed parsing/decryption
      if (e.message.startsWith('Incorrect password')) {
        setErrorMsg(e.message);
        setLoading(false);
        return;
      }
      // Create new data.enc with empty array
      await writeMetadata(folderHandle, [], password);
      metadata = [];
    }

    setMetadataArray(metadata);
    setLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  Write metadataArray → encrypted data.enc on disk
  // ─────────────────────────────────────────────────────────────────────────────
  const writeMetadata = async (dirHandle, metadata, pwd) => {
    const text = JSON.stringify(metadata);
    const encObj = await encryptData(text, pwd);
    const handle = await dirHandle.getFileHandle('data.enc', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(encObj));
    await writable.close();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  3) Upload new file(s): encrypt + write <hash>.enc + update metadata
  // ─────────────────────────────────────────────────────────────────────────────
  const onUpload = async (evt) => {
    if (!folderHandle || !password) {
      setErrorMsg('Load metadata (folder + password) first.');
      return;
    }
    const fileList = Array.from(evt.target.files);
    if (fileList.length === 0) return;
    setLoading(true);

    const updatedMeta = [...metadataArray];

    for (let file of fileList) {
      // Generate randomID (8 random bytes in hex)
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      let randomID = '';
      randomBytes.forEach((b) => {
        randomID += b.toString(16).padStart(2, '0');
      });

      // Hash = sha256(filename + lastModified + randomID)
      const composite = file.name + file.lastModified + randomID;
      const hash = await sha256(composite);

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Encrypt raw ArrayBuffer under password
      const encObj = await encryptData(arrayBuffer, password);

      // Write to disk under "<hash>.enc"
      const fHandle = await folderHandle.getFileHandle(`${hash}.enc`, { create: true });
      const writable = await fHandle.createWritable();
      await writable.write(JSON.stringify(encObj));
      await writable.close();

      // Add metadata entry
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

    // Clear file input so you can re-upload same file again if desired
    evt.target.value = '';
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  4) Download entry: decrypt <hash>.enc → ArrayBuffer → Blob → trigger download
  // ─────────────────────────────────────────────────────────────────────────────
  const onDownload = async (entry) => {
    if (!folderHandle || !password) {
      setErrorMsg('No folder or password.');
      return;
    }
    setLoading(true);

    try {
      const fHandle = await folderHandle.getFileHandle(`${entry.hash}.enc`);
      const file = await fHandle.getFile();
      const text = await file.text();
      let encObj;
      try {
        encObj = JSON.parse(text);
      } catch {
        throw new Error('Encrypted file is not valid JSON.');
      }

      const decryptedBuf = await decryptData(encObj, password);
      const blob = new Blob([decryptedBuf], { type: entry.type });
      const url = URL.createObjectURL(blob);

      // Programmatically click <a> to download
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to decrypt/download file. Possibly wrong password or missing file.');
    }

    setLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  5) Delete entry: remove <hash>.enc + update data.enc
  // ─────────────────────────────────────────────────────────────────────────────
  const onDelete = async (entry) => {
    if (!folderHandle || !password) {
      setErrorMsg('No folder or password.');
      return;
    }
    const confirmDel = window.confirm(`Delete "${entry.name}" permanently?`);
    if (!confirmDel) return;

    setLoading(true);

    try {
      // Remove the encrypted file
      await folderHandle.removeEntry(`${entry.hash}.enc`);

      // Filter metadata
      const filtered = metadataArray.filter((m) => m.hash !== entry.hash);

      // Write updated metadata
      await writeMetadata(folderHandle, filtered, password);
      setMetadataArray(filtered);
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to delete file or update metadata.');
    }

    setLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER LOGIC
  // ─────────────────────────────────────────────────────────────────────────────

  // 1) If no folder selected yet
  if (!folderHandle) {
    return (
      <div style={{ padding: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>HIDDEN FS</h1>
        <p>Select (or create) a folder to store encrypted files:</p>
        <button onClick={promptForFolder}>Select Folder</button>
        {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
      </div>
    );
  }

  // 2) Folder selected, but metadata not yet loaded
  if (metadataArray.length === 0 && !loading) {
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

  // 3) Metadata loaded (possibly empty). Show upload + grid.
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
