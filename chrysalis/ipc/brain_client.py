import logging
import time
import grpc
import json
import agent_pb2
import agent_pb2_grpc

def run():
    logging.info("Attempting to connect to Brain...")
    
    # Connect
    channel = grpc.insecure_channel('localhost:50051')
    stub = agent_pb2_grpc.AgentBridgeStub(channel)
    
    # 1. Ping Test (Latency)
    start = time.time()
    response = stub.Ping(agent_pb2.PingRequest(timestamp=int(start * 1000)))
    end = time.time()
    latency_ms = (end - start) * 1000
    
    logging.info(f"Ping Successful! Brain Time: {response.timestamp}, Ready: {response.ready}")
    logging.info(f"Use-Case Latency: {latency_ms:.2f}ms")
    
    # 2. Execute Test
    logging.info("Testing Execute...")
    action_resp = stub.Execute(agent_pb2.ActionRequest(
        intent="TEST_ACTION",
        params={"foo": "bar"},
        request_id="test-1"
    ))
    logging.info(f"Execute Result: {action_resp.message} | Payload: {action_resp.result_json}")

    # 3. Stream Test
    logging.info("Testing Event Stream...")
    try:
        for event in stub.StreamEvents(agent_pb2.EventStreamRequest(client_id="test-client")):
            logging.info(f"Received Event: {event.type} @ {event.timestamp}")
            # Just take one for test
            break
    except grpc.RpcError as e:
        logging.error(f"Stream failed: {e}")

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    run()
