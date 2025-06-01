import React, { useContext } from 'react';
import { AppProvider, AppContext } from './context/app-provider';
import Header from './components/header';
import FolderPicker from './components/folder-picker';
import PasswordPrompt from './components/password-prompt';
import FileUpload from './components/file-upload';
import FileEntry from './components/file-entry';
import './styles.css';

function AppContent() {
  const { folderHandle, metadataLoaded, metadataArray, errorMsg } = useContext(AppContext);

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
          <div className="file-list">
            {metadataArray.length === 0 ? (
              <p>No files uploaded yet.</p>
            ) : (
              metadataArray.map((entry, idx) => (
                <FileEntry key={idx} entry={entry} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
