// poll.js

const CACHE_VERSION = 'v2';  // incrémentez à chaque modif
const API_BASE = "https://hx9jzqon0l.execute-api.us-east-1.amazonaws.com/prod";
const FETCH_OPTS = { headers: { 'Content-Type': 'application/json' } };
const fusion = window.Fusion || {};
const CURRENT_SITE = (fusion.arcSite || 'lesoleil').replace(/-/g, '');
const localDate = new Date()
  .toLocaleString('sv-SE', { timeZone: 'America/Toronto' })
  .split(' ')[0];
const pollId = `${CURRENT_SITE}_${localDate}`;

function getArcIdUUID() {
  try {
    return JSON.parse(localStorage.getItem('ArcId.USER_INFO'))?.uuid || null;
  } catch {
    return null;
  }
}

async function fetchPoll(id) {
  const res = await fetch(`${API_BASE}/poll/${id}`, { method: 'GET', ...FETCH_OPTS });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function hasVoted(voteKey) {
  const res = await fetch(`${API_BASE}/vote/${voteKey}`, { method: 'GET', ...FETCH_OPTS });
  return res.ok;
}

async function sendVote(pollId, arcId, option) {
  const payload = { pollId, userId: arcId, arcId, option };
  const res = await fetch(`${API_BASE}/vote`, {
    method: 'POST',
    ...FETCH_OPTS,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${res.status} — ${msg}`);
  }
  return res.json();
}

async function getCachedPollData(id) {
  const key = `pollData_${CACHE_VERSION}_${id}`;
  const raw = sessionStorage.getItem(key);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(key);
    }
  }
  const data = await fetchPoll(id);
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {}
  return data;
}

function showResults(data) {
  const rEl = document.getElementById('poll-results');
  const total = data.votes.reduce((a, b) => a + b, 0);
  const html = data.options
    .map((opt, i) => {
      const pct = total ? Math.round((data.votes[i] / total) * 100) : 0;
      return `
        <div>
          <div style="display:flex;justify-content:space-between;">
            <span><b>${opt}</b></span><span>${pct}%</span>
          </div>
          <div class="poll-result-bar">
            <div class="poll-result-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
    .join('') +
    `<div class="poll-result-total">${total} répondant${total > 1 ? 's' : ''}</div>`;

  rEl.innerHTML = html;
  rEl.classList.remove('hidden');
  rEl.classList.add('visible');
}

async function renderPoll() {
  const container = document.querySelector('.poll-container');
  const qEl = document.getElementById('poll-question');
  const oEl = document.getElementById('poll-options');
  const bEl = document.getElementById('submit-poll');
  const aEl = document.getElementById('poll-alert');
  const rEl = document.getElementById('poll-results');

  // Reset state
  [ qEl, oEl, rEl, aEl ].forEach(el => {
    el.textContent = '';
    el.innerHTML = '';
    el.classList.add('hidden');
    el.classList.remove('visible');
  });

  // Parallel fetch: poll data & vote status
  const arcId = getArcIdUUID();
  const voteKey = arcId ? `${arcId}_${pollId}` : null;

  let data, alreadyVoted;
  try {
    [ data, alreadyVoted ] = await Promise.all([
      getCachedPollData(pollId),
      voteKey ? hasVoted(voteKey) : Promise.resolve(false)
    ]);
  } catch {
    container.classList.add('hidden');
    return;
  }

  const now = new Date();
  const start = new Date(data.startDateTime);
  const end = new Date(data.endDateTime);

  // Site/date logic
  if (data.site !== CURRENT_SITE) {
    qEl.textContent = 'Aucune question pour ce site.';
    qEl.classList.remove('hidden');
  } else if (now < start) {
    qEl.textContent = 'Trop tôt. Débute à : ' + start.toLocaleString('fr-FR');
    qEl.classList.remove('hidden');
  } else if (now >= end) {
    qEl.textContent = 'Trop tard. Fin à : ' + end.toLocaleString('fr-FR');
    qEl.classList.remove('hidden');
  } else {
    qEl.textContent = data.question;
    qEl.classList.remove('hidden');

    // If already voted, force a fresh fetch of results
    if (arcId && alreadyVoted) {
      try {
        const fresh = await fetchPoll(pollId);
        sessionStorage.setItem(`pollData_${pollId}`, JSON.stringify(fresh));
        showResults(fresh);
      } catch (e) {
        showResults(data);
      }
      return;
    }

    // Not yet voted: show options + submit button
    oEl.innerHTML = data.options
      .map((opt, i) => `
        <label style="display:block;margin-bottom:8px;">
          <input type="radio" name="poll-choice" value="${i}" style="margin-right:8px;">
          ${opt}
        </label>`)
      .join('');
    oEl.classList.remove('hidden');
    bEl.classList.remove('hidden');

    bEl.addEventListener('click', async () => {
      const userArc = getArcIdUUID();
      if (!userArc) {
        oEl.classList.add('hidden');
        bEl.classList.add('hidden');
        aEl.innerHTML = `
          <div>Vous devez être connecté pour répondre.</div>
          <button onclick="location.href='/connexion'">Me connecter</button>`;
        aEl.classList.remove('hidden');
        aEl.classList.add('visible');
        return;
      }

      if (await hasVoted(`${userArc}_${pollId}`)) {
        // another safety check → fresh results
        try {
          const fresh2 = await fetchPoll(pollId);
          sessionStorage.setItem(`pollData_${pollId}`, JSON.stringify(fresh2));
          showResults(fresh2);
        } catch {
          showResults(data);
        }
        return;
      }

      const sel = document.querySelector('input[name="poll-choice"]:checked');
      if (!sel) {
        aEl.textContent = 'Veuillez choisir une option.';
        aEl.classList.remove('hidden');
        aEl.classList.add('visible');
        return;
      }

      const optIndex = parseInt(sel.value, 10);
      try {
        await sendVote(pollId, userArc, optIndex);
        // update local cache
        data.votes[optIndex] = (data.votes[optIndex] || 0) + 1;
        // thank-you message
        aEl.textContent = 'Merci pour votre vote !';
        aEl.classList.remove('hidden');
        aEl.classList.add('visible');
        // after a brief pause, show results
        setTimeout(() => {
          aEl.classList.remove('visible');
          aEl.classList.add('hidden');
          oEl.classList.add('hidden');
          bEl.classList.add('hidden');
          showResults(data);
        }, 1000);
      } catch (e) {
        aEl.textContent = `Erreur lors de l'envoi (${e.message})`;
        aEl.classList.remove('hidden');
        aEl.classList.add('visible');
      }
    }, { once: true });
  }
}

// Initial render + fix container height + fade in
renderPoll().then(() => {
  const container = document.querySelector('.poll-container');
  container.style.minHeight = container.offsetHeight + 'px';
  container.style.opacity = '1';
});
