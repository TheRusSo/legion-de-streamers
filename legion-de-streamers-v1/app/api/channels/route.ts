import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabase";
import {getChannels,getUsers,normalizeKickSlug} from "@/lib/kick";
export const dynamic="force-dynamic";

export async function GET(){
 try{
  const db=getSupabaseAdmin();
  const {data,error}=await db.from("channels").select("*").order("created_at",{ascending:false});
  if(error)throw new Error(error.message);
  const rows=data||[];
  const [chs,users]=await Promise.all([getChannels(rows.map(x=>x.slug)),getUsers(rows.map(x=>x.user_id))]);
  const cm=new Map(chs.map((x:any)=>[x.slug.toLowerCase(),x]));
  const um=new Map(users.map((x:any)=>[x.user_id,x]));
  const channels=rows.map((r:any)=>{
   const c:any=cm.get(r.slug),u:any=um.get(r.user_id),live=Boolean(c?.stream?.is_live);
   return {slug:c?.slug||r.slug,name:u?.name||r.slug,profilePicture:u?.profile_picture||null,
    live,title:live?c?.stream_title||null:null,category:c?.category?.name||null,
    viewers:live?c?.stream?.viewer_count||0:0,thumbnail:live?c?.stream?.thumbnail||null:null,
    url:`https://kick.com/${c?.slug||r.slug}`};
  }).sort((a:any,b:any)=>a.live===b.live?(b.viewers||0)-(a.viewers||0):a.live?-1:1);
  return NextResponse.json({channels,liveCount:channels.filter((x:any)=>x.live).length,total:channels.length,updatedAt:new Date().toISOString()});
 }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
export async function POST(req:Request){
 try{
  const {channel}=await req.json(); const slug=normalizeKickSlug(channel||"");
  const found=(await getChannels([slug]))[0];
  if(!found)return NextResponse.json({error:`No encontramos @${slug} en KICK.`},{status:404});
  const db=getSupabaseAdmin();
  const {error}=await db.from("channels").upsert({slug:found.slug.toLowerCase(),user_id:found.broadcaster_user_id},{onConflict:"slug"});
  if(error)throw new Error(error.message);
  return NextResponse.json({message:`@${found.slug} ya forma parte del directorio.`},{status:201});
 }catch(e:any){return NextResponse.json({error:e.message||"No se pudo añadir."},{status:400})}
}