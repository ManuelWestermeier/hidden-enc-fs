import { useContext } from 'react';
import { AppProvider, AppContext } from './context/app-provider';
import Header from './components/header';
import FolderPicker from './components/folder-picker';
import PasswordPrompt from './components/password-prompt';
import FileUpload from './components/file-upload';
import FileEntry from './components/file-entry';
import './styles.css';
import Search from './components/search';

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
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
