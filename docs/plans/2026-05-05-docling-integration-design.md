# Docling Integration Design for laidocs

## Context
The current application uses `MarkItDown` for document to Markdown conversion. However, `MarkItDown` focuses on OCR and inline captioning but lacks the native capability to extract and save actual physical image files. 

The goal is to:
1. Preserve images from uploaded documents (extract and save them to disk).
2. Keep the image description right below the image in the Markdown output.
3. Integrate an LLM (from application settings) to generate descriptions and refine the final Markdown output (removing noise/garbage).
4. **Generalize support** for multiple document types beyond PDF, including DOCX, PPTX, XLSX, HTML, etc.

## Architecture & Components
We will replace `MarkItDown` with `Docling`, a powerful document understanding library that natively supports layout extraction, image cropping, and integrating VLM (Vision-Language Models) across diverse formats.

### 1. Multi-Format Pipeline Configuration
We will initialize `DocumentConverter` to handle all required formats (PDF, DOCX, PPTX, XLSX, HTML) by passing format-specific configurations inside `format_options`. 
For formats that support image extraction and VLM description (like PDF, DOCX, PPTX):
- Set `generate_picture_images = True` to extract picture bitmaps.
- Set `do_picture_description = True` and `enable_remote_services = True`.
- Configure `PictureDescriptionApiOptions` using `settings.llm` to pass the `base_url`, `model`, and API key (via headers or env vars) so Docling can send images to the OpenAI-compatible endpoint.

### 2. Custom Markdown Serializer
To achieve the exact layout of "Image followed by description" across all formats, we will create a `CustomPictureSerializer` that inherits from `docling_core`'s `MarkdownPictureSerializer`:
- **Image Saving**: During serialization, we will extract the PIL Image (`item.get_image(doc)`) and save it to the local vault directory (e.g., `<vault_path>/assets/<doc_id>_<img_index>.png`).
- **Markdown Generation**: Override the `serialize` method to yield custom markdown:
  ```markdown
  ![Image](/assets/<filename>)
  
  > **Description:** <AI_GENERATED_DESCRIPTION>
  ```

### 3. Output Refinement (Post-Processing)
After `Docling` produces the full Markdown text for any format, we will add an optional post-processing step if an LLM is configured.
- We will send the Markdown to the LLM with a system prompt: *"You are an AI assistant. Clean up this Markdown document, remove OCR noise or garbage characters, but strictly preserve the overall structure, headings, and image tags. Return only the cleaned Markdown."*

## Data Flow
1. **Upload**: User uploads a document (PDF, Word, Excel, PPT, etc.) to `POST /api/documents/upload`.
2. **Convert**: `DocumentConverter` dynamically selects the pipeline based on the file extension and initializes `Docling` with the LLM settings.
3. **Parse & Describe**: Docling parses the document, extracts layout and images, and calls the VLM API to get image descriptions (if applicable for the format).
4. **Serialize & Save Images**: The `CustomPictureSerializer` saves extracted image files to the vault's assets folder and builds the Markdown string.
5. **Refine**: The final Markdown is passed to the LLM for cleanup.
6. **Save to Vault**: The cleaned Markdown is saved, indexed in SQLite/FTS, and sent to LanceDB for RAG.

## Fallbacks & Error Handling
- If the LLM is not configured, `do_picture_description` and the post-processing refinement will be skipped.
- If the VLM API call fails (timeout/error), Docling will fallback gracefully (no description attached).
