import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_NAME = "notepad_session";
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30일

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// ---- 인증 ----
function makeToken() {
  const payload = `${Date.now() + SESSION_MAX_AGE}`;
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

function isValidToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return false;
  }
  return Number(payload) > Date.now();
}

// 비밀번호가 설정되지 않았으면 인증을 생략(로컬 개발 편의)
const authEnabled = APP_PASSWORD.length > 0;

function requireAuth(req, res, next) {
  if (!authEnabled) return next();
  if (isValidToken(req.cookies[COOKIE_NAME])) return next();
  res.status(401).json({ error: "unauthorized" });
}

app.get("/api/auth/status", (req, res) => {
  res.json({
    authEnabled,
    authenticated: !authEnabled || isValidToken(req.cookies[COOKIE_NAME]),
  });
});

app.post("/api/auth/login", (req, res) => {
  if (!authEnabled) return res.json({ ok: true });
  const { password } = req.body || {};
  const a = Buffer.from(String(password || ""));
  const b = Buffer.from(APP_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  res.cookie(COOKIE_NAME, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  });
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// ---- 노트북 API ----
app.get("/api/notebooks", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.execute(`
      SELECT nb.id, nb.name, nb.created_at,
             (SELECT COUNT(*) FROM notes n WHERE n.notebook_id = nb.id) AS note_count
      FROM notebooks nb
      ORDER BY nb.created_at ASC
    `);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.post("/api/notebooks", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim() || "새 노트북";
    const r = await db.execute({
      sql: "INSERT INTO notebooks (name) VALUES (?)",
      args: [name],
    });
    res.json({ id: Number(r.lastInsertRowid), name });
  } catch (e) {
    next(e);
  }
});

app.patch("/api/notebooks/:id", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "이름이 비어 있습니다." });
    await db.execute({
      sql: "UPDATE notebooks SET name = ? WHERE id = ?",
      args: [name, req.params.id],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete("/api/notebooks/:id", requireAuth, async (req, res, next) => {
  try {
    await db.execute({
      sql: "DELETE FROM notebooks WHERE id = ?",
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- 노트 API ----
app.get("/api/notes", requireAuth, async (req, res, next) => {
  try {
    const { notebook, q, favorite } = req.query;
    const where = [];
    const args = [];
    if (notebook) {
      where.push("notebook_id = ?");
      args.push(notebook);
    }
    if (favorite === "1") where.push("is_favorite = 1");
    if (q) {
      where.push("(title LIKE ? OR content LIKE ?)");
      args.push(`%${q}%`, `%${q}%`);
    }
    const sql = `
      SELECT id, notebook_id, title, is_favorite, created_at, updated_at,
             substr(content, 1, 300) AS preview
      FROM notes
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY updated_at DESC
    `;
    const { rows } = await db.execute({ sql, args });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.get("/api/notes/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.execute({
      sql: "SELECT * FROM notes WHERE id = ?",
      args: [req.params.id],
    });
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

app.post("/api/notes", requireAuth, async (req, res, next) => {
  try {
    const notebookId = req.body?.notebook_id ?? null;
    const title = String(req.body?.title ?? "");
    const content = String(req.body?.content ?? "");
    const r = await db.execute({
      sql: "INSERT INTO notes (notebook_id, title, content) VALUES (?, ?, ?)",
      args: [notebookId, title, content],
    });
    const { rows } = await db.execute({
      sql: "SELECT * FROM notes WHERE id = ?",
      args: [Number(r.lastInsertRowid)],
    });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

app.patch("/api/notes/:id", requireAuth, async (req, res, next) => {
  try {
    const fields = [];
    const args = [];
    for (const key of ["title", "content", "notebook_id", "is_favorite"]) {
      if (req.body?.[key] !== undefined) {
        fields.push(`${key} = ?`);
        args.push(req.body[key]);
      }
    }
    if (!fields.length) return res.json({ ok: true });
    fields.push("updated_at = datetime('now')");
    args.push(req.params.id);
    await db.execute({
      sql: `UPDATE notes SET ${fields.join(", ")} WHERE id = ?`,
      args,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete("/api/notes/:id", requireAuth, async (req, res, next) => {
  try {
    await db.execute({
      sql: "DELETE FROM notes WHERE id = ?",
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---- 정적 파일 ----
app.use(express.static(path.join(__dirname, "public")));

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류", detail: String(err.message || err) });
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`메모장 서버 실행 중: http://localhost:${PORT}`);
      if (!authEnabled) {
        console.warn("⚠️  APP_PASSWORD 미설정 — 인증 없이 동작합니다.");
      }
    });
  })
  .catch((e) => {
    console.error("DB 초기화 실패:", e);
    process.exit(1);
  });
