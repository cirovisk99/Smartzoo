# Roteiro — Vídeo Sprint Retro 3 | SmartZoo
**Grupo ABC** | Roberto Batista (SM) · André Barbosa · Ciro Yamauchi | Turma 1TIAPR
**Duração estimada:** ~4:50 min

---

## ABERTURA — 0:00 a 0:30

> *[Mostrar a tela do dashboard com as 7 jaulas no mapa]*

"Olá! Somos o grupo SmartZoo e este é o nosso vídeo de retrospectiva da Sprint 3.

Na Sprint Review 3 apresentamos aproximadamente 60% do nosso MVP para a Flexmedia — um sistema de monitoramento inteligente de animais em zoológicos, com mapa em tempo real, histórico de comportamento e um guia virtual por voz chamado Juba.

Neste vídeo vamos compartilhar o feedback que recebemos, o que está validado, o que planejamos evoluir e como dividimos as tarefas para a Sprint 4."

---

## FEEDBACK DA FLEXMEDIA — 0:30 a 1:15

> *[Mostrar slide ou câmera]*

"O retorno da Flexmedia foi **muito positivo**. O ponto que mais se destacou foi a **diferenciação da nossa abordagem**.

A maioria dos grupos está desenvolvendo totens voltados para a experiência do visitante — câmeras que detectam o humor da pessoa, jogos interativos, reconhecimento facial. São soluções legítimas, mas focadas no ser humano em frente ao totem.

O SmartZoo fez o caminho inverso: **nosso totem olha para dentro — para o ambiente e para os animais**. O sistema monitora comportamento, temperatura, atividade e presença dentro das jaulas, e entrega isso em tempo real para gestores e visitantes.

A empresa reconheceu essa diferenciação como um diferencial estratégico e **incentivou a equipe a continuar com o escopo atual**, sem grandes desvios de rota."

---

## O QUE FOI VALIDADO — 1:15 a 2:00

> *[Mostrar o dashboard ao vivo ou gravação]*

"A Flexmedia validou os quatro pilares do nosso MVP:

**Primeiro** — as **7 jaulas monitoradas em tempo real** via MQTT, com o mapa interativo mostrando o status de cada animal.

**Segundo** — o **guia por voz Juba**, nosso mascote que responde perguntas sobre os animais usando inteligência artificial. O visitante fala, o sistema transcreve via Gemini, processa e responde com voz sintetizada em português.

**Terceiro** — o **boot automático completo**. O sistema liga sozinho no Raspberry Pi — nenhum comando manual necessário para a demo funcionar.

**Quarto** — o **histórico de 24 horas** com gráfico de atividade por animal, essencial para veterinários acompanharem padrões de comportamento ao longo do dia."

---

## O QUE PRECISA SER MELHORADO — 2:00 a 2:30

> *[Câmera ou slide]*

"O feedback de melhoria foi pontual e bem direcionado:

O principal ponto levantado foi **aprofundar a inteligência do sistema**. Hoje o Juba responde bem perguntas gerais, mas a empresa quer ver o sistema **detectar anomalias automaticamente** — por exemplo, um animal que ficou inativo por muito mais tempo do que o seu padrão histórico, gerando um alerta para o veterinário sem intervenção humana.

Outro ponto foi a **personalização por espécie**: atualmente todos os animais têm padrões de atividade similares no sistema. Precisamos refletir que leões são mais ativos ao amanhecer, hipopótamos à noite, flamingos ao meio-dia — tornando o guia de voz muito mais preciso e interessante para o visitante."

---

## COMO REORGANIZAMOS O KANBAN — 2:30 a 3:15

> *[Mostrar o GitHub Projects / kanban na tela]*

"Com base nesse feedback, revisamos nosso backlog e organizamos o kanban no GitHub Projects.

Temos três colunas:

Na coluna **Sprint 3 Concluído** estão os 6 cards fechados: monitoramento em tempo real, integração MQTT e YOLOv8, guia de voz Juba, boot automático, histórico 24h e o sistema de demo com dados simulados.

Na coluna **Entregáveis** estão os dois cards desta sprint: este vídeo e o documento PDF de análise.

Na coluna **Sprint 4 — A Fazer** estão os 4 cards priorizados: Painel Administrativo, Detecção de Anomalias por IA, Horários de atividade diferenciados por espécie, e Expansão de Hardware.

Cada card tem critérios de aceitação definidos, estimativa em story points e responsável atribuído."

---

## ESTRATÉGIA PARA O MVP FINAL — 3:15 a 4:00

> *[Slide ou câmera]*

"Nossa estratégia para a Sprint 4 é evoluir de 60% para o MVP final em três frentes:

**Frente 1 — Inteligência:** Detecção automática de anomalias comportamentais com notificação para veterinários. Isso fecha o ciclo — de monitorar passivamente para **agir proativamente**.

**Frente 2 — Gestão:** Painel administrativo para a equipe do zoo gerenciar recintos, visualizar alertas e gerar relatórios. O sistema deixa de ser só para o visitante e passa a ser uma ferramenta de trabalho real.

**Frente 3 — Realismo:** Horários de atividade distintos por espécie, tornando o guia Juba muito mais preciso, e suporte a múltiplos nós ESP32 por recinto para maior cobertura do zoológico.

A meta é que na Sprint Review 4 o sistema funcione como um produto real — não só uma demo."

---

## DIVISÃO DE TAREFAS — 4:00 a 4:40

> *[Câmera — podem aparecer os três membros se quiserem]*

"A divisão de trabalho para a Sprint 4 ficou assim:

**Ciro** fica responsável pela Expansão de Hardware — integrar múltiplos nós ESP32 e câmeras de maior resolução, além de coordenar a integração geral do sistema.

**André** assume a Detecção de Anomalias por IA e os horários de atividade diferenciados por espécie — as duas tarefas que mais tocam na inteligência do sistema.

**Roberto** lidera o Painel Administrativo — a interface web para a equipe do zoo — e é o responsável pelo documento PDF de análise desta sprint.

Continuamos trabalhando com ciclos curtos de entrega e revisões semanais para garantir que o MVP final esteja sólido."

---

## FECHAMENTO — 4:40 a 5:00

> *[Mostrar o dashboard com o Juba aparecendo no mapa]*

"O SmartZoo nasceu de uma pergunta simples: *e se o zoológico pudesse cuidar melhor dos seus animais com tecnologia acessível?*

A Sprint 3 provou que a resposta é sim. A Sprint 4 vai provar que esse sistema pode ser real.

Obrigado!"
