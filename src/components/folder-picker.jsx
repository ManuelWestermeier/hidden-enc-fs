import { useContext } from 'react';
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
            <p>
                <strong>HIDDEN FS</strong> is a secure, browser-based file manager that uses password-based AES encryption to protect your data.
                You choose a local folder, enter a password, and it decrypts or initializes a hidden <code>data.enc</code> file containing encrypted file metadata.
                Files you add—text, images, videos, or any type—are encrypted individually and saved under a hashed filename.
                You can view, upload, create, or delete files securely, with all content staying on your local device.
                If the password is incorrect or the data is invalid, you can retry or select another folder.
            </p>
            <p>
                Free, <a href="https://github.com/ManuelWestermeier/hidden-enc-fs">Open Source</a> & Ultra Secure
            </p>

            <p>Select (or create) a folder to store encrypted files:</p>
            <button className="btn btn-large" autoFocus onClick={promptForFolder}>Select Folder</button>
        </div>
    );
}
