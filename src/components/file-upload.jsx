import { useContext } from 'react';
import { AppContext } from '../context/app-provider';
import { encryptData, sha256, sanitizeFilename } from '../crypto-utils';

export default function FileUpload() {
    const { folderHandle, password, metadataArray, setMetadataArray, setErrorMsg, setLoading } = useContext(AppContext);

    const writeMetadata = async (data) => {
        const enc = await encryptData(JSON.stringify(data), password);
        const handle = await folderHandle.getFileHandle('data.enc', { create: true });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(enc));
        await writable.close();
    };

    const onUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length || !folderHandle || !password) {
            setErrorMsg('Load metadata first.');
            return;
        }

        setLoading(true);
        const updatedMeta = [...metadataArray];

        for (const file of files) {
            const id = [...crypto.getRandomValues(new Uint8Array(8))]
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            const formattedName = sanitizeFilename(file.name);
            const composite = formattedName + file.lastModified + id;
            const hash = await sha256(composite);
            const encrypted = await encryptData(await file.arrayBuffer(), password);

            const handle = await folderHandle.getFileHandle(`${hash}.enc`, { create: true });
            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(encrypted));
            await writable.close();

            updatedMeta.push({
                name: formattedName,
                type: file.type || 'application/octet-stream',
                date: new Date(file.lastModified || Date.now()).toISOString(),
                hash,
            });
        }

        await writeMetadata(updatedMeta);
        setMetadataArray(updatedMeta);
        setLoading(false);
        e.target.value = '';
    };

    return (
        <div className="file-upload">
            <label>
                <button className='btn btn-large' onClick={() => document.getElementById("upload-file-picker").click()}>Upload file(s)</button>
                <input style={{ display: "none" }} id='upload-file-picker' type="file" multiple onChange={onUpload} />
            </label>
        </div>
    );
}
