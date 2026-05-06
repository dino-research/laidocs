# PageIndex Implementation Review

**Review Date:** May 6, 2026
**Commit:** `fa280d4` to `HEAD`
**Goal:** Review the transition from a traditional vector-based RAG pipeline to a hierarchical Tree-Indexing architecture (PageIndex).

> [!NOTE]
> Khái quát: Việc thay thế Vector DB (LanceDB) bằng Tree Index (dựa trên thuật toán của PageIndex) là một quyết định kiến trúc rất sáng suốt. Việc chuyển sang dùng LLM structure-reasoning giúp pipeline nhẹ nhàng, deterministic và dễ debug hơn nhiều. Cấu trúc cây được build cực kỳ chuẩn.

## 🔴 Blockers (Must Fix)

*(Không có bug logic nào nghiêm trọng hoặc làm sập hệ thống ngay lập tức. Code chạy ổn!)*

## 🟡 Suggestions (Should Fix)

### 1. Rủi ro Rate Limit (429 Too Many Requests) khi tóm tắt hàng loạt

> [!CAUTION]
> Bắn quá nhiều request đồng thời lên LLM provider có thể khiến API block IP hoặc block tài khoản của bạn.

**Vị trí:** `backend/services/tree_index.py` (hàm `generate_summaries`)

**Vấn đề:** 
Hiện tại, bạn đang dùng `asyncio.gather(*tasks)` để tóm tắt *tất cả* các node trong document cùng một lúc. Nếu user upload một file markdown dài có 50 headings, hệ thống sẽ gọi 50 requests đồng thời lên API.

**Giải pháp:** 
Sử dụng `asyncio.Semaphore` để giới hạn số lượng request gọi đồng thời (ví dụ: tối đa 5 request cùng lúc):

```python
sem = asyncio.Semaphore(5)

async def _safe_generate(t):
    async with sem:
        return await _generate_summary(t, settings)

# Thay vì tasks.append(_generate_summary(...))
# Hãy dùng: tasks.append(_safe_generate(node_text))
```

### 2. Anti-pattern khi dùng FastAPI BackgroundTasks

> [!WARNING]
> Sử dụng `asyncio.run` trong một FastAPI endpoint / background task sẽ tạo ra luồng event loop riêng lẻ, gây tốn tài nguyên và dễ sinh lỗi ngầm.

**Vị trí:** `backend/api/documents.py`

**Vấn đề:** 
Code đang wrap coroutine bằng `asyncio.run` khi đẩy vào background tasks: `background_tasks.add_task(asyncio.run, _build_and_store_tree(...))`. `BackgroundTasks` của FastAPI đã hỗ trợ native cho `async def`. Khi dùng `asyncio.run`, FastAPI coi nó là sync function, đẩy nó vào một worker thread, và tự tạo ra một event loop mới hoàn toàn bên trong thread đó. 

**Giải pháp:** 
Truyền trực tiếp hàm async vào `add_task` để nó được chạy trực tiếp trên main event loop:

```python
# Sửa từ:
background_tasks.add_task(asyncio.run, _build_and_store_tree(meta.doc_id, markdown))

# Thành:
background_tasks.add_task(_build_and_store_tree, meta.doc_id, markdown)
```

### 3. Logic Fallback làm giảm chất lượng câu trả lời RAG

> [!TIP]
> Cho phép LLM "từ chối trả lời" nếu không tìm thấy dữ liệu liên quan sẽ giúp giảm thiểu rủi ro sinh ra "ảo giác" (hallucination).

**Vị trí:** `backend/services/rag.py` (hàm `_get_context`)

**Vấn đề:** 
Nếu bước 1 (LLM Select Nodes) trả về array rỗng `[]` (ví dụ: câu hỏi nằm ngoài phạm vi tài liệu), code sẽ hiểu là *chưa lấy được context* và rơi vào block fallback: Cắt 12,000 ký tự đầu tiên của document nhét vào prompt. Điều này ép LLM sinh câu trả lời dựa trên phần mở đầu dù nó không liên quan.

**Giải pháp:** 
Phân biệt giữa "lỗi parse JSON" (dùng fallback) và "LLM chủ động trả về mảng rỗng" (return rỗng):

```python
node_ids = _select_nodes_sync(tree_index, question, self._settings)

# Nếu mảng thực sự rỗng do LLM không chọn được node nào
if isinstance(node_ids, list) and len(node_ids) == 0:
    return "" 
```

## 💭 Nits (Nice to Have)

### 1. Tăng cường độ an toàn khi parse JSON 
Trong hàm `_select_nodes_sync`, regex `re.search(r'\[.*?\]', raw, re.DOTALL)` xử lý text khá tốt. Nhưng đôi khi LLM có thể trả về array chứa object (ví dụ: `[{"node_id": "0001"}]`) thay vì string. Khi pass xuống hàm `find_nodes_by_ids`, dòng `id_set = set(node_ids)` sẽ throw `TypeError: unhashable type: 'dict'`.

**Gợi ý:** Ép kiểu/filter nhẹ sau khi parse:
```python
parsed = json.loads(match.group())
return [str(nid) for nid in parsed if isinstance(nid, (str, int))]
```

### 2. Tránh Local Imports lặp lại
Trong `api/documents.py`, các đoạn `import json as _j` hoặc `import asyncio as _asyncio` nằm ngay bên trong body hàm. Đưa các thư viện chuẩn (`json`, `asyncio`) lên top-level imports đầu file sẽ giúp code dễ theo dõi và chuẩn PEP8 hơn.

---

**Kết luận:** Quá trình chuyển đổi cấu trúc đã hoàn tất với chất lượng code logic cốt lõi rất tốt (parsing tree stack, cleanup). Khi có thời gian, bạn có thể implement các Suggestions để tăng độ mượt mà khi người dùng tương tác!
