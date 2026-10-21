import { useEffect, useMemo, useState } from "react";

/* ===================== TIPE ===================== */
type FileKey = "foto" | "akte" | "skhu" | "ijazah" | "bukti";
type Student = {
  id: string;
  nisn: string;
  nama: string;
  kelas: string;
  tahun: string;
} & Record<FileKey, string> &
  Record<`${FileKey}Id`, string>;
type Cfg = { url: string; token: string };

const LABEL: Record<FileKey, string> = {
  foto: "Foto Siswa",
  akte: "Akte & KK",
  skhu: "SKHU",
  ijazah: "Ijazah (PDF)",
  bukti: "Bukti Terima Ijazah",
};
const ACCEPT: Record<FileKey, string> = {
  foto: "image/*",
  akte: "image/*,application/pdf",
  skhu: "image/*,application/pdf",
  ijazah: "application/pdf",
  bukti: "image/*",
};
const KEYS = Object.keys(LABEL) as FileKey[];
const PAGE = 24;

/* ===== PENGATURAN API: ISI DI SINI ===== */
const API_URL =
  "https://script.google.com/macros/s/AKfycbx6QiJiRam4_lDn6fp2JNQ9Ic7waS8nSk3WLYVcRuBU_ILqblb74rA_j1Nw2MQGsDXJ/exec"; // URL Web App Apps Script, contoh: https://script.google.com/macros/s/XXXX/exec
const API_TOKEN = "123"; // harus sama persis dengan CONFIG.TOKEN di Code.gs
const CFG: Cfg = { url: API_URL, token: API_TOKEN };
const fid = (s: Student, k: FileKey) => s[`${k}Id` as `${FileKey}Id`];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/* ===================== API APPS SCRIPT ===================== */
async function call(
  cfg: Cfg,
  action: string,
  params: Record<string, string> = {}
) {
  const res = await fetch(
    `${cfg.url}?${new URLSearchParams({ action, token: cfg.token, ...params })}`
  );
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "Permintaan gagal");
  return j;
}
async function post(cfg: Cfg, body: object) {
  // tanpa header khusus agar tidak memicu preflight CORS
  const res = await fetch(cfg.url, {
    method: "POST",
    body: JSON.stringify({ ...body, token: cfg.token }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "Permintaan gagal");
  return j;
}
const toBase64 = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("Gagal membaca file"));
    r.readAsDataURL(f);
  });

// Antrean unduh berkas (maks 4 sekaligus) + cache blob agar tidak diunduh ulang
const blobs = new Map<string, Promise<string>>();
let active = 0;
const waiting: (() => void)[] = [];
function queued<T>(fn: () => Promise<T>) {
  return new Promise<T>((res, rej) => {
    const run = () => {
      active++;
      const done = () => {
        active--;
        waiting.shift()?.();
      };
      fn().then(res, rej).then(done, done);
    };
    active < 4 ? run() : waiting.push(run);
  });
}
function blobUrl(cfg: Cfg, id: string, thumb: boolean) {
  const key = id + (thumb ? "t" : "");
  let p = blobs.get(key);
  if (!p) {
    p = queued(async () => {
      const parts: BlobPart[] = [];
      let off = 0,
        total = 0,
        mime = "";
      do {
        const j = await call(cfg, "file", {
          id,
          thumb: thumb ? "1" : "0",
          off: String(off),
        });
        const arr = Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0));
        if (!arr.length) break;
        parts.push(arr);
        off += arr.length;
        total = j.total;
        mime = j.mime;
      } while (off < total);
      return URL.createObjectURL(new Blob(parts, { type: mime }));
    });
    p.catch(() => blobs.delete(key));
    blobs.set(key, p);
  }
  return p;
}

function Media({
  cfg,
  id,
  thumb,
  pdf,
  name,
  cls,
}: {
  cfg: Cfg;
  id: string;
  thumb: boolean;
  pdf: boolean;
  name: string;
  cls: string;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    setUrl("");
    setErr("");
    if (!id) return;
    let on = true;
    blobUrl(cfg, id, thumb)
      .then((u) => on && setUrl(u))
      .catch((e) => on && setErr(String(e?.message || e)));
    return () => {
      on = false;
    };
    // eslint-disable-next-line
  }, [id, thumb, cfg.url]);
  if (!id) return <div className={`${cls} ph`}>{initials(name)}</div>;
  if (err)
    return (
      <div
        className={`${cls} ph`}
        title={err}
        style={{ padding: 8, textAlign: "center", fontSize: 11 }}
      >
        Gagal: {err.slice(0, 80)}
      </div>
    );
  if (!url) return <div className={`${cls} ph`}>Memuat...</div>;
  return pdf ? (
    <iframe className={cls} src={url} title={name} />
  ) : (
    <img className={cls} src={url} alt={name} />
  );
}

/* ===================== APP ===================== */
export default function App() {
  const cfg = CFG;
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [kelas, setKelas] = useState("");
  const [tahun, setTahun] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [selId, setSelId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState("");
  const [proc, setProc] = useState("");
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null
  );
  const [form, setForm] = useState({
    nama: "",
    nisn: "",
    kelas: "",
    tahun: "",
  });

  const sel = students.find((s) => s.id === selId) ?? null;

  const editing = editId ? students.find((s) => s.id === editId) ?? null : null;

  async function load(c: Cfg = cfg, refresh = false) {
    if (!c.url) {
      setMsg("API_URL belum diisi di bagian atas App.tsx.");
      return;
    }
    setLoading(true);
    try {
      const j = await call(c, "list", refresh ? { refresh: "1" } : {});
      setStudents(j.students as Student[]);
      setMsg("");
    } catch (e) {
      setMsg("Gagal memuat data: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelId("");
        setShowAdd(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function upload(s: Student, k: FileKey, f: File) {
    if (f.size > 10 * 1024 * 1024) {
      setMsg("File terlalu besar (maks 10 MB).");
      return;
    }
    setBusy(true);
    setMsg(`Mengunggah ${LABEL[k]} untuk ${s.nama}...`);
    try {
      const data = await toBase64(f);
      const j = await post(cfg, {
        action: "upload",
        id: s.id,
        key: k,
        filename: f.name,
        mime: f.type || "application/octet-stream",
        data,
      });
      setStudents((p) =>
        p.map((x) => (x.id === s.id ? (j.student as Student) : x))
      );
      setMsg(`${LABEL[k]} ${s.nama} berhasil disimpan ke Google Drive.`);
    } catch (e) {
      setMsg("Gagal unggah: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    setEditId("");
    setForm({ nama: "", nisn: "", kelas: "", tahun: "" });
    setShowAdd(true);
  }

  function openEdit(s: Student) {
    setEditId(s.id);
    setForm({ nama: s.nama, nisn: s.nisn, kelas: s.kelas, tahun: s.tahun });
    setShowAdd(true);
  }

  async function addStudent() {
    if (!form.nama.trim()) {
      setMsg("Nama wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const j = await post(cfg, {
        action: "saveStudent",
        student: { ...form, id: editId },
      });
      const ns = j.student as Student;
      if (editId) {
        setStudents((p) => p.map((x) => (x.id === ns.id ? ns : x)));
        setMsg(`Data ${ns.nama} berhasil diperbarui.`);
      } else {
        setStudents((p) => [...p.filter((x) => x.id !== ns.id), ns]);
        setSelId(ns.id);
        setMsg(`${ns.nama} ditambahkan. Silakan unggah foto dan ijazahnya.`);
      }
      setForm({ nama: "", nisn: "", kelas: "", tahun: "" });
      setEditId("");
      setShowAdd(false);
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(s: Student) {
    if (
      !window.confirm(
        `Hapus data ${s.nama}?\nBaris di Google Sheet akan dihapus permanen dan semua berkasnya dipindahkan ke Sampah Google Drive.`
      )
    )
      return;
    setBusy(true);
    setProc(`Menghapus data ${s.nama}...`);
    try {
      await post(cfg, { action: "deleteStudent", id: s.id });
      setStudents((p) => p.filter((x) => x.id !== s.id));
      if (selId === s.id) setSelId("");
      setToast({ text: `Data ${s.nama} berhasil dihapus.`, ok: true });
    } catch (e) {
      setToast({
        text: "Gagal menghapus data: " + (e as Error).message,
        ok: false,
      });
    } finally {
      setProc("");
      setBusy(false);
    }
  }

  async function removeFile(s: Student, k: FileKey) {
    if (
      !window.confirm(
        `Hapus ${LABEL[k]} milik ${s.nama}?\nFile di Google Drive akan dipindahkan ke Sampah.`
      )
    )
      return;
    setBusy(true);
    setProc(`Menghapus ${LABEL[k]}...`);
    try {
      const j = await post(cfg, { action: "deleteFile", id: s.id, key: k });
      setStudents((p) =>
        p.map((x) => (x.id === s.id ? (j.student as Student) : x))
      );
      setToast({
        text: `${LABEL[k]} ${s.nama} berhasil dihapus.`,
        ok: true,
      });
    } catch (e) {
      setToast({
        text: "Gagal menghapus berkas: " + (e as Error).message,
        ok: false,
      });
    } finally {
      setProc("");
      setBusy(false);
    }
  }

  const kelasList = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.kelas)))
        .filter(Boolean)
        .sort(),
    [students]
  );
  const tahunList = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.tahun)))
        .filter(Boolean)
        .sort(),
    [students]
  );
  const rows = students.filter(
    (s) =>
      (!kelas || s.kelas === kelas) &&
      (!tahun || s.tahun === tahun) &&
      (!q || `${s.nama} ${s.nisn}`.toLowerCase().includes(q.toLowerCase())) &&
      (!incomplete ||
        (["foto", "ijazah", "bukti"] as FileKey[]).some((k) => !fid(s, k)))
  );
  const count = (k: FileKey) => students.filter((s) => fid(s, k)).length;
  useEffect(() => setShown(PAGE), [q, kelas, tahun, incomplete]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fileInput = (
    s: Student,
    k: FileKey,
    text: string,
    cls = "btn sm primary"
  ) => (
    <label className={cls}>
      {text}
      <input
        type="file"
        hidden
        disabled={busy}
        accept={ACCEPT[k]}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(s, k, f);
          e.target.value = "";
        }}
      />
    </label>
  );

  function renderDoc(s: Student, k: FileKey) {
    const id = fid(s, k);
    const isPdf = k === "ijazah" || /\.pdf$/i.test(s[k]);
    return (
      <section className="doc" key={k}>
        <div className="doc-h">
          <h4>{LABEL[k]}</h4>
          {fileInput(s, k, id ? "Ganti" : "Upload")}
        </div>
        {id ? (
          k === "ijazah" ? (
            <a
              className="btn primary"
              href={`https://drive.google.com/file/d/${id}/view`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka Ijazah di Google Drive
            </a>
          ) : (
            <Media
              cfg={cfg}
              id={id}
              thumb={false}
              pdf={isPdf}
              name={`${LABEL[k]} ${s.nama}`}
              cls={isPdf ? "pdf" : "doc-img"}
            />
          )
        ) : (
          <p className="muted">
            {s[k]
              ? `File tidak ditemukan di Drive: ${s[k]}`
              : "Belum ada berkas. Silakan upload."}
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="top">
        <div>
          <h1>Data Alumni Siswa</h1>
          <p className="muted">
            {students.length} alumni &middot; data dari Google Sheet &amp; Drive
          </p>
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={openAdd}>
            + Tambah Alumni
          </button>
          <button
            className="btn"
            onClick={() => load(cfg, true)}
            disabled={loading}
          >
            {loading ? "Memuat..." : "Muat Ulang"}
          </button>
        </div>
      </header>

      {msg && (
        <div className="notice" onClick={() => setMsg("")}>
          {msg}
        </div>
      )}

      <div className="stats">
        <div>
          <b>{students.length}</b>
          <span>Total alumni</span>
        </div>
        <div>
          <b>{count("foto")}</b>
          <span>Foto tersedia</span>
        </div>
        <div>
          <b>{count("ijazah")}</b>
          <span>Ijazah PDF</span>
        </div>
        <div>
          <b>{count("bukti")}</b>
          <span>Bukti terima</span>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Cari nama atau NISN..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={tahun} onChange={(e) => setTahun(e.target.value)}>
          <option value="">Semua tahun ajaran</option>
          {tahunList.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={kelas} onChange={(e) => setKelas(e.target.value)}>
          <option value="">Semua kelas</option>
          {kelasList.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="chk">
          <input
            type="checkbox"
            checked={incomplete}
            onChange={(e) => setIncomplete(e.target.checked)}
          />{" "}
          Berkas belum lengkap
        </label>
      </div>
      <p className="muted">
        Menampilkan {Math.min(shown, rows.length)} dari {rows.length}
      </p>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="no">No</th>
              <th>Nama</th>
              <th>NISN</th>
              <th>Kelas</th>
              <th>Tahun Ajaran</th>
              <th>Berkas</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((s, i) => (
              <tr key={s.id} onClick={() => setSelId(s.id)}>
                <td className="no">{i + 1}</td>
                <td className="nm">{s.nama}</td>
                <td>{s.nisn}</td>
                <td>{s.kelas}</td>
                <td>{s.tahun}</td>
                <td>
                  <div className="chips">
                    {(["foto", "ijazah", "bukti"] as FileKey[]).map((k) => (
                      <span
                        key={k}
                        className={`chip ${fid(s, k) ? "ok" : "missing"}`}
                      >
                        {k === "foto"
                          ? "Foto"
                          : k === "ijazah"
                          ? "Ijazah"
                          : "Bukti"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="act">
                  <div className="acts" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn sm"
                      disabled={busy}
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn sm danger"
                      disabled={busy}
                      onClick={() => void removeStudent(s)}
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <p className="center">
          <button className="btn" onClick={() => setShown(shown + PAGE)}>
            Tampilkan lebih banyak
          </button>
        </p>
      )}
      {!rows.length && !loading && (
        <p className="muted center">Tidak ada data.</p>
      )}

      {sel && (
        <div className="overlay" onClick={() => setSelId("")}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close"
              onClick={() => setSelId("")}
              aria-label="Tutup"
            >
              &times;
            </button>
            <div className="profile">
              <Media
                cfg={cfg}
                id={sel.fotoId}
                thumb
                pdf={false}
                name={sel.nama}
                cls="photo"
              />
              <div>
                <h2>{sel.nama}</h2>
                <dl>
                  <dt>NISN</dt>
                  <dd>{sel.nisn}</dd>
                  <dt>Kelas</dt>
                  <dd>{sel.kelas}</dd>
                  <dt>Tahun Ajaran</dt>
                  <dd>{sel.tahun}</dd>
                  <dt>ID</dt>
                  <dd>{sel.id}</dd>
                </dl>
                {fileInput(
                  sel,
                  "foto",
                  sel.fotoId ? "Ganti Foto" : "Upload Foto"
                )}
              </div>
            </div>
            {KEYS.filter((k) => k !== "foto").map((k) => renderDoc(sel, k))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <button
              className="close"
              onClick={() => setShowAdd(false)}
              aria-label="Tutup"
            >
              &times;
            </button>
            <h2>{editId ? "Edit Alumni" : "Tambah Alumni"}</h2>
            {(["nama", "nisn", "kelas", "tahun"] as const).map((k) => (
              <label className="field" key={k}>
                {k === "tahun"
                  ? "TAHUN AJARAN (contoh 2024-2025)"
                  : k.toUpperCase()}
                <input
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            {editing && (
              <div className="files">
                <h4>Berkas</h4>
                {KEYS.map((k) => {
                  const id = fid(editing, k);
                  return (
                    <div className="frow" key={k}>
                      <div className="finfo">
                        <b>{LABEL[k]}</b>
                        <span className="muted">
                          {id
                            ? editing[k]
                            : editing[k]
                            ? "File tidak ditemukan di Drive"
                            : "Belum ada berkas"}
                        </span>
                      </div>
                      <div className="acts">
                        {id && (
                          <a
                            className="btn sm"
                            href={`https://drive.google.com/file/d/${id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Buka
                          </a>
                        )}
                        {fileInput(editing, k, id ? "Ganti" : "Upload")}
                        {editing[k] && (
                          <button
                            className="btn sm danger"
                            disabled={busy}
                            onClick={() => void removeFile(editing, k)}
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {msg && <p className="muted">{msg}</p>}
              </div>
            )}
            <button
              className="btn primary"
              onClick={addStudent}
              disabled={busy}
            >
              {busy ? "Menyimpan..." : editId ? "Simpan Perubahan" : "Simpan"}
            </button>
          </div>
        </div>
      )}

      {proc && (
        <div className="proc">
          <div className="proc-box">
            <div className="spinner" />
            <p>{proc}</p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`toast ${toast.ok ? "ok" : "err"}`}
          onClick={() => setToast(null)}
        >
          <span className="ico">{toast.ok ? "✓" : "!"}</span>
          {toast.text}
        </div>
      )}
    </div>
  );
}

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2433}
.app{max-width:1200px;margin:0 auto;padding:20px}
h1{margin:0;font-size:24px}h2{margin:0 0 8px}h3{margin:8px 0 2px;font-size:14px;line-height:1.3}h4{margin:0}
.muted{color:#6b7587;font-size:13px;margin:2px 0}.center{text-align:center;padding:20px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.row{display:flex;gap:8px;align-items:center}.wrap{flex-wrap:wrap}
.btn{display:inline-block;border:1px solid #cfd6e4;background:#fff;color:#1c2433;padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer}
.btn:hover{background:#eef2f9}.btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.btn.primary:hover{background:#1d4fd0}
.btn.sm{padding:5px 10px;font-size:12px}.btn:disabled{opacity:.6;cursor:wait}
.notice{background:#e8f0ff;border:1px solid #bcd0ff;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;cursor:pointer}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
.stats div{background:#fff;border-radius:10px;padding:12px 14px;box-shadow:0 1px 2px #0001}
.stats b{display:block;font-size:22px}.stats span{font-size:12px;color:#6b7587}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.filters input,.filters select,.field input{padding:9px 12px;border:1px solid #cfd6e4;border-radius:8px;font-size:14px;background:#fff}
.filters input{flex:1;min-width:200px}.chk{display:flex;align-items:center;gap:6px;font-size:13px}
.chk input{flex:none;min-width:0;width:auto}
.table-wrap{background:#fff;border-radius:12px;box-shadow:0 1px 3px #0001;overflow-x:auto;margin-top:8px}
.tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
.tbl th{text-align:left;font-size:12px;color:#6b7587;font-weight:600;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e6eaf2;white-space:nowrap}
.tbl td{padding:10px 12px;border-bottom:1px solid #eef1f6;vertical-align:middle}
.tbl tbody tr{cursor:pointer;transition:background .1s}
.tbl tbody tr:hover{background:#eef4ff}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl .no{width:48px;text-align:center;color:#6b7587}
.tbl .nm{font-weight:600}
.tbl .chips{margin-top:0}
.tbl .act{width:1%;white-space:nowrap}
.acts{display:flex;gap:6px}
.btn.danger{color:#b91c1c;border-color:#fca5a5}
.btn.danger:hover{background:#fee2e2}
.files{margin:16px 0;border-top:1px solid #e6eaf2;padding-top:12px}
.frow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #eef1f6;flex-wrap:wrap}
.finfo{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.finfo b{font-size:13px}.finfo span{word-break:break-all}
a.btn{text-decoration:none}
.proc{position:fixed;inset:0;background:#0007;display:flex;align-items:center;justify-content:center;z-index:30}
.proc-box{background:#fff;border-radius:14px;padding:24px 32px;text-align:center;box-shadow:0 10px 30px #0004;min-width:220px}
.proc-box p{margin:12px 0 0;font-size:14px;color:#1c2433}
.spinner{width:40px;height:40px;margin:0 auto;border:4px solid #dbe3f3;border-top-color:#dc2626;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:10px;font-size:14px;color:#fff;box-shadow:0 8px 24px #0003;cursor:pointer;animation:toast-in .3s ease}
.toast.ok{background:#16a34a}.toast.err{background:#dc2626}
.toast .ico{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#fff3;font-weight:700}
@keyframes toast-in{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
.ph{display:flex;align-items:center;justify-content:center;color:#7b8aa5;font-weight:700;font-size:14px;background:#e5eaf3}
.chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}.chip{font-size:11px;padding:2px 8px;border-radius:99px}
.chip.ok{background:#dcfce7;color:#166534}.chip.missing{background:#fee2e2;color:#991b1b}
.overlay{position:fixed;inset:0;background:#0008;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;z-index:10}
.modal{position:relative;background:#fff;border-radius:14px;padding:22px;width:100%;max-width:820px}.modal.small{max-width:520px}
.close{position:absolute;top:10px;right:14px;border:0;background:none;font-size:28px;cursor:pointer;color:#6b7587}
.profile{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px}
.photo{width:170px;aspect-ratio:3/4;object-fit:cover;border-radius:10px;background:#e5eaf3}
dl{display:grid;grid-template-columns:110px 1fr;gap:6px 10px;margin:8px 0;font-size:14px}dt{color:#6b7587}dd{margin:0;font-weight:500;word-break:break-all}
.doc{border-top:1px solid #e6eaf2;padding:14px 0}.doc-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px}
.pdf{width:100%;height:520px;border:1px solid #dde3ee;border-radius:8px}.doc-img{max-width:100%;max-height:520px;border-radius:8px;display:block}
.pdf.ph,.doc-img.ph{height:120px}
.field{display:block;font-size:13px;margin:12px 0}.field input{width:100%;margin-top:4px}
`;
