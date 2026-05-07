# Hướng dẫn sử dụng Ứng dụng (LaiDocs) - Bắt đầu nhanh

Chào mừng bạn đến với LaiDocs! Tài liệu này sẽ hướng dẫn bạn các bước cơ bản để làm quen và sử dụng ứng dụng một cách hiệu quả, từ việc cấu hình AI đến việc tự động tải tài liệu và trò chuyện với chúng.

## Bước 1: Cấu hình AI/LLM lần đầu

Để ứng dụng có thể xử lý ngữ nghĩa và trả lời câu hỏi của bạn, bước đầu tiên là thiết lập cấu hình LLM (Large Language Model).
- Vui lòng mở phần **Settings** (Cài đặt).
- Cấu hình API Key (bạn có thể sử dụng OpenAI, Anthropic, hoặc cấu hình Local LLM tuỳ thuộc vào nhu cầu).

![Cài đặt LLM](./images/0-llm-settings.png)

## Bước 2: Chuẩn bị không gian làm việc (Tạo Folder)

LaiDocs lưu trữ tài liệu trong các thư mục giúp bạn dễ dàng quản lý theo từng dự án.
- Hãy nhấp vào biểu tượng tạo thư mục mới ở thanh Sidebar.
- Nhập tên thư mục mới, ví dụ: `Demo-Project`.

![Bước tạo Folder](./images/1-create-folder.png)

## Bước 3: Nạp tài liệu có sẵn (Upload Document)

Bạn có thể tải lên các tài liệu có sẵn từ máy tính của mình vào thư mục vừa tạo.
- Chọn thư mục `Demo-Project` vừa tạo ở thanh Sidebar.
- Nhấn nút **Upload**, chọn file tài liệu mẫu (ví dụ: `tescases/sample-data.pdf`) từ máy tính.
- Đợi hệ thống tự động tải lên và xử lý nội dung.

![Nhấn nút Upload](./images/2-upload-btn.png)

![Tài liệu đã được xử lý](./images/3-document-ready.png)

## Bước 4: Thu thập dữ liệu từ Internet (Crawl Web)

Không chỉ hỗ trợ tài liệu cục bộ, LaiDocs còn có khả năng tự động tải và lập chỉ mục nội dung từ các trang web.
- Vẫn đang chọn thư mục `Demo-Project`, nhấn nút **Crawl URL**.
- Nhập đường dẫn bạn muốn thu thập (ví dụ: `https://github.com/VectifyAI/PageIndex`) và xác nhận.

![Nhập URL cần Crawl](./images/4-crawl-url.png)

![Nội dung Web tải về](./images/5-crawl-success.png)

## Bước 5: Trò chuyện và khai thác dữ liệu (Chat)

Bây giờ bạn đã sẵn sàng để "hỏi đáp" với kho tri thức của mình.
- Chuyển sang giao diện **Chat**.
- Chọn các tài liệu (cả file PDF và nội dung web vừa nạp) làm bối cảnh (Context).
- Bắt đầu đặt câu hỏi, ví dụ: "Tóm tắt nội dung chính của PageIndex" để AI trả lời dựa trên chính xác những tài liệu đó.

![Chọn ngữ cảnh](./images/6-select-context.png)

![Kết quả chat](./images/7-chat-result.png)
