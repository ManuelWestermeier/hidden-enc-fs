// context/app-provider.js
import React, { createContext, useState } from 'react';

export const AppContext = createContext();

export function AppProvider({ children }) {
    const [folderHandle, setFolderHandle] = useState(null);
    const [password, setPassword] = useState('');
    const [metadataArray, setMetadataArray] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [metadataLoaded, setMetadataLoaded] = useState(false);

    return (
        <AppContext.Provider value={{
            folderHandle, setFolderHandle,
            password, setPassword,
            metadataArray, setMetadataArray,
            loading, setLoading,
            errorMsg, setErrorMsg,
            metadataLoaded, setMetadataLoaded
        }}>
            {children}
        </AppContext.Provider>
    );
}
