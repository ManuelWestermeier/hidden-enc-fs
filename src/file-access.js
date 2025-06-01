// file-access.js

export async function selectDirectory() {
    try {
        const handle = await window.showDirectoryPicker();
        return handle;
    } catch (err) {
        console.error('Directory access cancelled or failed:', err);
        return null;
    }
}

export async function readAllFilesFromDir(dirHandle) {
    const files = [];

    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            const content = await file.text();
            files.push({ name, content, handle });
        }
    }

    return files;
}

export async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return file.text();
}

export async function deleteFile(dirHandle, fileName) {
    try {
        await dirHandle.removeEntry(fileName);
        return true;
    } catch (err) {
        console.error(`Failed to delete file "${fileName}":`, err);
        return false;
    }
}