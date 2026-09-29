"use client";
import {FormEvent,useCallback,useEffect,useMemo,useState} from "react";
type C={slug:string;name:string;profilePicture:string|null;live:boolean;title:string|null;category:string|null;viewers:number;thumbnail:string|null;url:string};
export default function Home(){
 const [channels,setChannels]=useState<C[]>([]),[input,setInput]=useState(""),[search,setSearch]=useState(""),[msg,setMsg]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch("/api/channels",{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error);setChannels(j.channels);setErr("")}catch(e:any){setErr(e.message)}},[]);
 useEffect(()=>{load();const i=setInterval(load,30000);return()=>clearInterval(i)},[load]);
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setMsg("");setErr("");try{const r=await fetch("/api/channels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:input})}),j=await r.json();if(!r.ok)throw new Error(j.error);setMsg(j.message);setInput("");await load()}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 const list=useMemo(()=>channels.filter(c=>(c.name+" "+c.slug+" "+(c.category||"")).toLowerCase().includes(search.toLowerCase())),[channels,search]);
 const live=list.filter(c=>c.live),off=list.filter(c=>!c.live);
 return <main><div className="wrap">
  <header><div><b className="eyebrow">LEGIÓN DE STREAMERS</b><h1>Directorio <span>KICK</span></h1><p>Tu comunidad en un solo lugar. Descubre quién está en directo y entra a su canal oficial.</p></div><div className="stats"><div><strong>{channels.length}</strong><small>Miembros</small></div><div><strong>{channels.filter(c=>c.live).length}</strong><small>En directo</small></div></div></header>
  <section className="join"><div><b>ÚNETE AL DIRECTORIO</b><h2>Añadir mi canal</h2><p>Pega tu enlace de KICK o escribe tu usuario.</p></div><form onSubmit={add}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="https://kick.com/tuusuario"/><button disabled={busy}>{busy?"Añadiendo...":"Añadir canal"}</button></form>{(msg||err)&&<p className={err?"error":"ok"}>{err||msg}</p>}</section>
  <div className="tools"><h2>Streamers de la comunidad</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar streamer..."/></div>
  <Group title="● EN DIRECTO" items={live}/><Group title="● OFFLINE" items={off}/>
  <footer>Legión de Streamers · Estado actualizado automáticamente cada 30 segundos</footer>
 </div></main>
}
function Group({title,items}:{title:string;items:C[]}){return <section className="group"><h3>{title} <em>{items.length}</em></h3>{!items.length?<div className="empty">No hay canales en esta sección.</div>:<div className="grid">{items.map(c=><article key={c.slug} className={c.live?"card live":"card"}>{c.live&&c.thumbnail&&<div className="thumb"><img src={c.thumbnail} alt=""/><i>EN DIRECTO</i></div>}<div className="body"><div className="identity">{c.profilePicture?<img src={c.profilePicture} alt=""/>:<div className="avatar">{c.name[0]?.toUpperCase()}</div>}<div><h4>{c.name}</h4><small>@{c.slug}</small></div></div>{c.live?<><p className="title">{c.title||"En directo en KICK"}</p><p className="meta">{c.category||"Sin categoría"} <span>👁 {c.viewers}</span></p></>:<p className="offline">Actualmente offline</p>}<a href={c.url} target="_blank" rel="noreferrer">Entrar a KICK ↗</a></div></article>)}</div>}</section>}
