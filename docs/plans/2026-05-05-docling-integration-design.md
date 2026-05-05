# Docling Integration Design for laidocs

## Context
The current application uses `MarkItDown` for document to Markdown conversion. However, `MarkItDown` focuses on OCR and inline captioning but lacks the native capability to extract and save actual physical image files. 

The goal is to:
1. Preserve images from uploaded documents (extract and save them to disk).
2. Keep the image description right below the image in the Markdown output.
3. Integrate an LLM (from application settings) to generate descriptions and refine the final Markdown output (removing noise/garbage).

## Architecture & Components
We will replace `MarkItDown` with `Docling`, a powerful document understanding library that natively supports layout extraction, image cropping, and integrating VLM (Vision-Language Models).

### 1. Docling Pipeline Configuration
We will configure `PdfPipelineOptions` (and applicable options for other formats) with:
- `generate_picture_images = True`: To extract picture bitmaps from the document.
- `do_picture_description = True`: To trigger the description process.
- `enable_remote_services = True`: To allow Docling to call external LLM APIs.
- `PictureDescriptionApiOptions`: Configured using `settings.llm` to pass the `base_url`, `model`, and API key (via headers or environment variables) so Docling can send images to the OpenAI-compatible endpoint.

### 2. Custom Markdown Serializer
To achieve the exact layout of "Image followed by description", we will create a `CustomPictureSerializer` that inherits from `docling_core`'s `MarkdownPictureSerializer`:
- **Image Saving**: During serialization, we will extract the PIL Image (`item.get_image(doc)`) and save it to the local vault directory (e.g., `<vault_path>/assets/<doc_id>_<img_index>.png`).
- **Markdown Generation**: Override the `serialize` method to yield custom markdown:
  ```markdown
  ![Image](/assets/<filename>)
  
  > **Description:** <AI_GENERATED_DESCRIPTION>
  ```

### 3. Output Refinement (Post-Processing)
Docling outputs highly structured Markdown, but OCR artifacts may still exist. 
- We will add a post-processing step: After `docling` produces the full Markdown text, we will send it to the configured LLM with a system prompt: *"You are an AI assistant. Clean up this Markdown document, remove OCR noise or garbage characters, but strictly preserve the overall structure, headings, and image tags. Return only the cleaned Markdown."*

## Data Flow
1. **Upload**: User uploads PDF to `POST /api/documents/upload`.
2. **Convert**: `DocumentConverter` initializes `Docling` with the LLM settings.
3. **Parse & Describe**: Docling parses the PDF, extracts layout and images, and calls the VLM API to get image descriptions.
4. **Serialize & Save Images**: The `CustomPictureSerializer` saves extracted image files to the vault's assets folder and builds the Markdown string.
5. **Refine**: The final Markdown is passed to the LLM for cleanup.
6. **Save to Vault**: The cleaned Markdown is saved, indexed in SQLite/FTS, and sent to LanceDB for RAG.

## Fallbacks & Error Handling
- If the LLM is not configured, `do_picture_description` and the post-processing refinement will be skipped. Docling will just extract the image and output `![Image]()`.
- If the VLM API call fails (timeout/error), Docling will fallback gracefully (no description attached).
