import asyncio
import sys
from backend.services.agent import get_document_agent, set_tool_context
from backend.core.config import get_settings

async def main():
    agent = await get_document_agent()
    settings = get_settings()
    set_tool_context("test_doc_id", settings)

    stream_input = {"messages": [{"role": "user", "content": "hello"}]}
    config = {"configurable": {"thread_id": "test-2"}}

    print("Running astream...")
    async for chunk in agent.astream(
        stream_input,
        stream_mode="messages",
        subgraphs=True,
        version="v2",
        config=config,
    ):
        if isinstance(chunk, dict) and chunk.get("type") == "messages":
            data = chunk.get("data")
            if data and len(data) == 2:
                msg = data[0]
                print(f"msg type attr: {getattr(msg, 'type', None)}")
                print(f"msg type prop: {type(msg)}")
                if getattr(msg, 'type', None) == 'ai' and getattr(msg, 'content', None):
                    print(f"Content: {msg.content}")

    print("Done")

if __name__ == "__main__":
    asyncio.run(main())
