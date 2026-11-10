import test from 'node:test';
import assert from 'node:assert/strict';
import { clampDrag, dragOffsets, moveItem, orderTeams, targetIndex } from '../src/team-order.js';

const team = (id, name, members = []) => ({ id, name, members });

test('without a saved order, the caller\'s teams come first, then names', () => {
  const teams = [team('a', 'Zulu', ['me']), team('b', 'Alpha'), team('c', 'Mike', ['me'])];
  assert.deepEqual(orderTeams(teams, [], 'me').map(item => item.id), ['c', 'a', 'b']);
});

test('a saved order wins, new teams follow it, and removed teams are ignored', () => {
  const teams = [team('a', 'Alpha', ['me']), team('b', 'Bravo'), team('c', 'Charlie'), team('d', 'Delta', ['me'])];
  assert.deepEqual(orderTeams(teams, ['c', 'gone', 'a'], 'me').map(item => item.id), ['c', 'a', 'd', 'b']);
});

test('ordering does not change the caller\'s list', () => {
  const teams = [team('b', 'Bravo'), team('a', 'Alpha')];
  orderTeams(teams, ['a'], 'me');
  assert.deepEqual(teams.map(item => item.id), ['b', 'a']);
});

test('moveItem moves up, down and in place without changing the original', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(list, 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveItem(list, 1, 1), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

// Three teams of different heights, 8px apart.
const rects = [{ top: 0, bottom: 40, height: 40 }, { top: 48, bottom: 148, height: 100 }, { top: 156, bottom: 196, height: 40 }];

test('the target slot follows the pointer past each other team\'s midpoint', () => {
  assert.equal(targetIndex(rects, 0, 10), 0);
  assert.equal(targetIndex(rects, 0, 97), 0);
  assert.equal(targetIndex(rects, 0, 99), 1);
  assert.equal(targetIndex(rects, 0, 190), 2);
  assert.equal(targetIndex(rects, 2, 5), 0);
  assert.equal(targetIndex(rects, 2, 60), 1);
  assert.equal(targetIndex(rects, 2, 120), 2);
});

test('teams between the slots shift by the dragged height plus the gap', () => {
  assert.deepEqual(dragOffsets(rects, 0, 2), { offsets: [0, -48, -48], landing: 156 });
  assert.deepEqual(dragOffsets(rects, 2, 0), { offsets: [48, 48, 0], landing: -156 });
  assert.deepEqual(dragOffsets(rects, 1, 1), { offsets: [0, 0, 0], landing: 0 });
});

test('a dragged team stays inside the list', () => {
  assert.equal(clampDrag(rects, 2, 500), 0);
  assert.equal(clampDrag(rects, 2, -500), -156);
  assert.equal(clampDrag(rects, 0, 500), 156);
  assert.equal(clampDrag(rects, 1, 20), 20);
});

test('dragging the only team moves nothing', () => {
  assert.deepEqual(dragOffsets([{ top: 0, bottom: 40, height: 40 }], 0, 0), { offsets: [0], landing: 0 });
});
