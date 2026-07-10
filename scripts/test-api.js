#!/usr/bin/env node
const SERVER_URL = process.argv[2] || process.env.SERVER_URL || `http://localhost:${process.env.PORT || 4000}`;
let token = '';
let setlistIds = [];
async function request(path, options = {}) {
  const url = `${SERVER_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const opts = { ...options, headers };
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, ok: res.ok };
}
async function auth() {
  console.log(`\n🔑 Testing auth at ${SERVER_URL}...`);
  const { json, status } = await request('/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ clientType: 'api', deviceId: 'test-script-001' })
  });
  if (status !== 200 || !json.token) {
    console.error('❌ Failed to get token:', json);
    process.exit(1);
  }
  token = json.token;
  console.log(`✅ Got token (${json.clientType}) len=${token.length}`);
}
function authHeader() { return { 'Authorization': `Bearer ${token}` }; }
async function testStatus() {
  console.log('\n📊 GET /api/v1/status');
  const { json, status } = await request('/api/v1/status', { headers: authHeader() });
  if (status !== 200 || !json.success) throw new Error(`Status failed: ${JSON.stringify(json)}`);
  console.log(`✅ status: file="${json.status.lyricsFile}" count=${json.status.setlistCount} lyrics=${json.status.lyricsCount}`);
}
async function testSetlistAdd() {
  console.log('\n➕ POST /api/v1/setlist/add');
  const { json, status } = await request('/api/v1/setlist/add', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ name: 'Test Song.txt', content: 'Line one\nLine two\nLine three\nLine four\nLine five' })
  });
  if (status !== 200 || !json.success) throw new Error(`Add failed: ${JSON.stringify(json)}`);
  console.log(`✅ Added: ${json.added[0].id}`);
  setlistIds = [json.added[0].id];
}
async function testSetlistAddSecond() {
  console.log('\n➕ POST /api/v1/setlist/add (second file)');
  const { json } = await request('/api/v1/setlist/add', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ name: 'Second.txt', content: 'Second file content here\nMore lines\nThird line\nFourth' })
  });
  if (!json.success) throw new Error(`Add second failed: ${JSON.stringify(json)}`);
  setlistIds.push(json.added[0].id);
  console.log(`✅ Added second: ${json.added[0].id}`);
}
async function testSetlistGet() {
  console.log('\n📋 GET /api/v1/setlist');
  const { json } = await request('/api/v1/setlist', { headers: authHeader() });
  if (!json.success) throw new Error(`Get setlist failed: ${JSON.stringify(json)}`);
  console.log(`✅ Count: ${json.count}, ids: ${json.setlist.map(s=>s.id).join(', ')}`);
}
async function testSetlistReorder() {
  console.log('\n🔀 POST /api/v1/setlist/reorder');
  const reversed = [...setlistIds].reverse();
  const { json, status } = await request('/api/v1/setlist/reorder', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ orderedIds: reversed })
  });
  if (status !== 200 || !json.success) throw new Error(`Reorder failed: ${JSON.stringify(json)}`);
  console.log(`✅ Reordered: ${reversed.join(' -> ')}`);
  setlistIds = reversed;
}
async function testSetlistLoad() {
  console.log('\n📂 POST /api/v1/setlist/load');
  const { json, status } = await request('/api/v1/setlist/load', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ fileId: setlistIds[0] })
  });
  if (status !== 200 || !json.success) throw new Error(`Load failed: ${JSON.stringify(json)}`);
  console.log(`✅ Loaded: ${json.fileName} (${json.linesCount} lines)`);
}
async function testLyricsNav() {
  console.log('\n⏭️ POST /api/v1/lyrics/next');
  let r = await request('/api/v1/lyrics/next', { method: 'POST', headers: authHeader() });
  if (!r.json.success) throw new Error(`Next failed: ${JSON.stringify(r.json)}`);
  console.log(`✅ Next -> line ${r.json.selectedLine}`);
  console.log('⏮️ POST /api/v1/lyrics/prev');
  r = await request('/api/v1/lyrics/prev', { method: 'POST', headers: authHeader() });
  if (!r.json.success) throw new Error(`Prev failed`);
  console.log(`✅ Prev -> line ${r.json.selectedLine}`);
  console.log('🎯 POST /api/v1/lyrics/goto {lineIndex:0}');
  r = await request('/api/v1/lyrics/goto', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ lineIndex: 0 })
  });
  if (!r.json.success) throw new Error(`Goto failed: ${JSON.stringify(r.json)}`);
  console.log(`✅ Goto -> line ${r.json.selectedLine}`);
}
async function testLoadText() {
  console.log('\n📝 POST /api/v1/lyrics/load-text');
  const { json } = await request('/api/v1/lyrics/load-text', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ title: 'Direct Load', content: 'Direct line A\nDirect line B\nDirect line C' })
  });
  if (!json.success) throw new Error(`Load-text failed: ${JSON.stringify(json)}`);
  console.log(`✅ Loaded raw text: ${json.fileName} (${json.linesCount} lines)`);
}
async function testOutputToggle() {
  console.log('\n💡 POST /api/v1/output/toggle {on:true}');
  let r = await request('/api/v1/output/toggle', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ on: true })
  });
  if (!r.json.success) throw new Error(`Toggle on failed`);
  console.log(`✅ Output on: ${r.json.isOutputOn}`);
  console.log('💡 POST /api/v1/output/toggle {on:false}');
  r = await request('/api/v1/output/toggle', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ on: false })
  });
  console.log(`✅ Output off: ${r.json.isOutputOn}`);
  console.log('💡 POST /api/v1/output/toggle (toggle)');
  r = await request('/api/v1/output/toggle', { method: 'POST', headers: authHeader() });
  console.log(`✅ Toggled: ${r.json.isOutputOn}`);
}
async function testBibleReference() {
  console.log('\n📖 POST /api/v1/bible/reference {reference:"John 3:16"}');
  const { json } = await request('/api/v1/bible/reference', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ reference: 'John 3:16' })
  });
  if (!json.success) throw new Error(`Bible ref failed: ${JSON.stringify(json)}`);
  console.log(`✅ Bible loaded: ${json.reference} resolved=${json.resolved} slides=${json.slides} file=${json.fileName}`);
}
async function testBibleSearch() {
  console.log('\n🔍 GET /api/v1/bible/search?q=John');
  const { json } = await request('/api/v1/bible/search?q=John&limit=5', { headers: authHeader() });
  if (!json.success) throw new Error(`Bible search failed: ${JSON.stringify(json)}`);
  console.log(`✅ Search q="John": count=${json.count} results=${json.results?.length || 0} bibles=${json.bibles?.length || 0}`);
}
async function testBibleList() {
  console.log('\n📚 GET /api/v1/bible/list');
  const { json } = await request('/api/v1/bible/list', { headers: authHeader() });
  if (!json.success) throw new Error(`Bible list failed`);
  console.log(`✅ Bibles: total=${json.bibles?.length || 0} active=${json.activeBibleId || 'none'}`);
}
async function testDelete() {
  console.log(`\n🗑️ DELETE /api/v1/setlist/${setlistIds[0]}`);
  const { json } = await request(`/api/v1/setlist/${setlistIds[0]}`, {
    method: 'DELETE',
    headers: authHeader()
  });
  if (!json.success) throw new Error(`Delete failed: ${JSON.stringify(json)}`);
  console.log(`✅ Deleted, remaining=${json.totalCount}`);
}
async function testClear() {
  console.log('\n🧹 POST /api/v1/setlist/clear');
  const { json } = await request('/api/v1/setlist/clear', { method: 'POST', headers: authHeader() });
  if (!json.success) throw new Error(`Clear failed`);
  console.log(`✅ Cleared`);
  const { json: after } = await request('/api/v1/setlist', { headers: authHeader() });
  console.log(`✅ After clear count=${after.count}`);
}
async function run() {
  console.log(`🚀 Testing API at ${SERVER_URL}`);
  try {
    await auth();
    await testStatus();
    await testSetlistAdd();
    await testSetlistAddSecond();
    await testSetlistGet();
    await testSetlistReorder();
    await testSetlistLoad();
    await testLyricsNav();
    await testLoadText();
    await testOutputToggle();
    await testBibleReference();
    await testBibleSearch();
    await testBibleList();
    await testDelete();
    await testClear();
    console.log('\n🎉 All tests passed!');
  } catch (e) {
    console.error('\n❌ Test failed:', e.message);
    process.exit(1);
  }
}
run();
