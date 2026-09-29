/* ========== 运行状态 ========== */
let currentAxis = 'all';
let currentType = 'all';
let currentEras = new Set();
let selectedEventId = null;
let currentView = 'overview';
let lastFocus = null;
let progressEl = null;
let progressTicking = false;

/* ========== 初始化基础静态DOM文本 ========== */
function initStaticTexts() {
  document.getElementById('siteTitle').textContent = UI_TEXT.siteTitle;
  document.getElementById('brandBtn').textContent = UI_TEXT.brand;
  document.getElementById('search').placeholder = UI_TEXT.searchPlaceholder;
  document.getElementById('wbHint').textContent = '左栏选轴与过滤 · 中栏看证据 · 右栏看解释';
  document.getElementById('wbTip').textContent = UI_TEXT.wbTip;
  document.getElementById('resetFilters').textContent = UI_TEXT.labels.btnReset;
  document.getElementById('noresult').textContent = UI_TEXT.noResult;
  document.getElementById('lblStage').textContent = UI_TEXT.labels.stage;
  document.getElementById('lblEra').textContent = UI_TEXT.labels.era;
  document.getElementById('lblType').textContent = UI_TEXT.labels.type;
  document.getElementById('lblKeyNodes').textContent = UI_TEXT.labels.keyNodes;
  document.getElementById('siteFooter').textContent = UI_TEXT.footer;
  document.getElementById('closeBtn').textContent = UI_TEXT.labels.close;
  document.getElementById('termPanelClose').textContent = UI_TEXT.labels.close;
  document.getElementById('termPanelHint').textContent = UI_TEXT.labels.termHint;

  // 渲染导航栏
  document.getElementById('topNav').innerHTML = UI_TEXT.nav.map(n => 
    `<button data-view="${n.key}" ${n.axisEntry ? `data-axis-entry="${n.axisEntry}"` : ''} class="${n.active ? 'active' : ''}">${n.name}</button>`
  ).join('');

  // 填充大段 HTML 模版
  document.getElementById('view-overview').innerHTML = UI_TEXT.overviewHtml;
  document.getElementById('view-deep1989').innerHTML = UI_TEXT.deep1989Html;
  document.getElementById('view-deep2018').innerHTML = UI_TEXT.deep2018Html;
  document.getElementById('view-toolbox').innerHTML = UI_TEXT.toolboxHtml;

  // 绑导航事件
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => {
      // 带 data-axis-entry 的导航项交给全局委托统一处理，避免双重跳转
      if (el.hasAttribute('data-axis-entry')) return;
      showView(el.dataset.view);
    });
  });
}

/* ========== 视图切换逻辑 ========== */
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  document.querySelectorAll('.navlinks button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (name === 'workbench') renderWorkbench();
  if (name === 'toolbox') renderToolbox();
}

/* ========== 全局事件委托与监听 ========== */
function bindEvents() {
  document.getElementById('brandBtn').onclick = () => showView('overview');

  document.body.addEventListener('click', e => {
    // 处理入口卡片与跳转
    const card = e.target.closest('.entry-card');
    if (card && card.dataset.axis) {
      currentAxis = card.dataset.axis;
      selectedEventId = null;
      showView('workbench');
      return;
    }

    const btnAxis = e.target.closest('[data-axis]');
    if (btnAxis && !btnAxis.classList.contains('entry-card') && !btnAxis.classList.contains('axis-btn')) {
      currentAxis = btnAxis.dataset.axis || 'all';
      selectedEventId = null;
      showView('workbench');
      return;
    }

    const btnAxisEntry = e.target.closest('[data-axis-entry]');
    if (btnAxisEntry) {
      currentAxis = btnAxisEntry.dataset.axisEntry || 'all';
      selectedEventId = null;
      showView('workbench');
      return;
    }

    const btnGoto = e.target.closest('[data-goto]');
    if (btnGoto) {
      const id = btnGoto.dataset.goto;
      const ev = events.find(x => x.id === id);
      if (ev) {
        currentAxis = ev.axes[0] || 'power';
        selectedEventId = id;
        showView('workbench');
        setTimeout(() => {
          const c = document.querySelector(`.event-card[data-id="${id}"]`);
          if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
      }
      return;
    }

    // 专有名词弹出框
    const termEl = e.target.closest('.term');
    if (termEl && termEl.dataset.term) {
      e.preventDefault();
      openTerm(termEl.dataset.term);
      return;
    }

    if (e.target.id === 'termPanelClose' || e.target.id === 'termOverlay') {
      closeTerm();
      return;
    }

    if (e.target.id === 'closeBtn' || e.target.id === 'modal') {
      closeModal();
      return;
    }
  });

  // 搜索逻辑
  const searchInput = document.getElementById('search');
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (q && currentView !== 'workbench') {
      showView('workbench');
      return;
    }
    if (currentView === 'workbench') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderEventList, 160);
    }
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) return;
      const hit = events.find(ev => {
        const text = [ev.year, ev.display, ev.title, ...ev.tags].join(' ').toLowerCase();
        return text.includes(q);
      });
      if (hit) {
        currentAxis = hit.primary || hit.axes[0];
        selectedEventId = hit.id;
        showView('workbench');
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTerm();
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      trapFocus(e, document.getElementById('modal'));
      trapFocus(e, document.getElementById('termOverlay'));
    }
  });

  window.addEventListener('scroll', updateProgress, { passive: true });
}

/* ========== 辅助工具函数 ========== */
function axisLabel(id) {
  return { power: '权力来源', constraint: '权力约束', society: '社会进入' }[id] || id;
}

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkTerms(html) {
  if (!html) return '';
  const keys = Object.keys(glossary).sort((a, b) => b.length - a.length);
  let out = html;
  keys.forEach(k => {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?![^<]*>)(' + esc + ')', 'g');
    out = out.replace(re, m => {
      return `<span class="term" data-term="${escapeHtml(k)}">${escapeHtml(m)}</span>`;
    });
  });
  return out;
}

function openTerm(key) {
  const text = glossary[key];
  if (!text) return;
  document.getElementById('termPanelTitle').textContent = key;
  const body = document.getElementById('termPanelBody');
  body.innerHTML = text.split(/\n\n+/).map(p => {
    const t = p.trim();
    if (!t) return '';
    const html = escapeHtml(t)
      .replace(/^【([^】]+)】/, '<strong style="color:#9ec5e8">【$1】</strong> ')
      .replace(/\n/g, '<br>');
    return `<p style="margin:0 0 12px">${html}</p>`;
  }).join('');
  document.getElementById('termOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
  lastFocus = document.activeElement;
  const panel = document.getElementById('termPanel');
  if (panel) panel.focus();
}

function closeTerm() {
  document.getElementById('termOverlay').classList.remove('show');
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

function openModal(kicker, title, body) {
  document.getElementById('dialogKicker').textContent = kicker;
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = body;
  const modal = document.getElementById('modal');
  lastFocus = document.activeElement;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) closeBtn.focus();
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (!modal.classList.contains('show')) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

function trapFocus(e, container) {
  if (!container || !container.classList.contains('show')) return;
  const focusables = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function updateProgress() {
  if (progressTicking) return;
  progressTicking = true;
  window.requestAnimationFrame(() => {
    progressTicking = false;
    progressEl = progressEl || document.getElementById('progress');
    if (!progressEl) return;
    const doc = document.documentElement;
    const y = doc.scrollTop;
    const h = doc.scrollHeight - doc.clientHeight;
    progressEl.style.width = (h ? (y / h) * 100 : 0) + '%';
  });
}

/* ========== 工作台渲染逻辑 ========== */
function renderWorkbench() {
  const isAll = currentAxis === 'all';
  const meta = isAll ? null : axesMeta[currentAxis];
  document.getElementById('wbTitle').textContent = isAll ? '总时间线：1840—2026' : meta.name;
  document.getElementById('wbAxisLabel').textContent = isAll
    ? 'MASTER TIMELINE · 按历史年份完整排列'
    : ('OBSERVATION AXIS · ' + meta.q);

  // 观察轴切换按钮
  const sw = document.getElementById('axisSwitch');
  sw.innerHTML = `
    <button class="axis-btn ${isAll ? 'active' : ''}" data-axis="all">
      总时间线
      <span>全部节点 · 严格按年份</span>
    </button>
  ` + Object.values(axesMeta).map(a => `
    <button class="axis-btn ${a.id === currentAxis ? 'active' : ''}" data-axis="${a.id}">
      ${a.name}
      <span>${a.q}</span>
    </button>
  `).join('');

  sw.querySelectorAll('.axis-btn').forEach(btn => {
    btn.onclick = () => {
      const next = btn.dataset.axis;
      const prevSelected = selectedEventId;
      currentAxis = next;
      if (prevSelected) {
        const ev = events.find(x => x.id === prevSelected);
        selectedEventId = (next === 'all' || (ev && ev.axes.includes(next))) ? prevSelected : null;
      }
      currentEras.clear();
      currentType = 'all';
      renderTypeFilters();
      renderWorkbench();
    };
  });

  // 阶段演变列表
  const stageHtml = isAll
    ? [
      { t: '1840—1911', d: '从器物现代化到立宪与共和革命，制度危机全面展开。' },
      { t: '1911—1949', d: '共和形式确立，稳定宪政未能持续，政权多次重组。' },
      { t: '1949—1976', d: '新国家制度框架形成，政治运动冲击法制与公开空间。' },
      { t: '1978—1989', d: '改革重启，政治体制改革进入议程，以1989为断裂点。' },
      { t: '1992—2026', d: '经济与治理改革持续，党的全面领导进一步制度化。' }
    ].map(s => `<div class="stage-item"><strong>${s.t}</strong><span>${s.d}</span></div>`).join('')
    : meta.stages.map(s => `<div class="stage-item"><strong>${s.t}</strong><span>${s.d}</span></div>`).join('');
  document.getElementById('stageList').innerHTML = stageHtml;

  // 时代过滤器
  const ef = document.getElementById('eraFilters');
  ef.innerHTML = eras.map(e => `
    <button class="fchip ${currentEras.has(e.id) ? 'active' : ''}" data-era="${e.id}">${e.label}</button>
  `).join('');
  ef.querySelectorAll('.fchip').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.era;
      if (currentEras.has(id)) currentEras.delete(id); else currentEras.add(id);
      renderEventList();
      btn.classList.toggle('active');
    };
  });

  // 类型过滤器
  renderTypeFilters();

  document.getElementById('resetFilters').onclick = () => {
    currentEras.clear();
    currentType = 'all';
    renderTypeFilters();
    document.querySelectorAll('#eraFilters .fchip').forEach(c => c.classList.remove('active'));
    renderEventList();
  };

  // 阅读指引与关键节点
  document.getElementById('guideTitle').textContent = isAll ? '总时间线 · 阅读指引' : (meta.name + ' · 阅读指引');
  document.getElementById('guideText').textContent = isAll
    ? '完整历史主线，按年份排列。主题是政治体制改革：何时推进、推进了什么、在何处中断。点开事件可看背景说明、改革影响、原话与标语。'
    : meta.guide;
  const kn = document.getElementById('keyNodes');
  const keyIds = isAll ? ['t1911', 't1949', 't1978', 't1987', 't1989', 't2018'] : meta.keyIds;
  kn.innerHTML = keyIds.map(id => {
    const e = events.find(x => x.id === id);
    return e ? `<div class="key-node" data-id="${e.id}">${e.display} · ${e.title}</div>` : '';
  }).join('');
  kn.querySelectorAll('.key-node').forEach(n => {
    n.onclick = () => {
      selectedEventId = n.dataset.id;
      renderEventList();
      renderDetail();
    };
  });

  renderEventList();
  renderDetail();
}

function renderTypeFilters() {
  const tf = document.getElementById('typeFilters');
  tf.innerHTML = UI_TEXT.types.map(t => `
    <button class="fchip ${currentType === t.id ? 'active' : ''}" data-type="${t.id}">${t.name}</button>
  `).join('');
  tf.querySelectorAll('.fchip').forEach(btn => {
    btn.onclick = () => {
      currentType = btn.dataset.type;
      tf.querySelectorAll('.fchip').forEach(c => c.classList.toggle('active', c.dataset.type === currentType));
      renderEventList();
    };
  });
}

function getFilteredEvents() {
  return events.filter(e => {
    const axisOK = currentAxis === 'all' || e.axes.includes(currentAxis);
    const typeOK = currentType === 'all' || e.type === currentType;
    let eraOK = true;
    if (currentEras.size) {
      eraOK = [...currentEras].some(eid => {
        const er = eras.find(x => x.id === eid);
        return e.year >= er.range[0] && e.year <= er.range[1];
      });
    }
    return axisOK && typeOK && eraOK;
  }).sort((a, b) => a.year - b.year);
}

function renderEventList() {
  const list = getFilteredEvents();
  const q = document.getElementById('search').value.trim().toLowerCase();
  const filtered = q ? list.filter(e => {
    const text = [e.year, e.display, e.title, e.summary, e.changed, e.unchanged, e.result, ...e.tags, e.route].join(' ').toLowerCase();
    return text.includes(q);
  }) : list;

  const primaryCount = currentAxis === 'all' ? filtered.length : filtered.filter(e => e.primary === currentAxis).length;
  document.getElementById('eventCount').textContent = currentAxis === 'all'
    ? `全部节点 ${filtered.length} 条 · 严格按年份排列`
    : `当前 ${filtered.length} 条 · 其中本轴主相关 ${primaryCount} 条`;
  const el = document.getElementById('eventList');
  const no = document.getElementById('noresult');
  if (!filtered.length) {
    el.innerHTML = '';
    no.style.display = 'block';
    return;
  }
  no.style.display = 'none';
  el.innerHTML = filtered.map(e => {
    const isPrimary = currentAxis === 'all' || e.primary === currentAxis;
    const axisTags = e.axes.map(a => `<span class="mini-tag" style="${a === currentAxis ? 'border-color:var(--navy);color:var(--navy)' : ''}">${axisLabel(a)}</span>`).join('');
    return `<article class="event-card ${e.type} ${e.id === selectedEventId ? 'selected' : ''} ${isPrimary ? '' : 'secondary'}" data-id="${e.id}">
      <div class="eyear">${escapeHtml(e.display)}</div>
      <div class="etitle">${escapeHtml(e.title)}</div>
      <div class="esum">${escapeHtml(e.summary)}</div>
      <div class="etags">${axisTags}${e.tags.slice(0, 3).map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>
    </article>`;
  }).join('');
  el.querySelectorAll('.event-card').forEach(card => {
    card.onclick = () => {
      selectedEventId = card.dataset.id;
      renderEventList();
      renderDetail();
      setTimeout(() => {
        const sel = el.querySelector('.event-card.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    };
  });
  if (selectedEventId) {
    setTimeout(() => {
      const sel = el.querySelector('.event-card.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
  }
}

function renderDetail() {
  const empty = document.getElementById('rightEmpty');
  const detail = document.getElementById('rightDetail');
  if (!selectedEventId) {
    empty.style.display = 'block';
    detail.style.display = 'none';
    return;
  }
  const e = events.find(x => x.id === selectedEventId);
  if (!e) { empty.style.display = 'block'; detail.style.display = 'none'; return; }
  empty.style.display = 'none';
  detail.style.display = 'block';

  const links = (e.sources || []).map(id => {
    const s = sourceMap[id];
    return s ? `<a href="${escapeHtml(s[1])}" target="_blank" rel="noopener" style="font-size:12px;display:block;margin-bottom:4px">${escapeHtml(s[0])}</a>` : '';
  }).filter(Boolean).join('');

  const peopleHtml = (e.people || []).map(pid => {
    const p = people.find(x => x.id === pid);
    return p ? `<div class="rel-item" data-pid="${escapeHtml(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.role)}</div>` : '';
  }).join('');

  const otherAxes = e.axes.filter(a => a !== currentAxis && a).map(a =>
    `<button class="bp-chip" style="margin:2px 4px 2px 0;font-size:11px" data-switch-axis="${a}">在「${axisLabel(a)}」中查看</button>`
  ).join('');

  const what = e.what || '';
  const reformImpact = e.reformImpact || e.result;

  const hasExtra = (e.quotes && e.quotes.length) || (e.slogans && e.slogans.length) || (e.docs && e.docs.length) || peopleHtml || links;
  const extraInner = `
    ${(e.quotes || []).length ? `<div class="rel-section" style="border:none;padding-top:8px;margin-top:0"><h4>原话与文献</h4>${e.quotes.map(q => `<blockquote class="hist-quote"><p>「${escapeHtml(q.text)}」</p><cite>${escapeHtml(q.src || '')}</cite></blockquote>`).join('')}</div>` : ''}
    ${(e.slogans || []).length ? `<div class="rel-section" style="border:none;padding-top:8px;margin-top:0"><h4>当时的标语</h4><div class="slogan-wrap">${e.slogans.map(s => `<span class="slogan-chip">${escapeHtml(s)}</span>`).join('')}</div></div>` : ''}
    ${(e.docs || []).length ? `<div class="rel-section" style="border:none;padding-top:8px;margin-top:0"><h4>相关文献与文件</h4>${e.docs.map(d => `<div class="doc-card"><div class="doc-title">${escapeHtml(d.title)}</div><div class="doc-note">${escapeHtml(d.note || '')}</div></div>`).join('')}</div>` : ''}
    ${peopleHtml ? `<div class="rel-section" style="border:none;padding-top:8px;margin-top:0"><h4>相关人物</h4>${peopleHtml}</div>` : ''}
    ${links ? `<div class="rel-section" style="border:none;padding-top:8px;margin-top:0"><h4>资料入口</h4>${links}</div>` : ''}
  `;

  detail.innerHTML = `
    <div style="font-size:11px;font-weight:900;color:var(--blue);margin-bottom:4px">${escapeHtml(e.display)}</div>
    <h3 style="font-family:var(--serif);font-size:18px;margin:0 0 14px;line-height:1.3">${escapeHtml(e.title)}</h3>
    ${what ? `<div class="detail-block intro-block"><h4>背景说明</h4><p>${linkTerms(what)}</p></div>` : ''}
    <div class="detail-block"><h4>发生了什么</h4><p>${linkTerms(e.summary)}</p></div>
    <div class="detail-block impact-block"><h4>对政治体制改革的影响</h4><p>${linkTerms(reformImpact)}</p></div>
    ${hasExtra ? `<details class="more-fold" open><summary>原话 · 文献 · 标语</summary><div class="fold-body">${extraInner}</div></details>` : ''}
    <div class="detail-block"><h4>改了什么</h4><p>${linkTerms(e.changed)}</p></div>
    <div class="detail-block unchanged"><h4>没有改什么</h4><p>${linkTerms(e.unchanged)}</p></div>
    <div class="rel-section">
      <h4>所属改革路线</h4>
      <div style="font-size:13px;font-weight:700">${escapeHtml(e.route || '—')}</div>
    </div>
    ${otherAxes ? `<div class="rel-section"><h4>从其他角度查看</h4>${otherAxes}</div>` : ''}
    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="bp-chip" id="clearSelBtn">清除选中</button>
      ${e.id === 't1989' ? '<button class="bp-chip" data-view="deep1989">打开1989专题</button>' : ''}
      ${e.id === 't2018' ? '<button class="bp-chip" data-view="deep2018">打开2018专题</button>' : ''}
    </div>
  `;
  const clearBtn = detail.querySelector('#clearSelBtn');
  if (clearBtn) clearBtn.onclick = () => { selectedEventId = null; renderEventList(); renderDetail(); };
  detail.querySelectorAll('[data-switch-axis]').forEach(btn => {
    btn.onclick = () => {
      currentAxis = btn.dataset.switchAxis;
      renderWorkbench();
    };
  });
  detail.querySelectorAll('.rel-item[data-pid]').forEach(item => {
    item.onclick = () => {
      const p = people.find(x => x.id === item.dataset.pid);
      if (p) openModal(escapeHtml(p.role), escapeHtml(p.name), `<p>${escapeHtml(p.summary)}</p><p style="margin-top:12px"><strong>主张 / 边界 / 结果</strong><br>${escapeHtml(p.detail)}</p>`);
    };
  });
}

/* ========== 工具箱渲染逻辑 ========== */
function renderToolbox() {
  document.getElementById('fullTimeline').innerHTML = events.map(e => `
    <article class="event-card ${escapeHtml(e.type)}" data-id="${escapeHtml(e.id)}" style="cursor:pointer">
      <div class="eyear">${escapeHtml(e.display)}</div>
      <div class="etitle">${escapeHtml(e.title)}</div>
      <div class="esum">${escapeHtml(e.summary)}</div>
      <div class="etags">${e.tags.map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}
        ${e.axes.map(a => `<span class="mini-tag">${escapeHtml(axesMeta[a].name)}</span>`).join('')}
      </div>
    </article>
  `).join('');
  document.getElementById('fullTimeline').querySelectorAll('.event-card').forEach(card => {
    card.onclick = () => {
      const ev = events.find(x => x.id === card.dataset.id);
      currentAxis = ev.axes[0];
      selectedEventId = ev.id;
      showView('workbench');
    };
  });

  document.getElementById('peopleGrid').innerHTML = people.map(p => `
    <article class="person-card" data-id="${escapeHtml(p.id)}">
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="role">${escapeHtml(p.role)}</div>
      <p>${escapeHtml(p.summary)}</p>
    </article>
  `).join('');
  document.getElementById('peopleGrid').querySelectorAll('.person-card').forEach(c => {
    c.onclick = () => {
      const p = people.find(x => x.id === c.dataset.id);
      openModal(escapeHtml(p.role), escapeHtml(p.name), `<p>${escapeHtml(p.summary)}</p><p style="margin-top:12px"><strong>主张 / 边界 / 结果</strong><br>${escapeHtml(p.detail)}</p>`);
    };
  });

  document.getElementById('sourcesGrid').innerHTML = Object.entries(sourceMap).map(([id, s], i) => `
    <a class="source-card" href="${escapeHtml(s[1])}" target="_blank" rel="noopener">
      <div class="no">SOURCE ${String(i + 1).padStart(2, '0')}</div>
      <div class="title">${escapeHtml(s[0])}</div>
      <div class="meta">点击访问原始页面进行核对</div>
    </a>
  `).join('');

  document.querySelectorAll('.tb-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tb-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tb-' + tab.dataset.tb).classList.add('active');
    };
  });
}

/* ========== 应用启动 ========== */
document.addEventListener('DOMContentLoaded', () => {
  initStaticTexts();
  bindEvents();
  renderToolbox();
});
