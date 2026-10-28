(() => {
  'use strict';
  const KEY = 'cet4-vocabulary-test-v1';
  const $ = id => document.getElementById(id);
  const ui = { welcome: $('welcomeView'), test: $('testView'), result: $('resultView'), status: $('libraryStatus'), input: $('csvInput'), counter: $('counter'), percent: $('percent'), bar: $('progressBar'), word: $('word'), meaning: $('meaning'), pos: $('pos'), know: $('knowBtn'), unknown: $('unknownBtn'), summary: $('summary'), tbody: document.querySelector('#unknownTable tbody'), unknownTable: $('unknownTable'), empty: $('emptyUnknown') };
  let state = load();
  if (!state && Array.isArray(window.CET4_PRELOADED_LIBRARY?.words)) {
    state = { words: window.CET4_PRELOADED_LIBRARY.words, answers: {}, source: window.CET4_PRELOADED_LIBRARY.source, importedAt: window.CET4_PRELOADED_LIBRARY.importedAt };
    save();
  }

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function esc(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
  function csvCell(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function download(name, content, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function normalize(word) { return word.trim().toLowerCase().replace(/\s+/g, ' '); }
  function answeredCount() { return Object.keys(state.answers).length; }
  function current() { return state.words.find(w => !Object.hasOwn(state.answers, w.word)); }
  function sourceText() { return state ? `已加载 ${state.words.length.toLocaleString()} 个词条 · ${state.source || '未注明来源'}` : '尚未加载词库'; }
  function render() {
    ui.status.textContent = sourceText();
    if (!state) { ui.welcome.classList.remove('hidden'); ui.test.classList.add('hidden'); ui.result.classList.add('hidden'); return; }
    ui.welcome.classList.add('hidden');
    if (answeredCount() === state.words.length) return renderResult();
    ui.result.classList.add('hidden'); ui.test.classList.remove('hidden');
    const w = current(), n = answeredCount() + 1, total = state.words.length;
    ui.counter.textContent = `第 ${n} / ${total} 个`;
    ui.percent.textContent = `已完成 ${answeredCount()}（${Math.round(answeredCount() / total * 100)}%）`;
    ui.bar.style.width = `${answeredCount() / total * 100}%`;
    ui.word.textContent = w.word; ui.meaning.textContent = w.meaning; ui.pos.textContent = w.pos;
  }
  function answer(value) {
    const w = current(); if (!w) return;
    ui.know.disabled = ui.unknown.disabled = true;
    state.answers[w.word] = { value, answeredAt: new Date().toISOString() }; save();
    ui.know.disabled = ui.unknown.disabled = false; render();
  }
  function renderResult() {
    ui.test.classList.add('hidden'); ui.result.classList.remove('hidden');
    const total = state.words.length, known = Object.values(state.answers).filter(a => a.value === 'known').length, unknown = total - known;
    ui.summary.innerHTML = `<div class="stat">词库总数<b>${total}</b></div><div class="stat">已掌握<b>${known} · ${pct(known,total)}</b></div><div class="stat">不会<b>${unknown} · ${pct(unknown,total)}</b></div>`;
    const rows = state.words.filter(w => state.answers[w.word]?.value === 'unknown').sort((a,b) => a.word.localeCompare(b.word, 'en'));
    ui.tbody.innerHTML = rows.map(w => `<tr><td>${esc(w.word)}</td><td>${esc(w.meaning)}</td><td>${esc(w.pos)}</td></tr>`).join('');
    ui.empty.classList.toggle('hidden', rows.length !== 0); ui.unknownTable.classList.toggle('hidden', rows.length === 0);
  }
  function pct(n, total) { return `${(n / total * 100).toFixed(1)}%`; }
  function parseCsv(text) {
    const rows = []; let row = [], value = '', quote = false;
    for (let i=0; i<text.length; i++) { const c=text[i], next=text[i+1]; if (c === '"') { if (quote && next === '"') { value+='"'; i++; } else quote=!quote; } else if (c === ',' && !quote) { row.push(value); value=''; } else if ((c === '\n' || c === '\r') && !quote) { if (c === '\r' && next === '\n') i++; row.push(value); if (row.some(x => x.trim())) rows.push(row); row=[]; value=''; } else value+=c; }
    if (quote) throw new Error('CSV 中有未闭合的双引号。'); if (value || row.length) { row.push(value); rows.push(row); } return rows;
  }
  function importCsv(file) {
    const reader = new FileReader();
    reader.onload = () => { try {
      const rows = parseCsv(reader.result.replace(/^\uFEFF/, '')); if (rows.length < 2) throw new Error('CSV 至少需要表头和一条数据。');
      const headers = rows[0].map(x => x.trim().toLowerCase());
      const index = names => headers.findIndex(h => names.includes(h));
      const wi=index(['word','英文','english','单词']), mi=index(['meaning','中文释义','释义','中文','definition']), pi=index(['part_of_speech','pos','词性','词类']);
      if ([wi,mi,pi].some(i => i < 0)) throw new Error('找不到必需列。请使用 word, meaning, part_of_speech。');
      const map = new Map(), bad=[];
      rows.slice(1).forEach((r, i) => { const word=normalize(r[wi] || ''), meaning=(r[mi] || '').trim(), pos=(r[pi] || '').trim(); if (!word || !meaning || !pos) { bad.push(i+2); return; } const old=map.get(word); if (old) { old.meaning = [...new Set((old.meaning+'；'+meaning).split('；').filter(Boolean))].join('；'); old.pos = [...new Set((old.pos+'/'+pos).split('/').filter(Boolean))].join('/'); } else map.set(word,{word,meaning,pos}); });
      if (!map.size) throw new Error('没有可用词条。');
      if (bad.length && !confirm(`第 ${bad.slice(0,10).join('、')} 行缺少必填内容，将忽略 ${bad.length} 行。继续导入吗？`)) return;
      if (state && !confirm('导入新词库会清除当前测试进度，且无法撤销。确认继续吗？')) return;
      // Do not use prompt(): several embedded browsers intentionally do not support it.
      // The filename is kept for traceability; the importer remains responsible for data rights.
      const source = `用户导入：${file.name}（来源/许可由导入者确认）`;
      state={words:[...map.values()].sort((a,b)=>a.word.localeCompare(b.word,'en')),answers:{},source, importedAt:new Date().toISOString()}; save(); render(); alert(`导入完成：实际加载 ${state.words.length} 个去重词条。`);
    } catch (e) { alert(`导入失败：${e.message}`); } finally { ui.input.value=''; } };
    reader.readAsText(file, 'UTF-8');
  }
  $('downloadTemplate').onclick = () => download('cet4-vocabulary-template.csv', template(), 'text/csv;charset=utf-8');
  ui.input.onchange = e => e.target.files[0] && importCsv(e.target.files[0]);
  ui.know.onclick = () => answer('known'); ui.unknown.onclick = () => answer('unknown');
  $('exportCsv').onclick = () => { const data=state.words.filter(w=>state.answers[w.word]?.value==='unknown').sort((a,b)=>a.word.localeCompare(b.word,'en')); download('cet4-不会词.csv', '\uFEFFword,meaning,part_of_speech\n'+data.map(w=>[w.word,w.meaning,w.pos].map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8'); };
  $('exportBackup').onclick = () => download('cet4-测试结果备份.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
  function template() { return 'word,meaning,part_of_speech\nabandon,放弃；遗弃,verb\nability,能力；才能,noun\naboard,在船（或飞机、火车）上,adverb\nabsence,缺席；不存在,noun\nabsolute,绝对的；完全的,adjective\nabsorb,吸收；理解,verb\nacademic,学术的；学院的,adjective\naccess,进入；使用权,noun\naccommodate,容纳；适应,verb\nachieve,实现；达到,verb\nacquire,获得；习得,verb\nadapt,适应；改编,verb\n'; }
  render();
})();
