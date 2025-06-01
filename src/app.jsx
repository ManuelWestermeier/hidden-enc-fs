import React, { useState } from 'react';
import { encryptData, decryptData, sha256 } from './crypto-utils';

export default function App() {
  const [folderHandle, setFolderHandle] = useState(null);
  const [password, setPassword] = useState('');
  const [metadataArray, setMetadataArray] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [metadataLoaded, setMetadataLoaded] = useState(false);

  const promptForFolder = async () => {
    setErrorMsg('');
    setPassword('');
    setMetadataArray([]);
    setFolderHandle(null);
    setMetadataLoaded(false);

    try {
      const handle = await window.showDirectoryPicker();
      setFolderHandle(handle);
    } catch (e) { }
  };

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

    try {
      const dataEncHandle = await folderHandle.getFileHandle('data.enc');
      const file = await dataEncHandle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      const decryptedBuf = await decryptData(parsed, password);
      const jsonStr = new TextDecoder().decode(decryptedBuf);
      metadata = JSON.parse(jsonStr);
    } catch (e) {
      if (e.message.includes('Incorrect password')) {
        setErrorMsg(e.message);
        setLoading(false);
        return;
      }
      await writeMetadata(folderHandle, [], password);
      metadata = [];
    }

    setMetadataArray(metadata);
    setMetadataLoaded(true);
    setLoading(false);
  };

  const writeMetadata = async (dirHandle, metadata, pwd) => {
    const text = JSON.stringify(metadata);
    const encObj = await encryptData(text, pwd);
    const handle = await dirHandle.getFileHandle('data.enc', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(encObj));
    await writable.close();
  };

  const onUpload = async (evt) => {
    if (!folderHandle || !password) {
      setErrorMsg('Load metadata (folder + password) first.');
      return;
    }

    const fileList = Array.from(evt.target.files);
    if (fileList.length === 0) return;

    setLoading(true);
    let updatedMeta = [...metadataArray];

    for (const file of fileList) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      let randomID = '';
      randomBytes.forEach((b) => (randomID += b.toString(16).padStart(2, '0')));
      const composite = file.name + file.lastModified + randomID;
      const hash = await sha256(composite);
      const arrayBuffer = await file.arrayBuffer();
      const encObj = await encryptData(arrayBuffer, password);
      const fHandle = await folderHandle.getFileHandle(`${hash}.enc`, { create: true });
      const writable = await fHandle.createWritable();
      await writable.write(JSON.stringify(encObj));
      await writable.close();
      updatedMeta.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        date: new Date(file.lastModified || Date.now()).toISOString(),
        hash: hash,
      });
    }

    await writeMetadata(folderHandle, updatedMeta, password);
    setMetadataArray(updatedMeta);
    setLoading(false);
    evt.target.value = '';
  };

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
    } catch (e) {
      setErrorMsg('Failed to decrypt/download file. Possibly wrong password or missing file.');
    }
    setLoading(false);
  };

  const onDelete = async (entry) => {
    if (!folderHandle || !password) {
      setErrorMsg('No folder or password.');
      return;
    }

    const confirmDel = window.confirm(`Delete "${entry.name}" permanently?`);
    if (!confirmDel) return;

    setLoading(true);
    try {
      await folderHandle.removeEntry(`${entry.hash}.enc`);
      const filtered = metadataArray.filter((m) => m.hash !== entry.hash);
      await writeMetadata(folderHandle, filtered, password);
      setMetadataArray(filtered);
    } catch (e) {
      setErrorMsg('Failed to delete file or update metadata.');
    }
    setLoading(false);
  };

  if (!folderHandle) {
    return (
      <div>
        <h1>HIDDEN FS</h1>
        <p>Select (or create) a folder to store encrypted files:</p>
        <button onClick={promptForFolder}>Select Folder</button>
        {errorMsg && <p>{errorMsg}</p>}
      </div>
    );
  }

  if (!metadataLoaded && !loading) {
    return (
      <div>
        <h1>HIDDEN FS</h1>
        <p>Folder selected. Enter your password to load (or initialize) metadata:</p>
        <div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={loadOrInitMetadata}>Load Metadata</button>
        </div>
        {errorMsg && <p>{errorMsg}</p>}
        {loading && <p>Loading…</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>HIDDEN FS</h1>
      {errorMsg && <p>{errorMsg}</p>}
      <div>
        <label>
          Upload new file(s):
          <input type="file" multiple onChange={onUpload} />
        </label>
        {loading && <span>Processing…</span>}
      </div>
      <div>
        {metadataArray.map((entry, idx) => (
          <div key={idx}>
            <h2>{entry.name}</h2>
            <p>
              {entry.type || 'application/octet-stream'} ―{' '}
              {new Date(entry.date).toLocaleString()}
            </p>
            <div>
              <button onClick={() => onDownload(entry)}>Download</button>
              <button onClick={() => onDelete(entry)}>Delete</button>
            </div>
          </div>
        ))}
        {metadataArray.length === 0 && <p>No files uploaded yet.</p>}
      </div>
    </div>
  );
}
