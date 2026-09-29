const API="https://api.kick.com";
const TOKEN="https://id.kick.com/oauth/token";
let cached:{token:string;expires:number}|null=null;

async function accessToken(){
 if(cached&&cached.expires>Date.now()+30000)return cached.token;
 const id=process.env.KICK_CLIENT_ID, secret=process.env.KICK_CLIENT_SECRET;
 if(!id||!secret)throw new Error("Faltan KICK_CLIENT_ID/KICK_CLIENT_SECRET.");
 const body=new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:secret});
 const r=await fetch(TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,cache:"no-store"});
 if(!r.ok)throw new Error("No se pudo autenticar con KICK.");
 const j=await r.json();
 cached={token:j.access_token,expires:Date.now()+j.expires_in*1000};
 return cached.token;
}
async function api(path:string,params:URLSearchParams){
 const r=await fetch(API+path+"?"+params.toString(),{headers:{Authorization:`Bearer ${await accessToken()}`,Accept:"application/json"},cache:"no-store"});
 const j=await r.json();
 if(!r.ok)throw new Error(j.message||"Error de KICK API.");
 return j.data||[];
}
export function normalizeKickSlug(v:string){
 let s=v.trim();
 if(s.includes("kick.com")){
   const u=new URL(s.startsWith("http")?s:"https://"+s);
   if(!/^(www\.)?kick\.com$/i.test(u.hostname))throw new Error("Solo enlaces de kick.com.");
   s=u.pathname.split("/").filter(Boolean)[0]||"";
 }
 s=s.replace(/^@/,"").toLowerCase();
 if(!/^[a-z0-9_-]{2,25}$/.test(s))throw new Error("Usuario de KICK inválido.");
 return s;
}
export async function getChannels(slugs:string[]){
 if(!slugs.length)return [];
 const p=new URLSearchParams(); slugs.forEach(s=>p.append("slug",s));
 return api("/public/v1/channels",p);
}
export async function getUsers(ids:number[]){
 if(!ids.length)return [];
 const p=new URLSearchParams(); ids.forEach(id=>p.append("id",String(id)));
 return api("/public/v1/users",p);
}
