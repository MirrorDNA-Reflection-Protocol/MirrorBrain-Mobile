import asyncio
import logging
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
# Placeholder for local LLM inference (e.g. from llama.rn or local http)
# import ollama

class Orchestrator:
    def __init__(self):
        self.history = []
        self.tools = []

    async def connect_to_tools(self):
        # In a real scenario, this connects to the running device_server process
        # For this prototype, we assume we launch it as a subprocess
        server_params = StdioServerParameters(
            command="python3",
            args=["chrysalis/mcp/device_server.py"],
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # List available tools
                tools = await session.list_tools()
                self.tools = tools
                logging.info(f"Connected to Device Tools: {[t.name for t in tools]}")
                
                # Enter Interaction Loop
                await self.interaction_loop(session)

    async def interaction_loop(self, session):
        print("💡 MirrorBrain Orchestrator Online. (Type 'quit' to exit)")
        while True:
            user_input = input("You: ")
            if user_input.lower() in ['quit', 'exit']:
                break
            
            # 1. Plan
            # In V2, we would ask the LLM: "Here are tools X, Y, Z. User said '...'. What do?"
            # For this prototype, we hack a direct mapping to prove the plumbing.
            
            if "toast" in user_input:
                print("⚡ Thinking: User wants a toast...")
                # Call the tool via MCP
                result = await session.call_tool("show_toast", arguments={"message": "Hello from Brain!"})
                print(f"✅ Tool Result: {result}")
            
            elif "vibrate" in user_input:
                print("⚡ Thinking: Haptic feedback requested...")
                result = await session.call_tool("vibrate_device", arguments={"duration_ms": 1000})
                print(f"✅ Tool Result: {result}")
                
            else:
                print("🤔 I don't know how to do that yet. Try 'show toast' or 'vibrate'.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agent = Orchestrator()
    try:
        asyncio.run(agent.connect_to_tools())
    except Exception as e:
        # Fallback if MCP lib is missing in this env
        print(f"Orchestrator failed (Missing Deps?): {e}")
