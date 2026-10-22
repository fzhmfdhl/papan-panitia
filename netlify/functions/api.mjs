import { getStore } from "@netlify/blobs";

const USERS = [
  { name: "Jers", role: "Koordinator Steering", boss: true },
  { name: "Andra", role: "Ketua Panitia" },
  { name: "Tika", role: "Sekretaris Panitia" },
  { name: "Sarah", role: "Bendahara Panitia" },
  { name: "Batara", role: "Koord. Acara" },
  { name: "Vany", role: "Koord. Humas" },
  { name: "Desya", role: "Koord. Sponsor" },
  { name: "Rena", role: "Koord. Creative" },
  { name: "Fitrah", role: "Koord. Perlengkapan" },
  { name: "Aidil", role: "Koord. Konsumsi" },
];
// Siapa yang boleh membuka menu (ubah di sini bila perlu)
const ACCESS = { fin: ["Sarah", "Jers"], sponsors: ["Desya", "Jers"], bazaar: ["Desya", "Jers"] };
const FIN_TARGET = 300000000;
const BZ = { b1: { name: "Bazar pertama", target: 10000000 }, b2: { name: "Bazar kedua", target: 20000000 } };
// Kata sandi awal: nama huruf kecil + 123. Ubah lewat env var PW_JERS, PW_ANDRA, dst.
const pwOf = (n, env) => (env && env["PW_" + n.toUpperCase()]) || n.toLowerCase() + "123";
const num = (v, max = 1e12) => { v = Number(v); return Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null; };

async function handle({ method: m, path, body, token, env, anyPw }, s) {
  const R = (data, status = 200) => ({ status, data });
  const err = (e, st = 400) => R({ error: e }, st);
  try {
    if (path[0] === "login" && m === "POST") {
      const u = USERS.find((x) => x.name === body.name);
      if (!u || (!anyPw && String(body.password || "").trim() !== pwOf(u.name, env))) return err("Nama atau kata sandi salah", 401);
      const t = crypto.randomUUID() + crypto.randomUUID();
      await s.set("sess/" + t, u.name);
      return R({ token: t, user: u });
    }
    const meName = token ? await s.get("sess/" + token) : null;
    const me = USERS.find((x) => x.name === meName);
    if (!me) return err("Sesi habis, silakan masuk lagi", 401);

    const db = (await s.get("db", { type: "json" })) || {};
    db.tasks ||= []; db.meetings ||= []; db.fin ||= []; db.sponsors ||= []; db.bazaar ||= {};
    const save = () => s.setJSON("db", db);
    const can = (k) => ACCESS[k].includes(me.name);
    const img = (v) => typeof v === "string" && v.startsWith("data:image/") && v.length <= 4e6;
    const uid = () => crypto.randomUUID();
    const isCoord = /^Koord\./.test(me.role);
    const ketua = USERS.find((u) => u.role === "Ketua Panitia").name;

    if (path[0] === "state" && m === "GET") {
      const tasks = (me.boss ? db.tasks : db.tasks.filter((t) => t.assignee === me.name)).sort((a, b) => b.createdAt - a.createdAt);
      const mods = {};
      if (can("fin")) mods.fin = { target: FIN_TARGET, entries: [...db.fin].sort((a, b) => b.createdAt - a.createdAt) };
      if (can("sponsors")) mods.sponsors = [...db.sponsors].sort((a, b) => b.createdAt - a.createdAt);
      if (can("bazaar")) mods.bazaar = Object.fromEntries(Object.entries(BZ).map(([k, v]) => [k, { ...v, tickets: [], extra: 0, extraNote: "", ...(db.bazaar[k] || {}) }]));
      if (isCoord || me.boss) mods.meetings = db.meetings.filter((x) => me.boss || x.by === me.name)
        .map((x) => ({ ...x, attend: (db.tasks.find((t) => t.id === x.taskId) || {}).status || "todo" }))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return R({ users: USERS, tasks, mods });
    }

    // ---- Task ----
    if (path[0] === "tasks" && !path[1] && m === "POST") {
      if (!me.boss) return err("Hanya Jers yang bisa memberi task", 403);
      const title = String(body.title || "").trim().slice(0, 120);
      const names = (body.assignees || []).filter((n) => USERS.some((u) => u.name === n && !u.boss));
      if (!title) return err("Judul task wajib diisi");
      if (!names.length) return err("Pilih minimal satu panitia");
      const now = Date.now();
      names.forEach((n, i) => db.tasks.push({
        id: uid(), title, desc: String(body.desc || "").slice(0, 1000), assignee: n, deadline: body.deadline || "",
        priority: ["Biasa", "Penting", "Mendesak"].includes(body.priority) ? body.priority : "Biasa",
        status: "todo", seen: false, pic: "", createdAt: now + i,
      }));
      await save();
      return R({ ok: true, count: names.length });
    }
    if (path[0] === "tasks" && path[1]) {
      const t = db.tasks.find((x) => x.id === path[1]);
      if (!t) return err("Task tidak ditemukan", 404);
      const mine = t.assignee === me.name;
      if (path[2] === "seen" && m === "POST" && mine) { t.seen = true; await save(); return R({ ok: true }); }
      if (path[2] === "pic" && m === "POST") {
        if (!mine) return err("Ini bukan task kamu", 403);
        if (t.status === "done") return err("Task sudah selesai");
        const pic = String(body.pic || "").trim().slice(0, 60);
        if (!pic) return err("Isi nama penanggung jawab");
        Object.assign(t, { pic, seen: true });
        await save();
        return R({ ok: true });
      }
      if (path[2] === "complete" && m === "POST") {
        if (!mine) return err("Ini bukan task kamu", 403);
        if (t.status === "done") return err("Task sudah selesai");
        if (!t.pic) return err("Isi penanggung jawab dulu");
        if (!img(body.proof)) return err("Upload bukti berupa gambar (maks. sekitar 3 MB)");
        await s.set("proof/" + t.id, body.proof);
        Object.assign(t, { status: "done", seen: true, doneAt: Date.now(), note: String(body.note || "").slice(0, 500) });
        await save();
        return R({ ok: true });
      }
      if (path[2] === "proof" && m === "GET") {
        if (!mine && !me.boss) return err("Tidak diizinkan", 403);
        return R({ proof: (await s.get("proof/" + t.id)) || null });
      }
      if (!path[2] && m === "DELETE") {
        if (!me.boss) return err("Hanya Jers yang bisa menghapus task", 403);
        db.tasks = db.tasks.filter((x) => x.id !== t.id);
        await s.delete("proof/" + t.id);
        await save();
        return R({ ok: true });
      }
    }

    // ---- Meeting (otomatis membuat task hadir untuk Ketua Panitia) ----
    if (path[0] === "meetings") {
      if (!path[1] && m === "POST") {
        if (!isCoord) return err("Hanya koordinator yang bisa set up meeting", 403);
        const title = String(body.title || "").trim().slice(0, 100), place = String(body.place || "").trim().slice(0, 120);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : "";
        const time = /^\d{2}:\d{2}$/.test(body.time || "") ? body.time : "";
        if (!title) return err("Isi agenda meeting");
        if (!date) return err("Pilih tanggal meeting");
        if (!time) return err("Isi jam meeting");
        if (!place) return err("Isi tempat atau link meeting");
        const note = String(body.note || "").slice(0, 300), mid = uid(), tid = uid();
        db.meetings.push({ id: mid, title, date, time, place, note, by: me.name, createdAt: Date.now(), taskId: tid });
        db.tasks.push({
          id: tid, title: "Hadiri meeting: " + title,
          desc: `Meeting ${me.role} (${me.name})\nTanggal: ${date}, pukul ${time}\nTempat: ${place}` + (note ? "\nCatatan: " + note : ""),
          assignee: ketua, deadline: date, priority: "Penting", status: "todo", seen: false, pic: "", meetingId: mid, createdAt: Date.now(),
        });
        await save();
        return R({ ok: true });
      }
      const mt = db.meetings.find((x) => x.id === path[1]);
      if (!mt) return err("Meeting tidak ditemukan", 404);
      if (m === "DELETE") {
        if (!me.boss && mt.by !== me.name) return err("Tidak diizinkan", 403);
        const t = db.tasks.find((x) => x.id === mt.taskId);
        if (t && t.status !== "done") db.tasks = db.tasks.filter((x) => x.id !== t.id);
        db.meetings = db.meetings.filter((x) => x.id !== mt.id);
        await save();
        return R({ ok: true });
      }
    }

    // ---- Keuangan ----
    if (path[0] === "fin") {
      if (!can("fin")) return err("Tidak diizinkan", 403);
      if (!path[1] && m === "POST") {
        const type = body.type === "out" ? "out" : "in";
        const amount = num(body.amount), purpose = String(body.purpose || "").trim().slice(0, 120);
        if (!amount) return err("Isi jumlah uang dengan angka");
        if (!purpose) return err("Isi keperluannya");
        if (type === "out" && !img(body.nota)) return err("Pengeluaran wajib upload nota");
        const e = { id: uid(), type, amount, purpose, by: me.name, createdAt: Date.now(), hasNota: false };
        if (img(body.nota)) { await s.set("nota/" + e.id, body.nota); e.hasNota = true; }
        db.fin.push(e);
        await save();
        return R({ ok: true });
      }
      if (path[1] && m === "DELETE") {
        db.fin = db.fin.filter((x) => x.id !== path[1]);
        await s.delete("nota/" + path[1]);
        await save();
        return R({ ok: true });
      }
    }

    // ---- Sponsor ----
    if (path[0] === "sponsors") {
      if (!can("sponsors")) return err("Tidak diizinkan", 403);
      if (!path[1] && m === "POST") {
        const name = String(body.name || "").trim().slice(0, 80);
        if (!name) return err("Isi nama sponsor");
        db.sponsors.push({ id: uid(), name, note: String(body.note || "").slice(0, 200), status: "belum", by: me.name, createdAt: Date.now() });
        await save();
        return R({ ok: true });
      }
      const sp = db.sponsors.find((x) => x.id === path[1]);
      if (!sp) return err("Sponsor tidak ditemukan", 404);
      if (path[2] === "send" && m === "POST") {
        if (!img(body.proof)) return err("Upload bukti pengiriman berupa gambar");
        await s.set("sp/" + sp.id, body.proof);
        Object.assign(sp, { status: "terkirim", hasProof: true, sentAt: Date.now(), sentBy: me.name });
        await save();
        return R({ ok: true });
      }
      if (path[2] === "reset" && m === "POST") {
        Object.assign(sp, { status: "belum", hasProof: false });
        await s.delete("sp/" + sp.id);
        await save();
        return R({ ok: true });
      }
      if (!path[2] && m === "DELETE") {
        db.sponsors = db.sponsors.filter((x) => x.id !== sp.id);
        await s.delete("sp/" + sp.id);
        await save();
        return R({ ok: true });
      }
    }

    // ---- Bazar ----
    if (path[0] === "bazaar" && BZ[path[1]] && m === "POST") {
      if (!can("bazaar")) return err("Tidak diizinkan", 403);
      const tickets = (Array.isArray(body.tickets) ? body.tickets : []).slice(0, 10).map((t) => ({
        name: String(t.name || "Tiket").slice(0, 40), price: num(t.price, 1e9) || 0, sold: num(t.sold, 1e7) || 0,
      }));
      db.bazaar[path[1]] = { tickets, extra: num(body.extra) || 0, extraNote: String(body.extraNote || "").slice(0, 200) };
      await save();
      return R({ ok: true });
    }

    // ---- File (nota & bukti sponsor) ----
    if (path[0] === "file" && m === "GET") {
      const need = { nota: "fin", sp: "sponsors" }[path[1]];
      if (!need || !can(need)) return err("Tidak diizinkan", 403);
      return R({ file: (await s.get(path[1] + "/" + path[2])) || null });
    }
    return err("Endpoint tidak ditemukan", 404);
  } catch (e) {
    return err("Server error: " + e.message, 500);
  }
}

export default async (req) => {
  const s = getStore({ name: "papan-panitia", consistency: "strong" });
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const r = await handle({ method: req.method, path, body, token, env: process.env }, s);
  return new Response(JSON.stringify(r.data), { status: r.status, headers: { "content-type": "application/json" } });
};

export const config = { path: "/api/*" };
