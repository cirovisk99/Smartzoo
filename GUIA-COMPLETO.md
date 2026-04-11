# SmartZoo — Guia Completo de Instalação e Integração

> Guia passo a passo para quem nunca configurou um projeto IoT.
> Siga na ordem: Raspberry Pi → ESP32 → Frontend → Teste integrado.

---

## O que você vai precisar

### Hardware
- **Raspberry Pi** (qualquer modelo com WiFi — recomendado Pi 3B+ ou 4)
- **ESP32-S3 Sense (XIAO)** com câmera OV2640 integrada
- **Cabo USB-C** (para ligar e programar o ESP32)
- **Cabo HDMI + monitor** (para o totem, ou acesso remoto via SSH)
- **Roteador WiFi** — o ESP32 e o Raspberry Pi precisam estar na **mesma rede**

### Software (instalar no seu computador Windows)
- [VS Code](https://code.visualstudio.com/) com extensão **PlatformIO IDE**
- [Node.js LTS](https://nodejs.org/) (versão 20 ou superior)
- [MQTT Explorer](https://mqtt-explorer.com/) — para verificar as mensagens

---

## PARTE 1 — Raspberry Pi (Servidor)

> Todos os comandos abaixo são executados **no terminal do Raspberry Pi**.
> Você pode acessar o Pi via SSH: `ssh pi@<IP_DO_PI>` ou direto no terminal dele.

### 1.1 Descobrir o IP do Raspberry Pi

No terminal do Pi, execute:
```bash
hostname -I
```
Anote o IP (exemplo: `192.168.1.100`). Você vai usar esse número várias vezes.

---

### 1.2 Instalar o Mosquitto (broker MQTT)

O Mosquitto é o "correio" que recebe mensagens do ESP32 e entrega ao backend.

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
```

Inicie e configure para iniciar automaticamente:
```bash
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

Verifique se está rodando (deve aparecer `active (running)`):
```bash
sudo systemctl status mosquitto
```

Teste rápido — abra dois terminais:

**Terminal 1** (escuta mensagens):
```bash
mosquitto_sub -h localhost -t "teste/#" -v
```

**Terminal 2** (envia mensagem):
```bash
mosquitto_pub -h localhost -t "teste/hello" -m "funcionou!"
```

Se o Terminal 1 mostrou `teste/hello funcionou!`, o Mosquitto está OK.

---

### 1.3 Instalar Python e dependências do backend

```bash
sudo apt install -y python3 python3-pip python3-venv git
```

Navegue até a pasta do projeto SmartZoo:
```bash
cd ~/SmartZoo/backend
```

> **Nota:** Se você copiou o projeto via pen drive ou git clone, ajuste o caminho acima.
> Exemplo para copiar da sua máquina Windows para o Pi via rede:
> ```
> scp -r "C:\Users\SEU_USUARIO\OneDrive\Documentos\FIAP\Smartzoo" pi@192.168.1.100:~/
> ```

Crie um ambiente virtual Python (isola as dependências):
```bash
python3 -m venv venv
source venv/bin/activate
```

Seu terminal agora mostra `(venv)` no início — isso é normal e esperado.

Instale as dependências:
```bash
pip install -r requirements.txt
```

---

### 1.4 Configurar o arquivo .env do backend

Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

Abra para editar:
```bash
nano .env
```

Altere os valores:
```
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
DB_PATH=./smartzoo.db
SNAPSHOTS_DIR=./snapshots
AI_PROVIDER=gemini
GEMINI_API_KEY=SUA_CHAVE_GEMINI_AQUI
GEMINI_MODEL=gemini-1.5-flash
AI_CACHE_TTL=300
```

Para salvar no nano: `Ctrl+O` → Enter → `Ctrl+X`

> **Como obter a chave Gemini:**
> 1. Acesse [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
> 2. Clique em "Create API key"
> 3. Copie e cole no campo `GEMINI_API_KEY`
> A chave é gratuita para uso básico.

---

### 1.5 Cadastrar as jaulas no banco de dados

O backend cria o banco automaticamente ao iniciar, mas você precisa cadastrar as jaulas e mapear as zonas manualmente.

Primeiro, inicie o Python interativo dentro da pasta backend:
```bash
cd ~/SmartZoo/backend
source venv/bin/activate
python3
```

No prompt do Python (`>>>`), execute:
```python
import sqlite3

# Conecta ao banco (cria se não existir)
conn = sqlite3.connect('smartzoo.db')

# Cria as tabelas (o backend faz isso automaticamente, mas antecipamos aqui)
# Se já existir, não tem problema — o INSERT OR IGNORE não duplica

# Cadastra uma jaula (ajuste o ID, nome e posição no mapa)
conn.execute("""
    INSERT OR IGNORE INTO cages (id, animal_name, species, location_x, location_y)
    VALUES ('cage01', 'Leão', 'Panthera leo', 150, 200)
""")

# Mapeia as zonas dessa jaula (grade 3x3)
# Edite as descrições para corresponder ao layout real da jaula
zonas = [
    ('cage01', 'top_left',      'próximo à rocha'),
    ('cage01', 'top_center',    'sob a sombra da árvore'),
    ('cage01', 'top_right',     'perto do bebedouro'),
    ('cage01', 'left',          'área gramada esquerda'),
    ('cage01', 'center',        'centro da jaula'),
    ('cage01', 'right',         'próximo ao tronco'),
    ('cage01', 'bottom_left',   'canto perto das árvores'),
    ('cage01', 'bottom_center', 'entrada da jaula'),
    ('cage01', 'bottom_right',  'canto direito'),
]

conn.executemany("""
    INSERT OR REPLACE INTO cage_zones (cage_id, zone_key, description)
    VALUES (?, ?, ?)
""", zonas)

conn.commit()
print("Jaula cadastrada com sucesso!")
conn.close()
```

Para sair do Python: `exit()`

> **Para adicionar mais jaulas:** repita o bloco acima com um ID diferente (ex: `cage02`, `cage03`).

---

### 1.6 Iniciar o backend

Você precisa de **dois terminais** rodando ao mesmo tempo: o subscriber MQTT e a API.

**Terminal 1 — Subscriber MQTT** (recebe dados do ESP32 e salva no banco):
```bash
cd ~/SmartZoo/backend
source venv/bin/activate
python3 subscriber.py
```

Deve aparecer algo como:
```
[MQTT] Conectado ao broker em localhost:1883
[MQTT] Subscrito em: zoo/cage/+/status
[MQTT] Subscrito em: zoo/cage/+/snapshot
```

**Terminal 2 — API FastAPI** (serve os dados para o frontend):
```bash
cd ~/SmartZoo/backend
source venv/bin/activate
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Deve aparecer:
```
INFO: Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Teste a API no navegador: `http://192.168.1.100:8000/docs`
(substitua pelo IP do seu Pi — deve abrir uma página com todos os endpoints)

---

### 1.7 Iniciar automaticamente com o Raspberry Pi (opcional, para produção)

Para que tudo inicie sozinho quando o Pi ligar, crie serviços systemd:

**Serviço do subscriber:**
```bash
sudo nano /etc/systemd/system/smartzoo-subscriber.service
```

Cole o conteúdo abaixo (ajuste `pi` para seu usuário e o caminho do projeto):
```ini
[Unit]
Description=SmartZoo MQTT Subscriber
After=mosquitto.service
Requires=mosquitto.service

[Service]
User=pi
WorkingDirectory=/home/pi/SmartZoo/backend
ExecStart=/home/pi/SmartZoo/backend/venv/bin/python3 subscriber.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Serviço da API:**
```bash
sudo nano /etc/systemd/system/smartzoo-api.service
```

```ini
[Unit]
Description=SmartZoo FastAPI Backend
After=mosquitto.service smartzoo-subscriber.service

[Service]
User=pi
WorkingDirectory=/home/pi/SmartZoo/backend
ExecStart=/home/pi/SmartZoo/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ative os serviços:
```bash
sudo systemctl daemon-reload
sudo systemctl enable smartzoo-subscriber smartzoo-api
sudo systemctl start smartzoo-subscriber smartzoo-api
```

Verifique:
```bash
sudo systemctl status smartzoo-subscriber
sudo systemctl status smartzoo-api
```

---

## PARTE 2 — ESP32-S3 (Firmware)

> Feito no seu **computador Windows** com VS Code + PlatformIO.

### 2.1 Instalar o PlatformIO

1. Abra o **VS Code**
2. Clique no ícone de extensões (quadradinhos no lado esquerdo) ou `Ctrl+Shift+X`
3. Pesquise `PlatformIO IDE`
4. Clique em **Install**
5. Aguarde — vai baixar algumas dependências automaticamente (~5 minutos)
6. Reinicie o VS Code quando solicitado

---

### 2.2 Abrir o projeto no PlatformIO

1. No VS Code, clique no ícone do PlatformIO (formiga/alien no lado esquerdo)
2. Clique em **Open Project**
3. Navegue até a pasta `Smartzoo/firmware` e clique em **Open "firmware"**

A barra inferior do VS Code vai mostrar os controles do PlatformIO:
- ✓ = Build (compilar)
- → = Upload (gravar no ESP32)
- 🔌 = Monitor Serial (ver saída do ESP32)

---

### 2.3 Configurar WiFi e MQTT no firmware

Abra o arquivo `firmware/src/main.cpp`.

Procure as linhas 33–37 (seção "CONFIGURAÇÃO"):

```cpp
#define WIFI_SSID    "SEU_WIFI_AQUI"
#define WIFI_PASS    "SUA_SENHA_AQUI"
#define MQTT_BROKER  "192.168.1.100"   // IP do Raspberry Pi
#define MQTT_PORT    1883
#define CAGE_ID      "cage01"
```

Substitua:
- `SEU_WIFI_AQUI` → nome da sua rede WiFi (o mesmo que o Raspberry Pi usa)
- `SUA_SENHA_AQUI` → senha do WiFi
- `192.168.1.100` → IP do Raspberry Pi (o que você anotou no passo 1.1)
- `cage01` → ID da jaula que você cadastrou no banco (passo 1.5)

> **Importante:** O ESP32 e o Raspberry Pi precisam estar na **mesma rede WiFi**.
> O nome do WiFi é **case-sensitive** (diferencie maiúsculas e minúsculas).

Salve o arquivo: `Ctrl+S`

---

### 2.4 Conectar o ESP32

1. Conecte o ESP32-S3 Sense ao computador via **cabo USB-C**
2. O Windows deve reconhecer automaticamente (aparece como COM3, COM4, etc.)
3. Se não reconhecer, instale o driver: [CP210x USB to UART](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)

---

### 2.5 Compilar e gravar

Na barra inferior do VS Code (ícones do PlatformIO):

1. Clique em **✓ Build** — aguarde a compilação (~60 segundos na primeira vez)
   - Se aparecer `SUCCESS` em verde: OK
   - Se aparecer `FAILED` em vermelho: veja a seção de erros comuns ao final

2. Clique em **→ Upload** — grava o firmware no ESP32
   - O ESP32 piscará durante a gravação
   - Ao terminar: `SUCCESS`

---

### 2.6 Verificar no Monitor Serial

Clique em **🔌 Monitor Serial** na barra do PlatformIO (baud rate: 115200).

Aguarde ~5 segundos. Você deve ver:

```
=== SmartZoo — Módulo 3: WiFi + MQTT ===
[CAM] Inicializando... OK
[WiFi] Conectando a 'NomeDaSuaRede'....
[WiFi] Conectado! IP: 192.168.1.50
[MQTT] Conectando a 192.168.1.100:1883 (id=esp32_cage01_AB12)...
[MQTT] Conectado!
[MQTT] Subscrito em: zoo/cage/cage01/cmd
[CAM] Calibrando background — mantenha a cena VAZIA por ~3s...
```

Após ~3 segundos com a câmera apontada para a cena vazia:
```
inactive | count: 0 | zone: -           | bg_diff: 0.008
inactive | count: 0 | zone: -           | bg_diff: 0.011
```

Quando você aparecer na frente da câmera:
```
ACTIVE   | count: 1 | zone: center      | bg_diff: 0.213
[MQTT] Status publicado (OK): {"cage_id":"cage01","status":"active",...}
```

---

## PARTE 3 — Frontend (Totem)

> Feito no seu **computador Windows** ou diretamente no **Raspberry Pi**.

### 3.1 Instalar o Node.js

**No Raspberry Pi:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # deve mostrar v20.x.x
```

**No Windows:** baixe em [nodejs.org](https://nodejs.org/) e instale normalmente.

---

### 3.2 Configurar a URL da API

Navegue até a pasta do frontend:
```bash
cd ~/SmartZoo/frontend
```

Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

Edite:
```bash
nano .env
```

Altere para o IP do seu Raspberry Pi:
```
VITE_API_BASE_URL=http://192.168.1.100:8000
```

> Se estiver rodando o frontend **no próprio Raspberry Pi**, use:
> ```
> VITE_API_BASE_URL=http://localhost:8000
> ```

Salve: `Ctrl+O` → Enter → `Ctrl+X`

---

### 3.3 Instalar dependências e iniciar

```bash
cd ~/SmartZoo/frontend
npm install
npm run dev
```

Deve aparecer:
```
  VITE v5.x.x  ready in 800ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.100:3000/
```

Abra no navegador: `http://192.168.1.100:3000`

Você verá a tela do mapa com as jaulas cadastradas.

---

### 3.4 Build para produção (totem permanente)

Quando tudo estiver funcionando, gere a versão otimizada:
```bash
cd ~/SmartZoo/frontend
npm run build
```

Os arquivos gerados ficam em `frontend/dist/`. Para servi-los:

**Opção simples — usar o preview do Vite:**
```bash
npm run preview
```

**Opção robusta — Nginx:**
```bash
sudo apt install -y nginx

# Copia arquivos para o nginx
sudo cp -r dist/* /var/www/html/

# Reinicia o nginx
sudo systemctl restart nginx
```

O frontend estará acessível em `http://192.168.1.100` (sem precisar de porta).

---

## PARTE 4 — Teste Integrado

### 4.1 Verificar mensagens com MQTT Explorer

1. Instale o [MQTT Explorer](https://mqtt-explorer.com/) no seu Windows
2. Abra e configure:
   - **Protocol:** mqtt://
   - **Host:** 192.168.1.100 (IP do Raspberry Pi)
   - **Port:** 1883
3. Clique em **Connect**
4. No painel esquerdo, expanda `zoo → cage → cage01`

Você deve ver os tópicos:
- `zoo/cage/cage01/status` — atualizado a cada 10 segundos
- `zoo/cage/cage01/snapshot` — aparece quando você tira um snapshot

---

### 4.2 Testar snapshot via MQTT

No MQTT Explorer, na seção **Publish**:
- **Topic:** `zoo/cage/cage01/cmd`
- **Payload:** `{"action":"snapshot"}`
- Clique em **Publish**

O ESP32 vai capturar uma foto e publicar em `zoo/cage/cage01/snapshot`.

---

### 4.3 Testar a API diretamente

Abra no navegador: `http://192.168.1.100:8000/docs`

Clique em qualquer endpoint e depois em **Try it out** → **Execute**:

- `GET /api/status` — retorna status atual de todas as jaulas
- `GET /api/cages` — lista jaulas cadastradas
- `POST /api/chat` — envia pergunta ao chatbot IA

---

### 4.4 Checklist de integração

Marque cada item conforme for confirmando:

- [ ] Raspberry Pi com IP fixo (ou anote o IP atual)
- [ ] Mosquitto rodando (`sudo systemctl status mosquitto`)
- [ ] Backend subscriber rodando (terminal mostra mensagens chegando do ESP32)
- [ ] Backend API rodando (`/docs` abre no navegador)
- [ ] ESP32 conectado ao WiFi (monitor serial mostra IP atribuído)
- [ ] ESP32 conectado ao MQTT (monitor serial mostra "Conectado!")
- [ ] MQTT Explorer mostra tópico `zoo/cage/cage01/status` atualizando
- [ ] Frontend abre no navegador e mostra a jaula no mapa
- [ ] Detalhe da jaula mostra status (active/inactive) e contagem
- [ ] Snapshot via MQTT cmd funciona

---

## PARTE 5 — PS3 Eye como Segunda Jaula (Opcional)

> Conecte uma câmera PS3 Eye ao Raspberry Pi para simular um segundo ESP32-S3 Sense,
> monitorando outra jaula sem precisar de hardware adicional.
> Spec completa: `docs/SPEC-02-ps3eye-cage-node.md`

### 5.1 Conectar a PS3 Eye

Plugue a câmera USB no Raspberry Pi. O driver `gspca_ov534` já vem no kernel do Bookworm — nenhuma instalação extra.

Confirme que foi reconhecida:
```bash
ls /dev/video*
# Deve aparecer /dev/video0 (ou /dev/video1 se já havia outra câmera)
```

---

### 5.2 Instalar dependências Python

```bash
cd ~/SmartZoo/raspberry
python3 -m venv .venv
source .venv/bin/activate
pip install opencv-python-headless paho-mqtt numpy scipy
```

---

### 5.3 Rodar o nó da segunda jaula

```bash
python3 cage_node_ps3eye.py --cage-id cage02 --camera 0
```

Logs esperados:
```
[CAM] PS3Eye aberta (/dev/video0) OK
[MQTT] Conectado ao broker localhost:1883
inactive | count: 0 | zone: -  | activity: 0.004
```

O backend aceita automaticamente — nenhuma alteração necessária.

---

### 5.4 Verificar no MQTT Explorer

Expanda `zoo → cage → cage02`: você verá `status` chegando a cada 10 segundos.

---

### 5.5 Cadastrar cage02 no banco (para o frontend exibir)

```bash
cd ~/SmartZoo/backend
source venv/bin/activate
python3 -c "
from database import init_db, upsert_cage_minimal
init_db()
upsert_cage_minimal('cage02')
print('cage02 cadastrada')
"
```

Para personalizar nome, espécie e zonas, siga o mesmo processo do passo 1.5 usando `cage_id='cage02'`.

---

### 5.6 Rodar como serviço (permanente)

```bash
sudo nano /etc/systemd/system/smartzoo-cage02.service
```

```ini
[Unit]
Description=SmartZoo PS3Eye Cage Node (cage02)
After=mosquitto.service

[Service]
User=pi
WorkingDirectory=/home/pi/SmartZoo/raspberry
ExecStart=/home/pi/SmartZoo/raspberry/.venv/bin/python3 cage_node_ps3eye.py --cage-id cage02
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable smartzoo-cage02
sudo systemctl start smartzoo-cage02
```

---

## Erros Comuns e Soluções

### ESP32 não conecta ao WiFi
- Verifique o nome e senha do WiFi (letras maiúsculas/minúsculas importam)
- O ESP32 só funciona em redes **2.4 GHz** — não funciona em 5 GHz
- Confirme que a rede não tem portal de autenticação (tipo hotel/escola)

### ESP32 conecta ao WiFi mas não ao MQTT
- Confirme que o IP do Raspberry Pi em `MQTT_BROKER` está correto
- Verifique se o Mosquitto está rodando: `sudo systemctl status mosquitto`
- Teste a conectividade: no Pi, execute `ping <IP_DO_ESP32>`

### Erro de compilação "SEU_WIFI_AQUI" ou similar
- Você esqueceu de alterar as configurações em `main.cpp`. Veja o passo 2.3.

### Backend mostra erro "MQTT broker unreachable"
- Verifique o arquivo `.env` — `MQTT_BROKER_HOST` deve ser `localhost` no Pi
- Execute `mosquitto_pub -h localhost -t test -m ok` para testar

### Frontend mostra "API offline" ou tela em branco
- Confirme que o arquivo `.env` do frontend tem o IP correto
- Verifique se a API está rodando: `curl http://192.168.1.100:8000/api/status`
- Reconstrua o frontend após alterar o `.env`: `npm run build`

### Imagem da câmera de cabeça para baixo
- Já está corrigido no firmware com `vflip=1` e `hmirror=1`
- Se ainda estiver, verifique se o arquivo correto foi gravado no ESP32

### Contagem de animais muito alta em movimento
- Aguarde o animal parar de se mover — o blob detection conta melhor com cenas estáticas
- Ajuste `MIN_BLOB_CELLS` em `main.cpp` (linha 88): aumente de 3 para 4 ou 5

---

## Referência Rápida de Comandos

### Raspberry Pi — comandos úteis do dia a dia

```bash
# Ver logs em tempo real do backend
journalctl -u smartzoo-api -f
journalctl -u smartzoo-subscriber -f

# Reiniciar serviços após mudanças no código
sudo systemctl restart smartzoo-subscriber smartzoo-api

# Verificar banco de dados
cd ~/SmartZoo/backend
sqlite3 smartzoo.db "SELECT * FROM cages;"
sqlite3 smartzoo.db "SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 10;"

# Enviar snapshot para uma jaula via linha de comando
mosquitto_pub -h localhost -t "zoo/cage/cage01/cmd" -m '{"action":"snapshot"}'

# Monitorar todas as mensagens MQTT em tempo real
mosquitto_sub -h localhost -t "zoo/#" -v
```

### Estrutura de pastas do projeto

```
Smartzoo/
├── firmware/
│   ├── src/main.cpp          ← código do ESP32 (edite WiFi/MQTT aqui)
│   └── platformio.ini        ← configuração do PlatformIO
├── backend/
│   ├── main.py               ← API FastAPI
│   ├── subscriber.py         ← listener MQTT
│   ├── database.py           ← banco SQLite
│   ├── .env                  ← configurações (crie a partir de .env.example)
│   └── requirements.txt      ← dependências Python
├── frontend/
│   ├── src/
│   │   ├── screens/          ← telas do totem
│   │   └── api.js            ← chamadas ao backend
│   ├── .env                  ← URL do backend (crie a partir de .env.example)
│   └── package.json          ← dependências Node.js
└── GUIA-COMPLETO.md          ← este arquivo
```
