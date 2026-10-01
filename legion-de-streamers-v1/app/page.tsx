"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const MAIN_KICK_URL = "https://kick.com/soyelmoro";
const DISCORD_URL = "https://discord.com/invite/dSuxTZGD5u";
const MAIN_CHANNEL = "soyelmoro";
const LOCAL_CHANNELS_KEY = "legion_streamers_local_channels";
const LOCAL_DELETED_CHANNELS_KEY = "legion_streamers_deleted_channels";

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
  featured?: boolean;
  source?: string;
};

type ApiResult = {
  ok?: boolean;
  error?: string;
  code?: string;
  warning?: string;
  message?: string;
  storage?: string;
  permanent?: boolean;
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

function getStoredList(key: string) {
  if (typeof window === "undefined") return [] as string[];

  try {
    return extractLocalSlugs(window.localStorage.getItem(key) || "");
  } catch {
    return [] as string[];
  }
}

function saveStoredList(key: string, slugs: string[]) {
  if (typeof window === "undefined") return;

  try {
    const clean = [...new Set(slugs.map(cleanLocalSlug).filter(Boolean))];
    window.localStorage.setItem(key, clean.join("\n"));
  } catch {
    // localStorage may be blocked by the browser; ignore silently.
  }
}

function getStoredLocalSlugs() {
  return getStoredList(LOCAL_CHANNELS_KEY);
}

function getStoredDeletedSlugs() {
  return getStoredList(LOCAL_DELETED_CHANNELS_KEY);
}

function saveStoredLocalSlugs(slugs: string[]) {
  saveStoredList(LOCAL_CHANNELS_KEY, slugs);
}

function saveStoredDeletedSlugs(slugs: string[]) {
  saveStoredList(LOCAL_DELETED_CHANNELS_KEY, slugs);
}

function addStoredLocalSlugs(slugs: string[]) {
  const cleanSlugs = slugs.map(cleanLocalSlug).filter(Boolean);
  const current = getStoredLocalSlugs();
  const deleted = getStoredDeletedSlugs();
  const added = new Set(cleanSlugs);

  saveStoredDeletedSlugs(deleted.filter((slug) => !added.has(slug)));
  saveStoredLocalSlugs([...current, ...cleanSlugs]);
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
      const deletedSet = new Set(getStoredDeletedSlugs());
      const localSlugs = getStoredLocalSlugs().filter((slug) => !deletedSet.has(slug));
      const extra = localSlugs.length ? `?extra=${encodeURIComponent(localSlugs.join("\n"))}` : "";
      const res = await fetch(`/api/channels${extra}`, { cache: "no-store" });
      const data = await readApiResult(res);

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "No se pudo cargar el directorio.");
      }

      const visibleChannels = (data.channels || [])
        .filter((channel) => !deletedSet.has(channel.slug.toLowerCase()))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.live) - Number(a.live) || (b.viewers || 0) - (a.viewers || 0));

      setChannels(visibleChannels);
      setSystemNotice(data.warning || "Perfiles y estado EN VIVO se actualizan automáticamente cada 30 segundos.");
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
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === LOCAL_CHANNELS_KEY || event.key === LOCAL_DELETED_CHANNELS_KEY) {
        loadChannels();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", loadChannels);

    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", loadChannels);
    };
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

      if (added.length) setInput("");

      if (added.length && data.permanent === false) {
        addStoredLocalSlugs(added);
        setMessage(`Añadido: ${formatList(added)}. Nota: Supabase está bloqueando el guardado global; se mostrará en este navegador.`);
      } else if (added.length && duplicates.length) {
        setMessage(`Añadidos: ${formatList(added)}. Ya existían: ${formatList(duplicates)}.`);
      } else if (added.length) {
        setMessage(added.length === 1 ? `Canal añadido: ${formatList(added)}` : `Canales añadidos: ${formatList(added)}`);
      } else {
        setMessage("No se añadió ningún canal nuevo.");
      }

      await loadChannels();
      setTimeout(() => setMessage(""), 6500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setAdding(false);
    }
  }

  const liveChannels = channels.filter((channel) => channel.live);
  const liveCount = liveChannels.length;
  const offlineCount = channels.length - liveCount;
  const featuredChannels = channels.filter((channel) => channel.featured);
  const featuredChannel = featuredChannels[0] || channels.find((channel) => channel.slug.toLowerCase() === MAIN_CHANNEL) || channels[0];
  const featuredCoverImage = originalCover(featuredChannel);
  const featuredAvatarImage = originalAvatar(featuredChannel);
  const recentChannels = [...channels]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.live) - Number(a.live) || (b.viewers || 0) - (a.viewers || 0) || a.name.localeCompare(b.name))
    .slice(0, 5);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return channels
      .filter((channel) => {
        const matchesSearch = `${channel.slug} ${channel.name} ${channel.title || ""} ${channel.category || ""} ${channel.featured ? "destacado" : ""}`
          .toLowerCase()
          .includes(q);

        const matchesTab =
          tab === "all" ||
          (tab === "live" ? channel.live : !channel.live);

        return matchesSearch && matchesTab;
      })
      .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));
  }, [channels, search, tab]);

  return (
    <main>
      <nav className="topNav">
        <a className="brand" href="#top" aria-label="Legión de Streamers" />
        <div className="navCenter">
          <a href="#top" className="active">Inicio</a>
          <a href="#directorio">Canales</a>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">Comunidad</a>
        </div>
        <div className="navActions">
          <a className="discordPill" href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
          <a className="outlinePill" href="#directorio">Explorar</a>
        </div>
      </nav>

      <section id="top" className="heroPro">
        <div className="heroText">
          <span className="eyebrow">STREAMERS • COMUNIDAD • KICK</span>
          <h1>Juntos hacemos <em>más grande</em> la Legión.</h1>
          <p>
            Una comunidad para descubrir streamers, apoyar canales en vivo y conectar con nuevos talentos.
          </p>
          <div className="heroButtons">
            <a className="primaryButton" href={DISCORD_URL} target="_blank" rel="noreferrer">Únete a la comunidad</a>
            <a className="ghostButton" href="#directorio">Ver canales</a>
          </div>
        </div>

        <div className="heroSide">
          <form className="addPanel" onSubmit={addChannel}>
            <div>
              <span className="kickIcon">K</span>
              <h2>Agrega tu canal de <strong>KICK</strong></h2>
              <p>Sé parte de la Legión y muestra tu contenido a toda la comunidad.</p>
            </div>
            <div className="addRow">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://kick.com/tu-canal"
                rows={1}
              />
              <button disabled={adding}>{adding ? "Añadiendo..." : "Agregar canal"}</button>
            </div>
            {message && <div className="msg">{message}</div>}
          </form>

          <div className="miniStats">
            <div><b>{channels.length}</b><span>Canales</span></div>
            <div><b>{liveCount}</b><span>En vivo</span></div>
            <div><b>{featuredChannels.length || 1}</b><span>Destacados</span></div>
          </div>
        </div>
      </section>

      <section className="liveStrip" aria-label="Streamers en vivo">
        <div className="sectionTitle compact">
          <div>
            <span className="liveDot" />
            <h2>Streamers en vivo</h2>
            <p>Descubre quién está transmitiendo ahora en la Legión.</p>
          </div>
          <a href="#directorio" onClick={() => setTab("live")}>Ver todos los en vivo →</a>
        </div>
        {liveChannels.length ? (
          <div className="liveScroller">
            {liveChannels.slice(0, 6).map((channel) => {
              const coverImage = originalCover(channel);
              const avatarImage = originalAvatar(channel);
              return (
                <a key={channel.slug} className="liveCard" href={channel.url} target="_blank" rel="noreferrer">
                  <div className="liveBg" style={coverImage ? { backgroundImage: `linear-gradient(#10071db0,#10071de8), url(${coverImage})` } : undefined} />
                  <span className="liveBadge on">EN VIVO</span>
                  {avatarImage ? <img src={avatarImage} alt={channel.name || channel.slug} /> : <strong>{initials(channel.name || channel.slug)}</strong>}
                  <div>
                    <b>{channel.name || channel.slug}</b>
                    <small>{channel.category || "KICK"} • {channel.viewers || 0} viewers</small>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="empty">Ahora mismo no hay canales marcados como EN VIVO.</div>
        )}
      </section>

      <section className="spotlightGrid">
        <article className="featuredWide">
          <span className="cardLabel">STREAMER DESTACADO</span>
          <div className="featuredContent">
            <div className="featuredAvatarWrap">
              {featuredAvatarImage ? <img src={featuredAvatarImage} alt="Canal destacado" /> : <strong>{initials(featuredChannel?.name || MAIN_CHANNEL)}</strong>}
              <i className={featuredChannel?.live ? "on" : ""}>{featuredChannel?.live ? "EN VIVO" : "OFFLINE"}</i>
            </div>
            <div>
              <h2>{featuredChannel?.name || "SoyelMoro"}</h2>
              <p>@{featuredChannel?.slug || MAIN_CHANNEL}</p>
              <div className="tagRow">
                <span>{featuredChannel?.category || "KICK"}</span>
                <span>{featuredChannel?.live ? `${featuredChannel.viewers || 0} viewers` : "Comunidad"}</span>
              </div>
              <div className="featuredActions">
                <a className="greenButton" href={featuredChannel?.url || MAIN_KICK_URL} target="_blank" rel="noreferrer">Ver en Kick →</a>
                <a className="ghostButton" href={DISCORD_URL} target="_blank" rel="noreferrer">Seguir comunidad</a>
              </div>
            </div>
          </div>
          <div className="featuredBackdrop" style={featuredCoverImage ? { backgroundImage: `linear-gradient(90deg,#0b0714 10%,#0b071499), url(${featuredCoverImage})` } : undefined} />
        </article>

        <article className="activityBox">
          <span className="cardLabel">ACTIVIDAD RECIENTE</span>
          <div className="activityList">
            {recentChannels.map((channel) => (
              <a key={channel.slug} href={channel.url} target="_blank" rel="noreferrer">
                {originalAvatar(channel) ? <img src={originalAvatar(channel)} alt={channel.name || channel.slug} /> : <strong>{initials(channel.name || channel.slug)}</strong>}
                <div>
                  <b>{channel.name || channel.slug}</b>
                  <small>{channel.live ? "está en vivo ahora" : channel.featured ? "canal destacado" : "forma parte de la Legión"}</small>
                </div>
              </a>
            ))}
          </div>
        </article>

        <article className="membersBox">
          <span className="cardLabel">DESTACADOS</span>
          <b>{featuredChannels.length || 1}</b>
          <a href="#directorio">Ver toda la comunidad →</a>
        </article>
      </section>

      <section id="directorio" className="directoryPanel">
        <header className="dirHead">
          <div>
            <span className="gameIcon">🎮</span>
            <h2>Canales de la comunidad</h2>
            <p>Explora los streamers de la Legión. Filtra por estado y busca tu streamer favorito.</p>
          </div>
          <div className="dirTools">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar streamer..." />
          </div>
        </header>

        <div className="statusTabs">
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Todos ({channels.length})</button>
          <button className={tab === "live" ? "on" : ""} onClick={() => setTab("live")}>En vivo ({liveCount})</button>
          <button className={tab === "offline" ? "on" : ""} onClick={() => setTab("offline")}>Offline ({offlineCount})</button>
        </div>

        {loading ? (
          <div className="empty">Cargando canales...</div>
        ) : (
          <>
            <div className="channelGrid">
              {filtered.map((channel) => {
                const avatarImage = originalAvatar(channel);
                return (
                  <article key={channel.slug} className="channelCard">
                    <div className="channelTop">
                      {avatarImage ? <img src={avatarImage} alt={channel.name || channel.slug} /> : <strong>{initials(channel.name || channel.slug)}</strong>}
                      <div>
                        <h3>{channel.name || channel.slug} {channel.featured ? "⭐" : ""}</h3>
                        <p><i className={channel.live ? "status on" : "status"} /> {channel.live ? "En vivo" : "Desconectado"}</p>
                        <small>{channel.featured ? "DESTACADO • " : ""}{channel.category || "KICK"}</small>
                      </div>
                      <span className={channel.live ? "state live" : "state"}>{channel.live ? "EN VIVO" : "OFFLINE"}</span>
                    </div>
                    <div className="cardStats">👁 {channel.viewers || 0}</div>
                    <a href={channel.url} target="_blank" rel="noreferrer">Ver canal</a>
                  </article>
                );
              })}
            </div>
            {!filtered.length && <div className="empty">No hay canales en esta sección.</div>}
          </>
        )}
      </section>

      {!loading && systemNotice && <div className="floatingNotice">{systemNotice}</div>}

      <footer>
        LEGIÓN DE STREAMERS
        <span>CRECE • CONECTA • APOYA</span>
      </footer>
    </main>
  );
}
