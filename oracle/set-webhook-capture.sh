#!/bin/bash
# Cambiar webhook a captura temporal
curl -s -X POST http://localhost:8080/webhook/update/sekunet \
  -H 'apikey: SEKUNET_EVO_KEY_123' \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://129.146.7.74:9999","events":["APPLICATION_STARTUP","QRCODE_UPDATED","MESSAGES_UPSERT","MESSAGES_UPDATE","MESSAGES_DELETE","SEND_MESSAGE","CONTACTS_SET","CONTACTS_UPSERT","CONTACTS_UPDATE","PRESENCE_UPDATE","CHATS_SET","CHATS_UPSERT","CHATS_UPDATE","CHATS_DELETE","GROUPS_UPSERT","GROUP_UPDATE","GROUP_PARTICIPANTS_UPDATE","CONNECTION_UPDATE"],"webhookByEvents":false,"webhookBase64":true}'
echo ""
echo "Webhook cambiado a captura"
