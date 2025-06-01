# 🔒 Hidden FS

**[https://hidden-fs.duckdns.org](https://hidden-fs.duckdns.org)**  
A private, browser-based file system with strong encryption — no cloud, no tracking, no accounts. Your files stay local, secure, and fully under your control.

---

## 🚀 Features

- 🔐 **AES-GCM encryption** (password-based, with SHA-512 derived keys)
- 📁 **Local file storage** via the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- 🧠 **Encrypted metadata index** stored as `data.enc`
- 🔁 **File upload, creation, viewing, and deletion** all encrypted
- 🗃️ Files stored under a **randomized hash**, unlinkable to their original names
- 🧭 Works **offline** and as a **Progressive Web App (PWA)**
- 🧩 100% client-side — no servers, no internet required after install

---

## 🧪 How It Works

1. On launch, you are prompted to **select a folder**.
2. You provide a **password**, used to encrypt/decrypt your metadata (`data.enc`).
3. If `data.enc` exists and decryption succeeds, the app loads your files.
4. If not, a new encrypted index is created.
5. Files are stored encrypted using a hash of `filename + lastModified + randomId`.

All data is stored within the folder you select. Nothing leaves your machine.

---

## 📸 Screenshots

![screenshot1](https://hidden-fs.duckdns.org/screenshots/hiddenfs-preview.png)

---

## 📦 Install as PWA

Hidden FS can be installed on desktop or mobile:

- Open [hidden-fs.duckdns.org](https://hidden-fs.duckdns.org) in a modern browser
- Accept the install prompt (or use “Install App” from the browser menu)

---

## ⚠️ Limitations

- Requires a Chromium-based browser (e.g. Chrome, Edge) for File System Access API
- All data is lost if the selected folder is moved or deleted outside the app
- Password **must be remembered** – there’s no recovery

---

## 🛠️ Development

```bash
npm install
npm run dev
```
