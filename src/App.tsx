import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FolderProvider } from "./context/FolderContext";
import { UploadProvider } from "./context/UploadContext";
import Layout from "./components/Layout";
import WelcomePanel from "./pages/WelcomePanel";
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
              <Route index element={<WelcomePanel />} />
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
