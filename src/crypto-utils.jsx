//
// Provides:
//   • sha256(string) → Promise<string>    (hex digest of UTF-8 string)
//   • encryptData(plaintext, password) → Promise<{ salt, iv, data }>
//   • decryptData({ salt, iv, data }, password) → Promise<ArrayBuffer>
//       - sanitizeFilename
//
// AES-GCM with 96-bit IV, 128-bit tag. PBKDF2 with 100k iterations (SHA-256).

// Convert ArrayBuffer → Base64
function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Convert Base64 → ArrayBuffer
function base64ToBuffer(b64) {
    const binary = window.atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// SHA-256 of a UTF-8 string → hex string
export async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // Convert to hex
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Derive a CryptoKey from password + salt (PBKDF2 with 100k iterations, SHA-256; derive 256-bit key for AES-GCM)
async function deriveKey(password, saltBuffer) {
    const encoder = new TextEncoder();
    const passKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: 100000,
            hash: 'SHA-256',
        },
        passKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * encryptData( plaintext, password ) → Promise<{ salt, iv, data }>
 *
 * • If plaintext is a string, it will be UTF-8 encoded before encryption.
 * • Returns an object with:
 *     • salt: Base64-encoded 16-byte salt
 *     • iv:   Base64-encoded 12-byte IV
 *     • data: Base64-encoded ciphertext (AES-GCM, 128-bit tag appended)
 */
export async function encryptData(plaintext, password) {
    // 1) Generate 16-byte random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    // 2) Derive a key
    const key = await deriveKey(password, salt.buffer);
    // 3) Generate 12-byte IV for AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 4) Prepare plaintext buffer
    let plainBuf;
    if (typeof plaintext === 'string') {
        plainBuf = new TextEncoder().encode(plaintext);
    } else if (plaintext instanceof ArrayBuffer) {
        plainBuf = new Uint8Array(plaintext);
    } else if (plaintext.buffer instanceof ArrayBuffer) {
        // In case caller passes a TypedArray
        plainBuf = new Uint8Array(plaintext.buffer);
    } else {
        throw new Error('encryptData: unsupported plaintext type');
    }

    // 5) Encrypt
    const cipherBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        plainBuf
    );

    return {
        salt: bufferToBase64(salt.buffer),
        iv: bufferToBase64(iv.buffer),
        data: bufferToBase64(cipherBuffer),
    };
}

/**
 * decryptData( { salt, iv, data }, password ) → Promise<ArrayBuffer>
 *
 * • salt, iv, data are Base64 strings
 * • Returns the decrypted ArrayBuffer; caller can TextDecoder(...) if needed.
 */
export async function decryptData(encObj, password) {
    const { salt, iv, data } = encObj;

    // 1) Convert Base64 → ArrayBuffers
    const saltBuf = base64ToBuffer(salt);
    const ivBuf = base64ToBuffer(iv);
    const cipherBuf = base64ToBuffer(data);

    // 2) Derive same key from password + salt
    const key = await deriveKey(password, saltBuf);

    // 3) Decrypt
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: ivBuf,
            },
            key,
            cipherBuf
        );
    } catch (e) {
        throw new Error('Incorrect password or corrupt data');
    }

    return plainBuf;
}

export function sanitizeFilename(name) {
    const dotIndex = name.lastIndexOf('.');
    const base = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex >= 0 ? name.slice(dotIndex) : '';
    const kebab = base
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')
        .toLowerCase();
    return `${kebab}${ext.toLowerCase()}`;
}