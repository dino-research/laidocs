import { useParams } from "react-router-dom";

export default function DocumentEditor() {
  const { id } = useParams();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Document Editor</h1>
      <p className="text-gray-400">
        Editing document: {id ?? "unknown"}
      </p>
    </div>
  );
}
