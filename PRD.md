# PRD — Smart Zoo: Sistema de Monitoramento e Totem Interativo

## 1. Visão Geral

Sistema de monitoramento distribuído para zoológicos que usa visão computacional na borda (Edge AI) para rastrear animais, analisar atividade e oferecer uma interface interativa e educativa para visitantes via totem central.

**Arquitetura em 3 camadas:**
```
[Jaula / ESP32-S3]  →  (Wi-Fi / MQTT)  →  [Raspberry Pi]  →  [Tela Touchscreen]
   Edge AI + Servo Pan/Tilt                Servidor Central       Interface do Visitante
```

---

## 2. Objetivos

| # | Objetivo |
|---|----------|
| O1 | Informar em tempo real o nível de atividade de cada animal |
| O2 | Sugerir roteiros otimizados com base na atividade histórica |
| O3 | Oferecer experiência educativa interativa via chatbot de IA |
| O4 | Ser escalável para múltiplas jaulas sem reconfiguração do servidor |

**Público-alvo:** Visitantes (famílias, estudantes, turistas) e administradores do parque.

---

## 3. Requisitos Funcionais

### 3.1 Módulo A — Unidade de Captura (Jaula / ESP32-S3)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF01 | Rastrear objetos em movimento com sistema Pan-Tilt (2x Servo MG90S) | Alta |
| RF02 | Processar imagem localmente e classificar status: **Ativo** / **Inativo** | Alta |
| RF03 | Publicar metadados via MQTT: `cage_id`, `status`, `posição`, `timestamp` | Alta |
| RF04 | Capturar e enviar snapshot (JPEG) sob demanda ou em intervalo configurável | Média |

**Tópicos MQTT publicados:**
```
zoo/cage/{cage_id}/status     → { status, activity_level, position_pan, position_tilt, ts }
zoo/cage/{cage_id}/snapshot   → { image_base64, ts }
```

**Tópicos MQTT subscritos:**
```
zoo/cage/{cage_id}/cmd        → { action: "snapshot" | "reboot" | "set_interval" }
```

---

### 3.2 Módulo B — Servidor Central (Raspberry Pi)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF05 | Hospedar Broker MQTT (Mosquitto) para receber dados de N jaulas | Alta |
| RF06 | Armazenar histórico de atividades em SQLite | Alta |
| RF07 | Expor API REST (FastAPI) para a interface e comandos | Alta |
| RF08 | Integrar API de IA (Gemini / OpenAI) para responder perguntas sobre animais com contexto do zoo | Alta |
| RF09 | Gerar sugestão de roteiro baseada na probabilidade de atividade por horário | Média |

**Endpoints principais:**
```
GET  /api/status              → status atual de todas as jaulas
GET  /api/cage/{id}/history   → histórico de atividade (últimas 24h)
POST /api/chat                → { question } → { answer }
GET  /api/route/suggest       → roteiro otimizado no horário atual
POST /api/cage/{id}/cmd       → enviar comando para a jaula
GET  /api/cage/{id}/snapshot  → última imagem capturada
```

---

### 3.3 Módulo C — Interface do Usuário (Totem / Touchscreen)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF10 | Mapa interativo do zoo com indicadores de status por jaula (Verde = Ativo, Cinza = Inativo) | Alta |
| RF11 | Interface de chat (texto e/ou voz) para perguntas sobre curiosidades dos animais | Alta |
| RF12 | Painel de sugestão de roteiro atualizado automaticamente | Média |
| RF13 | Exibir snapshot mais recente ao tocar em uma jaula no mapa | Média |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Critério de Aceitação |
|----|-----------|----------------------|
| RNF01 | Conectividade estável em Wi-Fi local | Latência MQTT < 500ms em 95% das mensagens |
| RNF02 | Durabilidade dos componentes externos | Case 3D resistente a intempéries (mínimo IP44) |
| RNF03 | Escalabilidade | Adicionar nova jaula sem reconfigurar o servidor; apenas ID único via firmware |
| RNF04 | Alimentação | Fonte 9V 2A com regulagem via MB102 para estabilidade |
| RNF05 | Disponibilidade | Sistema em operação contínua durante horário do zoo |

---

## 5. Especificações de Hardware

| Componente | Qtd./Jaula | Função |
|------------|-----------|--------|
| ESP32-S3 Sense (câmera OV2640) | 1 | Processamento de visão e conectividade Wi-Fi |
| Servo MG90S | 2 | Movimentação Pan (horizontal) e Tilt (vertical) |
| Módulo MB102 | 1 | Distribuição e regulação de energia na protoboard |
| Fonte 9V 2A | 1 | Alimentação estável do sistema |
| Raspberry Pi 4/5 | 1 (Totem) | Servidor central, broker MQTT, API e interface |
| Tela Touchscreen | 1 (Totem) | Interface do visitante |

---

## 6. Divisão de Trabalho — Equipe de 3 Pessoas

### Papel 1 — Engenheiro de Hardware & Firmware (ESP32)

**Responsabilidades:**
- Montagem e fiação do circuito ESP32-S3 + servos + módulo MB102
- Firmware em MicroPython/C++ (Arduino IDE / PlatformIO):
  - Controle PWM dos servos (pan/tilt)
  - Captura de frames via câmera OV2640
  - Algoritmo de detecção de movimento (frame differencing ou PIR auxiliar)
  - Cliente MQTT (publicação de status e snapshot)
  - Recepção de comandos remotos via MQTT
- Calibração e testes do sistema de rastreamento
- Impressão/adaptação do case 3D para proteção

**Entregas:**
- [ ] E1.1 — Circuito montado e servos respondendo a comandos manuais
- [ ] E1.2 — Detecção de movimento funcional (classificação Ativo/Inativo)
- [ ] E1.3 — Publicação de status e snapshots via MQTT
- [ ] E1.4 — Rastreamento Pan-Tilt automático seguindo o movimento

---

### Papel 2 — Engenheiro de Backend & Dados (Raspberry Pi)

**Responsabilidades:**
- Instalação e configuração do Broker Mosquitto no Raspberry Pi
- Desenvolvimento da API REST com FastAPI (Python)
- Modelagem e criação do banco SQLite
- Subscriber MQTT para ingestão dos dados das jaulas
- Integração com API de IA (Gemini/OpenAI) com prompt de contexto do zoo
- Algoritmo de sugestão de roteiro (análise do histórico por hora do dia)

**Entregas:**
- [ ] E2.1 — Broker MQTT operacional recebendo dados do ESP32
- [ ] E2.2 — Banco SQLite com histórico de atividades populando corretamente
- [ ] E2.3 — API REST documentada e funcional (todos os endpoints)
- [ ] E2.4 — Chatbot de IA respondendo perguntas contextuais sobre os animais
- [ ] E2.5 — Endpoint de sugestão de roteiro funcionando

---

### Papel 3 — Engenheiro de Frontend & UX (Interface Totem)

**Responsabilidades:**
- Design e implementação da interface touchscreen (React / Vue / Tkinter)
- Mapa interativo do zoo com status em tempo real (polling ou WebSocket)
- Tela de chat integrada ao endpoint `/api/chat`
- Tela de sugestão de roteiro
- Tela de detalhes da jaula (snapshot + histórico de atividade)
- Testes de usabilidade no totem (touchscreen, legibilidade, fluxo)

**Entregas:**
- [ ] E3.1 — Layout base do totem (navegação entre telas)
- [ ] E3.2 — Mapa interativo com indicadores de status atualizados em tempo real
- [ ] E3.3 — Interface de chat funcional conectada ao backend
- [ ] E3.4 — Tela de sugestão de roteiro e detalhe de jaula
- [ ] E3.5 — Testes no hardware final (touchscreen)

---

## 7. Cronograma Sugerido

```
Semana 1 — Infraestrutura Base
  Papel 1: Montar circuito + testar servos
  Papel 2: Instalar Mosquitto + criar schema SQLite + esqueleto FastAPI
  Papel 3: Definir wireframes + estrutura do projeto frontend

Semana 2 — Integração Vertical (MVP)
  Papel 1: Firmware MQTT publicando status (sem rastreamento ainda)
  Papel 2: Subscriber salvando no banco + endpoint /api/status funcional
  Papel 3: Mapa exibindo status real das jaulas

Semana 3 — Funcionalidades Completas
  Papel 1: Rastreamento Pan-Tilt + captura de snapshot
  Papel 2: Chatbot de IA + sugestão de roteiro
  Papel 3: Chat na UI + tela de detalhes da jaula

Semana 4 — Integração Final & Testes
  Todos: Testes end-to-end, correção de bugs, apresentação
```

---

## 8. Schema do Banco de Dados (SQLite)

```sql
CREATE TABLE cages (
    id          TEXT PRIMARY KEY,   -- ex: "cage_leao_01"
    animal_name TEXT NOT NULL,
    species     TEXT,
    location_x  REAL,               -- coordenada no mapa
    location_y  REAL
);

CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cage_id     TEXT REFERENCES cages(id),
    status      TEXT CHECK(status IN ('active', 'inactive')),
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
    pan_pos     REAL,
    tilt_pos    REAL
);

CREATE TABLE snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cage_id     TEXT REFERENCES cages(id),
    image_path  TEXT,
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. Definição de "Pronto" (DoD)

O projeto é considerado entregue quando todos os critérios abaixo estiverem verificados:

- [ ] Pelo menos **1 unidade de jaula** rastreia movimento e publica status via MQTT
- [ ] O **Raspberry Pi** recebe, armazena e serve os dados via API REST
- [ ] O **chatbot de IA** responde perguntas contextuais sobre os animais do zoo
- [ ] A **interface do totem** exibe o mapa atualizado em tempo real
- [ ] O sistema suporta **adição de nova jaula** sem alteração do servidor
- [ ] Demonstração end-to-end funcionando em rede Wi-Fi local

---

## 10. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|-------------|---------|-----------|
| Latência de Wi-Fi afetando rastreamento em tempo real | Média | Médio | Processar lógica de rastreamento localmente no ESP32; MQTT apenas para telemetria |
| Limite de requisições da API de IA (quota/custo) | Média | Médio | Cache de respostas frequentes; fallback para respostas pré-definidas |
| Dificuldade de detecção de movimento com baixa luminosidade | Alta | Alto | Testar com iluminação artificial; considerar threshold adaptativo |
| Overheating do Raspberry Pi sob carga contínua | Baixa | Alto | Usar heatsink/cooler; monitorar temperatura via script |
