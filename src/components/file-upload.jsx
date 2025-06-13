import React, { useContext, useRef, useState, useEffect } from "react";
import { AppContext } from "../context/app-provider";
import { encryptData, sha256, sanitizeFilename } from "../crypto-utils";
import Webcam from "react-webcam";

export default function FileUpload() {
  const {
    folderHandle,
    password,
    metadataArray,
    setMetadataArray,
    setErrorMsg,
    setLoading,
  } = useContext(AppContext);

  const webcamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recordingType, setRecordingType] = useState(null); // 'audio' | 'video' | 'photo'
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  // Drag & Drop auf body
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    const onDragOver = (e) => {
      prevent(e);
      document.body.classList.add("draging");
    };
    const onDragLeave = (e) => {
      prevent(e);
      document.body.classList.remove("draging");
    };
    const onDrop = (e) => {
      prevent(e);
      document.body.classList.remove("draging");
      if (e.dataTransfer.files) onUpload(Array.from(e.dataTransfer.files));
    };
    document.body.addEventListener("dragover", onDragOver);
    document.body.addEventListener("dragleave", onDragLeave);
    document.body.addEventListener("drop", onDrop);
    return () => {
      document.body.removeEventListener("dragover", onDragOver);
      document.body.removeEventListener("dragleave", onDragLeave);
      document.body.removeEventListener("drop", onDrop);
    };
  }, []);

  const writeMetadata = async (data) => {
    const enc = await encryptData(JSON.stringify(data), password);
    const handle = await folderHandle.getFileHandle("data.enc", {
      create: true,
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(enc));
    await writable.close();
  };

  const saveFile = async (blob, filename, type) => {
    const buffer = await blob.arrayBuffer();
    const id =
      [...crypto.getRandomValues(new Uint8Array(8))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("") + Date.now();
    const composite = sanitizeFilename(filename) + blob.size + id;
    const hash = await sha256(composite);
    const enc = await encryptData(buffer, password);
    let perm = await folderHandle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted")
      perm = await folderHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") throw new Error("Allow read/write");
    const handle = await folderHandle.getFileHandle(`${hash}.enc`, {
      create: true,
    });
    const w = await handle.createWritable();
    await w.write(JSON.stringify(enc));
    await w.close();
    return {
      name: sanitizeFilename(filename),
      type: type || blob.type,
      date: new Date().toISOString(),
      hash,
    };
  };

  const onUpload = async (files) => {
    if (!files.length || !folderHandle || !password)
      return setErrorMsg("Load metadata first.");
    setLoading(true);
    const updated = [...metadataArray];
    try {
      for (const file of files) {
        const meta = await saveFile(file, file.name, file.type);
        updated.unshift(meta);
      }
      await writeMetadata(updated);
      setMetadataArray(updated);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePicker = (e) => onUpload(Array.from(e.target.files));

  const openStream = async (type) => {
    try {
      let constraints;
      if (type === "photo" || type === "video")
        constraints = {
          video: { facingMode: "environment" },
          audio: type === "video",
        };
      else constraints = { audio: true };
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(media);
      setRecordingType(type);
    } catch (e) {
      setErrorMsg("Recording failed: " + e.message);
    }
  };

  const startRecording = () => {
    if (!stream || recordingType === "photo") return;
    chunksRef.current = [];
    const options = {};
    if (
      recordingType === "audio" &&
      MediaRecorder.isTypeSupported("audio/webm")
    )
      options.mimeType = "audio/webm";
    if (recordingType === "video") {
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus"))
        options.mimeType = "video/webm;codecs=vp8,opus";
      else if (MediaRecorder.isTypeSupported("video/webm"))
        options.mimeType = "video/webm";
    }
    const rec = new MediaRecorder(stream, options);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstart = () => setIsRecording(true);
    rec.onstop = async () => {
      setIsRecording(false);
      const blob = new Blob(chunksRef.current, { type: rec.mimeType });
      const ext = recordingType === "audio" ? ".webm" : ".webm";
      await onUpload([
        new File([blob], `${recordingType}_${Date.now()}${ext}`, {
          type: blob.type,
        }),
      ]);
    };
    recorderRef.current = rec;
    rec.start();
  };

  const stopRecording = () => {
    if (recordingType === "photo") {
      const img = webcamRef.current.getScreenshot();
      const byteString = atob(img.split(",")[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++)
        ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: "image/png" });
      onUpload([
        new File([blob], `photo_${Date.now()}.png`, { type: "image/png" }),
      ]);
    } else if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
    }
    if (!isRecording) {
      // cancel
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      setRecordingType(null);
    }
  };

  document.body.style.overflow = stream ? "hidden" : "auto";

  return (
    <>
      <button
        className="btn"
        onClick={() => document.getElementById("picker").click()}
      >
        Upload
      </button>
      <input
        id="picker"
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handlePicker}
      />
      <button
        className="btn"
        disabled={!!stream}
        onClick={() => openStream("audio")}
      >
        Record Audio
      </button>
      <button
        className="btn"
        disabled={!!stream}
        onClick={() => openStream("video")}
      >
        Record Video
      </button>
      <button
        className="btn"
        disabled={!!stream}
        onClick={() => openStream("photo")}
      >
        Take Photo
      </button>

      {stream && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "calc(100dvh - 2rem)",
            borderRadius: "1rem",
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          {(recordingType === "video" || recordingType === "photo") && (
            <Webcam
              audio={recordingType === "video"}
              ref={webcamRef}
              screenshotFormat="image/png"
              width={640}
              height={480}
            />
          )}
          <div style={{ marginTop: 20, textAlign: "center" }}>
            {recordingType !== "photo" && (
              <>
                <button
                  className="btn"
                  onClick={isRecording ? stopRecording : startRecording}
                  style={{ margin: 5 }}
                >
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </button>
                {isRecording && (
                  <div style={{ color: "white", marginTop: 10 }}>
                    Recording...
                  </div>
                )}
              </>
            )}
            {recordingType === "photo" && (
              <>
                <button
                  className="btn"
                  onClick={stopRecording}
                  style={{ margin: 5 }}
                >
                  Take Photo
                </button>
                <button
                  className="btn"
                  onClick={stopRecording}
                  style={{ margin: 5 }}
                >
                  Cancel
                </button>
              </>
            )}
            <button
              className="btn"
              onClick={stopRecording}
              style={{ margin: 5 }}
            >
              Exit
            </button>
          </div>
        </div>
      )}
    </>
  );
}
