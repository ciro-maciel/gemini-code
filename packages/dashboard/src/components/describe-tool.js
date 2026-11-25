import {
  IconArrowForwardUp,
  IconBrain,
  IconBrowser,
  IconLayoutDashboard,
  IconClick,
  IconFile,
  IconKeyboard,
  IconMessageQuestion,
  IconPhoto,
  IconPlugConnected,
  IconSearch,
  IconTerminal2,
} from '@tabler/icons-react';

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** What a tool call did, as a person would say it. */
export function describeTool(name, args = {}) {
  const element = args.element ? `“${args.element}”` : '';
  switch (name) {
    case 'browser_navigate':
      return {
        icon: IconBrowser,
        text: `Abriu ${hostOf(args.url)}`,
        detail: args.url,
        isComputer: true,
      };
    case 'browser_navigate_back':
      return { icon: IconBrowser, text: 'Voltou uma página', isComputer: true };
    case 'browser_snapshot':
      return { icon: IconBrowser, text: 'Leu a página', isComputer: true };
    case 'browser_take_screenshot':
      return { icon: IconPhoto, text: 'Olhou a tela', isComputer: true };
    case 'browser_click':
    case 'browser_mouse_click_xy':
      return {
        icon: IconClick,
        text: `Clicou ${element ? `em ${element}` : 'na página'}`,
        isComputer: true,
      };
    case 'browser_type':
      return {
        icon: IconKeyboard,
        text: `Digitou ${element ? `em ${element}` : ''}`,
        detail: args.text,
        isComputer: true,
      };
    case 'browser_fill_form':
      return {
        icon: IconKeyboard,
        text: `Preencheu ${args.fields?.length ?? ''} campos`,
        isComputer: true,
      };
    case 'browser_press_key':
      return {
        icon: IconKeyboard,
        text: `Apertou ${args.key}`,
        isComputer: true,
      };
    case 'browser_select_option':
      return {
        icon: IconClick,
        text: `Escolheu uma opção ${element ? `em ${element}` : ''}`,
        isComputer: true,
      };
    case 'browser_wait_for':
      return { icon: IconBrowser, text: 'Esperou a página', isComputer: true };
    case 'browser_tabs':
      return { icon: IconBrowser, text: 'Mexeu nas abas', isComputer: true };
    case 'computer_shell':
      return {
        icon: IconTerminal2,
        text: 'Rodou um comando',
        detail: args.command,
        isComputer: true,
      };
    case 'computer_job_start':
      return {
        icon: IconTerminal2,
        text: 'Começou um trabalho longo',
        detail: args.command,
        isComputer: true,
      };
    case 'computer_job_wait':
      return {
        icon: IconTerminal2,
        text: 'Acompanhou o trabalho longo',
        detail: args.id,
        isComputer: true,
      };
    case 'computer_job_stop':
      return {
        icon: IconTerminal2,
        text: 'Parou o trabalho longo',
        detail: args.id,
        isComputer: true,
      };
    case 'computer_read_file':
      return {
        icon: IconFile,
        text: 'Leu um arquivo',
        detail: args.path,
        isComputer: true,
      };
    case 'computer_write_file':
      return {
        icon: IconFile,
        text: 'Escreveu um arquivo',
        detail: args.path,
        isComputer: true,
      };
    case 'tools_search':
      return {
        icon: IconSearch,
        text: 'Procurou ferramentas',
        detail: args.query,
      };
    case 'tools_enable':
      return {
        icon: IconPlugConnected,
        text: 'Ativou ferramentas',
        detail: (args.names || []).join(', '),
      };
    case 'service_connect':
      return {
        icon: IconPlugConnected,
        text: `Conectando ${args.serverName}`,
        detail: args.remoteUrl,
      };
    case 'memory_save':
      return {
        icon: IconBrain,
        text: 'Guardou na memória',
        detail: args.content,
      };
    case 'skill_save':
      return { icon: IconBrain, text: `Guardou a habilidade: ${args.name}` };
    case 'ask_user':
      return {
        icon: IconMessageQuestion,
        text: 'Perguntou a você',
        detail: args.question,
      };
    case 'bot_handoff':
      return {
        icon: IconArrowForwardUp,
        text: `Passou a ${args.to}`,
        detail: args.message,
      };
    case 'artifact_publish':
      return {
        icon: IconLayoutDashboard,
        text: `Publicou ${args.artifact?.title ? `“${args.artifact.title}”` : 'um artifact'}`,
        detail: args.path,
      };
    default:
      if (name?.startsWith('mcp__')) {
        // The connection's id says little; the tool's own name says what it did ("Feeds schedule piece").
        const [, service, tool = ''] = name.split('__');
        // The four tools of every house product (<p>_guide, _read, _write, _delete) say what they do in words.
        const four = /^([a-z0-9]+)_(guide|read|write|delete)$/.exec(tool);
        if (four) {
          const product = four[1].charAt(0).toUpperCase() + four[1].slice(1);
          const what = {
            guide: `Leu o guia do ${product}`,
            read: `Lendo no ${product}`,
            write: `Fazendo no ${product}`,
            delete: `Apagando no ${product}`,
          }[four[2]];
          return {
            icon: IconPlugConnected,
            text: what,
            detail: args.op || args.path || '',
          };
        }
        const words = tool.replace(/[_-]+/g, ' ').trim();
        return {
          icon: IconPlugConnected,
          text: words
            ? words.charAt(0).toUpperCase() + words.slice(1)
            : service,
          detail: service,
        };
      }
      return { icon: IconBrowser, text: name };
  }
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The steps between two things the agent said, as one line: what it did, the
 * same kind counted once ("Rodou um comando 3×, leu um arquivo e mais 2").
 */
export function summarizeSteps(steps) {
  const kinds = [];
  for (const step of steps) {
    const { text } = describeTool(step.name, step.args || {});
    const kind = kinds.find((each) => each.text === text);
    if (kind) kind.count++;
    else kinds.push({ text, count: 1 });
  }
  const SHOWN = 3;
  const parts = kinds
    .slice(0, SHOWN)
    .map(
      (kind, index) =>
        `${index ? lowerFirst(kind.text) : kind.text}${kind.count > 1 ? ` ${kind.count}×` : ''}`,
    );
  const rest = kinds.slice(SHOWN).reduce((sum, kind) => sum + kind.count, 0);
  if (rest) parts.push(`mais ${rest} ${rest === 1 ? 'passo' : 'passos'}`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`
    : (parts[0] ?? '');
}

/** Where a step happened, as one word for the work's summary line: the service, the memory, the computer. */
export function placeOf(name = '') {
  if (name.startsWith('mcp__')) {
    // The connection's id is its name cut short ("feeds_a_grande_v"); the tool says the product
    // ("feeds_read"). When the connection starts with the tool's product, the product is the place.
    const [, service = '', tool = ''] = name.split('__');
    const product = tool.split(/[_-]/)[0];
    const place =
      product && service.toLowerCase().startsWith(product.toLowerCase())
        ? product
        : service.split(/[_-]+/).slice(0, 2).join(' ');
    return place ? place.charAt(0).toUpperCase() + place.slice(1) : null;
  }
  if (name.startsWith('memory_') || name.startsWith('skill_')) return 'memória';
  if (name.startsWith('computer_')) return 'computador';
  if (name.startsWith('browser_')) return 'navegador';
  if (name.startsWith('chrome_')) return 'seu Chrome';
  if (name.startsWith('file_') || name.startsWith('repo_')) return 'arquivos';
  return null;
}
