import { atom, read, update } from 'claude-code';
import type { EngineInterface, RenderInput } from 'claude-code';
import { initial, label, treeRows } from './model';

const panel = atom({ plugin: 'team-panel', key: 'panel' } as const, initial);

const nodePalette = (status: string) => {
  if (status === 'running' || status === 'in_progress') return { ink: '#146547', fill: '#edf8f1', line: '#32936b' };
  if (status === 'completed') return { ink: '#294f9b', fill: '#eef3fc', line: '#6689cd' };
  if (status === 'failed') return { ink: '#9b3141', fill: '#fff0f2', line: '#cd6575' };
  if (status === 'waiting' || status === 'pending') return { ink: '#815515', fill: '#fff7e8', line: '#b78a3d' };
  return { ink: '#50566b', fill: '#f2f3f7', line: '#8a91a7' };
};

const connectorSvg = (stroke: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="38" viewBox="0 0 72 38"><path d="M16 0 V14 Q16 22 24 22 H52 V33" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M48 28 L52 33 L56 28" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function drawPanel($: EngineInterface, e: RenderInput, refresh: () => Promise<void>) {
  const { Box, Text, Button, Markdown } = $.ui.resolve(e);
  const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined;
  const p = await read($, panel);
  const toggle = (id: string) => update($, panel, current => ({ ...current, selected: current.selected === id ? '' : id }));
  const rows = [{ member: {
    id: 'main', name: '主代理', description: p.project, status: p.mainStatus,
    mode: '主会话', role: 'lead · 协调者', model: p.mainModel, tokens: p.mainTokens,
    observedAt: p.mainStartedAt ?? Date.now(), recent: p.mainRecent, calls: p.mainCalls ?? 0,
    activeStartedAt: p.mainActiveStartedAt, currentDurationMs: p.mainCurrentDurationMs,
    endedAt: undefined as number | undefined, durationMs: p.mainDurationMs,
    tool: p.mainTool,
  }, depth: 0 }, ...treeRows(p.members)];
  const tasks = p.tasks;
  return <Box flexDirection="column" gap="md" padding="sm">
    <Box flexDirection="column" gap="sm" paddingY="sm" borderStyle="round" borderDimColor={true}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text bold>团队面板 · Team Panel</Text>
        <Button key="refresh" label="刷新" onPress={refresh} />
      </Box>
      <Text dimColor>{p.project || '当前会话'} · {rows.length} 成员 · {p.members.filter(m => m.status === 'running').length + (p.mainStatus === 'running' ? 1 : 0)} 运行中</Text>
      {p.error && <Text color="yellow">{p.error}</Text>}
      <Box flexDirection="row" gap="sm" flexWrap="wrap" marginTop="xs">
        {['running', 'waiting', 'completed', 'failed'].map(status => <Text color={nodePalette(status).ink}>{label(status)}</Text>)}
      </Box>
      {rows.map(({ member: m, depth }) => {
        const expanded = p.selected === m.id;
        const active = m.status === 'running';
        const elapsed = active ? Date.now() - (m.activeStartedAt ?? m.observedAt) : (m.currentDurationMs ?? m.durationMs ?? ((m.endedAt ?? m.observedAt) - m.observedAt));
        const seconds = Math.max(0, Math.floor(elapsed / 1000));
        const parent = rows.find(row => row.member.id === ('parentId' in m ? m.parentId : undefined))?.member.name || '主代理';
        const palette = nodePalette(m.status);
        return <Box key={`branch:${m.id}`} flexDirection="column" gap={0} marginLeft={Math.min(depth, 4) * 2}>
          {depth > 0 && <Box flexDirection="row" alignItems="center" gap="xs">
            {Svg ? <Svg source={connectorSvg(palette.line)} alt={`${parent} 连接到 ${m.name}`} width={72} height={38} />
              : <Text color={palette.ink}>└─</Text>}
            <Text color={palette.ink}>{parent} → {m.name}</Text>
          </Box>}
          <Box key={`card:${m.id}`} flexShrink={1} minWidth={0} flexDirection="column" gap="sm"
            padding="sm" borderStyle="round" borderColor={palette.line} backgroundColor={palette.fill}>
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                <Text bold color={palette.ink}>{m.name} · {label(m.status)}</Text>
                <Text color={palette.ink}>{m.description || '当前会话'}</Text>
              </Box>
              <Button key={`expand:${m.id}`} label={expanded ? '收起' : '展开'} onPress={() => toggle(m.id)} />
            </Box>
            {expanded && <Box key={`details:${m.id}`} flexDirection="column" gap="xs">
              {depth > 0 && <Text dimColor>上级：{parent}</Text>}
              <Text>状态：{label(m.status)}</Text>
              <Text>模式：{m.mode || '子代理（加载前启动）'}</Text>
              <Text>团队角色：{m.role || ('type' in m ? m.type : 'lead')}</Text>
              <Text>模型：{m.model || '暂无数据'}</Text>
              <Text>Token 用量：{m.tokens === undefined ? '暂无已完成回合统计' : `${m.tokens.toLocaleString()}（已观测累计，含缓存）`}</Text>
              <Text>当前上下文：{m.id === 'main' ? `${p.mainContextTokens?.toLocaleString() ?? '暂无数据'} tokens` : '暂无数据'}</Text>
              <Text>当前耗时：{seconds} 秒</Text>
              <Text>运行状态：{active ? (m.tool ? m.tool : '正在处理当前任务') : label(m.status)} · 累计调用 tool {m.calls ?? 0} 次</Text>
            </Box>}
          </Box>
        </Box>;
      })}
    </Box>
    <Box flexDirection="column" gap="sm" paddingY="sm" borderStyle="round" borderDimColor={true}>
      <Text bold>任务流 · Task Flow · {p.tasks.filter(t => t.status === 'completed').length}/{p.tasks.length}</Text>
      <Text dimColor>本轮工作步骤 · 箭头表示执行顺序</Text>
      {tasks.length === 0 ? <Text dimColor>等待本轮工作步骤</Text> : tasks.slice(0, 30).map((t, index) => {
        const palette = nodePalette(t.status);
        return <Box key={`task-flow:${t.id}`} flexDirection="column" gap={0}>
          {index > 0 && <Box flexDirection="row" justifyContent="center" alignItems="center">
            {Svg ? <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 28 32"><path d="M14 0 V26 M8 20 L14 26 L20 20" fill="none" stroke="${palette.line}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`} alt="下一步骤" width={28} height={32} />
              : <Text color={palette.ink}>↓</Text>}
          </Box>}
          <Box key={`task:${t.id}`} flexDirection="column" padding="sm" gap="xs" borderStyle="round"
            borderColor={palette.line} backgroundColor={palette.fill}>
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              <Text bold color={palette.ink}>{index + 1}. {t.subject}</Text>
              <Text color={palette.ink}>{label(t.status)}</Text>
            </Box>
            {t.summary && <Markdown text={t.summary} />}
          </Box>
        </Box>;
      })}
    </Box>
  </Box>;
}
