// components/folder-picker.js
import React, { useContext } from 'react';
import { AppContext } from '../context/app-provider';

export default function FolderPicker() {
    const { setErrorMsg, setPassword, setMetadataArray, setFolderHandle, setMetadataLoaded } = useContext(AppContext);

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

    return (
        <div className="folder-picker">
            <p>Select (or create) a folder to store encrypted files:</p>
            <button className="btn" onClick={promptForFolder}>Select Folder</button>
        </div>
    );
}
