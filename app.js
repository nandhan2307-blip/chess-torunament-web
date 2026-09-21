/* Chess Tournament Points Table
   League (8 players, 28 games) then semi-finals, third-place match and final.
   Everything is saved in this browser (localStorage). */
(function () {
  'use strict';

  var STORAGE_KEY = 'chess-tournament-points-table-v1';
  var DEFAULT_PLAYERS = ['NANDYY', 'SK SANJU', 'VIVEK', 'JUBAA', 'SARAN', 'PRAVUU', 'SANJAY', 'SAKTHYY'];
  var N = DEFAULT_PLAYERS.length;      // 8 players
  var EACH = N - 1;                    // 7 games per player
  var TOTAL = (N * (N - 1)) / 2;       // 28 games

  /* Fixed fixture list: 7 rounds x 4 games, numbered Match 1 to Match 28.
     Numbers are player positions: 0 NANDYY, 1 SK SANJU, 2 VIVEK, 3 JUBAA,
     4 SARAN, 5 PRAVUU, 6 SANJAY, 7 SAKTHYY. Everyone plays once per round. */
  var SCHEDULE = [
    [[6, 5], [0, 7], [1, 4], [2, 3]],
    [[6, 7], [5, 4], [0, 3], [1, 2]],
    [[6, 4], [7, 3], [5, 2], [0, 1]],
    [[6, 3], [4, 2], [7, 1], [5, 0]],
    [[6, 2], [3, 1], [4, 0], [7, 5]],
    [[6, 1], [2, 0], [3, 5], [4, 7]],
    [[6, 0], [1, 5], [2, 7], [3, 4]]
  ];

  var PALETTE = ['#4e7a37', '#8a5a2b', '#3b6f8f', '#a0483f', '#6b4f8f', '#8a6d1a', '#2f7f73', '#7a4a63'];

  /* Flat list of matches with numbers, and a lookup by pair key */
  var matches = [];
  var matchByKey = {};
  SCHEDULE.forEach(function (round, ri) {
    round.forEach(function (p) {
      var m = { no: matches.length + 1, round: ri + 1, a: p[0], b: p[1], key: keyOf(p[0], p[1]) };
      matches.push(m);
      matchByKey[m.key] = m;
    });
  });

    /* ---------- State ---------- */
  // results: { "0-3": { w: 3 | "d", at: ms } }   key = lower index - higher index
  // ko: { sf1|sf2|final|third: { a, b, w, at } }

  var state = load();

  var form = { p1: null, p2: null, winner: null };
  var view = { player: 'all', status: 'all' };
  var photoTarget = null;
  var storageWarned = false;

  /* ---------- Firebase cloud sync ---------- */

  var CLOUD_COLLECTION = 'tournament';
  var CLOUD_DOCUMENT = 'main';

  // Becomes true only after the first Firebase snapshot has been received.
  var cloudInitialized = false;

  // Prevents Firebase updates from accidentally being written back
  // while we are applying data received from the cloud.
  var applyingCloudState = false;

  var cloudUnsubscribe = null;

  function cloudPayload() {
    return {
      players: state.players,
      win: state.win,
      draw: state.draw,
      results: state.results,
      seeds: state.seeds,
      ko: state.ko,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        toast('Could not save in this browser. Firebase will still be used when available.');
      }
      return false;
    }
  }

  function saveCloud() {
    if (!cloudInitialized || applyingCloudState) return;

    db.collection(CLOUD_COLLECTION)
      .doc(CLOUD_DOCUMENT)
      .set(cloudPayload())
      .catch(function (err) {
        console.error('Firebase save failed:', err);
        toast('Cloud save failed. Check your Firebase connection.');
      });
  }

  function startCloudSync() {
    if (cloudUnsubscribe) return;

    cloudUnsubscribe = db
      .collection(CLOUD_COLLECTION)
      .doc(CLOUD_DOCUMENT)
      .onSnapshot(
        function (doc) {

          applyingCloudState = true;

          if (doc.exists) {
            var data = doc.data();

            if (Array.isArray(data.players) && data.players.length === N) {
              state.players = data.players;
            }

            if (typeof data.win === 'number') {
              state.win = data.win;
            }

            if (typeof data.draw === 'number') {
              state.draw = data.draw;
            }

            if (data.results && typeof data.results === 'object') {
              state.results = data.results;
            }

            state.seeds = validSeeds(data.seeds) ? data.seeds : null;

            if (data.ko && typeof data.ko === 'object') {
              state.ko = data.ko;
            } else {
              state.ko = {};
            }

            // Photos deliberately remain local.
            // They are stored in localStorage because they are image data.
            saveLocal();

            cloudInitialized = true;

            renderAll();

            applyingCloudState = false;

          } else {

            // First device opening the app:
            // create the shared Firebase document using its current state.
            cloudInitialized = true;

            saveCloud();

            saveLocal();

            renderAll();

            applyingCloudState = false;
          }
        },
        function (err) {
          console.error('Firebase sync failed:', err);

          cloudInitialized = false;
          applyingCloudState = false;

          toast('Firebase connection failed. Local browser storage is still active.');
        }
      );
  }
  function defaultState() {
    return { players: DEFAULT_PLAYERS.slice(), win: 1, draw: 0.5, results: {}, photos: {}, seeds: null, ko: {} };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var ok = s && Array.isArray(s.players) && s.players.length === N &&
        s.players.every(function (p) { return typeof p === 'string' && p.trim(); }) &&
        typeof s.win === 'number' && typeof s.draw === 'number' &&
        s.results && typeof s.results === 'object';
      if (!ok) return defaultState();
      var photos = {};
      if (s.photos && typeof s.photos === 'object') {
        Object.keys(s.photos).forEach(function (k) {
          if (typeof s.photos[k] === 'string' && s.photos[k].indexOf('data:image/') === 0) photos[k] = s.photos[k];
        });
      }
      s.photos = photos;
      s.ko = s.ko && typeof s.ko === 'object' ? s.ko : {};
      s.seeds = validSeeds(s.seeds) ? s.seeds : null;
      return s;
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    var localOK = saveLocal();

    // Save to Firebase after the initial cloud state has loaded.
    saveCloud();

    return localOK;
  }

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function h(tag, props) {
    var el = document.createElement(tag);
    var k;
    if (props) {
      for (k in props) {
        var v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var a = 2; a < arguments.length; a++) {
      var kid = arguments[a];
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function keyOf(a, b) { return a < b ? a + '-' + b : b + '-' + a; }
  function nm(i) { return state.players[i]; }

  // 3 -> "3", 3.5 -> "3½", 0.5 -> "½"
  function fmt(n) {
    var r = Math.round(n * 100) / 100;
    var whole = Math.floor(r);
    var frac = Math.round((r - whole) * 100) / 100;
    if (frac === 0) return String(whole);
    if (frac === 0.5) return (whole === 0 ? '' : String(whole)) + '½';
    return String(r);
  }

  function playedCount() { return Object.keys(state.results).length; }
  function leagueDone() { return playedCount() === TOTAL; }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, msg.length > 60 ? 4200 : 2600);
  }

  function initials(name) {
    var w = name.trim().split(/\s+/);
    var s = w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : name.trim().slice(0, 2);
    return s.toUpperCase();
  }

  function avatar(i, size) {
    var el = h('span', { class: 'avatar', style: 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.38) + 'px' });
    if (state.photos[i]) {
      el.appendChild(h('img', { src: state.photos[i], alt: '', draggable: 'false' }));
    } else {
      el.style.background = PALETTE[i % PALETTE.length];
      el.textContent = initials(nm(i));
    }
    return el;
  }

  function ghostAvatar(size) {
    return h('span', { class: 'avatar ghost', 'aria-hidden': 'true', style: 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px', text: '?' });
  }

  /* ---------- League standings ---------- */
  function compute() {
    var s = state.players.map(function (name, i) {
      return { i: i, name: name, p: 0, w: 0, d: 0, l: 0, pts: 0, sb: 0 };
    });
    var entries = Object.keys(state.results).map(function (k) {
      var parts = k.split('-').map(Number);
      return { a: parts[0], b: parts[1], w: state.results[k].w };
    });

    entries.forEach(function (e) {
      s[e.a].p++; s[e.b].p++;
      if (e.w === 'd') {
        s[e.a].d++; s[e.b].d++;
        s[e.a].pts += state.draw; s[e.b].pts += state.draw;
      } else {
        var loser = e.w === e.a ? e.b : e.a;
        s[e.w].w++; s[loser].l++;
        s[e.w].pts += state.win;
      }
    });

    // Sonneborn-Berger tiebreak: points of opponents you beat (+ a share for draws)
    var share = state.win > 0 ? state.draw / state.win : 0.5;
    entries.forEach(function (e) {
      if (e.w === 'd') {
        s[e.a].sb += s[e.b].pts * share;
        s[e.b].sb += s[e.a].pts * share;
      } else {
        var loser = e.w === e.a ? e.b : e.a;
        s[e.w].sb += s[loser].pts;
      }
    });

    var eps = 1e-9;
    s.sort(function (x, y) {
      if (Math.abs(y.pts - x.pts) > eps) return y.pts - x.pts;
      if (Math.abs(y.sb - x.sb) > eps) return y.sb - x.sb;
      if (y.w !== x.w) return y.w - x.w;
      return x.name.localeCompare(y.name);
    });

    s.forEach(function (row, idx) {
      var prev = s[idx - 1];
      var same = prev && Math.abs(prev.pts - row.pts) < eps && Math.abs(prev.sb - row.sb) < eps && prev.w === row.w;
      row.rank = same ? prev.rank : idx + 1;
    });
    return s;
  }

  // true when two neighbouring places in the top 5 are level (affects who qualifies / who plays whom)
  function topTies(rows) {
    for (var i = 0; i < 4; i++) if (rows[i].rank === rows[i + 1].rank) return true;
    return false;
  }

  function renderStandings(rows) {
    var body = $('standingsBody');
    var played = playedCount();
    body.replaceChildren();

    rows.forEach(function (r, idx) {
      var isLeader = played > 0 && r.rank === 1;
      var cls = [];
      if (isLeader) cls.push('leader');
      if (played > 0 && idx < 4) cls.push('qual');
      if (played > 0 && idx === 3) cls.push('cut');

      var name = h('span', { class: 'namecell' }, avatar(r.i, 32), r.name);
      if (isLeader) name.appendChild(h('span', { class: 'crown', 'aria-hidden': 'true', text: '♔' }));
      if (r.p === EACH) name.appendChild(h('span', { class: 'done-tag', text: 'all games played' }));

      body.appendChild(h('tr', { class: cls.join(' ') || null },
        h('td', { class: 'c-rank', text: r.rank }),
        h('td', { class: 'c-name' }, name),
        h('td', { class: 'num', text: r.p + '/' + EACH }),
        h('td', { class: 'num', text: r.w }),
        h('td', { class: 'num', text: r.d }),
        h('td', { class: 'num', text: r.l }),
        h('td', { class: 'num pts', text: fmt(r.pts) }),
        h('td', { class: 'num tb', text: fmt(r.sb) })
      ));
    });

    $('progressText').textContent = played + ' of ' + TOTAL + ' games played';
    $('progressBar').setAttribute('aria-valuenow', played);
    $('progressFill').style.width = (played / TOTAL * 100) + '%';

    $('scoringNote').textContent =
      'Scoring: win = ' + fmt(state.win) + ', draw = ' + fmt(state.draw) + ', loss = 0. ' +
      'The top 4 (green marker, dashed line) go to the semi-finals. ' +
      'Players are ranked by points, then Tiebreak (Sonneborn-Berger: the points of the opponents you beat, plus a share for draws), then wins.';

    var banner = $('banner');
    var final = state.ko.final;
    if (final) {
      banner.hidden = false;
      banner.replaceChildren(h('span', { class: 'glyph', 'aria-hidden': 'true', text: '♛' }),
        'Tournament complete. ' + nm(final.w) + ' is the champion.');
    } else if (played === TOTAL) {
      var names = rows.slice(0, 4).map(function (r) { return r.name; }).join(', ');
      var tiedMsg = topTies(rows) && !validSeeds(state.seeds)
        ? ' Some places are level, so use "Adjust seeding" in the playoffs section.' : '';
      banner.hidden = false;
      banner.replaceChildren(h('span', { class: 'glyph', 'aria-hidden': 'true', text: '♔' }),
        'League complete. Semi-finalists: ' + names + '.' + tiedMsg);
    } else {
      banner.hidden = true;
    }
  }

  /* ---------- Players roster and photos ---------- */
  function renderRoster() {
    var box = $('roster');
    box.replaceChildren();
    state.players.forEach(function (n, i) {
      var has = !!state.photos[i];
      var tile = h('div', { class: 'tile' },
        h('button', {
          type: 'button', class: 'tile-photo',
          'aria-label': (has ? 'Change photo for ' : 'Add photo for ') + n,
          onclick: function () { photoTarget = i; $('photoInput').value = ''; $('photoInput').click(); }
        }, avatar(i, 72)),
        h('span', { class: 'tile-name', text: n }),
        h('span', { class: 'tile-action', text: has ? 'Change photo' : 'Add photo' }));
      if (has) {
        tile.appendChild(h('button', {
          type: 'button', class: 'tile-x', text: '×', 'aria-label': 'Remove photo of ' + n,
          onclick: function () { delete state.photos[i]; save(); renderAll(); toast('Photo removed for ' + n); }
        }));
      }
      box.appendChild(tile);
    });
  }

  function processPhoto(file, idx) {
    if (!file || file.type.indexOf('image/') !== 0) { toast('Please choose an image file (JPG or PNG).'); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('Could not read that file.'); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { toast('Could not open that image. Try a JPG or PNG.'); };
      img.onload = function () {
        var S = 200;
        var c = document.createElement('canvas');
        c.width = S; c.height = S;
        var ctx = c.getContext('2d');
        var side = Math.min(img.width, img.height);
        var sx = (img.width - side) / 2;
        var sy = (img.height - side) * 0.25;   // crop a little higher so faces are not cut off
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, S, S);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
        state.photos[idx] = c.toDataURL('image/jpeg', 0.85);
        var ok = save();
        renderAll();
        if (ok) toast('Photo added for ' + nm(idx));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- Results board ---------- */
  function renderBoard(rows) {
    var board = $('board');
    var scoreOf = {};
    rows.forEach(function (r) { scoreOf[r.i] = r.pts; });
    board.replaceChildren();

    var headRow = h('tr', null, h('td'));
    for (var c = 0; c < N; c++) {
      headRow.appendChild(h('th', { scope: 'col', class: 'col-name', title: nm(c) },
        h('div', { class: 'colhead' }, h('span', { text: nm(c) }), avatar(c, 26))));
    }
    headRow.appendChild(h('th', { scope: 'col', class: 'col-pts', text: 'Points' }));
    board.appendChild(h('thead', null, headRow));

    var body = h('tbody');
    for (var r = 0; r < N; r++) {
      var tr = h('tr', null, h('th', { scope: 'row', class: 'row-name', title: nm(r) },
        h('span', { class: 'rowhead' }, nm(r), avatar(r, 28))));
      for (var col = 0; col < N; col++) {
        var shade = (r + col) % 2 === 0 ? 'light' : 'dark';
        if (r === col) { tr.appendChild(h('td', { class: 'sq self' })); continue; }
        tr.appendChild(h('td', { class: 'sq ' + shade }, cellButton(r, col)));
      }
      tr.appendChild(h('td', { class: 'pts-cell', text: fmt(scoreOf[r]) }));
      body.appendChild(tr);
    }
    board.appendChild(body);
  }

  function cellButton(r, c) {
    var res = state.results[keyOf(r, c)];
    var mNo = matchByKey[keyOf(r, c)].no;
    var text = '', cls = 'cell empty';
    var label = 'Match ' + mNo + ', ' + nm(r) + ' vs ' + nm(c) + ': not played. Enter result.';
    if (res) {
      cls = 'cell';
      if (res.w === 'd') { text = '½'; label = 'Match ' + mNo + ', ' + nm(r) + ' vs ' + nm(c) + ': draw. Edit result.'; }
      else if (res.w === r) { text = '1'; label = 'Match ' + mNo + ', ' + nm(r) + ' vs ' + nm(c) + ': ' + nm(r) + ' won. Edit result.'; }
      else { text = '0'; label = 'Match ' + mNo + ', ' + nm(r) + ' vs ' + nm(c) + ': ' + nm(c) + ' won. Edit result.'; }
    }
    return h('button', {
      type: 'button', class: cls, text: text, 'aria-label': label,
      title: 'Match ' + mNo,
      onclick: function () { var m = matchByKey[keyOf(r, c)]; pickMatch(m.a, m.b, true); }
    });
  }

  /* ---------- Record form ---------- */
  function findPlayer(q) {
    q = q.trim().toLowerCase();
    if (!q) return { idx: -1 };
    var names = state.players.map(function (n) { return n.toLowerCase(); });
    var tests = [
      function (n) { return n === q; },
      function (n) { return n.indexOf(q) === 0; },
      function (n) { return n.indexOf(q) !== -1; }
    ];
    for (var t = 0; t < tests.length; t++) {
      var hits = [];
      names.forEach(function (n, i) { if (tests[t](n)) hits.push(i); });
      if (hits.length === 1) return { idx: hits[0] };
      if (hits.length > 1) return { idx: -1, ambiguous: true };
    }
    return { idx: -1 };
  }

  function parseMatch(text) {
    var t = text.trim();
    if (!t) return { empty: true };
    // also accept "match 5" / "m5" / "#5"
    var mm = t.match(/^(?:match\s*|m\s*|#\s*)(\d{1,2})$/i);
    if (mm) {
      var found = matches[Number(mm[1]) - 1];
      return found ? { a: found.a, b: found.b } : { error: 'There is no Match ' + mm[1] + '. Matches are numbered 1 to ' + TOTAL + '.' };
    }
    var parts = t.split(/\s+(?:vs\.?|versus|v)\s+|\s*\bvs\.?\b\s*|\s+[-–—]\s+/i);
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      return { error: 'Type two players separated by "vs", for example SK vs VIVEK.' };
    }
    var a = findPlayer(parts[0]), b = findPlayer(parts[1]);
    if (a.idx < 0) return { error: a.ambiguous ? '"' + parts[0].trim() + '" matches more than one player. Type more of the name.' : 'No player named "' + parts[0].trim() + '".' };
    if (b.idx < 0) return { error: b.ambiguous ? '"' + parts[1].trim() + '" matches more than one player. Type more of the name.' : 'No player named "' + parts[1].trim() + '".' };
    if (a.idx === b.idx) return { error: 'A player cannot play against themselves.' };
    return { a: a.idx, b: b.idx };
  }

  function pickMatch(a, b, prefill) {
    var changed = !(form.p1 === a && form.p2 === b);
    form.p1 = a; form.p2 = b;
    if (changed) form.winner = null;
    var existing = state.results[keyOf(a, b)];
    if (prefill && existing) form.winner = existing.w;
    $('matchText').value = nm(a) + ' vs ' + nm(b);
    renderForm();
    if (prefill) {
      $('formTitle').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    }
  }

  function describeResult(res) {
    return res.w === 'd' ? 'Draw' : nm(res.w) + ' won';
  }

  function renderForm() {
    var sel = $('matchSelect');
    var pending = [], done = [];
    matches.forEach(function (m) { (state.results[m.key] ? done : pending).push(m); });
    var current = form.p1 !== null ? keyOf(form.p1, form.p2) : '';
    sel.replaceChildren(h('option', { value: '', text: 'Choose a match' }));
    function group(label, list) {
      if (!list.length) return;
      var og = h('optgroup', { label: label });
      list.forEach(function (m) {
        og.appendChild(h('option', { value: m.key, text: 'Match ' + m.no + ': ' + nm(m.a) + ' vs ' + nm(m.b) }));
      });
      sel.appendChild(og);
    }
    group('Not played (' + pending.length + ')', pending);
    group('Played (' + done.length + ')', done);
    sel.value = current;

    var status = $('matchStatus');
    var ready = form.p1 !== null && form.p2 !== null;
    status.className = 'status';
    if (!ready) {
      var parsed = parseMatch($('matchText').value);
      if (parsed.error) { status.classList.add('err'); status.textContent = parsed.error; }
      else status.textContent = 'Type a match like SK vs VIVEK (or "match 5"), or pick one from the list. Partial names work.';
    } else {
      var m = matchByKey[keyOf(form.p1, form.p2)];
      var ex = state.results[m.key];
      if (ex) {
        status.classList.add('warn');
        status.textContent = 'Match ' + m.no + ' (' + nm(form.p1) + ' vs ' + nm(form.p2) + ') already has a result: ' + describeResult(ex).toLowerCase() + '. Saving will replace it.';
      } else {
        status.classList.add('ok');
        status.textContent = 'Match ' + m.no + ' (Round ' + m.round + '): ' + nm(form.p1) + ' vs ' + nm(form.p2) + '. Not played yet.';
      }
    }

    var group2 = $('winnerGroup');
    group2.replaceChildren();
    group2.setAttribute('role', 'radiogroup');
    var options = ready
      ? [{ v: form.p1, t: nm(form.p1) + ' wins', av: form.p1 }, { v: 'd', t: 'Draw' }, { v: form.p2, t: nm(form.p2) + ' wins', av: form.p2 }]
      : [{ v: null, t: 'Player 1 wins' }, { v: null, t: 'Draw' }, { v: null, t: 'Player 2 wins' }];
    options.forEach(function (o) {
      var lead = o.av !== undefined ? avatar(o.av, 26) : (o.v === 'd' ? h('span', { class: 'draw-mark', 'aria-hidden': 'true', text: '½' }) : null);
      group2.appendChild(h('button', {
        type: 'button', class: 'winner-btn', role: 'radio',
        'aria-checked': String(ready && form.winner === o.v),
        disabled: !ready,
        onclick: function () { form.winner = o.v; renderForm(); }
      }, lead, o.t));
    });

    $('btnSave').disabled = !(ready && form.winner !== null);
  }

  function onMatchText() {
    var parsed = parseMatch($('matchText').value);
    if (parsed.a !== undefined) {
      var changed = !(form.p1 === parsed.a && form.p2 === parsed.b);
      form.p1 = parsed.a; form.p2 = parsed.b;
      if (changed) form.winner = null;
    } else {
      form.p1 = null; form.p2 = null; form.winner = null;
    }
    renderForm();
  }

  function onMatchSelect() {
    var v = $('matchSelect').value;
    if (!v) { form.p1 = form.p2 = form.winner = null; $('matchText').value = ''; renderForm(); return; }
    var m = matchByKey[v];
    pickMatch(m.a, m.b, false);
  }

  function saveResult() {
    if (form.p1 === null || form.p2 === null || form.winner === null) return;
    var m = matchByKey[keyOf(form.p1, form.p2)];
    var replaced = !!state.results[m.key];
    state.results[m.key] = { w: form.winner, at: Date.now() };
    var msg = 'Match ' + m.no + ': ' + (form.winner === 'd'
      ? nm(form.p1) + ' vs ' + nm(form.p2) + ' was a draw'
      : nm(form.winner) + ' won');
    form = { p1: null, p2: null, winner: null };
    $('matchText').value = '';
    commit((replaced ? 'Updated. ' : 'Saved. ') + msg);
    $('matchText').focus();
  }

  /* ---------- Fixtures by round ---------- */
  function renderFilters() {
    var sel = $('filterPlayer');
    var cur = view.player;
    sel.replaceChildren(h('option', { value: 'all', text: 'All players' }));
    state.players.forEach(function (n, i) { sel.appendChild(h('option', { value: String(i), text: n })); });
    sel.value = cur;
    if (sel.value !== cur) { view.player = 'all'; sel.value = 'all'; }
  }

  function fixtureRow(m) {
    var res = state.results[m.key];
    function side(i) {
      return h('span', { class: 'fx-p' + (res && res.w === i ? ' fx-win' : '') }, avatar(i, 28), nm(i));
    }
    return h('div', { class: 'fx' },
      h('div', { class: 'fx-players' }, side(m.a), h('span', { class: 'vs', text: 'vs' }), side(m.b)),
      h('div', { class: 'fx-foot' },
        h('span', { class: 'fx-result' + (res ? ' done' : ''), text: 'Match ' + m.no + ': ' + (res ? describeResult(res) : 'Not played') }),
        h('button', {
          type: 'button', class: 'btn small no-print', text: res ? 'Edit' : 'Enter result',
          'aria-label': (res ? 'Edit result for match ' : 'Enter result for match ') + m.no + ', ' + nm(m.a) + ' vs ' + nm(m.b),
          onclick: function () { pickMatch(m.a, m.b, true); }
        })));
  }

  function renderFixtures() {
    var wrap = $('rounds');
    wrap.replaceChildren();
    var shown = 0;
    SCHEDULE.forEach(function (round, ri) {
      var list = matches.filter(function (m) {
        if (m.round !== ri + 1) return false;
        if (view.player !== 'all' && Number(view.player) !== m.a && Number(view.player) !== m.b) return false;
        var res = state.results[m.key];
        if (view.status === 'pending' && res) return false;
        if (view.status === 'done' && !res) return false;
        return true;
      });
      if (!list.length) return;
      var doneCount = matches.filter(function (m) { return m.round === ri + 1 && state.results[m.key]; }).length;
      var card = h('div', { class: 'round' },
        h('div', { class: 'round-head' }, h('span', { text: 'Round ' + (ri + 1) }), h('small', { text: doneCount + ' of ' + round.length + ' played' })));
      list.forEach(function (m) { card.appendChild(fixtureRow(m)); shown++; });
      wrap.appendChild(card);
    });
    if (!shown) wrap.appendChild(h('p', { class: 'empty-msg', text: 'No games match this filter.' }));
  }

  function renderHistory() {
    var list = $('history');
    list.replaceChildren();
    var items = Object.keys(state.results).map(function (k) {
      return { m: matchByKey[k], res: state.results[k], key: k };
    }).sort(function (x, y) { return y.res.at - x.res.at; }).slice(0, 8);

    if (!items.length) {
      list.appendChild(h('li', { class: 'empty-msg', text: 'No results yet. Record the first game to start the table.' }));
      return;
    }
    items.forEach(function (it) {
      var a = it.m.a, b = it.m.b, text, lead;
      if (it.res.w === 'd') {
        text = nm(a) + ' drew with ' + nm(b);
        lead = h('span', { class: 'draw-badge', 'aria-hidden': 'true', text: '½' });
      } else {
        var loser = it.res.w === a ? b : a;
        text = nm(it.res.w) + ' beat ' + nm(loser);
        lead = avatar(it.res.w, 28);
      }
      var when = new Date(it.res.at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      list.appendChild(h('li', null, lead,
        h('span', { class: 'h-text' }, text, h('span', { class: 'h-time', text: 'Match ' + it.m.no + ' · ' + when })),
        h('button', {
          type: 'button', class: 'btn small', text: 'Undo',
          'aria-label': 'Remove result: ' + text,
          onclick: function () { delete state.results[it.key]; save(); commit('Removed: ' + text); }
        })));
    });
  }

  /* ---------- Playoffs ---------- */
  function validSeeds(s) {
    return Array.isArray(s) && s.length === 4 && s.every(function (x, i) {
      return Number.isInteger(x) && x >= 0 && x < N && s.indexOf(x) === i;
    });
  }

  function getSeeds(rows) {
    if (validSeeds(state.seeds)) return state.seeds.slice();
    if (playedCount() === 0) return [null, null, null, null];
    return rows.slice(0, 4).map(function (r) { return r.i; });
  }

  function koWinner(id) { var r = state.ko[id]; return r ? r.w : null; }
  function koLoser(id) { var r = state.ko[id]; return r ? (r.w === r.a ? r.b : r.a) : null; }

  // Drop playoff results that no longer match the current seeds / earlier rounds. Returns true if any were dropped.
  function syncKnockout(seeds) {
    var done = leagueDone(), changed = false;
    function check(id, a, b) {
      var r = state.ko[id];
      if (!r) return;
      if (!done || a === null || b === null || r.a !== a || r.b !== b || (r.w !== a && r.w !== b)) {
        delete state.ko[id]; changed = true;
      }
    }
    check('sf1', seeds[0], seeds[3]);
    check('sf2', seeds[1], seeds[2]);
    check('final', koWinner('sf1'), koWinner('sf2'));
    check('third', koLoser('sf1'), koLoser('sf2'));
    return changed;
  }

  function deriveKO(seeds) {
    return [
      { id: 'sf1', title: 'Semi-final 1',
        a: { idx: seeds[0], sub: 'League seed 1', ph: 'Seed 1' },
        b: { idx: seeds[3], sub: 'League seed 4', ph: 'Seed 4' } },
      { id: 'sf2', title: 'Semi-final 2',
        a: { idx: seeds[1], sub: 'League seed 2', ph: 'Seed 2' },
        b: { idx: seeds[2], sub: 'League seed 3', ph: 'Seed 3' } },
      { id: 'final', title: 'Final',
        a: { idx: koWinner('sf1'), sub: 'Won semi-final 1', ph: 'Winner of semi-final 1' },
        b: { idx: koWinner('sf2'), sub: 'Won semi-final 2', ph: 'Winner of semi-final 2' } },
      { id: 'third', title: 'Third-place match',
        a: { idx: koLoser('sf1'), sub: 'Lost semi-final 1', ph: 'Loser of semi-final 1' },
        b: { idx: koLoser('sf2'), sub: 'Lost semi-final 2', ph: 'Loser of semi-final 2' } }
    ];
  }

  function setKO(m, w) {
    if (!leagueDone() || m.a.idx === null || m.b.idx === null) return;
    var cur = state.ko[m.id];
    if (cur && cur.w === w) return;
    state.ko[m.id] = { a: m.a.idx, b: m.b.idx, w: w, at: Date.now() };
    save();
    var cleared = commitSilent();
    toast(m.title + ': ' + nm(w) + ' wins.' + (cleared ? ' Later playoff results were cleared because the players changed.' : ''));
  }

  function clearKO(id) {
    delete state.ko[id];
    save();
    var cleared = commitSilent();
    toast('Result cleared.' + (cleared ? ' Later playoff results were cleared too.' : ''));
  }

  function matchCard(m, done) {
    var res = state.ko[m.id];
    var canPlay = done && m.a.idx !== null && m.b.idx !== null;
    var card = h('article', { class: 'kmatch' + (res ? ' decided' : '') }, h('h4', { class: 'kmatch-title', text: m.title }));

    [m.a, m.b].forEach(function (s) {
      var idx = s.idx;
      var won = !!res && res.w === idx;
      var lost = !!res && idx !== null && res.w !== idx;
      var cls = 'kplayer' + (idx === null ? ' tbd' : '') + (won ? ' won' : '') + (lost ? ' lost' : '');
      card.appendChild(h('div', { class: cls },
        idx === null ? ghostAvatar(44) : avatar(idx, 44),
        h('span', { class: 'kinfo' },
          h('span', { class: 'kname', text: idx === null ? s.ph : nm(idx) }),
          h('span', { class: 'kseed', text: idx === null ? '' : s.sub })),
        h('button', {
          type: 'button', class: 'btn small' + (won ? ' primary' : ''),
          text: won ? 'Winner' : 'Mark winner',
          disabled: !canPlay,
          'aria-pressed': String(won),
          'aria-label': idx === null ? 'Waiting for player' : nm(idx) + ' wins ' + m.title,
          onclick: function () { setKO(m, idx); }
        })));
    });

    var note;
    if (res) note = 'Result saved';
    else if (!done) note = 'Opens when the league is finished';
    else if (!canPlay) note = 'Waiting for the earlier match';
    else note = 'Not played yet';
    card.appendChild(h('div', { class: 'kfoot' }, h('span', { text: note }),
      res ? h('button', { type: 'button', class: 'btn small', text: 'Clear result', onclick: function () { clearKO(m.id); } }) : null));
    return card;
  }

  function championCard() {
    var f = state.ko.final, t = state.ko.third;
    if (!f) {
      return h('div', { class: 'champ empty' },
        h('div', { class: 'crown-big', 'aria-hidden': 'true', text: '♛' }),
        ghostAvatar(96),
        h('p', { class: 'champ-name', text: 'To be decided' }),
        h('p', { class: 'champ-sub', text: 'The winner of the final is the champion.' }));
    }
    var champ = f.w, runner = f.w === f.a ? f.b : f.a;
    var box = h('div', { class: 'champ' },
      h('div', { class: 'crown-big', 'aria-hidden': 'true', text: '♛' }),
      avatar(champ, 96),
      h('p', { class: 'champ-name', text: nm(champ) }),
      h('p', { class: 'champ-sub', text: 'Champion' }));
    var podium = [[2, runner, 'Runner-up']];
    if (t) podium.push([3, t.w, 'Third place'], [4, t.w === t.a ? t.b : t.a, 'Fourth place']);
    var ol = h('ol', { class: 'podium' });
    podium.forEach(function (p) {
      ol.appendChild(h('li', null, h('span', { class: 'medal m' + p[0], text: p[0] }), avatar(p[1], 30),
        h('span', { class: 'pname', text: nm(p[1]) }), h('span', { class: 'plabel', text: p[2] })));
    });
    box.appendChild(ol);
    return box;
  }

  function renderSeeding(rows, seeds, done) {
    var grid = $('seedGrid');
    var sig = state.players.join('|');
    if (grid.getAttribute('data-sig') !== sig || grid.children.length !== 4) {
      grid.replaceChildren();
      grid.setAttribute('data-sig', sig);
      for (var k = 0; k < 4; k++) {
        (function (k) {
          var sel = h('select', { id: 'seed' + k, onchange: function (e) { changeSeed(k, Number(e.target.value)); } });
          state.players.forEach(function (n, i) { sel.appendChild(h('option', { value: String(i), text: n })); });
          grid.appendChild(h('div', { class: 'field' }, h('label', { for: 'seed' + k, text: 'Seed ' + (k + 1) }), sel));
        })(k);
      }
    }
    for (var s = 0; s < 4; s++) {
      var el = $('seed' + s);
      el.value = seeds[s] === null ? '' : String(seeds[s]);
      el.disabled = !done;
    }
    $('seedReset').disabled = !done || !validSeeds(state.seeds);
    $('seedNote').textContent = !done
      ? 'Available once all 28 league games are played.'
      : (validSeeds(state.seeds) ? 'Manual seeding is on.' : 'Seeds follow the league table.');
  }

  function changeSeed(k, v) {
    var rows = compute();
    var seeds = getSeeds(rows);
    var other = seeds.indexOf(v);
    if (other >= 0 && other !== k) { seeds[other] = seeds[k]; }
    seeds[k] = v;
    state.seeds = seeds;
    save();
    var cleared = commitSilent();
    toast('Seeding updated.' + (cleared ? ' Playoff results were cleared because the matchups changed.' : ''));
  }

  function renderPlayoffs(rows, seeds) {
    var done = leagueDone();
    var left = TOTAL - playedCount();
    var status = $('koStatus');
    status.className = 'status';
    if (state.ko.final) {
      status.classList.add('ok');
      status.textContent = 'Playoffs complete. ' + nm(state.ko.final.w) + ' is the champion.';
    } else if (!done) {
      status.textContent = left + ' league game' + (left === 1 ? '' : 's') + ' left. Playoff results open once the league is complete.' +
        (playedCount() > 0 ? ' The bracket below is provisional and follows the current table.' : '');
    } else if (topTies(rows) && !validSeeds(state.seeds)) {
      status.classList.add('warn');
      status.textContent = 'League complete, but some places in the top 5 are level on points, tiebreak and wins, so they were ordered alphabetically. Play a tiebreak if needed, then open "Adjust seeding".';
    } else {
      status.classList.add('ok');
      status.textContent = 'League complete. Mark the winner of each semi-final to fill the final.';
    }

    renderSeeding(rows, seeds, done);

    var ko = deriveKO(seeds);
    var b = $('bracket');
    b.replaceChildren(
      h('div', { class: 'bcol' },
        h('h3', { class: 'bcol-title', text: 'Semi-finals' }), matchCard(ko[0], done), matchCard(ko[1], done)),
      h('div', { class: 'bcol' },
        h('h3', { class: 'bcol-title', text: 'Final and third place' }), matchCard(ko[2], done), matchCard(ko[3], done)),
      h('div', { class: 'bcol' },
        h('h3', { class: 'bcol-title', text: 'Champion' }), championCard()));
  }

  /* ---------- Settings dialog ---------- */
  function openSettings() {
    var grid = $('settingsPlayers');
    grid.replaceChildren();
    state.players.forEach(function (n, i) {
      grid.appendChild(h('div', { class: 'field' },
        h('label', { for: 'pname' + i, text: 'Player ' + (i + 1) }),
        h('input', { type: 'text', id: 'pname' + i, value: n, maxlength: '24', autocomplete: 'off' })));
    });
    $('winPts').value = state.win;
    $('drawPts').value = state.draw;
    $('settingsError').textContent = '';
    $('settingsDialog').showModal();
  }

  function saveSettings(ev) {
    ev.preventDefault();
    $('settingsError').textContent = '';
    var names = [];
    for (var i = 0; i < N; i++) names.push($('pname' + i).value.trim().replace(/\s+/g, ' '));
    var win = parseFloat($('winPts').value), draw = parseFloat($('drawPts').value);
    var err = $('settingsError');
    if (names.some(function (n) { return !n; })) { err.textContent = 'Every player needs a name.'; return; }
    var lower = names.map(function (n) { return n.toLowerCase(); });
    if (lower.some(function (n, i) { return lower.indexOf(n) !== i; })) { err.textContent = 'Two players have the same name. Make each name different.'; return; }
    if (!(win > 0) || !(draw >= 0) || draw > win) { err.textContent = 'A win must be worth more than 0, and a draw cannot be worth more than a win.'; return; }
    state.players = names; state.win = win; state.draw = draw;
    save();
    $('settingsDialog').close();
    if (form.p1 !== null) $('matchText').value = nm(form.p1) + ' vs ' + nm(form.p2);
    commit('Players and scoring saved');
  }

  /* ---------- Toolbar actions ---------- */
  function exportCsv() {
    var rows = compute();
    var lines = [['Rank', 'Player', 'Played', 'Won', 'Drawn', 'Lost', 'Points', 'Tiebreak']];
    rows.forEach(function (r) {
      lines.push([r.rank, r.name, r.p, r.w, r.d, r.l, r.pts, Math.round(r.sb * 100) / 100]);
    });
    lines.push([]);
    lines.push(['Match', 'Round', 'Player 1', 'Player 2', 'Result']);
    matches.forEach(function (m) {
      var res = state.results[m.key];
      lines.push([m.no, m.round, nm(m.a), nm(m.b), res ? (res.w === 'd' ? 'Draw' : nm(res.w) + ' won') : 'Not played']);
    });
    var csv = lines.map(function (l) {
      return l.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: 'chess-tournament-standings.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Standings and fixtures downloaded');
  }

  function resetResults() {
    var n = playedCount() + Object.keys(state.ko).length;
    if (!n) { toast('There are no results to reset'); return; }
    if (!confirm('Delete all league and playoff results? Player names, photos and scoring stay. This cannot be undone.')) return;
    state.results = {}; state.ko = {}; state.seeds = null;
    form = { p1: null, p2: null, winner: null };
    $('matchText').value = '';
    save();
    commit('All results cleared');
  }

  /* ---------- Render ---------- */
  function renderAll() {
    var rows = compute();
    var seeds = getSeeds(rows);

    var cleared = syncKnockout(seeds);

    // Do not write anything to Firebase while applying
    // the initial/remote cloud state.
    if (cleared && !applyingCloudState) {
      save();
    }

    renderRoster();
    renderStandings(rows);
    renderBoard(rows);
    renderForm();
    renderFilters();
    renderFixtures();
    renderHistory();
    renderPlayoffs(rows, seeds);

    return cleared;
  }

  function commitSilent() { return renderAll(); }

  // save, re-render and show a message (adds a note if playoff results had to be cleared)
  function commit(msg) {
    save();
    var cleared = renderAll();
    toast(msg + (cleared ? ' Playoff results were cleared because the table changed.' : ''));
  }

  /* ---------- Wire up ---------- */
  $('matchText').addEventListener('input', onMatchText);
  $('matchText').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (!$('btnSave').disabled) saveResult(); }
  });
  $('matchSelect').addEventListener('change', onMatchSelect);
  $('btnSave').addEventListener('click', saveResult);
  $('filterPlayer').addEventListener('change', function (e) { view.player = e.target.value; renderFixtures(); });
  $('filterStatus').addEventListener('change', function (e) { view.status = e.target.value; renderFixtures(); });
  $('btnSettings').addEventListener('click', openSettings);
  $('settingsForm').addEventListener('submit', saveSettings);
  $('settingsCancel').addEventListener('click', function () { $('settingsDialog').close(); });
  $('btnExport').addEventListener('click', exportCsv);
  $('btnPrint').addEventListener('click', function () { window.print(); });
  $('btnReset').addEventListener('click', resetResults);
  $('seedReset').addEventListener('click', function () {
    state.seeds = null; save();
    var cleared = commitSilent();
    toast('Seeding follows the league table.' + (cleared ? ' Playoff results were cleared because the matchups changed.' : ''));
  });
  $('photoInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (file && photoTarget !== null) processPhoto(file, photoTarget);
  });

    // Render the locally stored state immediately.
  renderAll();

  // Then connect to Firebase and replace it with the shared
  // tournament state when the cloud document is received.
  startCloudSync();

})();