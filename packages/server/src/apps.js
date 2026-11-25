// The apps a person can connect in one click: official remote MCP servers from
// the registry (registry.modelcontextprotocol.io), surveyed 20/10/2026. The
// registry gives the name and the address; the category and the description in
// Portuguese are ours. Anything else is still reachable through the registry
// search in the same screen, and the bot connects it on its own.

export const APP_CATEGORIES = [
  { id: 'productivity', label: 'Produtividade' },
  { id: 'code', label: 'Código' },
  { id: 'design', label: 'Design' },
  { id: 'communication', label: 'Comunicação' },
  { id: 'data', label: 'Pesquisa' },
  { id: 'payments', label: 'Pagamentos' },
];

export const APPS = [
  {
    id: 'notion',
    title: 'Notion',
    category: 'productivity',
    domain: 'notion.so',
    serverName: 'com.notion/mcp',
    url: 'https://mcp.notion.com/mcp',
    description: 'Ler e escrever páginas e bancos de dados',
    isRecommended: true,
  },
  {
    id: 'linear',
    title: 'Linear',
    category: 'productivity',
    domain: 'linear.app',
    serverName: 'app.linear/linear',
    url: 'https://mcp.linear.app/mcp',
    description: 'Issues, projetos e ciclos',
    isRecommended: true,
  },
  {
    id: 'atlassian',
    title: 'Atlassian',
    category: 'productivity',
    domain: 'atlassian.com',
    serverName: 'com.atlassian/atlassian-mcp-server',
    url: 'https://mcp.atlassian.com/v2/mcp',
    description: 'Jira e Confluence',
    isRecommended: true,
  },
  {
    id: 'monday',
    title: 'monday.com',
    category: 'productivity',
    domain: 'monday.com',
    serverName: 'com.monday/monday.com',
    url: 'https://mcp.monday.com/mcp',
    description: 'Quadros, itens e atualizações',
  },
  {
    id: 'airtable',
    title: 'Airtable',
    category: 'productivity',
    domain: 'airtable.com',
    serverName: 'com.airtable/mcp',
    url: 'https://mcp.airtable.com/mcp',
    description: 'Bases, tabelas e registros',
  },
  {
    id: 'todoist',
    title: 'Todoist',
    category: 'productivity',
    domain: 'todoist.com',
    serverName: 'net.todoist/mcp',
    url: 'https://ai.todoist.net/mcp',
    description: 'Tarefas e projetos pessoais',
  },
  {
    id: 'zapier',
    title: 'Zapier',
    category: 'productivity',
    domain: 'zapier.com',
    serverName: 'com.zapier/mcp',
    url: 'https://mcp.zapier.com/api/v1/connect',
    description: 'Milhares de apps pelas suas automações',
  },

  {
    id: 'github',
    title: 'GitHub',
    category: 'code',
    domain: 'github.com',
    serverName: 'io.github.github/github-mcp-server',
    url: 'https://api.githubcopilot.com/mcp/',
    description: 'Repositórios, issues e pull requests',
    isRecommended: true,
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare',
    category: 'code',
    domain: 'cloudflare.com',
    serverName: 'com.cloudflare.mcp/mcp',
    url: 'https://bindings.mcp.cloudflare.com/mcp',
    description: 'Workers, KV, R2 e D1',
  },
  {
    id: 'sentry',
    title: 'Sentry',
    category: 'code',
    domain: 'sentry.io',
    serverName: 'io.github.getsentry/sentry-mcp',
    url: 'https://mcp.sentry.dev/mcp',
    description: 'Erros e desempenho em produção',
  },
  {
    id: 'neon',
    title: 'Neon',
    category: 'code',
    domain: 'neon.tech',
    serverName: 'com.neon/mcp',
    url: 'https://mcp.neon.tech/mcp',
    description: 'Bancos Postgres e branches',
  },
  {
    id: 'postman',
    title: 'Postman',
    category: 'code',
    domain: 'postman.com',
    serverName: 'com.postman/postman-mcp-server',
    url: 'https://mcp.postman.com/mcp',
    description: 'Coleções e testes de API',
  },
  {
    id: 'context7',
    title: 'Context7',
    category: 'code',
    domain: 'context7.com',
    serverName: 'io.github.upstash/context7',
    url: 'https://mcp.context7.com/mcp',
    description: 'Documentação atual de bibliotecas',
  },
  {
    id: 'jam',
    title: 'Jam',
    category: 'code',
    domain: 'jam.dev',
    serverName: 'dev.jam/jam',
    url: 'https://mcp.jam.dev/mcp',
    description: 'Relatos de bug com tela e console',
  },

  {
    id: 'figma',
    title: 'Figma',
    category: 'design',
    domain: 'figma.com',
    serverName: 'com.figma.mcp/mcp',
    url: 'https://mcp.figma.com/mcp',
    description: 'Arquivos, frames e componentes',
    isRecommended: true,
  },
  {
    id: 'canva',
    title: 'Canva',
    category: 'design',
    domain: 'canva.com',
    serverName: 'com.canva.mcp/mcp',
    url: 'https://mcp.canva.com/mcp',
    description: 'Criar e editar designs',
  },
  {
    id: 'miro',
    title: 'Miro',
    category: 'design',
    domain: 'miro.com',
    serverName: 'io.github.miroapp/mcp-server',
    url: 'https://mcp.miro.com/',
    description: 'Quadros e diagramas',
  },
  {
    id: 'webflow',
    title: 'Webflow',
    category: 'design',
    domain: 'webflow.com',
    serverName: 'com.webflow/mcp',
    url: 'https://mcp.webflow.com/mcp',
    description: 'Sites, páginas e CMS',
  },
  {
    id: 'wix',
    title: 'Wix',
    category: 'design',
    domain: 'wix.com',
    serverName: 'com.wix/mcp',
    url: 'https://mcp.wix.com/sse',
    transport: 'sse',
    description: 'Sites e lojas',
  },

  {
    id: 'gmail',
    title: 'Gmail',
    category: 'communication',
    domain: 'gmail.com',
    serverName: 'com.mintmcp/gmail',
    url: 'https://gmail.mintmcp.com/mcp',
    description: 'Ler, organizar e rascunhar e-mails',
    isRecommended: true,
  },

  {
    id: 'huggingface',
    title: 'Hugging Face',
    category: 'data',
    domain: 'huggingface.co',
    serverName: 'co.huggingface/hf-mcp-server',
    url: 'https://huggingface.co/mcp?login',
    description: 'Modelos, datasets e Spaces',
  },
  {
    id: 'exa',
    title: 'Exa',
    category: 'data',
    domain: 'exa.ai',
    serverName: 'ai.exa/exa',
    url: 'https://mcp.exa.ai/mcp',
    description: 'Busca na web feita para agentes',
  },

  {
    id: 'stripe',
    title: 'Stripe',
    category: 'payments',
    domain: 'stripe.com',
    serverName: 'com.stripe/mcp',
    url: 'https://mcp.stripe.com',
    description: 'Clientes, cobranças e assinaturas',
  },
  {
    id: 'paypal',
    title: 'PayPal',
    category: 'payments',
    domain: 'paypal.com',
    serverName: 'com.paypal.mcp/mcp',
    url: 'https://mcp.paypal.com/mcp',
    description: 'Pedidos, faturas e transações',
  },
];

// --- Ours, from the catalog --------------------------------------------------
//
// Optional custom MCP catalog URL (set MCP_CATALOG_URL to merge extra servers).
const CATALOG_EVERY_MS = 60 * 60 * 1000;
const THIRD_PARTY = APPS.length;
const STORE_CATEGORIES = APP_CATEGORIES.length;

const CATALOG_STALE_MS = 2 * 60 * 1000;
let catalogReadAt = 0;

export async function refreshCatalogIfStale() {
  if (Date.now() - catalogReadAt > CATALOG_STALE_MS) await loadCatalog();
}

export async function loadCatalog() {
  catalogReadAt = Date.now();
  const catalogUrl = process.env.MCP_CATALOG_URL?.trim() || '';
  if (!catalogUrl) return;
  try {
    const response = await fetch(catalogUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`catalog answered ${response.status}`);
    const { items = [], categories = [] } = await response.json();
    const known = new Set(
      APPS.slice(0, THIRD_PARTY).map((app) => app.serverName),
    );
    const extra = items
      .filter(
        (item) => item?.url && item.serverName && !known.has(item.serverName),
      )
      .map((item) => ({ ...item, isCustom: true }));
    APPS.splice(THIRD_PARTY, APPS.length - THIRD_PARTY, ...extra);
    APP_CATEGORIES.splice(
      STORE_CATEGORIES,
      APP_CATEGORIES.length - STORE_CATEGORIES,
      ...categories.filter(
        (category) =>
          !APP_CATEGORIES.slice(0, STORE_CATEGORIES).some(
            (store) => store.id === category.id,
          ),
      ),
    );
    console.log(`[apps] custom catalog: ${extra.length} connectors`);
  } catch (error) {
    console.warn(`[apps] catalog unavailable (${error.message})`);
  }
}

export function startCatalog() {
  loadCatalog();
  setInterval(loadCatalog, CATALOG_EVERY_MS).unref?.();
}

const iconCache = new Map();

/** The app's icon, fetched once by the control server and kept in memory. */
export async function fetchAppIcon(domain) {
  if (!APPS.some((app) => app.domain === domain)) return null;
  if (iconCache.has(domain)) return iconCache.get(domain);
  const response = await fetch(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return null;
  const icon = {
    body: Buffer.from(await response.arrayBuffer()),
    type: response.headers.get('content-type') || 'image/png',
  };
  iconCache.set(domain, icon);
  return icon;
}
