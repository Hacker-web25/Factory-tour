/**
 * A pretend language Worker on a local port: the REAL Worker file running against
 * a real SQLite database, so the backup script can be rehearsed over real HTTP.
 * Used only by tests/backup/rehearsal.sh.
 */
import http from "node:http";
import { newLanguageDb } from "../helpers/d1Shim";
// @ts-expect-error plain JavaScript Worker, not type-checked
import worker from "../../cloudflare/language-worker.js";

const port = Number(process.env.PORT || 8799);
const db = newLanguageDb();
db.raw.prepare("INSERT INTO tour_language (tour_id, default_language, available_languages, updated_at) VALUES (?,?,?,?)").run("tour-aaaa-0001", "en", '["fr","de"]', Date.now());
for (let i = 0; i < 40; i++) {
  db.raw
    .prepare("INSERT INTO translations (tour_id, lang, src_hash, source_text, translated_text, engine, reviewed, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("tour-aaaa-0001", i % 2 ? "fr" : "de", String(i).padStart(40, "0"), `It's source ${i}`, `Texte ${i} — « guillemets » 😀`, "test", 0, Date.now());
}
db.raw
  .prepare("INSERT INTO transcripts (tour_id, audio_key, segments, updated_at) VALUES (?,?,?,?)")
  .run("tour-aaaa-0001", "a".repeat(40), JSON.stringify([{ start: 0, end: 1, text: "hello" }]), Date.now());

const env = { DB: db, LANG_API_SECRET: "x".repeat(32), BACKUP_SECRET: process.env.BACKUP_SECRET, AI: {} };
http
  .createServer(async (req, res) => {
    const r: Response = await worker.fetch(new Request(`http://local${req.url}`, { method: req.method, headers: { authorization: String(req.headers.authorization || "") } }), env);
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(await r.text());
  })
  .listen(port, "127.0.0.1", () => console.log("ready"));
