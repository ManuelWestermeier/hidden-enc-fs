import { useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppContext } from "../context/app-provider";
import { decryptData, encryptData } from "../crypto-utils";

const isPreviewableType = (type) => {
  return (
    type.startsWith("image") ||
    type.startsWith("text") ||
    type.startsWith("video") ||
    type.startsWith("audio") ||
    type === "application/pdf"
  );
};

export default function FileEntry({ entry }) {
  const {
    folderHandle,
    password,
    metadataArray,
    setMetadataArray,
    setErrorMsg,
  } = useContext(AppContext);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewable, setIsPreviewable] = useState(false);
  const entryRef = useRef(null); // Ref for the container element
  const hasViewedRef = useRef(false); // To avoid repeated viewing on multiple intersections

  useEffect(() => {
    setIsPreviewable(isPreviewableType(entry.type));
  }, [entry.type]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const writeMetadata = useCallback(
    async (data) => {
      try {
        const encrypted = await encryptData(JSON.stringify(data), password);
        const handle = await folderHandle?.getFileHandle("data.enc", {
          create: true,
        });
        if (!handle) throw new Error("Folder handle not available");
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(encrypted));
        await writable.close();
      } catch (error) {
        console.error("Error writing metadata:", error);
        setErrorMsg("Failed to write metadata.");
      }
    },
    [folderHandle, password, setErrorMsg]
  );

  const onDownload = useCallback(async () => {
    try {
      const fileHandle = await folderHandle?.getFileHandle(`${entry.hash}.enc`);
      if (!fileHandle) throw new Error("File handle not found");
      const file = await fileHandle.getFile();
      const encObj = JSON.parse(await file.text());
      const decryptedBuf = await decryptData(encObj, password);
      const blob = new Blob([decryptedBuf], { type: entry.type });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      setErrorMsg("Failed to decrypt/download.");
    }
  }, [entry.hash, entry.name, entry.type, folderHandle, password, setErrorMsg]);

  const onView = useCallback(async () => {
    try {
      const fileHandle = await folderHandle?.getFileHandle(`${entry.hash}.enc`);
      if (!fileHandle) throw new Error("File handle not found");
      const file = await fileHandle.getFile();
      const encObj = JSON.parse(await file.text());
      const decryptedBuf = await decryptData(encObj, password);
      const blob = new Blob([decryptedBuf], { type: entry.type });
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (error) {
      console.error("View error:", error);
      setErrorMsg("Failed to decrypt/view.");
    }
  }, [entry.hash, entry.type, folderHandle, password, previewUrl, setErrorMsg]);

  const onDelete = useCallback(async () => {
    if (!window.confirm(`Delete "${entry.name}" permanently?`)) return;

    try {
      await folderHandle?.removeEntry(`${entry.hash}.enc`);
      const updatedMetadata = metadataArray.filter(
        (m) => m.hash !== entry.hash
      );
      await writeMetadata(updatedMetadata);
      setMetadataArray(updatedMetadata);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setErrorMsg("Failed to delete.");
    }
  }, [
    entry.hash,
    entry.name,
    folderHandle,
    metadataArray,
    setMetadataArray,
    writeMetadata,
    previewUrl,
    setErrorMsg,
  ]);

  // Intersection Observer to trigger onView automatically when in viewport
  useEffect(() => {
    if (!isPreviewable || !entryRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entryObs) => {
          if (entryObs.isIntersecting && !hasViewedRef.current) {
            hasViewedRef.current = true; // prevent multiple triggers
            onView();
          }
        });
      },
      { threshold: 0.5 } // 50% of the item visible triggers the event
    );

    observer.observe(entryRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isPreviewable, onView]);

  return (
    <div
      ref={entryRef}
      className={`file-entry card${entry.view ? "" : " hidden"}`}
    >
      <h2
        style={{
          whiteSpace: "normal", // allow wrapping (default is normal anyway)
          wordBreak: "break-word", // break long words if needed
          overflowWrap: "break-word", // ensure wrapping for long strings
        }}
      >
        {entry.name}
      </h2>
      <p>
        {entry.type} ― {new Date(entry.date).toLocaleString()}
      </p>

      {previewUrl && isPreviewable && (
        <div
          className="preview-container"
          onClick={(e) => e.target.requestFullscreen()}
        >
          {entry.type.startsWith("image") && (
            <img
              className="content"
              tabIndex={-1}
              src={previewUrl}
              alt={entry.name}
            />
          )}
          {entry.type.startsWith("video") && (
            <video
              className="content"
              tabIndex={-1}
              controls
              src={previewUrl}
            />
          )}
          {entry.type.startsWith("audio") && (
            <audio
              className="content"
              tabIndex={-1}
              controls
              src={previewUrl}
            />
          )}
          {entry.type === "application/pdf" && (
            <iframe
              className="content"
              tabIndex={-1}
              src={previewUrl}
              title="PDF Preview"
            />
          )}
          {entry.type.startsWith("text") && (
            <iframe
              className="content"
              tabIndex={-1}
              src={previewUrl}
              title="Text Preview"
            />
          )}
        </div>
      )}

      {/* Hide "View" button because preview opens automatically */}
      <button className="btn" onClick={onDownload}>
        Download
      </button>
      <button className="btn danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
