import { useContext, useEffect, useState } from "react";
import { AppProvider, AppContext } from "./context/app-provider";
import Header from "./components/header";
import FolderPicker from "./components/folder-picker";
import PasswordPrompt from "./components/password-prompt";
import FileUpload from "./components/file-upload";
import FileEntry from "./components/file-entry";
import "./styles.css";
import Search from "./components/search";

function AppContent() {
  const { folderHandle, metadataLoaded, metadataArray, errorMsg } =
    useContext(AppContext);

  return (
    <div className="app">
      <Header />
      {errorMsg && <p className="error">{errorMsg}</p>}

      {!folderHandle ? (
        <FolderPicker />
      ) : !metadataLoaded ? (
        <PasswordPrompt />
      ) : (
        <>
          <FileUpload />
          <Search />
          <div className="file-list">
            {metadataArray.length === 0 ? (
              <p>No files.</p>
            ) : (
              metadataArray.map((entry) => (
                <FileEntry key={entry.name} entry={entry} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args) => {
      setLastError(args.map((a) => a?.toString?.() ?? "").join(" "));
      originalConsoleError(...args);
    };

    const handleWindowError = (msg, source, lineno, colno) => {
      setLastError(`${msg} at ${source}:${lineno}:${colno}`);
    };
    window.addEventListener("error", handleWindowError);

    return () => {
      console.error = originalConsoleError;
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  return (
    <AppProvider>
      <AppContent />
      {lastError && (
        <div
          style={{
            position: "fixed",
            bottom: 10,
            color: "red",
            backgroundColor: "#fff0f0",
            padding: "8px",
            border: "1px solid red",
          }}
        >
          {lastError}
        </div>
      )}
    </AppProvider>
  );
}
