// ---- API 헬퍼 ----
const api = {
  async req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      showLogin();
      throw new Error("unauthorized");
    }
    if (!res.ok) throw new Error((await res.json()).error || "오류");
    return res.status === 204 ? null : res.json();
  },
  get: (u) => api.req("GET", u),
  post: (u, b) => api.req("POST", u, b),
  patch: (u, b) => api.req("PATCH", u, b),
  del: (u) => api.req("DELETE", u),
};

// ---- 상태 ----
const state = {
  notebooks: [],
  notes: [],
  currentNote: null,
  filter: { type: "all", notebookId: null, q: "" },
};

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const loginScreen = $("login-screen");
const appEl = $("app");

// ---- 인증 ----
async function checkAuth() {
  const status = await api.get("/api/auth/status");
  if (status.authenticated) {
    if (status.authEnabled) $("logout-btn").classList.remove("hidden");
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  appEl.classList.add("hidden");
  $("login-password").focus();
}

async function showApp() {
  loginScreen.classList.add("hidden");
  appEl.classList.remove("hidden");
  await loadNotebooks();
  await loadNotes();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("login-error");
  errEl.textContent = "";
  try {
    await api.post("/api/auth/login", { password: $("login-password").value });
    $("login-password").value = "";
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

$("logout-btn").addEventListener("click", async () => {
  await api.post("/api/auth/logout");
  location.reload();
});

// ---- 노트북 ----
async function loadNotebooks() {
  state.notebooks = await api.get("/api/notebooks");
  renderNotebooks();
  renderNotebookOptions();
}

function renderNotebooks() {
  const ul = $("notebook-list");
  ul.innerHTML = "";
  for (const nb of state.notebooks) {
    const li = document.createElement("li");
    li.dataset.id = nb.id;
    if (state.filter.notebookId === nb.id) li.classList.add("active");
    const name = document.createElement("span");
    name.textContent = "📓 " + nb.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = nb.note_count;
    li.append(name, count);
    li.addEventListener("click", () => selectNotebook(nb.id));
    li.addEventListener("dblclick", () => renameNotebook(nb));
    ul.appendChild(li);
  }
}

function renderNotebookOptions() {
  const sel = $("note-notebook");
  sel.innerHTML = "";
  for (const nb of state.notebooks) {
    const opt = document.createElement("option");
    opt.value = nb.id;
    opt.textContent = nb.name;
    sel.appendChild(opt);
  }
}

$("add-notebook").addEventListener("click", async () => {
  const name = prompt("새 노트북 이름:");
  if (name === null) return;
  await api.post("/api/notebooks", { name });
  await loadNotebooks();
});

async function renameNotebook(nb) {
  const name = prompt("노트북 이름 변경:", nb.name);
  if (!name) return;
  await api.patch(`/api/notebooks/${nb.id}`, { name });
  await loadNotebooks();
}

function selectNotebook(id) {
  state.filter = { type: "notebook", notebookId: id, q: "" };
  $("search").value = "";
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  loadNotebooks();
  loadNotes();
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    state.filter = { type: item.dataset.filter, notebookId: null, q: "" };
    $("search").value = "";
    renderNotebooks();
    loadNotes();
  });
});
document.querySelector('[data-filter="all"]').classList.add("active");

// ---- 노트 목록 ----
async function loadNotes() {
  const params = new URLSearchParams();
  if (state.filter.type === "notebook")
    params.set("notebook", state.filter.notebookId);
  if (state.filter.type === "favorite") params.set("favorite", "1");
  if (state.filter.q) params.set("q", state.filter.q);
  state.notes = await api.get("/api/notes?" + params.toString());
  renderNotes();
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent || "";
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renderNotes() {
  const list = $("notes-list");
  list.innerHTML = "";
  if (!state.notes.length) {
    list.innerHTML = '<div class="empty-list">노트가 없습니다.</div>';
    return;
  }
  for (const note of state.notes) {
    const card = document.createElement("div");
    card.className = "note-card";
    if (state.currentNote?.id === note.id) card.classList.add("active");
    const star = note.is_favorite ? '<span class="star">★</span> ' : "";
    card.innerHTML = `
      <h3>${star}${escapeHtml(note.title) || "제목 없음"}</h3>
      <p class="snippet">${escapeHtml(stripHtml(note.preview)) || "내용 없음"}</p>
      <span class="date">${fmtDate(note.updated_at)}</span>`;
    card.addEventListener("click", () => openNote(note.id));
    list.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// ---- 노트 열기/편집 ----
async function openNote(id) {
  const note = await api.get(`/api/notes/${id}`);
  state.currentNote = note;
  $("editor-empty").classList.add("hidden");
  $("editor").classList.remove("hidden");
  $("note-title").value = note.title;
  $("note-content").innerHTML = note.content;
  $("note-notebook").value = note.notebook_id ?? "";
  $("fav-btn").textContent = note.is_favorite ? "★" : "☆";
  $("note-time").textContent = "수정: " + fmtDate(note.updated_at);
  $("save-status").textContent = "";
  renderNotes();
}

$("new-note").addEventListener("click", async () => {
  const notebookId =
    state.filter.type === "notebook"
      ? state.filter.notebookId
      : state.notebooks[0]?.id ?? null;
  const note = await api.post("/api/notes", {
    notebook_id: notebookId,
    title: "",
    content: "",
  });
  await loadNotebooks();
  await loadNotes();
  await openNote(note.id);
  $("note-title").focus();
});

$("delete-note").addEventListener("click", async () => {
  if (!state.currentNote) return;
  if (!confirm("이 노트를 삭제할까요?")) return;
  await api.del(`/api/notes/${state.currentNote.id}`);
  state.currentNote = null;
  $("editor").classList.add("hidden");
  $("editor-empty").classList.remove("hidden");
  await loadNotebooks();
  await loadNotes();
});

$("fav-btn").addEventListener("click", async () => {
  if (!state.currentNote) return;
  const val = state.currentNote.is_favorite ? 0 : 1;
  state.currentNote.is_favorite = val;
  $("fav-btn").textContent = val ? "★" : "☆";
  await api.patch(`/api/notes/${state.currentNote.id}`, { is_favorite: val });
  loadNotes();
});

$("note-notebook").addEventListener("change", async (e) => {
  if (!state.currentNote) return;
  await api.patch(`/api/notes/${state.currentNote.id}`, {
    notebook_id: Number(e.target.value),
  });
  state.currentNote.notebook_id = Number(e.target.value);
  await loadNotebooks();
  loadNotes();
});

// ---- 자동 저장 (디바운스) ----
let saveTimer = null;
function scheduleSave() {
  if (!state.currentNote) return;
  $("save-status").textContent = "저장 중…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 700);
}

async function saveNote() {
  if (!state.currentNote) return;
  const title = $("note-title").value;
  const content = $("note-content").innerHTML;
  await api.patch(`/api/notes/${state.currentNote.id}`, { title, content });
  state.currentNote.title = title;
  state.currentNote.content = content;
  $("save-status").textContent = "저장됨 ✓";
  // 목록의 제목/미리보기 갱신
  const card = state.notes.find((n) => n.id === state.currentNote.id);
  if (card) {
    card.title = title;
    card.preview = content.slice(0, 300);
    card.updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  renderNotes();
}

$("note-title").addEventListener("input", scheduleSave);
$("note-content").addEventListener("input", scheduleSave);

// ---- 검색 ----
let searchTimer = null;
$("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.filter.q = e.target.value.trim();
    loadNotes();
  }, 300);
});

// ---- 툴바 (리치 텍스트) ----
document.querySelectorAll(".toolbar [data-cmd]").forEach((btn) => {
  btn.addEventListener("mousedown", (e) => e.preventDefault()); // 포커스 유지
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    if (cmd === "createLink") {
      const url = prompt("링크 URL:");
      if (url) document.execCommand(cmd, false, url);
    } else if (cmd === "formatBlock") {
      document.execCommand(cmd, false, btn.dataset.value);
    } else {
      document.execCommand(cmd, false, null);
    }
    $("note-content").focus();
    scheduleSave();
  });
});

// ---- 시작 ----
checkAuth();
