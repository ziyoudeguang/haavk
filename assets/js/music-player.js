/* HAAVK 背景音乐播放器
 * 用法：在每个页面 </body> 前加一行
 *   <script src="/assets/js/music-player.js" defer></script>
 * 功能：右上角音符（播放时旋转、暂停/静音时画斜杠）+ 右侧三竖线按钮打开悬浮歌单
 * 跨页面记忆：曲目、进度、音量、播放模式、是否在播放
 */
(function () {
  'use strict';

  /* ========== ① 配置 ========== */
  // 歌单接口（即你的 music_list.php）。
  //  · 放在本站根目录：'/music_list.php'
  //  · 放在你另一个网站：写完整地址，如 'https://你的另一个站.com/music_list.php'
  var API_URL = '/music_list.php';
  // 接口请求失败时的备用歌单（不需要可留空 []）
  var FALLBACK = [
    { title: '曲目名称', artist: '', url: '/music/01.mp3' }
  ];
  /* ================================================================== */

  // 音量缩放：实际音量 = 滑块值 × GAIN。滑块拉满(100)时的实际音量就是 GAIN×100
  // 例如 0.3 → 滑块 40 实际 12，滑块 100 实际 30。嫌大就调小，嫌小就调大（0~1）
  var GAIN = 0.3;
  // 第一次访问时滑块的默认位置（0~1），用户调过之后以用户为准
  var DEFAULT_LEVEL = 0.4;

  var PLAYLIST = [];

  var KEY = 'haavk_music_v1';
  var MODES = ['列表循环', '单曲循环', '随机播放'];

  /* ---------- 样式（沿用站点 token） ---------- */
  var css = `
  .hm-right{display:flex;align-items:center;gap:22px;}
  .hm-box{display:flex;align-items:center;gap:0;--hm-navy:#0e1f33;--hm-blue:#2f6fb3;--hm-line:#e6e8eb;
    --hm-mono:"SF Mono","JetBrains Mono","Roboto Mono",Consolas,"Courier New",monospace;}
  .hm-box.hm-fixed{position:fixed;top:22px;right:28px;z-index:60;}
  .hm-btn{position:relative;width:28px;height:34px;display:inline-flex;align-items:center;justify-content:center;
    background:transparent;border:0;color:var(--hm-navy);cursor:pointer;padding:0;transition:color .2s;}
  /* 强制清掉站点全局 button 样式可能带来的边框/背景 */
  .hm-box .hm-btn{border:0 !important;background:none !important;box-shadow:none !important;border-radius:0 !important;
    margin:0 !important;min-width:0 !important;appearance:none;-webkit-appearance:none;}
  .hm-box .hm-btn+.hm-btn{margin-left:0 !important;}
  .hm-box .hm-btn:hover{background:none !important;border:0 !important;}
  .hm-btn:hover{color:var(--hm-blue);}
  .hm-btn:focus-visible{outline:2px solid var(--hm-blue);outline-offset:2px;}
  .hm-btn[aria-expanded="true"]{color:var(--hm-blue);}
  .hm-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
  .hm-ico{display:inline-flex;animation:hm-spin 4s linear infinite;animation-play-state:paused;}
  .hm-box.playing .hm-ico{animation-play-state:running;}
  .hm-slash{position:absolute;inset:0;margin:auto;opacity:0;transition:opacity .15s;pointer-events:none;}
  .hm-slash line{stroke:var(--hm-warn,#c9453a);stroke-width:2;}
  .hm-box.off .hm-slash{opacity:1;}
  @keyframes hm-spin{to{transform:rotate(360deg);}}

  .hm-panel{position:fixed;top:68px;right:28px;width:340px;max-width:calc(100vw - 24px);z-index:100;
    background:rgba(14,31,51,.97);color:#e6e7ea;border:1px solid rgba(255,255,255,.1);border-top:2px solid var(--hm-blue);
    box-shadow:0 18px 48px rgba(8,16,28,.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
    font-family:"PingFang SC","Microsoft YaHei","Hiragino Sans GB",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    opacity:0;transform:translateY(-6px);visibility:hidden;transition:opacity .2s,transform .2s,visibility .2s;}
  .hm-panel.open{opacity:1;transform:none;visibility:visible;}
  .hm-head{display:flex;justify-content:space-between;align-items:baseline;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);}
  .hm-head b{font-size:14px;font-weight:600;letter-spacing:3px;color:#fff;}
  .hm-head span{font-family:var(--hm-mono);font-size:11px;letter-spacing:1px;color:#7f8c9b;}
  .hm-hr{display:flex;align-items:center;gap:10px;}
  .hm-rf{background:none;border:0;padding:0;margin:0;color:#7f8c9b;cursor:pointer;display:inline-flex;align-items:center;gap:5px;
    font-family:var(--hm-mono);font-size:11px;letter-spacing:1px;transition:color .2s;}
  .hm-rf:hover:not(:disabled){color:#6fa6dd;}
  .hm-rf:disabled{cursor:not-allowed;opacity:.6;}
  .hm-rf:focus-visible{outline:2px solid #6fa6dd;outline-offset:3px;}
  .hm-rf svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
  .hm-rf.spin svg{animation:hm-spin .8s linear infinite;}
  .hm-list{list-style:none;margin:0;padding:6px 0;max-height:260px;overflow-y:auto;}
  .hm-list::-webkit-scrollbar{width:4px;}
  .hm-list::-webkit-scrollbar-thumb{background:#2f4660;}
  .hm-item{display:flex;align-items:center;gap:12px;padding:11px 18px;cursor:pointer;border-left:3px solid transparent;
    transition:background .15s;}
  .hm-item:hover{background:rgba(255,255,255,.05);}
  .hm-item.active{border-left-color:var(--hm-blue);background:rgba(47,111,179,.14);}
  .hm-idx{font-family:var(--hm-mono);font-size:12px;color:#5f6e7f;width:22px;flex:none;}
  .hm-item.active .hm-idx{color:#6fa6dd;}
  .hm-meta{flex:1;min-width:0;}
  .hm-title{font-size:14px;color:#e6e7ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .hm-artist{font-size:12px;color:#7f8c9b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .hm-eq{display:none;gap:2px;align-items:flex-end;height:12px;flex:none;}
  .hm-eq i{width:2px;background:#6fa6dd;height:4px;}
  .hm-item.active .hm-eq{display:flex;}
  .hm-box.playing .hm-item.active .hm-eq i{animation:hm-eq .9s ease-in-out infinite;}
  .hm-eq i:nth-child(2){animation-delay:.2s !important;}
  .hm-eq i:nth-child(3){animation-delay:.4s !important;}
  @keyframes hm-eq{0%,100%{height:3px;}50%{height:12px;}}

  .hm-ctrl{padding:14px 18px 16px;border-top:1px solid rgba(255,255,255,.08);}
  .hm-prog{display:flex;align-items:center;gap:10px;font-family:var(--hm-mono);font-size:11px;color:#7f8c9b;}
  .hm-prog input{flex:1;}
  .hm-row{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:12px;}
  .hm-trans{display:flex;gap:6px;}
  .hm-t{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;background:transparent;
    border:1px solid rgba(255,255,255,.16);color:#cfd6de;cursor:pointer;padding:0;transition:background .2s,border-color .2s;}
  .hm-t:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3);}
  .hm-t.main{background:var(--hm-blue);border-color:var(--hm-blue);color:#fff;}
  .hm-t.main:hover{background:#245a94;border-color:#245a94;}
  .hm-t:focus-visible{outline:2px solid #6fa6dd;outline-offset:2px;}
  .hm-t svg{width:14px;height:14px;fill:currentColor;stroke:none;}
  .hm-mode{font-size:12px;letter-spacing:1px;width:auto;padding:0 10px;color:#9fb0c3;}
  .hm-vol{display:flex;align-items:center;gap:8px;flex:1;max-width:120px;color:#7f8c9b;}
  .hm-vol button{background:none;border:0;color:inherit;cursor:pointer;padding:0;display:inline-flex;}
  .hm-vol svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
  .hm-vol input{flex:1;min-width:0;}

  .hm-panel input[type=range]{-webkit-appearance:none;appearance:none;height:14px;background:transparent;cursor:pointer;margin:0;
    --p:0%;}
  .hm-panel input[type=range]::-webkit-slider-runnable-track{height:2px;
    background:linear-gradient(to right,#2f6fb3 var(--p),rgba(255,255,255,.18) var(--p));}
  .hm-panel input[type=range]::-moz-range-track{height:2px;background:rgba(255,255,255,.18);}
  .hm-panel input[type=range]::-moz-range-progress{height:2px;background:#2f6fb3;}
  .hm-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;margin-top:-4px;
    background:#fff;border:0;border-radius:0;}
  .hm-panel input[type=range]::-moz-range-thumb{width:10px;height:10px;background:#fff;border:0;border-radius:0;}

  @media (max-width:1000px){
    .hm-right{gap:12px;}
    .hm-box.hm-fixed{right:16px;top:16px;}
    .hm-panel{right:12px;top:64px;}
  }
  @media (prefers-reduced-motion:reduce){
    .hm-ico,.hm-box.playing .hm-item.active .hm-eq i{animation:none !important;}
  }`;

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- DOM ---------- */
  var SVG_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>';
  var SVG_SLASH = '<svg class="hm-slash" viewBox="0 0 24 24" aria-hidden="true"><line x1="3.5" y1="3.5" x2="20.5" y2="20.5"/></svg>';
  var SVG_BARS = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="6" y2="18"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="18" y1="6" x2="18" y2="18"/></svg>';
  var SVG_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15"/><rect x="14" y="4.5" width="4" height="15"/></svg>';
  var SVG_PREV = '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="2.4" height="14"/><path d="M19 5v14L8.5 12z"/></svg>';
  var SVG_NEXT = '<svg viewBox="0 0 24 24"><rect x="16.6" y="5" width="2.4" height="14"/><path d="M5 5v14l10.5-7z"/></svg>';
  var SVG_VOL = '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/></svg>';
  var SVG_MUTE = '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h4l5 4v-13l-5 4z"/><line x1="16.5" y1="9.5" x2="21.5" y2="14.5"/><line x1="21.5" y1="9.5" x2="16.5" y2="14.5"/></svg>';

  var box = document.createElement('div');
  box.className = 'hm-box off';
  box.innerHTML =
    '<button class="hm-btn" id="hmNote" type="button" aria-label="播放 / 暂停音乐" title="播放 / 暂停">' +
      '<span class="hm-ico">' + SVG_NOTE + '</span>' + SVG_SLASH +
    '</button>' +
    '<button class="hm-btn" id="hmMenu" type="button" aria-label="打开歌单" aria-expanded="false" aria-controls="hmPanel" title="歌单">' + SVG_BARS + '</button>';

  var panel = document.createElement('div');
  panel.className = 'hm-panel';
  panel.id = 'hmPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '歌单');
  panel.innerHTML =
    '<div class="hm-head"><b>歌单</b><span class="hm-hr">' +
      '<button class="hm-rf" id="hmRefresh" type="button" aria-label="刷新歌单" title="刷新歌单（冷却 5 秒）">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/></svg><span id="hmCd"></span></button>' +
      '<span id="hmCount"></span></span></div>' +
    '<ul class="hm-list" id="hmList"></ul>' +
    '<div class="hm-ctrl">' +
      '<div class="hm-prog"><span id="hmCur">0:00</span><input type="range" id="hmSeek" min="0" max="1000" value="0" aria-label="播放进度"><span id="hmDur">0:00</span></div>' +
      '<div class="hm-row">' +
        '<div class="hm-trans">' +
          '<button class="hm-t" id="hmPrev" type="button" aria-label="上一首">' + SVG_PREV + '</button>' +
          '<button class="hm-t main" id="hmPlay" type="button" aria-label="播放 / 暂停">' + SVG_PLAY + '</button>' +
          '<button class="hm-t" id="hmNext" type="button" aria-label="下一首">' + SVG_NEXT + '</button>' +
          '<button class="hm-t hm-mode" id="hmMode" type="button" aria-label="切换播放模式"></button>' +
        '</div>' +
        '<div class="hm-vol"><button id="hmMute" type="button" aria-label="静音">' + SVG_VOL + '</button>' +
        '<input type="range" id="hmVol" min="0" max="100" value="60" aria-label="音量"></div>' +
      '</div>' +
    '</div>';

  function mount() {
    var header = document.querySelector('header');
    var att = header && header.querySelector('.attention');
    if (header && att) {
      var wrap = document.createElement('div');
      wrap.className = 'hm-right';
      header.insertBefore(wrap, att);
      wrap.appendChild(box);
      wrap.appendChild(att);
    } else {
      box.classList.add('hm-fixed');
      document.body.appendChild(box);
    }
    document.body.appendChild(panel);
    getList().then(function (l) {
      PLAYLIST = l;
      if (!PLAYLIST.length) { box.style.display = 'none'; return; }
      init();
    });
  }

  /* ---------- 歌单接口 ---------- */
  function normalize(arr) {
    return arr.map(function (m) {
      var title = m.title || m.filename || '';
      var artist = (m.artist && m.artist !== '未知艺术家') ? m.artist : '';
      var k = title.indexOf(' - ');            // 文件名形如 “歌手 - 歌名” 时自动拆分
      if (!artist && k > 0) { artist = title.slice(0, k).trim(); title = title.slice(k + 3).trim(); }
      return { title: title, artist: artist, url: m.url, file: m.filename || m.url };
    });
  }
  function fetchFresh() {
    return fetch(API_URL, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var l = normalize(d.music || []);
        if (!l.length) throw new Error('empty');
        try { sessionStorage.setItem(KEY + '_list', JSON.stringify(l)); } catch (e) {}
        return l;
      });
  }
  function getList() {
    try {
      var c = JSON.parse(sessionStorage.getItem(KEY + '_list'));
      if (c && c.length) return Promise.resolve(c);
    } catch (e) {}
    return fetchFresh().catch(function () { return normalize(FALLBACK); });
  }

  /* ---------- 逻辑 ---------- */
  function init() {
    var $ = function (id) { return document.getElementById(id); };
    var audio = new Audio();
    audio.preload = 'metadata';

    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}

    var idx = 0;
    PLAYLIST.forEach(function (t, i) { if (saved.file && t.file === saved.file) idx = i; });
    var mode = saved.mode | 0;
    var wantPlay = !!saved.playing;
    var resumeAt = +saved.time || 0;
    var level = typeof saved.lv === 'number' ? saved.lv : DEFAULT_LEVEL;   /* 滑块值 0~1 */
    audio.volume = level * GAIN;
    audio.muted = !!saved.muted;

    var list = $('hmList'), seek = $('hmSeek'), vol = $('hmVol');
    function renderList() {
      list.innerHTML = '';
      $('hmCount').textContent = PLAYLIST.length + ' 首';
      PLAYLIST.forEach(function (t, i) {
        var li = document.createElement('li');
        li.className = 'hm-item';
        li.tabIndex = 0;
        li.innerHTML = '<span class="hm-idx"></span><div class="hm-meta"><div class="hm-title"></div><div class="hm-artist"></div></div>' +
          '<span class="hm-eq"><i></i><i></i><i></i></span>';
        li.children[0].textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
        li.querySelector('.hm-title').textContent = t.title;
        li.querySelector('.hm-artist').textContent = t.artist || '';
        li.addEventListener('click', function () { load(i); play(); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(i); play(); }
        });
        list.appendChild(li);
      });
    }
    renderList();

    function save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          idx: idx, file: PLAYLIST[idx].file, mode: mode, time: audio.currentTime || 0,
          lv: level, muted: audio.muted, playing: !audio.paused
        }));
      } catch (e) {}
    }
    function fmt(s) {
      if (!isFinite(s)) return '0:00';
      var m = Math.floor(s / 60), r = Math.floor(s % 60);
      return m + ':' + (r < 10 ? '0' : '') + r;
    }
    function fill(el) { el.style.setProperty('--p', (el.value / el.max * 100) + '%'); }

    function render() {
      var playing = !audio.paused;
      box.classList.toggle('playing', playing);
      box.classList.toggle('off', !playing || audio.muted || level === 0);
      $('hmPlay').innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
      $('hmMute').innerHTML = (audio.muted || level === 0) ? SVG_MUTE : SVG_VOL;
      $('hmMode').textContent = MODES[mode];
      Array.prototype.forEach.call(list.children, function (li, i) {
        li.classList.toggle('active', i === idx);
      });
    }

    function load(i) {
      idx = i; retries = 0;
      audio.src = PLAYLIST[i].url;
      seek.value = 0; fill(seek);
      $('hmCur').textContent = '0:00';
      $('hmDur').textContent = '0:00';
      render(); save();
    }
    function play() {
      var p = audio.play();
      if (p && p.catch) p.catch(function () { render(); });
    }
    function pause() { audio.pause(); }
    function toggle() { audio.paused ? play() : pause(); }

    function next(auto) {
      if (mode === 2 && PLAYLIST.length > 1) {
        var n; do { n = Math.floor(Math.random() * PLAYLIST.length); } while (n === idx);
        load(n);
      } else {
        load((idx + 1) % PLAYLIST.length);
      }
      play();
    }
    function prev() {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      load((idx - 1 + PLAYLIST.length) % PLAYLIST.length);
      play();
    }

    /* 事件 */
    $('hmNote').addEventListener('click', toggle);
    $('hmPlay').addEventListener('click', toggle);
    $('hmNext').addEventListener('click', function () { next(); });
    $('hmPrev').addEventListener('click', prev);
    $('hmMode').addEventListener('click', function () { mode = (mode + 1) % MODES.length; render(); save(); });
    $('hmMute').addEventListener('click', function () {
      if (level === 0) { level = DEFAULT_LEVEL; audio.volume = level * GAIN; audio.muted = false; }
      else audio.muted = !audio.muted;
      vol.value = audio.muted ? 0 : level * 100; fill(vol);
      render(); save();
    });
    vol.value = audio.muted ? 0 : level * 100; fill(vol);
    vol.addEventListener('input', function () {
      level = vol.value / 100;
      audio.volume = level * GAIN;
      audio.muted = level === 0;
      fill(vol); render(); save();
    });
    seek.addEventListener('input', function () {
      if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
      fill(seek);
    });

    audio.addEventListener('play', function () { render(); save(); });
    audio.addEventListener('pause', function () { render(); save(); });
    audio.addEventListener('ended', function () {
      /* 排查用：按 F12 看 Console，能看到歌是在第几秒“结束”的 */
      console.info('[music] ended', PLAYLIST[idx].title, fmt(audio.currentTime) + ' / ' + fmt(audio.duration));
      if (mode === 1) { audio.currentTime = 0; play(); } else next(true);
    });
    var retries = 0;
    audio.addEventListener('error', function () {
      var e = audio.error, t = audio.currentTime || 0;
      console.warn('[music] error', e && e.code, e && e.message, PLAYLIST[idx].url, 'at ' + fmt(t));
      /* 播到一半网络/传输出错：先在原位置重试（最多 3 次），不要直接切歌 */
      if (t > 0.5 && retries < 3) {
        retries++;
        audio.src = PLAYLIST[idx].url;
        audio.addEventListener('loadedmetadata', function once() {
          audio.removeEventListener('loadedmetadata', once);
          try { audio.currentTime = t; } catch (x) {}
          play();
        });
        audio.load();
        return;
      }
      /* 文件本身打不开（丢失/格式不支持）才跳下一首 */
      if (PLAYLIST.length > 1) next(true);
    });
    audio.addEventListener('loadedmetadata', function () { $('hmDur').textContent = fmt(audio.duration); });
    var lastSave = 0;
    audio.addEventListener('timeupdate', function () {
      if (audio.duration) {
        seek.value = audio.currentTime / audio.duration * 1000; fill(seek);
      }
      $('hmCur').textContent = fmt(audio.currentTime);
      var now = Date.now();
      if (now - lastSave > 1500) { lastSave = now; save(); }
    });
    window.addEventListener('pagehide', save);

    /* 刷新歌单（冷却 5 秒） */
    var COOLDOWN = 5, cooling = false;
    var rf = $('hmRefresh'), cd = $('hmCd');
    rf.addEventListener('click', function () {
      if (cooling) return;
      cooling = true; rf.disabled = true; rf.classList.add('spin');
      var left = COOLDOWN; cd.textContent = left + 's';
      var timer = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(timer); cooling = false; rf.disabled = false; cd.textContent = ''; }
        else cd.textContent = left + 's';
      }, 1000);
      fetchFresh().then(function (l) {
        var cur = PLAYLIST[idx] && PLAYLIST[idx].file, ni = -1;
        l.forEach(function (t, i) { if (t.file === cur) ni = i; });
        PLAYLIST = l;
        if (ni >= 0) { idx = ni; renderList(); render(); }
        else { audio.pause(); renderList(); load(0); }   /* 正在播的歌被删了：停下并回到第一首 */
      }).catch(function () {
        var c = $('hmCount'); c.textContent = '刷新失败';
        setTimeout(function () { c.textContent = PLAYLIST.length + ' 首'; }, 2000);
      }).then(function () { rf.classList.remove('spin'); });
    });

    /* 面板开关 */
    var menu = $('hmMenu');
    function setOpen(o) {
      panel.classList.toggle('open', o);
      menu.setAttribute('aria-expanded', o ? 'true' : 'false');
    }
    menu.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!panel.classList.contains('open')); });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

    /* 初始化曲目 + 跨页续播 */
    load(idx);
    if (resumeAt > 0) {
      audio.addEventListener('loadedmetadata', function once() {
        audio.removeEventListener('loadedmetadata', once);
        if (resumeAt < audio.duration) audio.currentTime = resumeAt;
      });
    }
    if (wantPlay) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () {
        /* 浏览器拦截了自动播放：等用户在页面上任意点一下再继续 */
        var go = function () {
          document.removeEventListener('pointerdown', go, true);
          if (wantPlay && audio.paused) play();
        };
        document.addEventListener('pointerdown', go, true);
      });
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
