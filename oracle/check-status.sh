#!/bin/bash
curl -s http://localhost:8080/instance/fetchInstances -H 'apikey: SEKUNET_EVO_KEY_123' | python3 -c "
import json, sys
d = json.load(sys.stdin)[0]
print('status:', d['connectionStatus'])
print('disconnectionAt:', d.get('disconnectionAt'))
print('updatedAt:', d.get('updatedAt'))
print('messages count:', d.get('_count', {}).get('Message'))
"
