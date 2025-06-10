import { useContext } from "react";
import { AppContext } from "../context/app-provider";
import { encryptData, sha256, sanitizeFilename } from "../crypto-utils";

export default function FileUpload() {
  const {
    folderHandle,
    password,
    metadataArray,
    setMetadataArray,
    setErrorMsg,
    setLoading,
  } = useContext(AppContext);

  const writeMetadata = async (data) => {
    const enc = await encryptData(JSON.stringify(data), password);
    const handle = await folderHandle.getFileHandle("data.enc", {
      create: true,
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(enc));
    await writable.close();
  };

  const onUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !folderHandle || !password) {
      setErrorMsg("Load metadata first.");
      return;
    }

    setLoading(true);
    const updatedMeta = [...metadataArray];

    for (const file of files) {
      try {
        const id =
          [...crypto.getRandomValues(new Uint8Array(8))]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("") + Date.now();
        const formattedName = sanitizeFilename(file.name);
        const composite = formattedName + file.lastModified + id;
        const hash = await sha256(composite);
        const encrypted = await encryptData(await file.arrayBuffer(), password);

        let permission = await folderHandle.queryPermission({
          mode: "readwrite",
        });
        if (permission !== "granted") {
          permission = await folderHandle.requestPermission({
            mode: "readwrite",
          });
        }

        if (permission !== "granted") {
          throw new Error("Please allow read & write access to continue.");
        }

        const handle = await folderHandle.getFileHandle(`${hash}.enc`, {
          create: true,
        });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(encrypted));
        await writable.close();

        updatedMeta.unshift({
          name: formattedName,
          type: file.type || "application/octet-stream",
          date: new Date(file.lastModified || Date.now()).toISOString(),
          hash,
        });
      } catch (error) {
        setErrorMsg("error:" + error);
      }
    }

    try {
      await writeMetadata(updatedMeta);
      setMetadataArray(updatedMeta);
      setLoading(false);
      e.target.value = "";
    } catch (error) {
      setErrorMsg("error:" + error);
    }
  };

  document.body.ondragover = (e) => {
    e.preventDefault(); // damit Drop funktioniert
    document.body.classList.add("draging");
  };

  document.body.ondragleave = (e) => {
    // Nur entfernen, wenn die Maus wirklich den Body verlässt,
    // nicht wenn sie z.B. auf ein Kind-Element geht.
    if (e.target === document.body) {
      document.body.classList.remove("draging");
    }
  };

  document.body.ondragend = document.body.ondragleave;

  document.body.ondrop = (e) => {
    e.preventDefault();
    document.body.classList.remove("draging");

    if (e.dataTransfer?.files) {
      onUpload({ target: { files: e.dataTransfer.files } });
    }
  };

  return (
    <div className="file-upload">
      <label>
        <button
          style={{ width: "calc(100% - 30px)" }}
          className="btn btn-large"
          onClick={() => document.getElementById("upload-file-picker").click()}
        >
          Upload file(s)
        </button>
        <input
          style={{ display: "none" }}
          id="upload-file-picker"
          type="file"
          multiple
          onChange={onUpload}
        />
      </label>
    </div>
  );
}
