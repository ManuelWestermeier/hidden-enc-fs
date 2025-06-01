import { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/app-provider';
import { decryptData, encryptData } from '../crypto-utils';

export default function FileEntry({ entry }) {
    const { folderHandle, password, metadataArray, setMetadataArray, setErrorMsg, setLoading } = useContext(AppContext);
    const [previewUrl, setPreviewUrl] = useState("");
    const [isPreviewable, setIsPreviewable] = useState(false);

    useEffect(() => {
        setIsPreviewable(
            entry.type.startsWith("image") ||
            entry.type.startsWith("text") ||
            entry.type.startsWith("video") ||
            entry.type.startsWith("audio") ||
            entry.type.startsWith("application/pdf")
        );
    }, [entry.type]);

    const writeMetadata = async (data) => {
        const enc = await encryptData(JSON.stringify(data), password);
        const handle = await folderHandle.getFileHandle('data.enc', { create: true });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(enc));
        await writable.close();
    };

    const onDownload = async () => {
        try {
            const file = await (await folderHandle.getFileHandle(`${entry.hash}.enc`)).getFile();
            const encObj = JSON.parse(await file.text());
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
        } catch {
            setErrorMsg('Failed to decrypt/download.');
        }
    };

    const onView = async () => {
        try {
            const file = await (await folderHandle.getFileHandle(`${entry.hash}.enc`)).getFile();
            const encObj = JSON.parse(await file.text());
            const decryptedBuf = await decryptData(encObj, password);
            const blob = new Blob([decryptedBuf], { type: entry.type });
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
        } catch {
            setErrorMsg('Failed to decrypt/view.');
        }
    };

    const onDelete = async () => {
        if (!window.confirm(`Delete "${entry.name}" permanently?`)) return;

        try {
            await folderHandle.removeEntry(`${entry.hash}.enc`);
            const updated = metadataArray.filter(m => m.hash !== entry.hash);
            await writeMetadata(updated);
            setMetadataArray(updated);
        } catch {
            setErrorMsg('Failed to delete.');
        }
    };

    return (
        <div className="file-entry card">
            <h2>{entry.name}</h2>
            <p>{entry.type} ― {new Date(entry.date).toLocaleString()}</p>
            {previewUrl && isPreviewable && (
                <div className="preview-container">
                    {entry.type.startsWith('image') && <img className='content' src={previewUrl} alt={entry.name} />}
                    {entry.type.startsWith('video') && <video className='content' controls src={previewUrl} alt={entry.name} />}
                    {entry.type.startsWith('audio') && <audio className='content' controls src={previewUrl} alt={entry.name} />}

                    {entry.type === 'application/pdf' && <iframe className='content' src={previewUrl} title="PDF Preview" />}
                    {entry.type.startsWith('text') && <iframe className='content' src={previewUrl} title="Text Preview" />}
                </div>
            )}
            {isPreviewable && <button className="btn" onClick={onView}>View</button>}
            <button className="btn" onClick={onDownload}>Download</button>
            <button className="btn danger" onClick={onDelete}>Delete</button>
        </div>
    );
}
