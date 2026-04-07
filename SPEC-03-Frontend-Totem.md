# SPEC-03 — Interface do Usuário (Totem / Touchscreen)

**Papel:** Engenheiro de Frontend & UX
**Módulo:** Interface Touchscreen para Visitantes

---

## 1. Visão Geral

Aplicação frontend executada no Raspberry Pi e exibida em tela touchscreen no totem do zoo. Deve ser intuitiva para visitantes de todas as idades (famílias, estudantes, turistas), com toque responsivo e elementos visuais grandes.

```
┌─────────────────────────────────────┐
│           SMARTZOO TOTEM            │
│                                     │
│  [Mapa Interativo]  [Chat AI]       │
│  [Roteiro]          [Detalhe Jaula] │
└─────────────────────────────────────┘
```

---

## 2. Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF10 | Mapa interativo do zoo com indicadores de status por jaula (Verde = Ativo, Cinza = Inativo) | Alta |
| RF11 | Interface de chat (texto e/ou voz) para perguntas sobre curiosidades dos animais | Alta |
| RF12 | Painel de sugestão de roteiro atualizado automaticamente | Média |
| RF13 | Exibir snapshot mais recente ao tocar em uma jaula no mapa | Média |

---

## 3. Telas e Fluxo de Navegação

```
[Tela Inicial / Mapa]
        │
        ├──► [Detalhe da Jaula]  (toque em uma jaula)
        │         └──► snapshot + gráfico de atividade
        │
        ├──► [Chat com IA]  (botão fixo)
        │
        └──► [Sugestão de Roteiro]  (botão fixo)
```

- Navegação simples, sem hierarquias profundas
- Botão **"Voltar ao Mapa"** sempre visível nas sub-telas
- Timeout de inatividade: retornar ao Mapa após **60 segundos** sem interação

---

## 4. Telas Detalhadas

### 4.1 Tela Inicial — Mapa Interativo

**Elementos:**
- Imagem de fundo: planta baixa/mapa ilustrado do zoo
- Para cada jaula cadastrada no backend:
  - Marcador circular posicionado nas coordenadas `location_x`, `location_y` (normalizadas 0–1 sobre o mapa)
  - Cor: `#4CAF50` (verde) se `status = "active"`, `#9E9E9E` (cinza) se `"inactive"`
  - Label com nome do animal abaixo do marcador
  - Pulsação/animação no marcador quando ativo
- Atualização automática via polling: **GET /api/status** a cada **5 segundos**

**Interação:**
- Toque no marcador → navega para Tela de Detalhe da Jaula

---

### 4.2 Tela de Detalhe da Jaula

**Elementos:**
- Nome e espécie do animal (título)
- Snapshot mais recente (imagem): **GET /api/cage/{id}/snapshot**
  - Placeholder com ícone de câmera se não houver imagem
- Status atual em badge colorido (Ativo / Inativo)
- Gráfico de barras: atividade por hora nas últimas 24h — **GET /api/cage/{id}/history**
  - Eixo X: hora do dia (0–23)
  - Eixo Y: `active_ratio` (0–100%)
- Botão "Voltar ao Mapa"

---

### 4.3 Tela de Chat com IA

**Elementos:**
- Histórico de mensagens (scroll) — usuário à direita, IA à esquerda
- Campo de texto para digitação (teclado virtual tela cheia)
- Botão "Enviar" — chama **POST /api/chat**
- Indicador de carregamento enquanto aguarda resposta
- Botão "Limpar conversa"
- Botão "Voltar ao Mapa"

**UX:**
- Mensagens de boas-vindas pré-definidas como sugestões de perguntas clicáveis:
  - "Qual animal está mais ativo agora?"
  - "Me fale sobre os leões"
  - "Qual o melhor horário para ver as girafas?"

---

### 4.4 Tela de Sugestão de Roteiro

**Elementos:**
- Título: "Roteiro Sugerido para Agora"
- Lista ordenada de jaulas com:
  - Número da ordem (#1, #2, #3…)
  - Nome do animal
  - Barra de progresso indicando `expected_activity` (0–100%)
  - Status atual em badge
- Botão "Atualizar Roteiro" — chama **GET /api/route/suggest**
- Atualização automática a cada **5 minutos**
- Botão "Voltar ao Mapa"

---

## 5. Design System

### Tipografia
- Fonte principal: `Roboto` ou `Inter` (sans-serif, legível a distância)
- Tamanho mínimo de texto: **18px** (visibilidade no totem)
- Títulos: **32px+**

### Cores
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-active` | `#4CAF50` | Animal ativo |
| `--color-inactive` | `#9E9E9E` | Animal inativo |
| `--color-primary` | `#2E7D32` | Botões principais, cabeçalho |
| `--color-bg` | `#F5F5F5` | Fundo geral |
| `--color-surface` | `#FFFFFF` | Cards e painéis |
| `--color-text` | `#212121` | Texto principal |

### Componentes de Toque
- Área mínima clicável: **48x48px** (acessibilidade touchscreen)
- Feedback visual imediato ao toque (ripple effect ou highlight)
- Sem hover states (interface touch-only)

---

## 6. Integração com a API

**Base URL:** `http://{raspberry_ip}:8000` (definir via variável de ambiente/config)

| Tela | Endpoint | Método | Intervalo |
|------|----------|--------|-----------|
| Mapa | `/api/status` | GET | Polling 5s |
| Detalhe | `/api/cage/{id}/history` | GET | Ao navegar |
| Detalhe | `/api/cage/{id}/snapshot` | GET | Ao navegar |
| Chat | `/api/chat` | POST | Por mensagem |
| Roteiro | `/api/route/suggest` | GET | Polling 5min |

**Tratamento de erros:**
- API indisponível: exibir banner "Servidor temporariamente offline" e continuar tentando
- Snapshot 404: exibir placeholder
- Chat timeout (>10s): exibir mensagem "Tente novamente"

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Critério |
|----|-----------|----------|
| RNF_UI1 | Responsividade | Interface adaptada à resolução da tela touchscreen (ex: 1024x600 ou 1280x800) |
| RNF_UI2 | Performance | Transições entre telas < 300ms |
| RNF_UI3 | Offline parcial | Exibir último estado conhecido se API cair |
| RNF_UI4 | Inatividade | Retornar ao Mapa após 60s sem toque |

---

## 8. Stack Técnica

**Opção A — React (recomendada para touchscreen moderno):**
```
React + Vite
Chart.js (gráfico de atividade)
Tailwind CSS
```

**Opção B — Vue.js:**
```
Vue 3 + Vite
Chart.js ou ApexCharts
Tailwind CSS ou UnoCSS
```

**Opção C — Tkinter (se preferir Python puro, sem browser):**
```
Python 3 + Tkinter
matplotlib (gráficos)
requests (API calls)
```

> Para exibição em Raspberry Pi sem gerenciador de janelas, considerar executar o browser em modo kiosk:
> `chromium-browser --kiosk http://localhost:3000`

---

## 9. Configuração de Build/Deploy no Raspberry Pi

**Para React/Vue:**
```bash
npm run build          # gera /dist
# servir com nginx ou python -m http.server no diretório /dist
```

**Kiosk mode (autostart no boot):**
```bash
# /etc/xdg/autostart/smartzoo-kiosk.desktop
[Desktop Entry]
Exec=chromium-browser --kiosk --disable-infobars http://localhost:3000
```

---

## 10. Entregas

- [ ] **E3.1** — Layout base do totem com navegação entre as 4 telas funcionando
- [ ] **E3.2** — Mapa interativo com marcadores de jaula e status atualizado em tempo real (polling)
- [ ] **E3.3** — Interface de chat funcional conectada ao `/api/chat`
- [ ] **E3.4** — Tela de sugestão de roteiro e tela de detalhe da jaula (snapshot + gráfico)
- [ ] **E3.5** — Testes no hardware final (touchscreen): toque, legibilidade, fluxo de navegação

---

## 11. Dependências com Outros Módulos

| Dependência | Módulo | Detalhe |
|-------------|--------|---------|
| API REST disponível | SPEC-02 (Backend) | Frontend depende de todos os endpoints do SPEC-02 |
| IP do Raspberry Pi | SPEC-02 (Backend) | Configurar `VITE_API_BASE_URL` antes do build |
| Coordenadas das jaulas no mapa | SPEC-02 (Backend) | `location_x` e `location_y` devem ser populadas no banco para posicionar os marcadores |
| Imagem do mapa do zoo | — | Criar ou obter planta baixa do zoo para uso como fundo do mapa interativo |

---

## 12. Critérios de Aceite

- Mapa exibindo todos os animais cadastrados com status correto (verde/cinza)
- Status atualiza automaticamente sem recarregar a página
- Chat envia pergunta e exibe resposta da IA em < 10s
- Tela de detalhe exibe gráfico de atividade das últimas 24h
- Interface navegável apenas por toque, sem necessidade de teclado/mouse
- Sistema retorna ao mapa após 60s de inatividade
