import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const baseUrl = process.env.BASE_URL
const opmlPath = process.env.OPML_PATH
const knownPublicationId = '1071360'

function getPublicationIdsFromOpml(text) {
  const ids = new Set()
  const regex = /api\.substack\.com\/feed\/podcast\/(\d+)/g
  let match = regex.exec(text)

  while (match) {
    ids.add(match[1])
    match = regex.exec(text)
  }

  return [...ids].sort((a, b) => Number(a) - Number(b))
}

function getPublicationIds() {
  const ids = new Set([knownPublicationId])

  if (opmlPath && existsSync(opmlPath)) {
    const opmlText = readFileSync(opmlPath, 'utf8')
    for (const id of getPublicationIdsFromOpml(opmlText)) {
      ids.add(id)
    }
  }

  return [...ids]
}

const maybeTest = baseUrl ? test : test.skip

maybeTest('smoke: login and feed endpoints do not crash', async () => {
  const loginRes = await fetch(`${baseUrl}/api/login`, { signal: AbortSignal.timeout(20_000) })
  const feedRes = await fetch(`${baseUrl}/api/feed`, { signal: AbortSignal.timeout(20_000) })

  assert.notEqual(
    loginRes.status,
    500,
    `/api/login returned 500. Response: ${(await loginRes.text()).slice(0, 200)}`
  )
  assert.notEqual(
    feedRes.status,
    500,
    `/api/feed returned 500. Response: ${(await feedRes.text()).slice(0, 200)}`
  )
})

maybeTest('smoke: pub-id endpoint handles known IDs without 500', async () => {
  const ids = getPublicationIds()
  assert.ok(ids.length > 0, 'No publication IDs found for smoke test')

  const failures = []

  // Sequential requests reduce load and make it easier to map any failures.
  for (const id of ids) {
    const res = await fetch(`${baseUrl}/api/pub-id/${id}`, { signal: AbortSignal.timeout(20_000) })
    if (res.status === 500) {
      const bodyPreview = (await res.text()).slice(0, 200)
      failures.push({ id, status: res.status, bodyPreview })
    }
  }

  assert.equal(
    failures.length,
    0,
    `pub-id smoke failures (${failures.length}/${ids.length}): ${JSON.stringify(failures.slice(0, 10))}`
  )
})

