import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { sanitizeText } from '@/lib/validation';

test('инфраструктура тестов: алиас @/ и next/server резолвятся', async () => {
  assert.equal(typeof sanitizeText, 'function');
  const req = new NextRequest('http://localhost/api/x', { method: 'POST', body: '{"a":1}' });
  assert.deepEqual(await req.json(), { a: 1 });
});
