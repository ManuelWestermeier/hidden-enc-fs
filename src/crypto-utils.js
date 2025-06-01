// src/crypto-utils.js

// ───────────────────────────────────────────────────────────────────────────────
//  Helper functions for:
//   • deriveKey(password, salt)       → AES-GCM CryptoKey
//   • encryptData(data, password)     → { salt, iv, data } (all base64 strings)
//   • decryptData(encObject, password)→ ArrayBuffer (raw decrypted bytes)
//   • sha256(str)                     → hex‐string SHA-256 hash
// ───────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Convert an ArrayBuffer → base64 string
 */
export function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Convert a base64 string → ArrayBuffer
 */
export function base64ToBuffer(base64) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        arr[i] = bytes.charCodeAt(i);
    }
    return arr.buffer;
}

/**
 * Derive an AES-256-GCM key from a raw password + salt (PBKDF2 + SHA-512).
 * @param {string} password    — raw password
 * @param {ArrayBuffer} salt   — 16-byte salt
 * @param {Array} keyUsage     — e.g. ['encrypt','decrypt']
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt, keyUsage = ['encrypt', 'decrypt']) {
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
            hash: 'SHA-512',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        keyUsage
    );
}

/**
 * Encrypt either a string or an ArrayBuffer under AES-256-GCM.
 * @param { string | ArrayBuffer } data       — if string → UTF-8; if ArrayBuffer → raw bytes
 * @param { string } password                 — user’s password
 * @returns { Promise<{ salt: string, iv: string, data: string }> }
 *
 *   • salt, iv, data are all base64-encoded strings.
 *   • salt = 16 random bytes; iv = 12 random bytes.
 */
export async function encryptData(data, password) {
    // 1) Generate salt & iv
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 2) Derive AES key
    const key = await deriveKey(password, salt, ['encrypt']);

    // 3) Prepare plaintext bytes
    let plaintext;
    if (typeof data === 'string') {
        plaintext = encoder.encode(data);
    } else {
        plaintext = data;
    }

    // 4) Encrypt
    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        plaintext
    );

    return {
        salt: bufferToBase64(salt.buffer),
        iv: bufferToBase64(iv.buffer),
        data: bufferToBase64(cipherBuffer),
    };
}

/**
 * Decrypts a previously‐encrypted object (with encryptData).
 * @param { { salt: string, iv: string, data: string } } encObject
 * @param { string } password
 * @returns { Promise<ArrayBuffer> } — raw decrypted bytes
 */
export async function decryptData(encObject, password) {
    // 1) Base64 → ArrayBuffer
    const salt = base64ToBuffer(encObject.salt);
    const iv = base64ToBuffer(encObject.iv);
    const data = base64ToBuffer(encObject.data);

    // 2) Derive key
    const key = await deriveKey(password, salt, ['decrypt']);

    // 3) Decrypt
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
}

/**
 * Compute SHA-256 on a UTF-8 string, return lowercase hex string.
 * @param {string} str
 * @returns {Promise<string>} — e.g. "a3f5…"
 */
export async function sha256(str) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
