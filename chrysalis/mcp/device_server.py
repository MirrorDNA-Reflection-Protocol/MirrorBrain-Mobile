import asyncio
import logging
import grpc
import json
from mcp.server.fastmcp import FastMCP

# Import our existing gRPC stubs
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../ipc'))
import agent_pb2
import agent_pb2_grpc

# Initialize the MCP Server
mcp = FastMCP("MirrorBrain Device Capabilities")

# gRPC Connection to Android Body
channel = grpc.insecure_channel('localhost:50051')
stub = agent_pb2_grpc.AgentBridgeStub(channel)

def execute_android_intent(intent: str, params: dict):
    """Helper to send commands via gRPC bridge"""
    try:
        response = stub.Execute(agent_pb2.ActionRequest(
            intent=intent,
            params=params,
            request_id="mcp-" + os.urandom(4).hex()
        ))
        return {
            "success": response.success,
            "message": response.message,
            "data": json.loads(response.result_json) if response.result_json else {}
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@mcp.tool()
def show_toast(message: str) -> str:
    """Display a temporary toast message on the Android screen."""
    result = execute_android_intent("TOAST", {"message": message})
    return f"Toast executed: {result}"

@mcp.tool()
def open_application(package_name: str) -> str:
    """Launch an Android application by its package name (e.g. com.android.settings)."""
    result = execute_android_intent("LAUNCH_APP", {"package": package_name})
    return f"App Launch executed: {result}"

@mcp.tool()
def vibrate_device(duration_ms: int = 500) -> str:
    """Vibrate the phone for a specified duration."""
    result = execute_android_intent("VIBRATE", {"duration": str(duration_ms)})
    return f"Vibration executed: {result}"

@mcp.tool()
def get_battery_status() -> str:
    """Get the current battery level and charging status."""
    result = execute_android_intent("QUERY_BATTERY", {})
    return str(result)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.info("Starting MirrorBrain Device MCP Server...")
    mcp.run()
