import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { apiUploadStream, UploadStageEvent } from "../lib/api-upload";
import { useFolderContext } from "./FolderContext";

export interface PendingUpload {
  /** Temporary client-side key (not the doc_id yet) */
  clientId: string;
  /** Original filename shown while pending */
  filename: string;
  /** Current stage label */
  stage: UploadStageEvent["stage"];
  /** Populated once "saved" event arrives */
  docId?: string;
  docTitle?: string;
  docFolder?: string;
  error?: string;
}

interface UploadContextValue {
  pendingUploads: PendingUpload[];
  startUpload: (file: File, folder: string) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const counterRef = useRef(0);
  const { triggerRefreshDocs, triggerRefreshFolders } = useFolderContext();

  const startUpload = useCallback(
    (file: File, folder: string) => {
      const clientId = `upload-${++counterRef.current}`;

      // Add pending entry immediately
      setPendingUploads((prev) => [
        ...prev,
        { clientId, filename: file.name, stage: "uploading" },
      ]);

      const updateStage = (update: Partial<PendingUpload>) => {
        setPendingUploads((prev) =>
          prev.map((u) => (u.clientId === clientId ? { ...u, ...update } : u))
        );
      };

      apiUploadStream(file, folder, (event) => {
        if (event.stage === "saved") {
          updateStage({
            stage: "saved",
            docId: event.id,
            docTitle: event.title,
            docFolder: event.folder,
          });
          // Refresh document list and folders so new doc appears
          triggerRefreshDocs();
          triggerRefreshFolders();
          // Remove from pending list after short delay so user sees "saved ✓"
          setTimeout(() => {
            setPendingUploads((prev) => prev.filter((u) => u.clientId !== clientId));
          }, 2000);
        } else if (event.stage === "error") {
          updateStage({ stage: "error", error: event.message });
          // Remove error item after longer delay
          setTimeout(() => {
            setPendingUploads((prev) => prev.filter((u) => u.clientId !== clientId));
          }, 5000);
        } else {
          updateStage({ stage: event.stage });
        }
      }).catch((err) => {
        updateStage({ stage: "error", error: err instanceof Error ? err.message : "Upload failed" });
        setTimeout(() => {
          setPendingUploads((prev) => prev.filter((u) => u.clientId !== clientId));
        }, 5000);
      });
    },
    [triggerRefreshDocs, triggerRefreshFolders]
  );

  return (
    <UploadContext.Provider value={{ pendingUploads, startUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
