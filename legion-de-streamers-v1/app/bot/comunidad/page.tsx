"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import styles from "../bot.module.css";

type Member = {
  id: string;
  kick_slug: string;
  display_name: string;
  status: "active" | "paused";
  leaderboard_opt_in: boolean;
  points: number;
};
type LeaderboardEntry = {
  kick_slug: string;
  display_name: string;
  points: number;
};
type Report = {
  id: string;
  subject: string;
  category: string;
  summary: string;
  status: "open" | "resolved";
  created_at: string;
};

function categoryName(value: string) {
  const names: Record<string, string> = {
    spam: "Spam", harassment: "Acoso", rules: "Incumplimiento de reglas", other: "Otro"
  };
  return names[value] || value;
}

export default function BotCommunityPage() {
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notice, setNotice] = useState("");
  const [publicError, setPublicError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [rewardMember, setRewardMember] = useState("");
  const [rewardPoints, setRewardPoints] = useState("5");
  const [rewardReason, setRewardReason] = useState("");
  const [reportSubject, setReportSubject] = useState("");
  const [reportCategory, setReportCategory] = useState("spam");
  const [reportSummary, setReportSummary] = useState("");

  const refreshLeaderboard = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/leaderboard", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo abrir el ranking.");
      setLeaderboard(data.leaderboard || []);
      setPublicError(data.limited ? "Se alcanzó el límite de datos del ranking; se requiere paginación." : "");
    } catch (error) {
      setPublicError(error instanceof Error ? error.message : "Ranking no disponible.");
    }
  }, []);

  useEffect(() => { void refreshLeaderboard(); }, [refreshLeaderboard]);

  async function adminFetch(path: string, method = "GET", body?: Record<string, unknown>) {
    const res = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        "x-admin-password": password,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }

  async function loadAdmin() {
    setBusy(true);
    setNotice("");
    try {
      const [m, r] = await Promise.all([
        adminFetch("/api/bot/members"),
        adminFetch("/api/bot/reports")
      ]);
      setMembers(m.members || []);
      setReports(r.reports || []);
      setAuthorized(true);
      if (m.limited) setNotice("Hay más registros de los que se pueden mostrar; habilita paginación antes de utilizar este panel a gran escala.");
    } catch (error) {
      setAuthorized(false);
      setMembers([]);
      setReports([]);
      setNotice(error instanceof Error ? error.message : "Acceso denegado.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      const [m, r] = await Promise.all([
        adminFetch("/api/bot/members"), adminFetch("/api/bot/reports")
      ]);
      setMembers(m.members || []);
      setReports(r.reports || []);
      await refreshLeaderboard();
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }

  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) return setNotice("Debes confirmar el consentimiento de la persona.");
    await runAction(async () => {
      await adminFetch("/api/bot/members", "POST", {
        kick_slug: slug, display_name: name, consent_confirmed: true
      });
      setSlug(""); setName(""); setConsent(false);
    }, "Integrante registrado. No aparece públicamente en el ranking sin consentimiento adicional.");
  }

  async function awardPoints(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const points = Number(rewardPoints);
    if (!Number.isInteger(points) || points < 1 || points > 50) return setNotice("Elige entre 1 y 50 puntos.");
    await runAction(async () => {
      await adminFetch("/api/bot/points", "POST", {
        member_id: rewardMember, points, reason: rewardReason
      });
      setRewardReason("");
    }, "Puntos registrados en el historial.");
  }

  async function addReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(async () => {
      await adminFetch("/api/bot/reports", "POST", {
        subject: reportSubject, category: reportCategory, summary: reportSummary
      });
      setReportSubject(""); setReportSummary("");
    }, "Reporte registrado para revisión manual.");
  }

  function deleteMember(member: Member) {
    if (!window.confirm("¿Eliminar a " + member.display_name + " y su historial de puntos? No puede deshacerse.")) return;
    void runAction(() => adminFetch("/api/bot/members?id=" + encodeURIComponent(member.id), "DELETE"),
      "Miembro eliminado del registro privado.");
  }

  function toggleStatus(member: Member) {
    void runAction(() => adminFetch("/api/bot/members", "PATCH", {
      action: "set_status", id: member.id, status: member.status === "active" ? "paused" : "active"
    }), "Estado actualizado.");
  }

  function toggleLeaderboard(member: Member) {
    if (!member.leaderboard_opt_in &&
      !window.confirm("Confirma que " + member.display_name + " autorizó expresamente que su nombre, canal Kick y puntos se muestren en el ranking público.")) return;
    void runAction(() => adminFetch("/api/bot/members", "PATCH", {
      action: "set_leaderboard", id: member.id,
      leaderboard_opt_in: !member.leaderboard_opt_in, opt_in_confirmed: !member.leaderboard_opt_in
    }), "Preferencia de ranking actualizada.");
  }

  function changeReport(report: Report) {
    void runAction(() => adminFetch("/api/bot/reports", "PATCH", {
      id: report.id, status: report.status === "open" ? "resolved" : "open"
    }), "Reporte actualizado. Las sanciones en WhatsApp siguen siendo responsabilidad de los administradores.");
  }

  const activeMembers = members.filter(m => m.status === "active");
  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.wordmark} href="/bot">✦ LEGIÓN <span>BOT</span></a>
          <nav className={styles.nav}>
            <a href="/bot">Panel principal</a>
            <a href="/">Directorio</a>
          </nav>
        </header>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>COMUNIDAD · ORGANIZACIÓN · MODERACIÓN HUMANA</span>
          <h1>La fuerza de <span>la Legión.</span></h1>
          <p>Registro de integrantes, méritos verificados, ranking voluntario y gestión interna de reportes. Ninguna función lee mensajes de WhatsApp.</p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span className={styles.eyebrow}>RANKING OPT-IN</span><h2>Creadores destacados</h2></div>
            <button type="button" onClick={() => void refreshLeaderboard()} className={styles.secondary}>Actualizar</button>
          </div>
          <p className={styles.muted}>Solo aparecen miembros activos que autorizaron publicar su nombre, canal de Kick y puntos.</p>
          {publicError && <p role="status" className={styles.warning}>{publicError}</p>}
          {leaderboard.length ? <div className={styles.items}>
            {leaderboard.map((m, i) => <a key={m.kick_slug} className={styles.item}
              href={"https://kick.com/" + encodeURIComponent(m.kick_slug)}
              target="_blank" rel="noopener noreferrer">
              <span className={styles.calendarIcon}>{i + 1}.</span>
              <span className={styles.itemBody}><strong>{m.display_name}</strong><small>@{m.kick_slug}</small></span>
              <span className={styles.itemLink}>{m.points} pts ↗</span>
            </a>)}
          </div> : <p className={styles.muted}>Aún no hay integrantes que hayan autorizado aparecer en el ranking.</p>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span className={styles.eyebrow}>ÁREA RESTRINGIDA</span><h2>Control de administradores</h2></div>
            {authorized && <span className={styles.tag}>Sesión local activa</span>}
          </div>
          <p className={styles.muted}>Utiliza la contraseña del panel actual. Se envía exclusivamente en solicitudes protegidas, sin guardarse en el navegador ni en la base de datos.</p>
          <label className={styles.field}>Contraseña de administrador
            <input type="password" autoComplete="off" value={password} onChange={(e) => {
              setPassword(e.target.value); setAuthorized(false); setMembers([]); setReports([]);
            }} placeholder="Contraseña actual de /admin"/>
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={busy || !password.trim()} onClick={() => void loadAdmin()}>
              {authorized ? "Actualizar administración" : "Acceder al panel"}
            </button>
            {authorized && <button type="button" className={styles.secondary} onClick={() => {
              setAuthorized(false); setPassword(""); setMembers([]); setReports([]); setNotice("Acceso local cerrado.");
            }}>Cerrar</button>}
          </div>
          {notice && <p role="status" className={styles.warning}>{notice}</p>}
        </section>

        {authorized && <>
          <section className={styles.grid}>
            <div className={styles.panel}>
              <span className={styles.eyebrow}>REGISTRO PRIVADO</span>
              <h2>Nuevo integrante</h2>
              <p className={styles.muted}>Registra a una persona solo después de confirmar su autorización. No se solicita ni guarda su número de WhatsApp.</p>
              <form className={styles.form} onSubmit={(e) => void addMember(e)}>
                <label className={styles.field}>Nombre público
                  <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alias del streamer"/>
                </label>
                <label className={styles.field}>Canal de Kick
                  <input required value={slug} maxLength={100} onChange={(e) => setSlug(e.target.value)} placeholder="soyelmoro o kick.com/soyelmoro"/>
                </label>
                <label className={styles.field} style={{ display: "block", lineHeight: "1.5" }}>
                  <input type="checkbox" style={{ width: "auto", marginRight: 8 }}
                    checked={consent} onChange={(e) => setConsent(e.target.checked)}/>
                  Confirmo que la persona autorizó el registro de su alias y su canal Kick.
                </label>
                <button type="submit" className={styles.primary} disabled={busy || !consent}>Registrar integrante</button>
              </form>
            </div>
            <div className={styles.panel}>
              <span className={styles.eyebrow}>RECONOCIMIENTOS</span>
              <h2>Asignar puntos</h2>
              <p className={styles.muted}>Otorga puntos por contribuciones verificadas, como organizar actividades y ayudar a otros. No recompenses espectadores falsos.</p>
              <form className={styles.form} onSubmit={(e) => void awardPoints(e)}>
                <label className={styles.field}>Integrante activo
                  <select required value={rewardMember} onChange={(e) => setRewardMember(e.target.value)}>
                    <option value="">Selecciona un integrante</option>
                    {activeMembers.map((m) => <option key={m.id} value={m.id}>{m.display_name} (@{m.kick_slug})</option>)}
                  </select>
                </label>
                <label className={styles.field}>Puntos (1 a 50)
                  <input type="number" min={1} max={50} required value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)}/>
                </label>
                <label className={styles.field}>Motivo verificable
                  <input required minLength={5} maxLength={240} value={rewardReason} onChange={(e) => setRewardReason(e.target.value)} placeholder="Ej. Dirigió el torneo semanal"/>
                </label>
                <button className={styles.primary} type="submit" disabled={busy || !rewardMember}>Guardar puntos</button>
              </form>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div><span className={styles.eyebrow}>GESTIÓN DE MIEMBROS</span><h2>Integrantes registrados ({members.length})</h2></div>
            </div>
            <div className={styles.items}>
              {members.length ? members.map((m) => <div key={m.id} className={styles.item}>
                <span className={styles.itemBody}>
                  <strong>{m.display_name} · {m.points} pts</strong>
                  <small>@{m.kick_slug} · {m.status === "active" ? "Activo" : "En pausa"} · Ranking {m.leaderboard_opt_in ? "visible" : "privado"}</small>
                </span>
                <div className={styles.actions}>
                  <button disabled={busy} type="button" className={styles.secondary} onClick={() => toggleStatus(m)}>
                    {m.status === "active" ? "Pausar" : "Activar"}
                  </button>
                  <button disabled={busy} type="button" className={styles.secondary} onClick={() => toggleLeaderboard(m)}>
                    {m.leaderboard_opt_in ? "Ocultar ranking" : "Autorizar ranking"}
                  </button>
                  <button disabled={busy} type="button" className={styles.danger} onClick={() => deleteMember(m)}>Eliminar</button>
                </div>
              </div>) : <p className={styles.muted}>Sin integrantes registrados.</p>}
            </div>
          </section>

          <section className={styles.panel}>
            <span className={styles.eyebrow}>MODERACIÓN INTERNA</span>
            <h2>Registro de incidentes</h2>
            <p className={styles.muted}>Los moderadores registran incidencias manualmente. No pegues teléfonos, mensajes privados ni información sensible. El bot no puede expulsar a nadie del grupo.</p>
            <form className={styles.form} onSubmit={(e) => void addReport(e)}>
              <div className={styles.formRow}>
                <label className={styles.field}>Asunto
                  <input required minLength={3} maxLength={100} value={reportSubject} onChange={(e) => setReportSubject(e.target.value)} placeholder="Ej. Publicaciones repetidas"/>
                </label>
                <label className={styles.field}>Categoría
                  <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}>
                    <option value="spam">Spam</option>
                    <option value="harassment">Acoso</option>
                    <option value="rules">Incumplimiento de reglas</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
              </div>
              <label className={styles.field}>Resumen sin datos personales
                <textarea required minLength={10} maxLength={750} rows={3} value={reportSummary}
                  onChange={(e) => setReportSummary(e.target.value)} placeholder="Resume el incidente sin pegar chats privados."/>
              </label>
              <button className={styles.primary} disabled={busy} type="submit">Registrar reporte</button>
            </form>
            <h3 className={styles.smallHeading}>Reportes recientes</h3>
            <div className={styles.items}>
              {reports.length ? reports.map((r) => <div className={styles.item} key={r.id}>
                <span className={styles.itemBody}>
                  <strong>{r.subject} · {categoryName(r.category)}</strong>
                  <small>{r.summary}</small>
                  <small>{r.status === "open" ? "Pendiente de revisión" : "Revisado"} · {new Date(r.created_at).toLocaleDateString("es-DO")}</small>
                </span>
                <button disabled={busy} type="button" className={styles.secondary} onClick={() => changeReport(r)}>
                  {r.status === "open" ? "Marcar resuelto" : "Reabrir"}
                </button>
              </div>) : <p className={styles.muted}>Sin reportes registrados.</p>}
            </div>
          </section>
        </>}

        <footer className={styles.footer}>
          Los puntos se introducen manualmente. El ranking requiere consentimiento; las sanciones en WhatsApp requieren un administrador. IA conversacional aún pendiente.
        </footer>
      </div>
    </main>
  );
}
