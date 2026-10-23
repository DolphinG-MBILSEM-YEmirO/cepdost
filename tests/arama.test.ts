// Tests for text search: Turkish letters, highlighting and snippets.
//
//   npm test

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aramaSorgusu, eslesiyor, eslesmeOzeti, eslesmeParcalari, katla } from '../src/lib/arama'

test('folding: case and Turkish letters, keeping the length', () => {
  assert.equal(katla('ÇAY İçelim, Işık'), 'cay icelim, isik')
  assert.equal(katla('Gül Şövalye Kâmil'), 'gul sovalye kamil')
  for (const metin of ['İİİ', 'Çay ☕ 👋🏽 içelim']) assert.equal(katla(metin).length, metin.length)
})

test('a query: trimmed and folded, nothing for blanks', () => {
  assert.equal(aramaSorgusu('  Çay   Saati '), 'cay saati')
  assert.equal(aramaSorgusu('   '), null)
  assert.equal(eslesiyor('Yarın ÇAY içelim mi?', aramaSorgusu('cay')!), true)
  assert.equal(eslesiyor('Kahve', aramaSorgusu('cay')!), false)
})

test('highlighting marks every match in the original spelling', () => {
  assert.deepEqual(eslesmeParcalari('Çay mı, çay mı?', 'cay'), [
    { metin: 'Çay', eslesme: true },
    { metin: ' mı, ', eslesme: false },
    { metin: 'çay', eslesme: true },
    { metin: ' mı?', eslesme: false },
  ])
  assert.deepEqual(eslesmeParcalari('☕ çay', 'cay'), [
    { metin: '☕ ', eslesme: false },
    { metin: 'çay', eslesme: true },
  ])
  assert.deepEqual(eslesmeParcalari('kahve', 'cay'), [{ metin: 'kahve', eslesme: false }])
})

test('a long message shows the part around its match', () => {
  const uzun = `${'a'.repeat(100)} buluşalım mı ${'b'.repeat(200)}`
  const ozet = eslesmeOzeti(uzun, 'bulusalim', 10, 20)
  assert.ok(ozet.startsWith('…') && ozet.endsWith('…') && ozet.includes('buluşalım mı'))
  assert.equal(eslesmeOzeti('Kısa mesaj', 'kisa'), 'Kısa mesaj')
  // An emoji at the edge isn't cut in half.
  const emojili = `${'x'.repeat(9)}😀 çay 😀`
  assert.equal(eslesmeOzeti(emojili, 'cay', 2, 2), '…çay …')
  assert.equal(eslesmeOzeti(emojili, 'cay', 3, 3), '…😀 çay 😀')
})
