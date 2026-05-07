# User Guideline Design

## Overview
Create a comprehensive `README.md` guide in the `guideline` folder to help new users quickly get started with LaiDocs (Vectify). The guide will use a workflow-based tutorial approach, walking the user through an end-to-end journey from LLM setup to chatting with documents.

## Structure

1. **Bước 1: Cấu hình AI/LLM lần đầu**
   - Hướng dẫn mở Settings -> Cấu hình API Key (OpenAI/Anthropic/Local LLM).
   - Ảnh: `![Cài đặt LLM](./images/0-llm-settings.png)`

2. **Bước 2: Chuẩn bị không gian làm việc (Tạo Folder)**
   - Tạo thư mục mới (VD: `Demo-Project`) ở thanh Sidebar.
   - Ảnh: `![Bước tạo Folder](./images/1-create-folder.png)`

3. **Bước 3: Nạp tài liệu có sẵn (Upload Document)**
   - Tải lên file `tescases/sample-data.pdf` vào thư mục vừa tạo.
   - Ảnh: `![Nhấn nút Upload](./images/2-upload-btn.png)`, `![Tài liệu đã được xử lý](./images/3-document-ready.png)`

4. **Bước 4: Thu thập dữ liệu từ Internet (Crawl Web)**
   - Sử dụng tính năng Crawl URL `https://github.com/VectifyAI/PageIndex`.
   - Ảnh: `![Nhập URL cần Crawl](./images/4-crawl-url.png)`, `![Nội dung Web tải về](./images/5-crawl-success.png)`

5. **Bước 5: Trò chuyện và khai thác dữ liệu (Chat)**
   - Chọn bối cảnh từ các tài liệu vừa nạp và bắt đầu đặt câu hỏi cho AI.
   - Ảnh: `![Chọn ngữ cảnh](./images/6-select-context.png)`, `![Kết quả chat](./images/7-chat-result.png)`

## Implementation Notes
- Use standard Markdown formatting.
- Image placeholders will be explicitly written as `![alt-text](./images/filename.png)`.
- The user will be responsible for taking actual screenshots and saving them in the `guideline/images/` directory with the specified names.
