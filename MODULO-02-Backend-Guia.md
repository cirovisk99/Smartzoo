# Módulo 02 — Backend Raspberry Pi: Guia de Instalação e Uso

## Pré-requisitos

- Raspberry Pi (3B+ ou superior) com Raspberry Pi OS (Bullseye ou Bookworm)
- Python 3.9+
- Acesso à internet para instalar pacotes
- ESP32 já configurado conforme o Módulo 01

---

## 1. Instalar o Mosquitto (Broker MQTT)

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
```

### Configurar o Mosquitto

Edite (ou crie) o arquivo de configuração:

```bash
sudo nano /etc/mosquitto/mosquitto.conf
```

Conteúdo mínimo para rede local:

```
listener 1883
allow_anonymous true
```

### Habilitar e iniciar o serviço

```bash
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
sudo systemctl status mosquitto   # deve mostrar "active (running)"
```

### Testar o broker localmente

Em dois terminais separados:

```bash
# Terminal 1 — subscriber
mosquitto_sub -h localhost -t "zoo/cage/+/status" -v

# Terminal 2 — publisher de teste
mosquitto_pub -h localhost -t "zoo/cage/cage_leao_01/status" \
  -m '{"cage_id":"cage_leao_01","status":"active","activity_level":0.85,"animal_count":1,"zone":"bottom_left","uptime_ms":12345}'
```

---

## 2. Instalar dependências Python

### Clonar / copiar o código

```bash
# Se estiver usando git:
git clone https://github.com/seu-usuario/smartzoo-backend.git /home/pi/smartzoo-backend
cd /home/pi/smartzoo-backend/backend

# Ou copiar manualmente os arquivos da pasta backend/ para /home/pi/smartzoo-backend/
```

### Criar ambiente virtual (recomendado)

```bash
cd /home/pi/smartzoo-backend
python3 -m venv venv
source venv/bin/activate
```

### Instalar pacotes

```bash
pip install -r requirements.txt
```

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Preencha os valores relevantes:

```env
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
DB_PATH=./smartzoo.db
SNAPSHOTS_DIR=./snapshots
AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...sua_chave_aqui...
```

> Para obter uma chave Gemini, veja a seção 8 deste guia.

---

## 4. Popular o banco com dados de exemplo

O banco é criado automaticamente ao iniciar qualquer dos processos.
Para popular as tabelas `cages` e `cage_zones` com dados do leão e de outras jaulas:

```bash
# Iniciar o banco (cria as tabelas)
python3 -c "from database import init_db; init_db()"

# Inserir dados de exemplo
sqlite3 smartzoo.db << 'SQL'

-- Jaulas
INSERT OR IGNORE INTO cages (id, animal_name, species, location_x, location_y) VALUES
  ('cage_leao_01',   'Leão',   'Panthera leo',          0.20, 0.50),
  ('cage_girafa_01', 'Girafa', 'Giraffa camelopardalis', 0.50, 0.30),
  ('cage_elefante_01','Elefante','Loxodonta africana',   0.80, 0.60),
  ('cage_zebra_01',  'Zebra',  'Equus quagga',          0.40, 0.70);

-- Zonas do Leão
INSERT OR IGNORE INTO cage_zones (cage_id, zone_key, description) VALUES
  ('cage_leao_01', 'top_left',      'no alto à esquerda, perto da rocha'),
  ('cage_leao_01', 'top_center',    'no alto ao centro, sob a sombra'),
  ('cage_leao_01', 'top_right',     'no alto à direita, próximo ao bebedouro'),
  ('cage_leao_01', 'left',          'à esquerda, na área gramada'),
  ('cage_leao_01', 'center',        'no centro da jaula'),
  ('cage_leao_01', 'right',         'à direita, próximo ao tronco'),
  ('cage_leao_01', 'bottom_left',   'no canto esquerdo, próximo às árvores'),
  ('cage_leao_01', 'bottom_center', 'na parte inferior, ao centro'),
  ('cage_leao_01', 'bottom_right',  'no canto direito, próximo à cerca');

-- Zonas da Girafa
INSERT OR IGNORE INTO cage_zones (cage_id, zone_key, description) VALUES
  ('cage_girafa_01', 'top_left',      'no alto à esquerda, perto das folhas altas'),
  ('cage_girafa_01', 'top_center',    'no alto ao centro, sob a copa das árvores'),
  ('cage_girafa_01', 'top_right',     'no alto à direita, próximo ao bebedouro elevado'),
  ('cage_girafa_01', 'left',          'à esquerda, na área de alimentação'),
  ('cage_girafa_01', 'center',        'no centro da jaula'),
  ('cage_girafa_01', 'right',         'à direita, próximo à cerca'),
  ('cage_girafa_01', 'bottom_left',   'na parte inferior esquerda, área de descanso'),
  ('cage_girafa_01', 'bottom_center', 'na parte inferior central'),
  ('cage_girafa_01', 'bottom_right',  'no canto inferior direito');

SQL
echo "Dados inseridos com sucesso!"
```

### Verificar os dados

```bash
sqlite3 smartzoo.db "SELECT * FROM cages;"
sqlite3 smartzoo.db "SELECT * FROM cage_zones WHERE cage_id = 'cage_leao_01';"
```

---

## 5. Rodar o subscriber.py

O subscriber consome mensagens MQTT e as persiste no banco. Deve rodar em processo separado.

```bash
# Ativar virtualenv se ainda não estiver ativo
source /home/pi/smartzoo-backend/venv/bin/activate

cd /home/pi/smartzoo-backend
python3 subscriber.py
```

Saída esperada:
```
2024-01-15 14:00:00 [INFO] __main__: Inicializando banco de dados...
2024-01-15 14:00:00 [INFO] __main__: Conectando ao broker localhost:1883...
2024-01-15 14:00:00 [INFO] __main__: Conectado ao broker MQTT localhost:1883
2024-01-15 14:00:00 [INFO] __main__: Inscrito em: zoo/cage/+/status  |  zoo/cage/+/snapshot
```

---

## 6. Rodar o main.py (FastAPI)

```bash
source /home/pi/smartzoo-backend/venv/bin/activate
cd /home/pi/smartzoo-backend

uvicorn main:app --host 0.0.0.0 --port 8000
```

Ou diretamente:
```bash
python3 main.py
```

A documentação interativa Swagger estará disponível em:
```
http://<ip-do-raspberry>:8000/docs
```

---

## 7. Testar os endpoints com curl

Substitua `<ip>` pelo IP do Raspberry Pi (ou `localhost` se estiver testando localmente).

### Status de todas as jaulas

```bash
curl http://<ip>:8000/api/status | python3 -m json.tool
```

### Histórico de atividade (últimas 24h)

```bash
curl http://<ip>:8000/api/cage/cage_leao_01/history | python3 -m json.tool
```

### Snapshot mais recente

```bash
curl http://<ip>:8000/api/cage/cage_leao_01/snapshot --output leao_latest.jpg
```

### Sugestão de roteiro

```bash
curl http://<ip>:8000/api/route/suggest | python3 -m json.tool
```

### Chat com o guia virtual

```bash
curl -X POST http://<ip>:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Quando o leão costuma estar mais ativo?"}' \
  | python3 -m json.tool
```

### Enviar comando para uma jaula

```bash
# Solicitar snapshot
curl -X POST http://<ip>:8000/api/cage/cage_leao_01/cmd \
  -H "Content-Type: application/json" \
  -d '{"action": "snapshot"}'

# Alterar intervalo de envio (30 segundos)
curl -X POST http://<ip>:8000/api/cage/cage_leao_01/cmd \
  -H "Content-Type: application/json" \
  -d '{"action": "set_interval", "value": 30}'

# Reiniciar ESP32
curl -X POST http://<ip>:8000/api/cage/cage_leao_01/cmd \
  -H "Content-Type: application/json" \
  -d '{"action": "reboot"}'
```

### Health check

```bash
curl http://<ip>:8000/health
```

---

## 8. Obter e configurar a Gemini API Key

1. Acesse [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Faça login com sua conta Google
3. Clique em **"Create API Key"**
4. Copie a chave gerada (começa com `AIzaSy...`)
5. Edite o `.env`:
   ```bash
   nano /home/pi/smartzoo-backend/.env
   ```
   Defina:
   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=AIzaSy...sua_chave_aqui...
   ```
6. Reinicie o processo da API para aplicar

> **Limites gratuitos Gemini 1.5 Flash:** 15 RPM / 1.500 req/dia — suficiente para demonstrações.

---

## 9. Configurar como serviços systemd (execução automática no boot)

### API FastAPI

```bash
sudo nano /etc/systemd/system/smartzoo-api.service
```

```ini
[Unit]
Description=SmartZoo FastAPI Backend
After=network.target mosquitto.service

[Service]
User=pi
WorkingDirectory=/home/pi/smartzoo-backend
ExecStart=/home/pi/smartzoo-backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment="PATH=/home/pi/smartzoo-backend/venv/bin"

[Install]
WantedBy=multi-user.target
```

### Subscriber MQTT

```bash
sudo nano /etc/systemd/system/smartzoo-subscriber.service
```

```ini
[Unit]
Description=SmartZoo MQTT Subscriber
After=network.target mosquitto.service

[Service]
User=pi
WorkingDirectory=/home/pi/smartzoo-backend
ExecStart=/home/pi/smartzoo-backend/venv/bin/python3 subscriber.py
Restart=always
RestartSec=5
Environment="PATH=/home/pi/smartzoo-backend/venv/bin"

[Install]
WantedBy=multi-user.target
```

### Ativar os serviços

```bash
sudo systemctl daemon-reload
sudo systemctl enable smartzoo-api smartzoo-subscriber
sudo systemctl start smartzoo-api smartzoo-subscriber
sudo systemctl status smartzoo-api smartzoo-subscriber
```

---

## 10. Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| `Connection refused` no subscriber | Mosquitto não está rodando | `sudo systemctl start mosquitto` |
| `404` no `/api/cage/{id}/snapshot` | Nenhum snapshot recebido ainda | Verificar se ESP32 está publicando; testar com `mosquitto_pub` |
| Chatbot retorna mensagem de fallback | `GEMINI_API_KEY` não configurada | Editar `.env` e reiniciar a API |
| `500` em qualquer endpoint | Erro interno | Verificar logs com `journalctl -u smartzoo-api -f` |
| Banco não encontrado | Caminho errado em `DB_PATH` | Verificar `.env` e permissões do diretório |

### Ver logs em tempo real

```bash
# API
journalctl -u smartzoo-api -f

# Subscriber
journalctl -u smartzoo-subscriber -f
```

### Consultar o banco diretamente

```bash
sqlite3 /home/pi/smartzoo-backend/smartzoo.db

-- Últimas 10 entradas de atividade
SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 10;

-- Verificar snapshots
SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 5;
```
