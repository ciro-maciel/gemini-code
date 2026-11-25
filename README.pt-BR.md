# Gemini Code

**Uma mesa aberta onde vários agentes de programação, construídos em volta do Gemini do Google, trabalham no seu software ao mesmo tempo e pedem a uma pessoa antes de qualquer coisa arriscada.**

Agentes de programação que leem um repositório, rodam comandos e entregam mudanças já fazem parte de como desenvolvedores trabalham. Um agente por vez é a parte fácil. A difícil vem depois: rodar vários juntos sem que um apague o trabalho do outro, com uma pessoa no comando do que importa.

O Gemini Code é uma resposta aberta a isso, construída em volta do Gemini. Você abre quantos agentes o trabalho pede (um engenheiro, um revisor, um depurador) e acompanha todos trabalhando ao mesmo tempo. Cada agente guarda as próprias instruções e a própria memória. O próximo passo, o primeiro marco abaixo, dá a cada um a sua pasta de trabalho, para que um não pise no trabalho do outro.

> Projeto aberto e independente. Sem vínculo, patrocínio ou endosso do Google. "Gemini" é marca do Google LLC.

---

## O que ele faz

- **Uma mesa de agentes (Mesa).** Painéis divididos, um agente por painel, todos rodando juntos. O centro de comando mostra quem está trabalhando, quem espera por você e o que cada um mudou.
- **Construído em volta do Gemini.** Fala direto com a API do Gemini: streaming, resumo do raciocínio, chamada de função, imagem e tokens em cache. O Gemini é o padrão e o único provedor configurado de fábrica; o motor também fala o formato de chat da OpenAI, então outro provedor funciona com a chave dele.
- **Uma pessoa decide o que importa.** Um avaliador de risco lê cada comando, ação no navegador e escrita por conector antes de rodar. Pagamento e login perguntam toda vez. Envio, publicação e exclusão perguntam até você escolher permitir sempre, e o trabalho de rotina para de perguntar.
- **Segredo não chega ao modelo.** Um cofre cifrado por agente põe a chave só no ambiente do comando e tira o valor de tudo o que o modelo lê.
- **Conectores por MCP.** GitHub, Linear, Sentry, Cloudflare, Notion, Figma e outros pelos servidores MCP oficiais, mais um navegador que o agente usa.
- **Entre com a sua assinatura Google.** Os agentes podem rodar numa assinatura Google AI Pro ou Ultra pelo Antigravity CLI do Google, que abre a família Gemini 4 (Neon e outros) sem cobrança de API. Veja [docs/subscription.md](docs/subscription.md).
- **Local primeiro.** Roda na sua máquina, sobre uma pasta, sem conta e sem login. O modo nuvem, um computador Linux isolado por agente na Fly Sprites, é opcional.

## Começar

Você precisa do [Bun](https://bun.sh) 1.2+ e de uma chave da API Gemini no [Google AI Studio](https://aistudio.google.com/apikey). O nível gratuito basta para experimentar.

```bash
git clone https://github.com/ciro-maciel/gemini-code.git
cd gemini-code
bun install
cp .env.example .env        # preencha GEMINI_API_KEY=...
bun run dev                 # servidor em :8787, painel em :5180
```

Abra http://localhost:5180. Para os agentes trabalharem no seu projeto:

```bash
WORKSPACE_DIR=/caminho/do/seu/repo bun run dev
```

## Modelos

O padrão é o modelo Gemini mais rápido que respondeu de forma estável no nível gratuito quando testamos. Troque com `DEFAULT_MODEL`.

| Modelo | Uso |
|---|---|
| `gemini-3.5-flash-lite` (padrão) | Passos do dia a dia, avaliador de risco, títulos |
| `gemini-3.6-flash` | Trabalho difícil, em muitos arquivos |
| `gemini-3.5-flash` | Reserva quando os outros estão ocupados |

Numa rodada em 24/11/2026 (nível gratuito, um pedido que chama uma ferramenta), o `gemini-3.5-flash-lite` começou a responder em 0,75 s e o `gemini-3.6-flash` em 1,5 s. Quando um modelo está sobrecarregado ou sem cota, o motor passa sozinho para o próximo que está bem.

## Como é construído

| Pasta | Tecnologia | O que é |
|---|---|---|
| `control/` | Bun, SQLite (WAL) | API e transmissão ao vivo, o laço do agente, o adaptador do Gemini, avaliador de risco, cliente MCP, cofre, execução local e na nuvem |
| `dashboard/` | React 19, Vite, Mantine 8 | A mesa: painéis, centro de comando, conversas dos agentes, aprovações, trilha de auditoria |
| `computer/` | Ubuntu, Chrome, Playwright MCP | Imagem opcional de um computador isolado na nuvem por agente |
| `worker/` | Cloudflare Worker | Porta pública e despertador opcionais para a nuvem |
| `workspace/` | Arquivos | Onde moram os agentes e as habilidades compartilhadas |

## Próximos passos

**Marco 1, em andamento: cada agente com a sua árvore de arquivos.** Sai a aba Arquivos compartilhada. A árvore de cada agente aparece ao lado da conversa, com o que ele mudou marcado. O terminal de cada agente começa na pasta dele e não sai dela, e cada agente ganha o seu `git worktree` do projeto.

Os marcos seguintes são discutidos nas issues.

## Contribuir

Issues e pull requests são bem-vindos. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes; agentes que trabalham neste repositório leem o [AGENTS.md](AGENTS.md).

## Quem faz

O Gemini Code foi criado por [Ciro Cesar Maciel](https://ciromaciel.click/?ref=oss-gemini-code), que constrói software e agentes de IA e publica como código aberto as ferramentas que usa.

## Licença

[Apache License 2.0](LICENSE). Copyright 2026 Ciro Cesar Maciel e colaboradores.

Read in English: [README.md](README.md).
