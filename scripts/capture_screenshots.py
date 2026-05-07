#!/usr/bin/env python3
"""Capture LAIDocs screenshots for README using Playwright headless.

Strategy: Load the app once, then navigate by clicking sidebar elements
(simulating real user interaction) instead of page.goto() for SPA routes.
"""

import asyncio
import httpx
from pathlib import Path

from playwright.async_api import async_playwright

SCREENSHOTS_DIR = Path(__file__).parent.parent / "docs" / "assets"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:5173"
API_BASE = "http://localhost:8008"


async def wait_for_backend():
    for _ in range(30):
        try:
            if httpx.get(f"{API_BASE}/api/health", timeout=2).status_code == 200:
                return True
        except Exception:
            pass
        await asyncio.sleep(1)
    return False


def get_or_create_test_doc():
    """Get existing doc or create one with rich content."""
    try:
        resp = httpx.get(f"{API_BASE}/api/documents/", timeout=5)
        docs = resp.json() if resp.status_code == 200 else []
        if docs:
            doc_id = docs[0].get("id") or docs[0].get("doc_id")
            print(f"  Using existing document: {doc_id}")
            return doc_id
    except Exception:
        pass

    try:
        resp = httpx.post(
            f"{API_BASE}/api/documents/create",
            json={"filename": "getting-started.md", "folder": "guides"},
            timeout=5,
        )
        if resp.status_code != 200:
            return None
        doc_id = resp.json().get("id")
        print(f"  Created test document: {doc_id}")

        test_content = """# Getting Started with LAIDocs

## Welcome

LAIDocs is your local AI-powered document manager. This guide will help you get the most out of it.

## Uploading Documents

You can upload files in the following formats:

- **PDF** — Full layout with OCR support
- **DOCX** — Microsoft Word documents
- **PPTX** — PowerPoint presentations
- **XLSX** — Excel spreadsheets (text + tables)
- **HTML** — Web pages saved as files

### Image Extraction

Embedded images are automatically extracted and saved as vault assets, referenced as standard Markdown `![img](/assets/...)` links.

## Web Crawling

Enter any URL and LAIDocs will convert it to clean Markdown using Crawl4AI, an intelligent web crawler that strips away ads and unnecessary clutter.

## Chat with Documents

Click the chat icon on any document to start a conversation. The AI assistant:

1. Answers **only** from the document content
2. Cites specific sections
3. Remembers context within a session
4. Supports multiple languages

### How It Works

The chat uses a **DeepAgents**-powered assistant with a **SOUL** (System of Understanding and Learning):

- **Document-grounded ONLY**: Every answer must come from the document context
- **No fabrication**: Never invents or extrapolates information
- **Tree Reasoning**: Uses hierarchical tree index for intelligent section selection

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save document |
| `Ctrl+N` | New file |
| `Escape` | Close panel |

> **Tip**: Use Ollama or LM Studio for a fully local, zero-data-leaves setup!

## Architecture

Built with Tauri v2 (Rust) + React 19 + Python FastAPI. The document conversion pipeline uses Docling for PDF/DOCX/PPTX parsing and Crawl4AI for web crawling.
"""
        httpx.put(f"{API_BASE}/api/documents/{doc_id}", json={"content": test_content}, timeout=5)
        return doc_id
    except Exception as e:
        print(f"  ❌ Error creating test doc: {e}")
        return None


async def main():
    print("📸 Capturing LAIDocs screenshots...")
    print(f"   Target: {BASE_URL}")
    print(f"   Output: {SCREENSHOTS_DIR}")
    print()

    if not await wait_for_backend():
        print("❌ Backend not ready")
        return

    doc_id = get_or_create_test_doc()
    if not doc_id:
        print("❌ No document available")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=2,
        )
        page = await context.new_page()

        # ======= Load app =======
        print("🌐 Loading app...")
        await page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
        await asyncio.sleep(2)
        print("✅ App loaded")

        # ======= 1. Welcome Panel =======
        print("\n📸 [1/4] Welcome Panel...")
        await page.screenshot(path=str(SCREENSHOTS_DIR / "screenshot-welcome.png"))
        print(f"✅ screenshot-welcome.png ({(SCREENSHOTS_DIR / 'screenshot-welcome.png').stat().st_size / 1024:.0f} KB)")

        # ======= 2. Settings — click sidebar Settings button =======
        print("\n📸 [2/4] Settings...")
        # Settings NavItem is in the sidebar footer, contains text "Settings"
        settings_btn = page.locator("button:has-text('Settings')").last
        if await settings_btn.count() > 0:
            await settings_btn.click()
            await asyncio.sleep(2)
            await page.screenshot(path=str(SCREENSHOTS_DIR / "screenshot-settings.png"))
            print(f"✅ screenshot-settings.png ({(SCREENSHOTS_DIR / 'screenshot-settings.png').stat().st_size / 1024:.0f} KB)")
        else:
            print("⚠️ Settings button not found in sidebar")

        # ======= 3. Document Editor — click file in tree =======
        print("\n📸 [3/4] Document Editor...")
        # Click "Home" first to go back to document list
        home_btn = page.locator("button:has-text('Home')").first
        if await home_btn.count() > 0:
            await home_btn.click()
            await asyncio.sleep(1.5)

        # Find and click the document in the file tree
        # Documents appear as buttons with the filename
        doc_clicked = False
        for _ in range(3):
            # Look for any file item in the tree (not folder, not Home/Settings)
            file_items = page.locator("button.tree-file-item, nav button[style*='paddingLeft']").all()
            for item in file_items:
                text = await item.text_content()
                if text and text.strip() and text.strip() not in ("Home", "Settings", "Explorer"):
                    await item.click()
                    doc_clicked = True
                    print(f"  Clicked file: {text.strip()}")
                    break
            if doc_clicked:
                break
            await asyncio.sleep(2)

        if not doc_clicked:
            # Fallback: try clicking any button in the nav area that has .md or a filename
            nav_buttons = page.locator("nav button").all()
            for btn in nav_buttons:
                text = (await btn.text_content() or "").strip()
                if text and text not in ("Home", "Settings", "Explorer") and "." in text:
                    await btn.click()
                    doc_clicked = True
                    print(f"  Clicked: {text}")
                    break

        if doc_clicked:
            await asyncio.sleep(3)

            # Verify editor loaded by checking for chat button
            chat_btn = page.locator("#chat-with-doc-btn")
            if await chat_btn.count() > 0:
                await page.screenshot(path=str(SCREENSHOTS_DIR / "screenshot-editor.png"))
                print(f"✅ screenshot-editor.png ({(SCREENSHOTS_DIR / 'screenshot-editor.png').stat().st_size / 1024:.0f} KB)")

                # ======= 4. Chat Panel =======
                print("\n📸 [4/4] Chat Panel...")
                await chat_btn.click()
                await asyncio.sleep(2)
                await page.screenshot(path=str(SCREENSHOTS_DIR / "screenshot-chat.png"))
                print(f"✅ screenshot-chat.png ({(SCREENSHOTS_DIR / 'screenshot-chat.png').stat().st_size / 1024:.0f} KB)")
            else:
                # Still take the screenshot even if chat button not found
                await page.screenshot(path=str(SCREENSHOTS_DIR / "screenshot-editor.png"))
                print(f"⚠️ Editor loaded but no chat button. screenshot-editor.png saved")
                print(f"  URL: {page.url}")
                # Debug: list all buttons
                all_btns = await page.locator("button").all_text_contents()
                print(f"  All buttons: {[b.strip() for b in all_btns if b.strip()][:15]}")
        else:
            print("⚠️ Could not click any document in the tree")

        await browser.close()

    print(f"\n🎉 Done! Screenshots saved to {SCREENSHOTS_DIR}:")
    for f in sorted(SCREENSHOTS_DIR.glob("screenshot-*.png")):
        print(f"   📄 {f.name} ({f.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    asyncio.run(main())
