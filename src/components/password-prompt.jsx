import React, { useContext } from 'react';
import { AppContext } from '../context/app-provider';
import { decryptData, encryptData } from '../crypto-utils';

export default function PasswordPrompt() {
    const { password, setPassword, folderHandle, setErrorMsg, setMetadataArray, setMetadataLoaded, setLoading } = useContext(AppContext);

    const loadOrInitMetadata = async (e) => {
        e.preventDefault();
        if (!folderHandle) return setErrorMsg('No folder selected.');
        if (!password) return setErrorMsg('Please enter a password.');

        setLoading(true);
        setErrorMsg('');
        let metadata = [];

        try {
            const file = await (await folderHandle.getFileHandle('data.enc')).getFile();
            const text = await file.text();
            const parsed = JSON.parse(text);
            const decryptedBuf = await decryptData(parsed, password);
            metadata = JSON.parse(new TextDecoder().decode(decryptedBuf));
        } catch (e) {
            if (e.message.includes('Incorrect password')) {
                setErrorMsg(e.message);
                setLoading(false);
                return;
            }
            // Initialize empty metadata if file not found
            const encObj = await encryptData('[]', password);
            const handle = await folderHandle.getFileHandle('data.enc', { create: true });
            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(encObj));
            await writable.close();
        }

        setMetadataArray(metadata);
        setMetadataLoaded(true);
        setLoading(false);
    };

    return (
        <form onSubmit={loadOrInitMetadata} className="password-prompt">
            <p>Enter your password to load (or initialize) metadata:</p>
            <input
                type="password"
                placeholder="Password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoFocus
            />
            <button className="btn btn-large" type='submit'>Load Metadata</button>
        </form>
    );
}
