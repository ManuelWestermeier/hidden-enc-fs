// crypto-utils.js

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}

async function hashString(str, algo = 'SHA-256') {
    const hashBuffer = await crypto.subtle.digest(algo, encoder.encode(str));
    return bufferToBase64(hashBuffer);
}

async function hashBlob(blob, algo = 'SHA-256') {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest(algo, buffer);
    return bufferToBase64(hashBuffer);
}

async function deriveKey(password, salt, keyUsage = ['encrypt', 'decrypt']) {
    const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-512'
        },
        baseKey,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        keyUsage
    );
}

async function encryptData(data, password) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const key = await deriveKey(password, salt);
    const encoded = typeof data === 'string' ? encoder.encode(data) : data;

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    return {
        cipherText: bufferToBase64(cipherBuffer),
        iv: bufferToBase64(iv),
        salt: bufferToBase64(salt)
    };
}

async function decryptData({ cipherText, iv, salt }, password) {
    const key = await deriveKey(password, base64ToBuffer(salt));
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(iv) },
        key,
        base64ToBuffer(cipherText)
    );
    return decoder.decode(decrypted);
}

async function encryptBlob(blob, password) {
    const arrayBuffer = await blob.arrayBuffer();
    return encryptData(arrayBuffer, password);
}

async function decryptBlob(encData, password) {
    const key = await deriveKey(password, base64ToBuffer(encData.salt));
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(encData.iv) },
        key,
        base64ToBuffer(encData.cipherText)
    );
    return new Blob([decrypted]);
}

export {
    hashString,
    hashBlob,
    encryptData,
    decryptData,
    encryptBlob,
    decryptBlob
};
