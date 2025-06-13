import React, { useContext, useRef, useState } from "react";
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

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recordingType, setRecordingType] = useState(null); // 'audio' | 'video'
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);

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
    const arrayBuffer = await blob.arrayBuffer();
    const id =
      [...crypto.getRandomValues(new Uint8Array(8))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("") + Date.now();
    const composite = sanitizeFilename(filename) + blob.size + id;
    const hash = await sha256(composite);
    const encrypted = await encryptData(arrayBuffer, password);

    let permission = await folderHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await folderHandle.requestPermission({ mode: "readwrite" });
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

    return {
      name: sanitizeFilename(filename),
      type: type || blob.type,
      date: new Date().toISOString(),
      hash,
    };
  };

  const onUpload = async (files) => {
    if (!files.length || !folderHandle || !password) {
      setErrorMsg("Load metadata first.");
      return;
    }
    setLoading(true);
    const updatedMeta = [...metadataArray];
    try {
      for (const file of files) {
        const meta = await saveFile(file, file.name, file.type);
        updatedMeta.unshift(meta);
      }
      await writeMetadata(updatedMeta);
      setMetadataArray(updatedMeta);
    } catch (error) {
      setErrorMsg("error:" + error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilePicker = (e) => onUpload(Array.from(e.target.files));

  const startRecording = async (type) => {
    if (stream) return;
    try {
      const constraints =
        type === "photo"
          ? { video: { facingMode: "environment" } }
          : type === "video"
          ? { video: true, audio: true }
          : { audio: true };
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      setStream(mediaStream);

      if (type === "photo") {
        const videoTrack = mediaStream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(videoTrack);
        const blob = await imageCapture.takePhoto();
        await onUpload([
          new File([blob], `photo_${Date.now()}.jpg`, { type: blob.type }),
        ]);
        videoTrack.stop();
        setStream(null);
        return;
      }

      videoRef.current.srcObject = mediaStream;
      videoRef.current.play();
      const recorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = recorder;
      setRecordingType(type);
      recorder.ondataavailable = (e) =>
        setChunks((prev) => prev.concat(e.data));
      recorder.start();
    } catch (err) {
      setErrorMsg("Recording failed: " + err.message);
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.onstop = async () => {
      const blob = new Blob(chunks, {
        type: recordingType === "audio" ? "audio/webm" : "video/webm",
      });
      const ext = recordingType === "audio" ? "webm" : "webm";
      await onUpload([
        new File([blob], `${recordingType}_${Date.now()}.${ext}`, {
          type: blob.type,
        }),
      ]);
      stream.getTracks().forEach((t) => t.stop());
      setChunks([]);
      setStream(null);
      setRecordingType(null);
    };
    recorder.stop();
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
    <div className="file-upload space-y-4">
      <div className="flex space-x-2">
        <button
          onClick={() => handleFilePicker({ target: { files: [] } })}
          className="btn"
        >
          Choose File(s)
        </button>
        <input
          type="file"
          multiple
          style={{ display: "none" }}
          id="upload-file-picker"
          onChange={handleFilePicker}
        />
      </div>
      <div className="flex space-x-2">
        <button
          disabled={stream}
          onClick={() => startRecording("audio")}
          className="btn"
        >
          Record Audio
        </button>
        <button
          disabled={stream}
          onClick={() => startRecording("video")}
          className="btn"
        >
          Record Video
        </button>
        <button
          disabled={stream}
          onClick={() => startRecording("photo")}
          className="btn"
        >
          Take Photo
        </button>
        {recordingType && (
          <button onClick={stopRecording} className="btn btn-danger">
            Stop {recordingType}
          </button>
        )}
      </div>
      {stream && recordingType === "video" && (
        <video
          ref={videoRef}
          className="w-full h-auto mt-4 rounded"
          controls
          muted
        />
      )}
    </div>
  );
}
