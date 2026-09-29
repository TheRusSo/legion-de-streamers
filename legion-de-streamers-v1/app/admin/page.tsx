"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

type AdminChannel = {
  slug: string;
  created_at?: string;
};

type ApiResult = {
  ok?: boolean;
  error?: string;
  code?: string;
  channels?: AdminChannel[];
  added?: string[];
  deleted?: string;
  updated?: { oldSlug: string; newSlug: string };
};

const STORAGE_KEY = "legion_admin_password";

function formatDate(value?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function normalizeAdminInput(value: string) {
  return value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?kick\.com\//i, "");
}

async function readApi(res: Response): Promise<ApiResult> {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResult;
  } catch {
    return { error: text };
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [busySlug, setBusySlug] = useState("");
  const [newChannels, setNewChannels] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => a.slug.localeCompare(b.slug));
  }, [channels]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setPassword(saved);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked && password) {
      loadChannels(password);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, password]);

  function authHeaders(secret = password) {
    return {
      "Content-Type": "application/json",
      "x-admin-password": secret
    };
  }

  async function request(path: string, options: RequestInit = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {})
      },
      cache: "no-store"
    });

    const data = await readApi(res);
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "No se pudo completar la acción.");
    }

    return data;
  }

  async function loadChannels(secret = password) {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/channels", {
        headers: authHeaders(secret),
        cache: "no-store"
      });
      const data = await readApi(res);

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "No se pudo cargar el panel.");
      }

      setChannels(data.channels || []);
      setNotice(`Panel cargado. Canales: ${data.channels?.length || 0}`);
    } catch (err) {
      setUnlocked(false);
      window.localStorage.removeItem(STORAGE_KEY);
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    const secret = password.trim();

    if (!secret) {
      setError("Escribe la contraseña administrativa.");
      return;
    }

    setPassword(secret);
    window.localStorage.setItem(STORAGE_KEY, secret);
    setUnlocked(true);
    await loadChannels(secret);
  }

  function logout() {
    window.localStorage.removeItem(STORAGE_KEY);
    setPassword("");
    setUnlocked(false);
    setChannels([]);
    setNotice("Sesión administrativa cerrada.");
  }

  async function addChannels(e: FormEvent) {
    e.preventDefault();
    if (!newChannels.trim()) return;

    setLoading(true);
    setError("");

    try {
      const data = await request("/api/admin/channels", {
        method: "POST",
        body: JSON.stringify({ channels: newChannels })
      });

      setNewChannels("");
      setNotice(`Añadido: ${(data.added || []).map((slug) => `@${slug}`).join(", ")}`);
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function updateChannel(oldSlug: string) {
    const newSlug = normalizeAdminInput(edits[oldSlug] || "");
    if (!newSlug || newSlug === oldSlug) return;

    setBusySlug(oldSlug);
    setError("");

    try {
      await request("/api/admin/channels", {
        method: "PATCH",
        body: JSON.stringify({ oldSlug, newSlug })
      });

      setNotice(`Actualizado: @${oldSlug} → @${newSlug}`);
      setEdits((current) => ({ ...current, [oldSlug]: "" }));
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setBusySlug("");
    }
  }

  async function deleteChannel(slug: string) {
    const ok = window.confirm(`¿Eliminar @${slug} del directorio?`);
    if (!ok) return;

    setBusySlug(slug);
    setError("");

    try {
      await request(`/api/admin/channels?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE"
      });

      setNotice(`Eliminado: @${slug}`);
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setBusySlug("");
    }
  }

  if (!unlocked) {
    return (
      <main className={styles.adminPage}>
        <section className={`${styles.card} ${styles.login}`}>
          <span className={styles.badge}>ACCESO PRIVADO</span>
          <h1 className={styles.title}>Panel <span>Admin</span></h1>
          <p className={styles.text}>
            Entra con tu contraseña privada para editar o eliminar canales del directorio de Legión de Streamers.
          </p>

          <form className={styles.formGrid} onSubmit={login}>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña administrativa"
            />
            <button className={styles.button} disabled={loading}>ENTRAR</button>
          </form>

          {error && <div className={styles.error}>{error}</div>}
          <p className={styles.small}>
            Seguridad: las acciones del panel se validan en el servidor con ADMIN_PASSWORD.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.adminPage}>
      <section className={styles.shell}>
        <div className={styles.top}>
          <div>
            <span className={styles.badge}>PANEL PRIVADO</span>
            <h1 className={styles.title}>Gestionar <span>canales</span></h1>
            <p className={styles.text}>
              Añade, edita o elimina canales del directorio sin tocar la página pública ni la lógica de KICK.
            </p>
          </div>

          <div className={styles.actions}>
            <button className={styles.ghostButton} onClick={() => loadChannels()} disabled={loading}>ACTUALIZAR</button>
            <button className={styles.dangerButton} onClick={logout}>SALIR</button>
          </div>
        </div>

        <div className={styles.panel}>
          <form className={`${styles.card} ${styles.addBox}`} onSubmit={addChannels}>
            <textarea
              className={styles.textarea}
              value={newChannels}
              onChange={(event) => setNewChannels(event.target.value)}
              placeholder={"kick.com/nuevocanal\n@otrocanal"}
            />
            <button className={styles.button} disabled={loading || !newChannels.trim()}>AÑADIR</button>
          </form>

          {notice && <div className={styles.notice}>{notice}</div>}
          {error && <div className={styles.error}>{error}</div>}

          <div className={`${styles.card} ${styles.tableWrap}`}>
            {loading ? (
              <div className={styles.empty}>Cargando canales...</div>
            ) : sortedChannels.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Fecha</th>
                    <th>Editar usuario</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedChannels.map((channel) => (
                    <tr key={channel.slug}>
                      <td>
                        <div className={styles.slug}>@{channel.slug}</div>
                        <a className={styles.link} href={`https://kick.com/${channel.slug}`} target="_blank" rel="noreferrer">
                          Ver en KICK ↗
                        </a>
                      </td>
                      <td>{formatDate(channel.created_at)}</td>
                      <td>
                        <input
                          className={styles.miniInput}
                          value={edits[channel.slug] ?? ""}
                          onChange={(event) => setEdits((current) => ({ ...current, [channel.slug]: event.target.value }))}
                          placeholder="nuevo-usuario"
                        />
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.ghostButton}
                            onClick={() => updateChannel(channel.slug)}
                            disabled={busySlug === channel.slug || !(edits[channel.slug] || "").trim()}
                          >
                            GUARDAR
                          </button>
                          <button
                            className={styles.dangerButton}
                            onClick={() => deleteChannel(channel.slug)}
                            disabled={busySlug === channel.slug}
                          >
                            ELIMINAR
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.empty}>No hay canales guardados.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
