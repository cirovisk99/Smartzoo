#!/bin/bash
# Detecta a rede atual e rebuilda o frontend com o IP correto da API

FRONTEND_DIR="/home/pi/Smartzoo/frontend"

# Detecta IP atual do Pi
CURRENT_IP=$(ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1)

if [[ "$CURRENT_IP" == 192.168.0.* ]]; then
    API_URL="http://192.168.0.100:8000"
    NETWORK="casa"
elif [[ "$CURRENT_IP" == 10.116.32.* ]]; then
    API_URL="http://10.116.32.100:8000"
    NETWORK="FIAP (hotspot)"
else
    echo "Rede desconhecida (IP: $CURRENT_IP). Abortando."
    exit 1
fi

echo "Rede detectada: $NETWORK (IP: $CURRENT_IP)"
echo "API URL: $API_URL"

# Atualiza .env.production
echo "VITE_API_BASE_URL=$API_URL" > "$FRONTEND_DIR/.env.production"

# Rebuilda
echo "Rebuilding frontend..."
cd "$FRONTEND_DIR"
npm run build

echo "Pronto! Frontend atualizado para $NETWORK."
