# LaiDocs User Guideline - Quick Start

Welcome to LaiDocs! This guide will walk you through the basic steps to get familiar with the application and use it effectively, from configuring AI models to automatically ingesting documents and chatting with them.

## Step 1: Initial AI/LLM Configuration

For the application to process semantics and answer your questions, the first step is to configure your LLM (Large Language Model).
- Please open the **Settings** section.
- Configure your API Key (you can use OpenAI, Anthropic, or configure a Local LLM depending on your needs).

![LLM Settings](./images/0-llm-settings.png)

## Step 2: Prepare your Workspace (Create Folder)

LaiDocs stores documents in folders to help you easily manage them by project.
- Click on the new folder icon in the Sidebar.
- Enter a new folder name, for example: `Demo-Project`.

![Create Folder Step](./images/1-create-folder.png)

## Step 3: Add Existing Documents (Upload Document)

You can upload existing documents from your computer to the newly created folder.
- Select the `Demo-Project` folder you just created in the Sidebar.
- Click the **Upload** button and select a sample document file (for example: `tescases/sample-data.pdf`) from your computer.
- Wait for the system to automatically upload and process the content.

![Click Upload Button](./images/2-upload-btn.png)

![Document Processed](./images/3-document-ready.png)

## Step 4: Collect Data from the Internet (Crawl Web)

Besides local documents, LaiDocs also has the ability to automatically download and index content from websites.
- While still selecting the `Demo-Project` folder, click the **Crawl URL** button.
- Enter the URL you want to collect (for example: `https://github.com/VectifyAI/PageIndex`) and confirm.

![Enter Crawl URL](./images/4-crawl-url.png)

![Web Content Downloaded](./images/5-crawl-success.png)

## Step 5: Chat and Explore Data

Now you are ready to do Q&A with your knowledge base.
- Switch to the **Chat** interface.
- Select the documents (both the PDF file and the newly ingested web content) as your Context.
- Start asking questions, for example: "Summarize the main content of PageIndex" for the AI to answer based precisely on those documents.

![Select Context](./images/6-select-context.png)

![Chat Result](./images/7-chat-result.png)
