"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Channel = {
  slug: string;
  name: string;
  url: string;
  live: boolean;
  title?: string;
  description?: string;
  category?: string;
  viewers?: number;
  thumbnail?: string;
  avatar?: string;
  banner?: string;
  followers?: number;
  source?: string;
};

function initials(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "K";
}

export default function Page() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "live" | "offline">("all");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [profileStatus, setProfileStatus] = useState("Actualizando perfiles cada 30 segundos.");

  async function loadChannels() {
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo cargar el directorio.");
      }

      setChannels(data.channels || []);
      setProfileStatus(
        data.kick_status === "error"
          ? "Canales guardados. KICK no respondió en esta actualización; se intentará otra vez automáticamente."
          : "Perfiles y estado EN VIVO se actualizan automáticamente cada 30 segundos."
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : "Error desconocido.";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChannels();
    const timer = setInterval(loadChannels, 30_000);
    return () => clearInterval(timer);
  }, []);

  async function addChannel(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) {
      setMessage("Pega tu enlace o usuario de KICK.");
      return;
    }

    setAdding(true);
    setMessage("");

    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: input })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo añadir el canal.");
      }

      setInput("");
      setMessage("Canal añadido correctamente. Cargando perfil de KICK...");
      await loadChannels();
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setAdding(false);
    }
  }

  const liveCount = channels.filter((channel) => channel.live).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return channels.filter((channel) => {
      const matchesSearch = `${channel.slug} ${channel.name} ${channel.title || ""} ${channel.category || ""}`
        .toLowerCase()
        .includes(q);

      const matchesTab =
        tab === "all" ||
        (tab === "live" ? channel.live : !channel.live);

      return matchesSearch && matchesTab;
    });
  }, [channels, search, tab]);

  return (
    <main>
      <nav>
        <div className="brand">
          <b>L</b>
          <span>LEGIÓN<small>DE STREAMERS</small></span>
        </div>
        <a href="#directorio">EXPLORAR</a>
      </nav>

      <section className="hero">
        <label>COMUNIDAD • KICK • CREADORES</label>
        <h1>Tu comunidad.<br /><em>En vivo y conectada.</em></h1>
        <p>
          Añade enlaces ilimitados de KICK. La página carga el perfil de cada canal y actualiza su estado automáticamente.
        </p>

        <form onSubmit={addChannel}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="kick.com/tuusuario o @tuusuario"
          />
          <button disabled={adding}>{adding ? "AÑADIENDO..." : "AÑADIR MI CANAL"}</button>
        </form>

        {message && <div className="msg">{message}</div>}
        {!loading && <div className="warn">{profileStatus}</div>}

        <div className="stats">
          <div><strong>{channels.length}</strong><small>MIEMBROS</small></div>
          <div><strong>{liveCount}</strong><small>EN VIVO</small></div>
          <div><strong>30s</strong><small>ACTUALIZACIÓN</small></div>
        </div>
      </section>

      <section id="directorio" className="dir">
        <header>
          <div>
            <label>DIRECTORIO</label>
            <h2>Canales de la comunidad</h2>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar streamer..."
          />
        </header>

        <div className="tabs">
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
            Todos ({channels.length})
          </button>
          <button className={tab === "live" ? "on" : ""} onClick={() => setTab("live")}>
            ● En vivo ({liveCount})
          </button>
          <button className={tab === "offline" ? "on" : ""} onClick={() => setTab("offline")}>
            Offline ({channels.length - liveCount})
          </button>
        </div>

        {loading ? (
          <div className="empty">Cargando canales...</div>
        ) : (
          <>
            <div className="grid">
              {filtered.map((channel) => (
                <article key={channel.slug} className={channel.live ? "isLive" : ""}>
                  <div
                    className="cover"
                    style={channel.thumbnail ? { backgroundImage: `linear-gradient(#09070daa,#09070dcc), url(${channel.thumbnail})` } : undefined}
                  >
                    <div className="avatar">
                      {channel.avatar ? <img src={channel.avatar} alt={channel.name} /> : initials(channel.name)}
                    </div>
                    <i className={channel.live ? "live" : ""}>{channel.live ? "● EN VIVO" : "OFFLINE"}</i>
                  </div>
                  <div className="body">
                    <h3>{channel.name}</h3>
                    <p>@{channel.slug}</p>
                    <div className="meta">
                      <strong>{channel.live ? (channel.title || "Transmitiendo ahora") : "Perfil de KICK conectado"}</strong>
                      <span>
                        {channel.live
                          ? `${channel.category || "Sin categoría"} • ${channel.viewers || 0} viewers`
                          : `${channel.followers || 0} seguidores • Estado actualizado`}
                      </span>
                    </div>
                    <a href={channel.url} target="_blank" rel="noreferrer">VER CANAL EN KICK ↗</a>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && <div className="empty">No hay canales en esta sección.</div>}
          </>
        )}
      </section>

      <footer>
        LEGIÓN DE STREAMERS
        <span>CRECE • CONECTA • APOYA</span>
      </footer>
    </main>
  );
}
