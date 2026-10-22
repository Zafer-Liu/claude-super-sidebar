import { atom, read, update } from 'claude-code';
import type { EngineInterface, RenderInput } from 'claude-code';
import { initial, treeRows } from './model';
import { summaryBody } from './steps';
import type { Theme } from '../types';
import { activityLabel, generatedLabel, operationLabel, statusLabel, taskStatusLabel, verificationLabel, switchLanguage, switchTheme, t, taskTitle } from './i18n';

const panel = atom({ plugin: 'super-sidebar', key: 'panel' } as const, initial);
const preferences = atom({ plugin: 'super-sidebar', key: 'preferences' } as const, { language: 'zh', theme: 'white', revision: 0, loaded: false } as import('../types').Preferences);
const palettes = {
  white: { background: '#ffffff', ink: '#292d35', muted: '#606570', border: '#b5bac3', connector: '#767c88',
    running: '#23733e', completed: '#255fbb', failed: '#b42332', waiting: '#805800' },
  beige: { background: '#f5efe3', ink: '#342f28', muted: '#696052', border: '#b7ac98', connector: '#81745f',
    running: '#326b37', completed: '#305da3', failed: '#a82b32', waiting: '#795600' },
  black: { background: '#191a1d', ink: '#e6e6e1', muted: '#aaaab2', border: '#575961', connector: '#9597a2',
    running: '#7bd99a', completed: '#8bb9ff', failed: '#ff939d', waiting: '#eac772' },
} as const;
const themes: Theme[] = ['white', 'beige', 'black'];
const statusColor = (status: string, palette: typeof palettes[Theme]) => {
  if (status === 'running' || status === 'in_progress') return palette.running;
  if (status === 'completed') return palette.completed;
  if (status === 'failed') return palette.failed;
  if (status === 'waiting' || status === 'pending' || status === 'killed') return palette.waiting;
  return palette.ink;
};
const elbowArrow = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="28" viewBox="0 0 48 28"><path d="M8 0 V12 H36 V25 M32 21 L36 25 L40 21" fill="none" stroke="${color}" stroke-width="1"/></svg>`;
const stepArrow = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 0 V21 M8 17 L12 21 L16 17" fill="none" stroke="${color}" stroke-width="1"/></svg>`;
const preview = (value: string) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 179)}…` : compact;
};
const marker = (status: string) => status === 'completed' ? '✓' : status === 'failed' ? '×'
  : status === 'running' || status === 'in_progress' ? '●' : '○';

// A short content hash of the loaded modules, so a hot reload that changes the
// code is visible as a different revision. Read once per module load.
async function implementationRevision($: EngineInterface): Promise<string> {
  const files = ['hooks/pane.tsx', 'hooks/steps.ts', 'hooks/i18n.ts', 'hooks/register.tsx', 'hooks/model.ts'];
  let hash = 0;
  for (const file of files) {
    const text = await $.fs.read(`${$.plugin.root}/${file}`).catch(() => '');
    for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
async function pluginVersion($: EngineInterface): Promise<string> {
  const raw = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).catch(() => '');
  const match = /"version"\s*:\s*"([^"]+)"/.exec(raw);
  return match?.[1] ?? '';
}

export async function drawPanel($: EngineInterface, e: RenderInput, refresh: () => Promise<void>) {
  const { Box, Text, Button, Markdown } = $.ui.resolve(e);
  // MarkdownProps exposes no color/style; rich text keeps the native host renderer.
  const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined;
  const p = await read($, panel);
  const pref = await read($, preferences);
  const sessionId = await $.session.id();
  const lang = pref.sessionId === sessionId ? pref.language : 'zh';
  const theme = pref.sessionId === sessionId && (pref.theme === 'beige' || pref.theme === 'black') ? pref.theme : 'white';
  const palette = palettes[theme];
  const buttonVariant = theme === 'black' ? 'primary' as const : 'secondary' as const;
  const tr = (key: Parameters<typeof t>[1]) => t(lang, key);
  // Provenance distinguishes generated operation titles from supplied prose.
  const messages = await $.session.messages().catch(() => []);
  const version = await pluginVersion($);
  const revision = await implementationRevision($);
  if (p.sessionId !== sessionId || await $.session.id() !== sessionId) return <Box />;
  const toggle = async (id: string) => {
    if (await $.session.id() !== sessionId) return;
    await update($, panel, current => current.sessionId !== sessionId ? current
      : { ...current, selected: current.selected === id ? '' : id });
  };
  const rows = [{ member: {
    id: 'main', name: tr('main'), description: p.project, status: p.mainStatus,
    mode: '主会话', role: 'lead · 协调者', model: p.mainModel, tokens: p.mainTokens,
    observedAt: p.mainStartedAt ?? Date.now(), recent: p.mainRecent, calls: p.mainCalls ?? 0,
    activeStartedAt: p.mainActiveStartedAt, currentDurationMs: p.mainCurrentDurationMs,
    endedAt: undefined as number | undefined, durationMs: p.mainDurationMs, tool: p.mainTool,
  }, depth: 0 }, ...treeRows(p.members)];
  // Plan identity is explicit; ordinary prose never promotes a stage to a plan.
  const plans = p.tasks.filter(task => task.kind === 'plan');
  const planIds = new Set(plans.map(task => task.id));
  const tasks = p.tasks.filter(task => !planIds.has(task.id) && Boolean(task.subject.trim()));
  const running = rows.filter(({ member }) => member.status === 'running').length;
  return <Box flexDirection="column" width="100%" gap="lg" padding="sm">
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm" flexWrap="wrap">
        <Text bold>{tr('agents')} · {rows.length}</Text>
        <Box flexDirection="row" gap="xs" alignItems="center">
          <Button key="refresh" label={tr('refresh')} variant={buttonVariant} onPress={refresh} />
        </Box>
      </Box>
      <Text dimColor>{running} {statusLabel(lang, 'running')} · {tr('observedOnly')}</Text>
      {p.error && <Text color={palette.waiting}>{generatedLabel(lang, p.error)}</Text>}
      {rows.map(({ member: m, depth }) => {
        const expanded = p.selected === m.id;
        const active = m.status === 'running';
        const terminal = ['completed', 'failed', 'killed'].includes(m.status);
        const elapsed = active ? Date.now() - (m.activeStartedAt ?? m.observedAt)
          : (m.currentDurationMs ?? m.durationMs ?? ((m.endedAt ?? m.observedAt) - m.observedAt));
        const seconds = Math.max(0, Math.floor(elapsed / 1000));
        const parent = rows.find(row => row.member.id === ('parentId' in m ? m.parentId : undefined))?.member.name || tr('main');
        const activity = m.tool ? activityLabel(lang, m.tool, messages)
          : active ? tr('working') : generatedLabel(lang, m.recent) || tr('noActivity');
        return <Box key={`branch:${m.id}`} flexDirection="column" gap={0} marginLeft={Math.min(depth, 4) * 2} minWidth={0}>
          {depth > 0 && <Box flexDirection="row" gap="xs" alignItems="center">
            {Svg ? <Svg source={elbowArrow('#818791')} alt={tr('parent')} width={48} height={28} />
              : <Text dimColor>└─↓</Text>}
          </Box>}
          <Box key={`card:${m.id}`} flexShrink={1} minWidth={0} flexDirection="column" gap="sm"
            padding="sm" borderStyle="single" borderColor={palette.border} backgroundColor={palette.background}>
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
                <Text color={palette.ink} bold>{m.name}</Text>
                <Text color={statusColor(m.status, palette)}>{marker(m.status)} {statusLabel(lang, m.status)}</Text>
              </Box>
              <Button key={`expand:${m.id}`} variant={buttonVariant} label={expanded ? tr('collapse') : tr('expand')} onPress={() => toggle(m.id)} />
            </Box>
            <Text color={palette.muted}>{tr('elapsed')} {seconds} {tr('seconds')} · {m.calls ?? 0} {tr('calls')}</Text>
            {!terminal && <Text color={palette.muted}>{tr('activity')}: {activity}</Text>}
            {expanded && m.description && <Text color={palette.ink}>{m.description}</Text>}
            {expanded && <Box key={`details:${m.id}`} flexDirection="column" gap="xs">
              {depth > 0 && <Text color={palette.muted}>{tr('parent')}: {parent}</Text>}
              <Text color={palette.ink}>{tr('mode')}: {generatedLabel(lang, m.mode || '子代理（加载前启动）')}</Text>
              <Text color={palette.ink}>{tr('role')}: {generatedLabel(lang, m.role || ('type' in m ? m.type : 'lead'))}</Text>
              <Text color={palette.ink}>{tr('model')}: {m.model || tr('unavailable')}</Text>
              <Text color={palette.ink}>{tr('tokens')}: {m.tokens === undefined ? tr('tokenUnavailable') : `${m.tokens.toLocaleString()} · ${tr('tokenCumulative')}`}</Text>
              <Text color={palette.ink}>{tr('context')}: {m.id === 'main'
                ? (p.mainContextTokens !== undefined ? `${p.mainContextTokens.toLocaleString()} tokens` : tr('contextUnavailable'))
                : tr('contextUnavailable')}</Text>
            </Box>}
          </Box>
        </Box>;
      })}
    </Box>
    <Box flexDirection="column" gap="sm">
      <Text bold>{tr('tasks')} · {tasks.filter(task => task.status === 'completed').length}/{tasks.length}{p.mainStatus === 'running' ? ` · ${statusLabel(lang, 'in_progress')}` : ''}</Text>
      <Text dimColor>{tr('stepOrder')}</Text>
      {plans.map(plan => {
        const expanded = p.selected === `plan:${plan.id}`;
        const body = plan.summary === t('zh', 'noPlan') ? tr('noPlan') : plan.summary;
        return <Box key={`plan:${plan.id}`} flexDirection="column" gap="sm" padding="sm" borderStyle="single" borderColor={palette.border} backgroundColor={palette.background} minWidth={0}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
            <Box flexDirection="column" gap="xs" flexShrink={1} minWidth={0}>
              <Text color={palette.ink} bold>{tr('plan')}</Text>
              <Text color={statusColor(plan.status, palette)}>{taskStatusLabel(lang, plan.status)}</Text>
            </Box>
            <Button key={`expand-plan:${plan.id}`} variant={buttonVariant} label={expanded ? tr('collapse') : tr('expand')}
              onPress={() => toggle(`plan:${plan.id}`)} />
          </Box>
          {expanded && body && <Markdown text={body} />}
          {expanded && (plan.operations?.length ?? 0) > 0 && <Box flexDirection="column" gap="xs">
            <Text color={palette.muted}>{plan.operationCount ?? plan.operations?.length} {tr('operations')}</Text>
            {plan.operations!.slice(0, 40).map(operation => <Text key={operation.id} color={palette.ink}>
              {operationLabel(lang, operation, messages)} · {taskStatusLabel(lang, operation.status)}
            </Text>)}
          </Box>}
        </Box>;
      })}
      {tasks.length === 0 ? (p.mainStatus !== 'running' && <Text dimColor>{tr('emptyTasks')}</Text>) : tasks.slice(0, 30).map((task, index) => {
        const expanded = p.selected === `task:${task.id}`;
        const summary = summaryBody(task.summary ?? '');
        return <Box key={`task-flow:${task.id}`} flexDirection="column" gap={0} minWidth={0}>
          {index > 0 && <Box paddingLeft="sm">
            {Svg ? <Svg source={stepArrow('#818791')} alt={tr('stepOrder')} width={24} height={24} />
              : <Text dimColor>↓</Text>}
          </Box>}
          <Box key={`task:${task.id}`} flexDirection="column" padding="sm" gap="sm" borderStyle="single" borderColor={palette.border} backgroundColor={palette.background} minWidth={0}>
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
                <Text color={palette.ink} bold>{index + 1}. {taskTitle(lang, task, messages)}</Text>
                <Text color={statusColor(task.status, palette)}>{marker(task.status)} {task.status === 'completed' && !task.operationCount ? tr('replyComplete') : taskStatusLabel(lang, task.status)}</Text>
              </Box>
              {((task.operations?.length ?? 0) > 0 || Boolean(task.summary && task.summary.trim().length > 180) || Boolean(task.verification?.evidence)) && <Button key={`expand-task:${task.id}`} variant={buttonVariant} label={expanded ? tr('collapse') : tr('expand')}
                onPress={() => toggle(`task:${task.id}`)} />}
            </Box>
            {(expanded ? task.summary : summary) && (expanded ? <Markdown text={task.summary!} /> : <Text color={palette.muted}>{preview(summary)}</Text>)}
            {(task.operations?.length ?? 0) > 0 && <Box flexDirection="column" gap="xs">
              {task.operations!.slice(0, expanded ? 40 : 3).map(operation => <Text key={operation.id} color={statusColor(operation.status, palette)}>
                {marker(operation.status)} {operationLabel(lang, operation, messages)} · {taskStatusLabel(lang, operation.status)}
              </Text>)}
              {(task.operationCount ?? 0) > (expanded ? 40 : 3) && <Text color={palette.muted}>{task.operationCount} {tr('operations')}</Text>}
            </Box>}
            {task.kind === 'stage' && (expanded || task.verification?.status && task.verification.status !== 'unknown') && <Text color={palette.muted}>
              {task.verification?.status && task.verification.status !== 'unknown' ? `${tr('verification')}: ` : ''}{verificationLabel(lang, task.verification?.status ?? 'unknown')}
              {task.verification?.source === 'assistant' ? ` · ${tr('assistantReported')}` : ''}
            </Text>}
            {expanded && task.verification?.evidence && <Text color={palette.muted}>{task.verification.evidence}</Text>}

          </Box>
        </Box>;
      })}
    </Box>
    <Box flexDirection="column" gap="sm" borderStyle="single" borderColor={palette.border} backgroundColor={palette.background} padding="sm">
      <Text color={palette.ink} bold>{tr('preferences')}</Text>
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
        <Text color={palette.ink}>{tr('language')}</Text>
        <Button key="language" variant={buttonVariant} label={lang === 'zh' ? 'EN' : '中文'}
          onPress={() => switchLanguage($, sessionId, lang === 'zh' ? 'en' : 'zh')} />
      </Box>
      <Box flexDirection="row" gap="xs" alignItems="center" flexWrap="wrap">
        <Text color={palette.ink}>{tr('theme')}</Text>
        {themes.map(value => {
          const selected = value === theme;
          const label = `${tr(value)}${selected ? ` · ${tr('selected')}` : ''}`;
          return <Button key={`theme:${value}`} label={label} variant={selected ? 'primary' : buttonVariant}
            onPress={() => switchTheme($, sessionId, value)} />;
        })}
      </Box>
      <Box flexDirection="column" gap="xs">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
          <Text color={palette.muted}>{tr('version')}</Text>
          <Button key="expand-version" variant={buttonVariant}
            label={p.selected === 'version' ? tr('collapse') : tr('expand')}
            onPress={() => toggle('version')} />
        </Box>
        {p.selected === 'version' && <Box flexDirection="column" gap="xs">
          <Text color={palette.ink}>{tr('pluginVersion')}: {version || tr('unavailable')}</Text>
          <Text color={palette.ink}>{tr('revision')}: {revision}</Text>
        </Box>}
      </Box>
    </Box>
  </Box>;
}
