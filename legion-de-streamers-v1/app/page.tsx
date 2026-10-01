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

function channelImage(channel?: Channel) {
  return originalCover(channel) || originalAvatar(channel);
}

function channelLabel(channel?: Channel) {
  if (!channel) return "Variedad";
  return channel.category || channel.title || "Variedad";
}

function shortNumber(value?: number) {
  const number = value || 0;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return String(number);
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

      const visibleChannels = (data.channels || []).filter((channel) => !deletedSet.has(channel.slug.toLowerCase()));
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
  const featuredChannel = channels.find((channel) => channel.slug.toLowerCase() === MAIN_CHANNEL) || liveChannels[0] || channels[0];
  const featuredImage = channelImage(featuredChannel);
  const activeDisplay = liveChannels.slice(0, 5);
  const topChannels = [...channels]
    .sort((a, b) => (b.viewers || 0) - (a.viewers || 0) || (b.followers || 0) - (a.followers || 0))
    .slice(0, 5);
  const categories = [...new Set(channels.map((channel) => channel.category).filter(Boolean) as string[])].slice(0, 7);

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
    <main className="streamPage">
      <nav className="siteNav">
        <a className="brandMark" href="#top" aria-label="Legión de Streamers">
          <span>♛</span>
          <strong>LEGIÓN <small>DE STREAMERS</small></strong>
        </a>

        <div className="navMenu">
          <a href="#top">Inicio</a>
          <a href="#directorio">Streamers</a>
          <a href="#comunidad">Comunidad</a>
          <a href="#eventos">Eventos</a>
        </div>

        <div className="navRight">
          <div className="onlineDot"><i /> {channels.length || 0} canales</div>
          <button className="navIcon" aria-label="Buscar">⌕</button>
          <a className="discordPill" href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
        </div>
      </nav>

      <section id="top" className="heroV2">
        <div className="heroCopy">
          <div className="breadcrumbs">STREAMERS <span>›</span> COMUNIDAD <span>›</span> SIN LÍMITES</div>
          <h1>Juntos hacemos <em>más grande</em></h1>
          <p>
            Una comunidad de streamers, para streamers. Juega, comparte, conecta y haz crecer tu canal dentro de la Legión.
          </p>
          <div className="heroActions">
            <a className="primaryBtn" href={DISCORD_URL} target="_blank" rel="noreferrer">Únete a la comunidad</a>
            <a className="secondaryBtn" href="#directorio">Conoce más</a>
          </div>
        </div>

        <div className="heroPanel addChannelPanel">
          <div className="panelTitle">
            <span className="kickBadge">K</span>
            <div>
              <h2>Agrega tu canal de <b>KICK</b></h2>
              <p>Sé parte de la Legión y muestra tu contenido a toda la comunidad.</p>
            </div>
          </div>

          <form onSubmit={addChannel} className="addChannelForm">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://kick.com/tu-canal"
              rows={1}
            />
            <button disabled={adding}>{adding ? "Agregando..." : "Agregar canal →"}</button>
          </form>

          {message && <div className="inlineMessage">{message}</div>}

          <div className="miniStatsGrid">
            <div><strong>{channels.length}</strong><small>Canales</small></div>
            <div><strong>{liveCount}</strong><small>En vivo</small></div>
            <div><strong>30s</strong><small>Refresh</small></div>
          </div>
        </div>

        <aside className="tournamentCard" id="eventos">
          <span>🏆</span>
          <h3>Torneos comunitarios</h3>
          <p>Demuestra tu habilidad. Juega con la Legión.</p>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">Ver comunidad →</a>
        </aside>
      </section>

      <section className="liveRail">
        <div className="sectionBar">
          <div><i className="pulse" /> <strong>STREAMERS EN VIVO</strong> <span>Descubre quién está transmitiendo ahora en la Legión.</span></div>
          <a href="#directorio">Ver todos los en vivo →</a>
        </div>

        {loading ? (
          <div className="emptyState">Cargando canales...</div>
        ) : activeDisplay.length ? (
          <div className="liveScroller">
            {activeDisplay.map((channel) => (
              <a className="liveCard" href={channel.url} target="_blank" rel="noreferrer" key={channel.slug}>
                <div className="liveImage" style={channelImage(channel) ? { backgroundImage: `linear-gradient(#07050baa,#07050bcc), url(${channelImage(channel)})` } : undefined}>
                  <span>EN VIVO</span>
                  <b>👁 {shortNumber(channel.viewers)}</b>
                </div>
                <div className="liveInfo">
                  {originalAvatar(channel) ? <img src={originalAvatar(channel)} alt={`Foto de ${channel.name}`} /> : <em>{initials(channel.name || channel.slug)}</em>}
                  <div><strong>{channel.name || channel.slug}</strong><small>{channel.category || "KICK"}</small></div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="emptyState">Ahora mismo no hay canales en vivo.</div>
        )}
      </section>

      <section className="featureLayout" id="comunidad">
        <article className="spotlightCard">
          <div className="cardHeading">♛ STREAMER DESTACADO</div>
          <div className="spotlightBody">
            <div className="spotlightVisual" style={featuredImage ? { backgroundImage: `linear-gradient(90deg,#12091c 22%,#12091c66), url(${featuredImage})` } : undefined}>
              <span>{featuredChannel?.live ? "EN VIVO" : "OFFLINE"}</span>
              {originalAvatar(featuredChannel) ? <img src={originalAvatar(featuredChannel)} alt={`Foto de ${featuredChannel?.name || "streamer"}`} /> : <strong>{initials(featuredChannel?.name || "LS")}</strong>}
            </div>
            <div className="spotlightText">
              <h2>{featuredChannel?.name || "SoyelMoro"}</h2>
              <p>{featuredChannel ? `@${featuredChannel.slug}` : "@soyelmoro"}</p>
              <div className="tagRow">
                <span>{channelLabel(featuredChannel)}</span>
                <span>Comunidad</span>
                <span>{featuredChannel?.live ? `${featuredChannel.viewers || 0} viewers` : "Destacado"}</span>
              </div>
              <div className="spotlightActions">
                <a className="kickBtn" href={featuredChannel?.url || MAIN_KICK_URL} target="_blank" rel="noreferrer">Ver en Kick →</a>
                <a className="followBtn" href={DISCORD_URL} target="_blank" rel="noreferrer">Seguir comunidad</a>
              </div>
            </div>
          </div>
        </article>

        <aside className="activityCard">
          <div className="cardHeading">⌁ ACTIVIDAD RECIENTE</div>
          <div className="activityTabs"><span>Todos</span><span>Nuevos canales</span><span>Logros</span></div>
          <div className="activityList">
            {(channels.length ? channels.slice(0, 5) : [{ slug: "soyelmoro", name: "SoyelMoro", url: MAIN_KICK_URL, live: false }] as Channel[]).map((channel, index) => (
              <div className="activityItem" key={`${channel.slug}-${index}`}>
                {originalAvatar(channel) ? <img src={originalAvatar(channel)} alt="" /> : <em>{initials(channel.name || channel.slug)}</em>}
                <p><strong>{channel.name || channel.slug}</strong> {channel.live ? "está en vivo ahora" : "forma parte de la Legión"}<small>Actualizado recientemente</small></p>
              </div>
            ))}
          </div>
        </aside>

        <aside className="newMembersCard">
          <span>👥</span>
          <h3>Nuevos miembros</h3>
          <strong>+{Math.max(channels.length, 1)}</strong>
          <p>Canales dentro de la comunidad</p>
          <a href="#directorio">Ver toda la comunidad →</a>
        </aside>
      </section>

      <section id="directorio" className="directoryPanel">
        <div className="directoryHeader">
          <div>
            <span className="sectionIcon">🎮</span>
            <h2>Canales de la comunidad</h2>
            <p>Explora los streamers de la Legión. Filtra por estado, busca tu streamer favorito y descubre nuevos canales.</p>
          </div>
          <div className="directoryControls">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar streamer..." />
            <select value={tab} onChange={(e) => setTab(e.target.value as "all" | "live" | "offline")}>
              <option value="all">Todos</option>
              <option value="live">En vivo</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        <div className="categoryPills">
          <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Todos</button>
          <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}>En vivo</button>
          <button className={tab === "offline" ? "active" : ""} onClick={() => setTab("offline")}>Offline</button>
          {categories.map((category) => <span key={category}>{category}</span>)}
        </div>

        {loading ? (
          <div className="emptyState">Cargando canales...</div>
        ) : filtered.length ? (
          <div className="communityGrid">
            {filtered.map((channel) => (
              <article className={channel.live ? "communityCard live" : "communityCard"} key={channel.slug}>
                <div className="communityAvatar">
                  {originalAvatar(channel) ? <img src={originalAvatar(channel)} alt={`Foto de ${channel.name || channel.slug}`} /> : <strong>{initials(channel.name || channel.slug)}</strong>}
                </div>
                <div className="communityInfo">
                  <h3>{channel.name || channel.slug}</h3>
                  <p>{channel.live ? "● En vivo" : "● Desconectado"}</p>
                  <small>{channel.category || channel.title || "KICK"}</small>
                </div>
                <div className="communityMeta">
                  <span>{channel.live ? "EN VIVO" : "OFFLINE"}</span>
                  <b>👁 {shortNumber(channel.viewers)}</b>
                </div>
                <a href={channel.url} target="_blank" rel="noreferrer">Ver canal</a>
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyState">No hay canales en esta sección.</div>
        )}
      </section>

      <section className="rankingFooter">
        <div>
          <h2>Ranking de la comunidad</h2>
          <p>Una vista rápida de los canales con más movimiento dentro de la Legión.</p>
        </div>
        <div className="rankingList">
          {(topChannels.length ? topChannels : channels.slice(0, 5)).map((channel, index) => (
            <a href={channel.url} target="_blank" rel="noreferrer" key={channel.slug}>
              <b>#{index + 1}</b>
              <span>{channel.name || channel.slug}</span>
              <small>{channel.live ? `${shortNumber(channel.viewers)} viewers` : channel.category || "KICK"}</small>
            </a>
          ))}
        </div>
      </section>

      {!loading && systemNotice && <div className="systemToast">{systemNotice}</div>}
    </main>
  );
}
