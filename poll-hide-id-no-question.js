// poll.js (mise à jour : masquer complètement le bloc uniquement si aucune question (404) disponible)

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
  if (!res.ok) throw new Error(res.status.toString());
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

function showResults(data) {
  const rEl = document.getElementById('poll-results');
  const total = data.votes.reduce((a, b) => a + b, 0);
  const html = data.options.map((opt, i) => {
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
  }).join('') + `<div class="poll-result-total">
    ${total} répondant${total > 1 ? 's' : ''}
  </div>`;

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

  // reset des éléments
  [qEl, oEl, aEl, document.getElementById('poll-results')].forEach(el => {
    el.textContent = '';
    el.innerHTML = '';
    el.classList.add('hidden');
    el.classList.remove('visible');
  });

  const arcId = getArcIdUUID();
  const voteKey = arcId ? `${arcId}_${pollId}` : null;

  let data, alreadyVoted;
  try {
    [ data, alreadyVoted ] = await Promise.all([
      fetchPoll(pollId),
      voteKey ? hasVoted(voteKey) : Promise.resolve(false)
    ]);
  } catch (err) {
    // masquer seulement si code 404 (aucune question)
    if (err.message === '404') {
      container.classList.add('hidden');
      return;
    }
    console.error('Erreur inattendue :', err);
    // afficher un message générique
    qEl.textContent = 'Une erreur est survenue.';
    qEl.classList.remove('hidden');
    return;
  }

  const now = new Date();
  const start = new Date(data.startDateTime);
  const end   = new Date(data.endDateTime);

  if (data.site !== CURRENT_SITE || now < start || now >= end) {
    container.classList.add('hidden');
    return;
  }

  // afficher question
  qEl.textContent = data.question;
  qEl.classList.remove('hidden');

  if (arcId && alreadyVoted) {
    const fresh = await fetchPoll(pollId).catch(() => data);
    showResults(fresh);
    return;
  }

  // formulaire de vote
  oEl.innerHTML = data.options.map((opt, i) => `
    <label style="display:block;margin-bottom:8px;">
      <input type="radio" name="poll-choice" value="${i}" style="margin-right:8px;">
      ${opt}
    </label>`).join('');
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
      const fresh2 = await fetchPoll(pollId).catch(() => data);
      showResults(fresh2);
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
      aEl.textContent = 'Merci pour votre vote !';
      aEl.classList.remove('hidden');
      aEl.classList.add('visible');
      oEl.classList.add('hidden');
      bEl.classList.add('hidden');
      const fresh = await fetchPoll(pollId).catch(() => data);
      setTimeout(() => {
        aEl.classList.remove('visible');
        aEl.classList.add('hidden');
        showResults(fresh);
      }, 1000);
    } catch (e) {
      aEl.textContent = `Erreur lors de l'envoi (${e.message})`;
      aEl.classList.remove('hidden');
      aEl.classList.add('visible');
    }
  }, { once: true });
}

// initialisation + verrouiller la hauteur + fade-in
renderPoll().then(() => {
  const container = document.querySelector('.poll-container');
  container.style.minHeight = container.offsetHeight + 'px';
  container.style.opacity = '1';
});
