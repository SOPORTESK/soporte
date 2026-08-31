#!/bin/bash
# health-check.sh — Verificación automática de Evolution API en OCI

LOG="/var/log/evolution-health.log"
EVO_URL="http://localhost:8080"
EVO_KEY="SEKUNET_EVO_KEY_123"
INSTANCE="sekunet"

check() {
  STATUS=$(curl -sf -m 10 \
    -H "apikey: $EVO_KEY" \
    "$EVO_URL/instance/connectionState/$INSTANCE" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('instance',{}).get('state','unknown'))" 2>/dev/null)

  echo "$(date -Iseconds) status=$STATUS" >> "$LOG"

  if [ "$STATUS" != "open" ]; then
    echo "$(date -Iseconds) ALERTA: Estado=$STATUS — reiniciando contenedor" >> "$LOG"
    cd /home/ubuntu/evolution
    docker-compose restart evolution-api >> "$LOG" 2>&1
    sleep 30
    NEW_STATUS=$(curl -sf -m 10 \
      -H "apikey: $EVO_KEY" \
      "$EVO_URL/instance/connectionState/$INSTANCE" 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('instance',{}).get('state','unknown'))" 2>/dev/null)
    echo "$(date -Iseconds) post-restart status=$NEW_STATUS" >> "$LOG"
  fi
}

check