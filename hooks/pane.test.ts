import { test, expect } from 'claude-code/testing';

for (const surface of ['desktop', 'terminal'] as const) {
  test(`renders the team pane on ${surface}`, async $ => {
    const ui = await $.ui.mount({
      plugin: 'team-panel', surface, component: 'Pane', requestId: 'team-panel',
      props: { title: 'Team', isFocused: false, bodyColumns: 60, placement: 'dock',
        scroll: { top: 0, left: 0, bodyRows: 40 }, view: {} },
    });
    const drawing = JSON.stringify(await ui.drawn());
    expect(drawing.includes('团队面板')).toBe(true);
    expect(drawing.includes('任务流')).toBe(true);
    for (const field of ['状态：', '模式：', '团队角色：', 'Token 用量：', '耗时：']) {
      expect(drawing.includes(field)).toBe(true);
    }
  });
}
