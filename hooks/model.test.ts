import { test, expect } from 'claude-code/testing';
import { collectTasks, mergeMembers, treeRows, diagram, initial } from './model';

test('retains completed members when the live roster drops them', () => {
  const first = mergeMembers([], [{ id: 'a', description: 'Review', type: 'Explore', status: 'completed' }], 100);
  expect(mergeMembers(first, [], 200)[0].status).toBe('completed');
});
test('task owner changes and deletions follow successful engine results', () => {
  const tasks = collectTasks([], 'TaskCreate', { subject: 'Build panel' }, { task: { id: '1', subject: 'Build panel' } });
  const updated = collectTasks(tasks, 'TaskUpdate', { taskId: '1', owner: 'ui', status: 'completed' }, { success: true });
  expect(updated[0].owner).toBe('ui');
  expect(updated[0].status).toBe('completed');
  expect(collectTasks(updated, 'TaskUpdate', { taskId: '1', status: 'deleted' }, { success: true }).length).toBe(0);
});
test('cyclic and orphan parent IDs terminate and escape SVG content', () => {
  const members = mergeMembers([], [
    { id: 'a', parentId: 'b', name: '<script>', description: 'A & B', type: 'Explore', status: 'running' },
    { id: 'b', parentId: 'a', description: 'Cycle', type: 'Explore', status: 'idle' },
    { id: 'c', parentId: 'absent', description: 'Orphan', type: 'Explore', status: 'idle' },
  ], 100);
  expect(treeRows(members).length).toBe(3);
  expect(diagram({ ...initial, members }).includes('<script>')).toBe(false);
});
