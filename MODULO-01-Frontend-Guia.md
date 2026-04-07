# MODULO-01 — Frontend SmartZoo: Guia de Instalação e Operação

**Stack:** React 18 + Vite 5 + Tailwind CSS 3 + Chart.js 4  
**Destino:** Raspberry Pi rodando Chromium em modo kiosk

---

## 1. Instalação do Node.js no Raspberry Pi

O Raspberry Pi usa ARM (armv7l ou aarch64). Use a versão LTS mais recente (Node 20+).

### Via NodeSource (método recomendado)

```bash
# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar dependências de build
sudo apt install -y curl git

# Adicionar repositório NodeSource (Node 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js e npm
sudo apt install -y nodejs

# Verificar instalação
node -v    # deve mostrar v20.x.x
npm -v     # deve mostrar 10.x.x
```

### Via nvm (alternativa, permite trocar versões)

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recarregar shell
source ~/.bashrc

# Instalar Node 20
nvm install 20
nvm use 20
nvm alias default 20
```

---

## 2. Instalação das dependências do projeto

```bash
# Navegar até o diretório do frontend
cd ~/Smartzoo/frontend

# Instalar dependências
npm install
```

---

## 3. Configuração de variáveis de ambiente

Copie o arquivo de exemplo e edite com o IP correto do Raspberry Pi backend:

```bash
cp .env.example .env
nano .env
```

Conteúdo do `.env`:

```
VITE_API_BASE_URL=http://192.168.1.100:8000
```

Substitua `192.168.1.100` pelo IP real do Raspberry Pi que executa o backend (SPEC-02).  
Se frontend e backend rodam no **mesmo** Raspberry Pi:

```
VITE_API_BASE_URL=http://localhost:8000
```

Se o backend for acessado pelo hostname mDNS:

```
VITE_API_BASE_URL=http://raspberry.local:8000
```

> A variável precisa estar definida **antes** do `npm run build`. Não é lida em runtime — é embutida no bundle pelo Vite.

---

## 4. Rodando em modo desenvolvimento

```bash
cd ~/Smartzoo/frontend
npm run dev
```

O servidor inicia em `http://0.0.0.0:3000` — acessível na rede local.  
Para acessar do Raspberry Pi local: `http://localhost:3000`

**Recarregamento automático** ao modificar os arquivos `.jsx` ou `.css`.

---

## 5. Build de produção

```bash
cd ~/Smartzoo/frontend

# Garantir que .env está configurado com o IP correto do backend
cat .env

# Gerar build otimizado
npm run build
```

Os arquivos são gerados em `frontend/dist/`.

### Servir o build com Python (simples, sem instalar nginx)

```bash
cd ~/Smartzoo/frontend/dist
python3 -m http.server 3000
```

### Servir com nginx (recomendado para produção)

```bash
sudo apt install -y nginx

# Copiar arquivos do build para o diretório do nginx
sudo cp -r ~/Smartzoo/frontend/dist/* /var/www/html/

# Reiniciar nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

O frontend estará disponível em `http://localhost:80` (ou `http://localhost`).

---

## 6. Modo kiosk no boot do Raspberry Pi

O kiosk mode abre o Chromium em tela cheia automaticamente após o boot, sem barra de endereço nem cursor de mouse.

### 6.1 Instalar dependências de kiosk

```bash
sudo apt install -y chromium-browser unclutter xdotool
```

- `unclutter` — esconde o cursor do mouse após inatividade
- `xdotool` — utilitário de automação de janela (opcional, para scripts de reload)

### 6.2 Criar arquivo de autostart

```bash
mkdir -p ~/.config/autostart

nano ~/.config/autostart/smartzoo-kiosk.desktop
```

Conteúdo do arquivo:

```ini
[Desktop Entry]
Type=Application
Name=SmartZoo Kiosk
Exec=bash -c "sleep 5 && chromium-browser --kiosk --disable-infobars --noerrdialogs --disable-session-crashed-bubble --disable-restore-session-state --disable-features=TranslateUI --no-first-run http://localhost:3000"
X-GNOME-Autostart-enabled=true
```

> O `sleep 5` garante que o servidor frontend (nginx ou python) inicie antes do Chromium.

### 6.3 Esconder cursor do mouse

```bash
nano ~/.config/autostart/unclutter.desktop
```

Conteúdo:

```ini
[Desktop Entry]
Type=Application
Name=Unclutter
Exec=unclutter -idle 1 -root
X-GNOME-Autostart-enabled=true
```

### 6.4 Configuração para Raspberry Pi sem desktop (modo lite)

Se o Raspberry Pi OS Lite for usado (sem interface gráfica), é necessário configurar o X11 manualmente:

```bash
sudo apt install -y xserver-xorg x11-xserver-utils openbox

nano ~/.bash_profile
```

Adicionar ao final do `.bash_profile`:

```bash
if [ -z "$DISPLAY" ] && [ "$XDG_VTNR" = "1" ]; then
  startx -- -nocursor
fi
```

Criar `~/.xinitrc`:

```bash
nano ~/.xinitrc
```

Conteúdo:

```bash
#!/bin/bash
xset s off
xset s noblank
xset -dpms

unclutter -idle 1 -root &

sleep 3
chromium-browser --kiosk \
  --disable-infobars \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --no-first-run \
  http://localhost:3000
```

```bash
chmod +x ~/.xinitrc
```

### 6.5 Iniciar serviço backend e frontend no boot

Criar serviço systemd para o servidor frontend:

```bash
sudo nano /etc/systemd/system/smartzoo-frontend.service
```

Conteúdo (usando Python HTTP server):

```ini
[Unit]
Description=SmartZoo Frontend Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Smartzoo/frontend/dist
ExecStart=/usr/bin/python3 -m http.server 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ativar o serviço:

```bash
sudo systemctl daemon-reload
sudo systemctl enable smartzoo-frontend
sudo systemctl start smartzoo-frontend
```

Verificar status:

```bash
sudo systemctl status smartzoo-frontend
```

---

## 7. Ajuste das coordenadas das jaulas no mapa

As coordenadas `location_x` e `location_y` são armazenadas no banco de dados do backend (SPEC-02) e retornadas pelo endpoint `GET /api/status`.

### Valores esperados

- `location_x`: número entre `0.0` e `1.0`, onde `0.0` é a borda esquerda e `1.0` é a borda direita do mapa
- `location_y`: número entre `0.0` e `1.0`, onde `0.0` é a borda superior e `1.0` é a borda inferior do mapa

### Como calibrar as coordenadas

1. **Abra a imagem do mapa** em um editor de imagem (GIMP, Photoshop, ou mesmo Paint)
2. **Identifique a posição de cada jaula** no mapa (em pixels)
3. **Converta para coordenadas normalizadas**:
   ```
   location_x = pixel_x / largura_total_da_imagem
   location_y = pixel_y / altura_total_da_imagem
   ```
4. **Atualize no banco de dados** via script SQL ou pela API de administração do backend

### Exemplo de cálculo

Para um mapa de 1280 x 800 pixels:
- Jaula dos leões em (320, 200) → `location_x = 0.25`, `location_y = 0.25`
- Jaula das girafas em (960, 600) → `location_x = 0.75`, `location_y = 0.75`

### Script de atualização via SQLite (backend SPEC-02)

```bash
# No Raspberry Pi backend
cd ~/Smartzoo/backend
python3 - <<'EOF'
import sqlite3

conn = sqlite3.connect('smartzoo.db')
cursor = conn.cursor()

# Exemplo: atualizar coordenadas de cada jaula
updates = [
    (0.25, 0.25, 1),  # cage_id=1: leões
    (0.75, 0.25, 2),  # cage_id=2: girafas
    (0.25, 0.75, 3),  # cage_id=3: elefantes
    (0.75, 0.75, 4),  # cage_id=4: zebras
]

cursor.executemany(
    'UPDATE cages SET location_x = ?, location_y = ? WHERE id = ?',
    updates
)
conn.commit()
conn.close()
print("Coordenadas atualizadas!")
EOF
```

### Verificar posicionamento visualmente

1. Rode o frontend em modo dev (`npm run dev`)
2. Abra `http://localhost:3000` no navegador
3. Verifique se os marcadores aparecem nas posições corretas sobre o mapa
4. Se necessário, ajuste os valores e recarregue a página (polling automático atualiza em 5s)

### Substituir o mapa placeholder

O mapa padrão usa um gradiente verde como placeholder. Para usar a imagem real do zoo:

1. Adicione a imagem em `frontend/src/assets/zoo-map.png` (ou `.jpg`)
2. Edite `frontend/src/screens/MapScreen.jsx`, localize o div com `background: 'linear-gradient(...)'` e substitua por:

```jsx
import zooMap from '../assets/zoo-map.png'

// No JSX, substituir o div do background por:
<img
  src={zooMap}
  alt="Mapa do Zoo"
  className="absolute inset-0 w-full h-full object-cover"
/>
```

---

## 8. Resolução de problemas comuns

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| Tela branca no Chromium | Frontend não iniciou | Verificar `systemctl status smartzoo-frontend` |
| "Servidor temporariamente offline" | `VITE_API_BASE_URL` errado ou backend offline | Verificar IP no `.env` e status do backend |
| Marcadores no lugar errado | Coordenadas incorretas no banco | Recalibrar `location_x/y` conforme seção 7 |
| Kiosk não abre no boot | Autostart não configurado | Verificar `~/.config/autostart/smartzoo-kiosk.desktop` |
| Chromium mostra barra de crash | Flag `--disable-session-crashed-bubble` ausente | Adicionar a flag no comando de autostart |
| Fonte pixelada | Inter não carregou (sem internet) | Baixar a fonte localmente e servir junto com o build |

### Baixar fonte Inter para uso offline

```bash
cd ~/Smartzoo/frontend/public
mkdir fonts
curl -L "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2" -o fonts/Inter-Regular.woff2
```

Em `frontend/index.html`, substitua o `<link>` do Google Fonts por:

```html
<style>
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/Inter-Regular.woff2') format('woff2');
    font-weight: 400 700;
    font-style: normal;
  }
</style>
```

---

## 9. Atualizações do frontend

Após qualquer mudança no código:

```bash
cd ~/Smartzoo/frontend

# Reinstalar dependências se package.json mudou
npm install

# Rebuild
npm run build

# Reiniciar servidor se necessário
sudo systemctl restart smartzoo-frontend
```

O Chromium em kiosk não recarrega automaticamente. Para forçar reload remoto:

```bash
# Do terminal do Raspberry Pi
DISPLAY=:0 xdotool key ctrl+r
```
