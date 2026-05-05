import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FolderProvider } from "./context/FolderContext";
import { UploadProvider } from "./context/UploadContext";
import Layout from "./components/Layout";
import Documents from "./pages/Documents";
import DocumentEditor from "./pages/DocumentEditor";
import Search from "./pages/Search";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <FolderProvider>
        <UploadProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Documents />} />
              <Route path="doc/:id" element={<DocumentEditor />} />
              <Route path="search" element={<Search />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </UploadProvider>
      </FolderProvider>
    </BrowserRouter>
  );
}
