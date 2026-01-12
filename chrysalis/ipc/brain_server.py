from concurrent import futures
import logging
import time
import grpc
import json

import agent_pb2
import agent_pb2_grpc

class AgentBridge(agent_pb2_grpc.AgentBridgeServicer):
    def Ping(self, request, context):
        current_time = int(time.time() * 1000)
        return agent_pb2.PingResponse(timestamp=current_time, ready=True)

    def Execute(self, request, context):
        logging.info(f"Received Execute Request: {request.intent} | Params: {request.params}")
        
        # Simulating logic processing
        response_payload = {"status": "processed", "echo_params": dict(request.params)}
        
        return agent_pb2.ActionResponse(
            success=True,
            message=f"Executed {request.intent}",
            result_json=json.dumps(response_payload),
            request_id=request.request_id
        )

    def StreamEvents(self, request, context):
        # Streaming mock events
        logging.info(f"Streaming events for client: {request.client_id}")
        events = [
            ("NOTIFICATION", {"package": "com.whatsapp", "title": "New Message"}),
            ("SCREEN_STATE", {"state": "ON"}),
            ("BATTERY", {"level": "85%"})
        ]
        
        for evt_type, data in events:
            yield agent_pb2.SystemEvent(
                type=evt_type,
                payload_json=json.dumps(data),
                timestamp=int(time.time() * 1000)
            )
            time.sleep(0.5)

def serve():
    port = '50051'
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    agent_pb2_grpc.add_AgentBridgeServicer_to_server(AgentBridge(), server)
    server.add_insecure_port('[::]:' + port)
    logging.info(f"Agent Brain listening on port {port}")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    serve()
