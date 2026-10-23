"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./bot.module.css";

type KickChannel = {
  slug: string;
  name: string;
  url: string;
  live: boolean;
  viewers?: number;
  title?: string;
  category?: string;
  source?: "official" | "public" | "fallback";
};

type BotEvent = {
  id: string;
  title: string;
  details: string;
  starts_at: string;
};

type Template = "directos" | "evento" | "bienvenida" | "anuncio";

const TIME_ZONE = "America/Santo_Domingo";

function dateRD(iso: string) {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: TIME_ZONE, weekday: "long", day: "numeric",
    month: "long", hour: "numeric", minute: "2-digit", hour12: true
  }).format(new Date(iso));
}

function toMessage(type: Template, live: KickChannel[], events: BotEvent[], selectedEvent: string) {
  if (type === "directos") {
    if (!live.length) return "🎮 LEGIÓN DE STREAMERS\n\nPor el momento no hay directos confirmados en nuestro directorio.\n\n🌐 https://legion-de-streamers.vercel.app/";
    return "🔴 ¡LA LEGIÓN ESTÁ EN DIRECTO!\n\n" +
      live.map((c) => "🎮 " + c.name + (c.category ? " · " + c.category : "") +
        (c.title ? "\n" + c.title.slice(0, 150) : "") + "\n" +
        "https://kick.com/" + encodeURIComponent(c.slug)).join("\n\n") +
      "\n\n🤝 Apoya y descubre creadores de la comunidad.\n🌐 https://legion-de-streamers.vercel.app/";
  }
  if (type === "evento") {
    const e = events.find((item) => item.id === selectedEvent) || events[0];
    if (!e) return "📅 PRÓXIMOS EVENTOS DE LA LEGIÓN\n\nConsulta las actividades de la comunidad en nuestra web.";
    return "📅 EVENTO | LEGIÓN DE STREAMERS\n\n🏆 " + e.title +
      "\n🕒 " + dateRD(e.starts_at) + " (hora RD)" +
      (e.details ? "\n📝 " + e.details : "") +
      "\n\n🙌 ¡Participa con nuestra comunidad!";
  }
  if (type === "bienvenida") {
    return "👋 ¡BIENVENIDO/A A LEGIÓN DE STREAMERS!\n\n" +
      "🎮 Comparte tu canal de Kick, conoce a otros creadores y participa en las actividades.\n" +
      "🤝 Respeta a los integrantes y evita el spam.\n" +
      "🌐 Registra tu canal: https://legion-de-streamers.vercel.app/\n\n" +
      "¡Nos alegra tenerte aquí!";
  }
  return "📣 COMUNICADO DE LEGIÓN DE STREAMERS\n\n" +
    "¡Hola, comunidad! Tenemos novedades y actividades para seguir creciendo juntos.\n\n" +
    "🎮 Consulta los directos y el directorio:\nhttps://legion-de-streamers.vercel.app/";
}

export default function LegionBotPage() {
  const [channels, setChannels] = useState<KickChannel[]>([]);
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [loadingKick, setLoadingKick] = useState(true);
  const [kickError, setKickError] = useState("");
  const [kickWarning, setKickWarning] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [localDate, setLocalDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adminNotice, setAdminNotice] = useState("");
  const [template, setTemplate] = useState<Template>("directos");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.ok || !Array.isArray(payload.channels)) {
        throw new Error("La API de canales no respondió correctamente.");
      }
      const list = payload.channels as KickChannel[];
      setChannels(list);
      setKickError("");
      setKickWarning(
        payload.kick_status === "error" || payload.configured?.kick === false ||
        (list.length > 0 && list.every((c) => c.source === "fallback"))
          ? "La disponibilidad de Kick no está completamente verificada. No interpretes los canales como desconectados hasta recuperar la conexión."
          : ""
      );
    } catch {
      setKickError("No se pudo consultar Kick. Los estados de los canales no están verificados.");
      setKickWarning("");
    } finally {
      setLoadingKick(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/events", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Error del calendario.");
      setEvents(payload.events || []);
      setEventsError("");
    } catch (error) {
      setEventsError(error instanceof Error ? error.message : "Error del calendario.");
    }
  }, []);

  useEffect(() => {
    void fetchChannels();
    void fetchEvents();
    const timer = window.setInterval(() => {
      void fetchChannels();
      void fetchEvents();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [fetchChannels, fetchEvents]);

  const live = useMemo(() => channels.filter((c) => c.live), [channels]);
  const prepared = useMemo(
    () => toMessage(template, live, events, selectedEvent),
    [template, live, events, selectedEvent]
  );
  const message = customMessage || prepared;
  const shareURL = "https://api.whatsapp.com/send?text=" + encodeURIComponent(message);
  const canCreate = Boolean(password.trim() && title.trim() && localDate);

  function changeTemplate(value: Template) {
    setTemplate(value);
    setCustomMessage("");
    setCopyNotice("");
  }

  async function createEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdminNotice("");
    const date = new Date(localDate);
    if (!Number.isFinite(date.getTime())) {
      setAdminNotice("Elige una fecha y hora válidas.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/bot/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ title, details, starts_at: date.toISOString() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el evento.");
      setTitle("");
      setDetails("");
      setLocalDate("");
      setAdminNotice("Evento guardado en el calendario.");
      await fetchEvents();
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelEvent(id: string) {
    if (!password.trim()) {
      setAdminNotice("Introduce primero la contraseña de administrador.");
      return;
    }
    if (!window.confirm("¿Cancelar este evento?")) return;
    setSubmitting(true);
    setAdminNotice("");
    try {
      const res = await fetch("/api/bot/events?id=" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "x-admin-password": password }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cancelar.");
      setAdminNotice("Evento cancelado.");
      await fetchEvents();
    } catch (error) {
      setAdminNotice(error instanceof Error ? error.message : "Error al cancelar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopyNotice("Mensaje copiado. Pégalo en tu grupo de WhatsApp.");
    } catch {
      setCopyNotice("No se pudo copiar automáticamente. Selecciona el texto y cópialo.");
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a href="/" className={styles.wordmark}>✦ LEGIÓN <span>BOT</span></a>
          <nav className={styles.nav}>
            <a href="/">Directorio</a>
            <a href="/admin">Admin canales</a>
            <a href="/bot/comunidad">Miembros y moderación</a>
          </nav>
        </header>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>CENTRO DE OPERACIONES · VERSIÓN MVP</span>
          <h1>Tu comunidad, <span>mejor organizada.</span></h1>
          <p>Controla directos de Kick, organiza eventos y prepara anuncios para tu grupo actual de WhatsApp, sin enviar mensajes automáticamente ni acceder a conversaciones privadas.</p>
        </section>

        <section className={styles.stats} aria-label="Resumen del directorio">
          <div className={styles.stat}><strong>{loadingKick ? "…" : channels.length}</strong><span>Canales consultados</span></div>
          <div className={styles.stat}><strong>{loadingKick || kickError ? "—" : live.length}</strong><span>Directos detectados</span></div>
          <div className={styles.stat}><strong>{eventsError ? "—" : events.length}</strong><span>Eventos próximos</span></div>
          <div className={styles.stat}><strong>Manual</strong><span>Publicación en WhatsApp</span></div>
        </section>

        {(kickError || kickWarning) && <p role="status" className={styles.warning}>{kickError || kickWarning}</p>}
        {eventsError && <p role="status" className={styles.warning}>Calendario: {eventsError}</p>}

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.eyebrow}>KICK · DIRECTOS</span>
                <h2>Streamers en vivo</h2>
              </div>
              <button className={styles.secondary} onClick={() => void fetchChannels()} type="button">Actualizar</button>
            </div>
            {loadingKick ? <p className={styles.muted}>Consultando canales…</p> :
              kickError ? <p className={styles.muted}>No hay estados verificados.</p> :
              live.length ? <div className={styles.items}>
                {live.map((channel) => (
                  <a key={channel.slug} className={styles.item} href={"https://kick.com/" + encodeURIComponent(channel.slug)} target="_blank" rel="noopener noreferrer">
                    <span className={styles.dot}/>
                    <span className={styles.itemBody}><strong>{channel.name || channel.slug}</strong><small>{channel.category || "En directo"}{typeof channel.viewers === "number" ? " · " + channel.viewers + " espectadores" : ""}</small></span>
                    <span className={styles.itemLink}>Kick ↗</span>
                  </a>
                ))}
              </div> : <p className={styles.muted}>No se han detectado directos. Si Kick está disponible, aparecerán aquí automáticamente.</p>}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.eyebrow}>COMUNIDAD</span>
                <h2>Agenda de eventos</h2>
              </div>
              <button type="button" className={styles.secondary} onClick={() => void fetchEvents()}>Actualizar</button>
            </div>
            {events.length ? <div className={styles.items}>
              {events.map((e) => (
                <div className={styles.item} key={e.id}>
                  <span className={styles.calendarIcon}>▦</span>
                  <span className={styles.itemBody}>
                    <strong>{e.title}</strong>
                    <small>{dateRD(e.starts_at)} · hora RD</small>
                    {e.details && <small>{e.details}</small>}
                  </span>
                  <button type="button" className={styles.textButton} onClick={() => { setSelectedEvent(e.id); changeTemplate("evento"); }}>Anunciar</button>
                </div>
              ))}
            </div> : <p className={styles.muted}>No hay eventos próximos publicados.</p>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.eyebrow}>WHATSAPP</span>
              <h2>Centro de mensajes</h2>
            </div>
            <span className={styles.tag}>Revisión humana</span>
          </div>
          <p className={styles.muted}>Elige una plantilla, modifica el texto y compártelo tú mismo. El sistema no envía mensajes ni puede seleccionar automáticamente tu grupo.</p>
          <div className={styles.tabs}>
            {(["directos", "evento", "bienvenida", "anuncio"] as Template[]).map((item) =>
              <button key={item} type="button" aria-pressed={template === item} className={template === item ? styles.tabActive : styles.tab} onClick={() => changeTemplate(item)}>
                {item === "directos" ? "🔴 Directos" : item === "evento" ? "📅 Evento" : item === "bienvenida" ? "👋 Bienvenida" : "📣 Anuncio"}
              </button>
            )}
          </div>
          {template === "evento" && events.length > 0 && (
            <label className={styles.field}>Evento seleccionado
              <select value={selectedEvent || events[0].id} onChange={(e) => { setSelectedEvent(e.target.value); setCustomMessage(""); }}>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </label>
          )}
          <label className={styles.field}>Mensaje editable
            <textarea className={styles.message} value={message} onChange={(e) => setCustomMessage(e.target.value)} rows={9} maxLength={3500}/>
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void copyMessage()}>Copiar mensaje</button>
            <a className={styles.secondary} href={shareURL} target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a>
            <button type="button" className={styles.secondary} onClick={() => setCustomMessage("")}>Restablecer</button>
          </div>
          {copyNotice && <p role="status" className={styles.success}>{copyNotice}</p>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.eyebrow}>ADMINISTRACIÓN</span>
              <h2>Programar nueva actividad</h2>
            </div>
            <span className={styles.tag}>Solo administradores</span>
          </div>
          <p className={styles.muted}>Utiliza la misma contraseña de /admin. Solo se envía en la solicitud protegida al servidor, no se almacena en este dispositivo.</p>
          <form onSubmit={(e) => void createEvent(e)} className={styles.form}>
            <label className={styles.field}>Contraseña administrativa
              <input autoComplete="off" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña del panel"/>
            </label>
            <div className={styles.formRow}>
              <label className={styles.field}>Título
                <input required minLength={3} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Noche de Warzone"/>
              </label>
              <label className={styles.field}>Fecha y hora (tu dispositivo)
                <input required type="datetime-local" value={localDate} onChange={(e) => setLocalDate(e.target.value)}/>
              </label>
            </div>
            <label className={styles.field}>Descripción
              <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Dinámica, reglas e información del evento"/>
            </label>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={submitting || !canCreate}>Guardar evento</button>
            </div>
          </form>
          {adminNotice && <p role="status" className={styles.warning}>{adminNotice}</p>}
          {events.length > 0 && <>
            <h3 className={styles.smallHeading}>Cancelar eventos programados</h3>
            <div className={styles.items}>
              {events.map((event) => <div className={styles.item} key={event.id}>
                <span className={styles.itemBody}><strong>{event.title}</strong><small>{dateRD(event.starts_at)} · hora RD</small></span>
                <button type="button" disabled={submitting} className={styles.danger} onClick={() => void cancelEvent(event.id)}>Cancelar</button>
              </div>)}
            </div>
          </>}
        </section>

        <footer className={styles.footer}>LEGIÓN BOT MVP · La moderación automática en grupos, el envío directo por WhatsApp y la IA conversacional todavía no están implementados.</footer>
      </div>
    </main>
  );
}
