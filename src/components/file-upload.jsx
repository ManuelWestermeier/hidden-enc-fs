import React, { useContext, useRef, useState, useEffect } from "react";
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
  const dropRef = useRef(null);

  // Video stream to video element
  useEffect(() => {
    if (stream && recordingType === "video" && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    }
  }, [stream, recordingType]);

  // Drag-and-drop handlers
  useEffect(() => {
    const preventDefault = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDragOver = (e) => {
      preventDefault(e);
      dropRef.current.classList.add("dragging");
    };
    const onDragLeave = (e) => {
      preventDefault(e);
      if (e.target === dropRef.current)
        dropRef.current.classList.remove("dragging");
    };
    const onDrop = (e) => {
      preventDefault(e);
      dropRef.current.classList.remove("dragging");
      if (e.dataTransfer.files) {
        onUpload(Array.from(e.dataTransfer.files));
      }
    };
    const node = dropRef.current;
    if (node) {
      node.addEventListener("dragover", onDragOver);
      node.addEventListener("dragleave", onDragLeave);
      node.addEventListener("drop", onDrop);
    }
    return () => {
      if (node) {
        node.removeEventListener("dragover", onDragOver);
        node.removeEventListener("dragleave", onDragLeave);
        node.removeEventListener("drop", onDrop);
      }
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
      setRecordingType(type);
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
        setRecordingType(null);
        return;
      }

      const recorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = recorder;
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

  return (
    <div
      ref={dropRef}
      className="file-upload space-y-4 border-2 border-dashed p-4 rounded relative"
    >
      <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
        Ziehe Dateien hierher oder wähle sie aus
      </div>
      <div className="flex space-x-2 relative z-10">
        <button
          onClick={() => document.getElementById("upload-file-picker").click()}
          className="btn"
        >
          Choose File(s)
        </button>
        <input
          id="upload-file-picker"
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFilePicker}
        />
      </div>
      <div className="flex space-x-2 relative z-10">
        <button
          disabled={!!stream}
          onClick={() => startRecording("audio")}
          className="btn"
        >
          Record Audio
        </button>
        <button
          disabled={!!stream}
          onClick={() => startRecording("video")}
          className="btn"
        >
          Record Video
        </button>
        <button
          disabled={!!stream}
          onClick={() => startRecording("photo")}
          className="btn"
        >
          Take Photo
        </button>
        {stream && recordingType !== "photo" && (
          <button onClick={stopRecording} className="btn btn-danger">
            Stop {recordingType}
          </button>
        )}
      </div>

      {/* Fullscreen overlay for recording */}
      {stream && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50">
          {recordingType === "video" && (
            <video
              ref={videoRef}
              className="max-w-full max-h-full rounded"
              muted
            />
          )}
          <div className="mt-4 space-x-4">
            {recordingType === "photo" ? null : (
              <button
                onClick={() =>
                  mediaRecorderRef.current?.state === "recording"
                    ? stopRecording()
                    : startRecording(recordingType)
                }
                className="btn btn-large"
              >
                {mediaRecorderRef.current?.state === "recording"
                  ? "Stop"
                  : "Start"}{" "}
                Recording
              </button>
            )}
            {recordingType === "photo" && (
              <button
                onClick={() => startRecording("photo")}
                className="btn btn-large"
              >
                Take Photo
              </button>
            )}
            <button
              onClick={() => {
                stream.getTracks().forEach((t) => t.stop());
                setStream(null);
                setRecordingType(null);
                setChunks([]);
              }}
              className="btn btn-secondary"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
