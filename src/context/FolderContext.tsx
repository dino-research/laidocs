import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface FolderContextValue {
  activeFolder: string | null;
  setActiveFolder: (folder: string | null) => void;
  refreshFoldersKey: number;
  triggerRefreshFolders: () => void;
  refreshDocsKey: number;
  triggerRefreshDocs: () => void;
}

const FolderContext = createContext<FolderContextValue>({
  activeFolder: null,
  setActiveFolder: () => {},
  refreshFoldersKey: 0,
  triggerRefreshFolders: () => {},
  refreshDocsKey: 0,
  triggerRefreshDocs: () => {},
});

export function FolderProvider({ children }: { children: ReactNode }) {
  const [activeFolder, setActiveFolderState] = useState<string | null>(null);
  const [refreshFoldersKey, setRefreshFoldersKey] = useState(0);
  const [refreshDocsKey, setRefreshDocsKey] = useState(0);

  const setActiveFolder = useCallback((folder: string | null) => {
    setActiveFolderState(folder);
  }, []);

  const triggerRefreshFolders = useCallback(() => {
    setRefreshFoldersKey((k) => k + 1);
  }, []);

  const triggerRefreshDocs = useCallback(() => {
    setRefreshDocsKey((k) => k + 1);
  }, []);

  return (
    <FolderContext.Provider value={{ activeFolder, setActiveFolder, refreshFoldersKey, triggerRefreshFolders, refreshDocsKey, triggerRefreshDocs }}>
      {children}
    </FolderContext.Provider>
  );
}

export function useFolderContext() {
  return useContext(FolderContext);
}
