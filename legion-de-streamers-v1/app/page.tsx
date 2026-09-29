"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const MAIN_KICK_URL = "https://kick.com/soyelmoro";
const DISCORD_URL = "https://discord.com/invite/dSuxTZGD5u";
const MAIN_CHANNEL = "soyelmoro";

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

type ApiResult = {
  ok?: boolean;
  error?: string;
  code?: string;
  warning?: string;
  message?: string;
  added?: string[];
  duplicates?: string[];
  channels?: Channel[];
};

function cleanLocalSlug(input: string) {
  const raw = String(input || "").trim().replace(/\/+$/, "");
  const match = raw.match(/(?:https?:\/\/)?(?:www\.)?kick\.com\/([^/?#\s]+)/i);
  const slug = (match?.[1] || raw.replace(/^@/, ""))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!slug || slug.length > 80) return "";
  return slug;
}

function extractLocalSlugs(input: string) {
  const parts = String(input || "")
    .replace(/\r/g, "\n")
    .replace(/,/g, "\n")
    .replace(/;/g, "\n")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const slugs = new Set<string>();
  for (const part of parts) {
    const slug = cleanLocalSlug(part);
    if (slug) slugs.add(slug);
  }

  return [...slugs];
}

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

function originalCover(channel?: Channel) {
  return channel?.thumbnail || channel?.banner || channel?.avatar || "";
}

function originalAvatar(channel?: Channel) {
  return channel?.avatar || channel?.thumbnail || channel?.banner || "";
}

async function readApiResult(res: Response): Promise<ApiResult> {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResult;
  } catch {
    return { error: text };
  }
}

function formatList(values: string[]) {
  if (!values.length) return "";
  return values.slice(0, 5).map((v) => `@${v}`).join(", ") + (values.length > 5 ? "..." : "");
}

export default function Page() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "live" | "offline">("all");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [systemNotice, setSystemNotice] = useState("");

  async function loadChannels() {
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      const data = await readApiResult(res);

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "No se pudo cargar el directorio.");
      }

      setChannels(data.channels || []);
      setSystemNotice(data.warning ? `Aviso técnico: ${data.warning}` : "Perfiles y estado EN VIVO se actualizan automáticamente cada 30 segundos.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Error desconocido.";
      setSystemNotice(text);
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

    const slugs = extractLocalSlugs(input);
    if (!slugs.length) {
      setMessage("Pega al menos un enlace o usuario válido de KICK.");
      return;
    }

    const existing = new Set(channels.map((channel) => channel.slug.toLowerCase()));
    const alreadyVisible = slugs.filter((slug) => existing.has(slug));
    const requestedNew = slugs.filter((slug) => !existing.has(slug));

    if (!requestedNew.length) {
      setMessage(alreadyVisible.length === 1
        ? `Ese canal ya está agregado: ${formatList(alreadyVisible)}`
        : `Esos canales ya están agregados: ${formatList(alreadyVisible)}`);
      return;
    }

    setAdding(true);
    setMessage("");

    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: requestedNew.join("\n") })
      });

      const data = await readApiResult(res);

      if (!res.ok || data.ok === false) {
        if (data.code === "duplicate" && data.duplicates?.length) {
          setMessage(`Ya estaba agregado: ${formatList(data.duplicates)}`);
          await loadChannels();
          return;
        }

        throw new Error(data.error || "No se pudo añadir el canal.");
      }

      const added = data.added || [];
      const duplicates = [...alreadyVisible, ...(data.duplicates || [])];

      if (added.length) {
        setInput("");
      }

      if (added.length && duplicates.length) {
        setMessage(`Añadidos: ${formatList(added)}. Ya existían: ${formatList(duplicates)}.`);
      } else if (added.length) {
        setMessage(added.length === 1
          ? `Canal añadido: ${formatList(added)}`
          : `Canales añadidos: ${formatList(added)}`);
      } else {
        setMessage("No se añadió ningún canal nuevo.");
      }

      await loadChannels();
      setTimeout(() => setMessage(""), 4500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setAdding(false);
    }
  }

  const liveCount = channels.filter((channel) => channel.live).length;
  const featuredChannel = channels.find((channel) => channel.slug.toLowerCase() === MAIN_CHANNEL);
  const featuredCoverImage = originalCover(featuredChannel);
  const featuredAvatarImage = originalAvatar(featuredChannel);

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
        <div className="brand" aria-label="Legión de Streamers" />
        <div className="navLinks">
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">DISCORD</a>
          <a href="#directorio">EXPLORAR</a>
        </div>
      </nav>

      <section className="hero">
        <label>COMUNIDAD • KICK • DISCORD</label>
        <h1>Legión de Streamers.<br /><em>Crece con la comunidad.</em></h1>
        <p>
          Únete al Discord oficial, comparte tu canal de KICK y aparece en el directorio junto a los demás miembros.
        </p>

        <div className="singleAction">
          <a className="discordMainButton" href={DISCORD_URL} target="_blank" rel="noreferrer">
            Entrar al Discord oficial
          </a>
        </div>

        <form onSubmit={addChannel}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"kick.com/tuusuario\nhttps://kick.com/otrocanal\n@otrouser"}
            rows={3}
          />
          <button disabled={adding}>{adding ? "AÑADIENDO..." : "AÑADIR CANAL"}</button>
        </form>

        <div className="hint">Puedes pegar varios enlaces a la vez, uno por línea. No se aceptan canales duplicados.</div>
        {message && <div className="msg">{message}</div>}
        {!loading && systemNotice && <div className="warn">{systemNotice}</div>}

        <div className="stats">
          <div><strong>{channels.length}</strong><small>MIEMBROS</small></div>
          <div><strong>{liveCount}</strong><small>EN VIVO</small></div>
          <div><strong>30s</strong><small>ACTUALIZACIÓN</small></div>
        </div>
      </section>

      <section className="featuredSection" aria-label="Streamer destacado">
        <div className="featuredHeader">
          <label>DESTACADO</label>
          <h2>Canal destacado de la comunidad</h2>
        </div>

        <article className="featuredCard">
          <div
            className="featuredCover"
            style={featuredCoverImage ? { backgroundImage: `linear-gradient(#09070d88,#09070dde), url(${featuredCoverImage})` } : undefined}
          >
            {featuredAvatarImage ? (
              <img src={featuredAvatarImage} alt="Foto original del canal SoyelMoro" />
            ) : (
              <strong>SM</strong>
            )}
            <i className={featuredChannel?.live ? "live" : ""}>{featuredChannel?.live ? "● EN VIVO" : "OFFLINE"}</i>
          </div>

          <div className="featuredBody">
            <span className="featuredTag">CANAL PRINCIPAL</span>
            <h3>SoyelMoro</h3>
            <p>@soyelmoro</p>
            <div className="featuredMeta">
              <strong>{featuredChannel?.live ? (featuredChannel.title || "Transmitiendo ahora") : "Streamer destacado de Legión de Streamers"}</strong>
              <span>{featuredChannel?.live ? `${featuredChannel.category || "Gaming"} • ${featuredChannel.viewers || 0} viewers` : "Retos • juegos • charlas • comunidad"}</span>
            </div>
            <a href={MAIN_KICK_URL} target="_blank" rel="noreferrer">Ver canal destacado en KICK ↗</a>
          </div>
        </article>
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
              {filtered.map((channel) => {
                const coverImage = originalCover(channel);
                const avatarImage = originalAvatar(channel);

                return (
                  <article key={channel.slug} className={channel.live ? "isLive" : ""}>
                    <div
                      className="cover"
                      style={coverImage ? { backgroundImage: `linear-gradient(#09070daa,#09070dcc), url(${coverImage})` } : undefined}
                    >
                      {avatarImage ? (
                        <img className="avatarImg" src={avatarImage} alt={`Foto original de ${channel.name || channel.slug}`} />
                      ) : (
                        <div className="avatar">{initials(channel.name || channel.slug)}</div>
                      )}
                      <i className={channel.live ? "live" : ""}>{channel.live ? "● EN VIVO" : "OFFLINE"}</i>
                    </div>
                    <div className="body">
                      <h3>{channel.name || channel.slug}</h3>
                      <p>@{channel.slug}</p>
                      <div className="profileInfo">
                        {channel.live ? (
                          <>
                            <strong>{channel.title || "Transmitiendo ahora"}</strong>
                            <span>{channel.category || "Sin categoría"} • {channel.viewers || 0} viewers</span>
                          </>
                        ) : (
                          <span>{channel.followers ? `${channel.followers} seguidores` : "Perfil de KICK"}</span>
                        )}
                      </div>
                      <a href={channel.url} target="_blank" rel="noreferrer">VER CANAL EN KICK ↗</a>
                    </div>
                  </article>
                );
              })}
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
