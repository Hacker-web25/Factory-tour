/**
 * lib/site/measure.ts — analytics and the cookie notice for the marketing
 * pages.
 *
 * Why this file exists: the marketing pages (/, /plans, /how-it-works,
 * /faq, /case-studies, /booking, /order-confirmation) are NOT rendered by
 * the Next.js app layout. They are a prebuilt React bundle inside a plain
 * HTML shell (lib/site/home.ts), so the <Analytics /> and <CookieNotice />
 * components in app/layout.tsx never ran on them. For a while that meant
 * the home page, where every pamphlet scan lands, recorded nothing: no
 * Google Analytics, no Clarity, no first-party page view, and no cookie
 * notice. This script does the same jobs in plain browser JavaScript.
 *
 * It must stay in step with:
 *   components/analytics/Analytics.tsx    (what loads, when)
 *   components/analytics/CookieNotice.tsx (the notice)
 *   lib/analytics/client.ts               (first-touch attribution, session
 *                                          id, the /api/track payload)
 * They share the same storage keys and the same opt-out cookie, so a choice
 * made on one kind of page holds on the other.
 *
 * The script body is a String.raw template: keep it free of backticks, and
 * of ${...} other than the one ${BRAND} colour, and keep it to syntax every
 * phone browser runs.
 */

import { gaConfigured, clarityConfigured, GA_MEASUREMENT_ID, CLARITY_PROJECT_ID } from "@/lib/analytics/config";

const BRAND = "#0b5cff";

const BODY = String.raw`(function(){
var C=window.__VPV_MEASURE__||{};
try{if(window.self!==window.top)return}catch(e){return}
var OPT="vpv_no_analytics",SEEN="vpv.cookie.notice.v1",ATTR="vpv.attr.v1",SID="vpv.sid.v1",IDLE=1800000,YEAR=31536000;
var gaOk=/^G-[A-Z0-9]{6,}$/i.test(C.ga||""),clOk=/^[a-z0-9]{6,15}$/i.test(C.cl||"");
function out(){try{return document.cookie.indexOf(OPT+"=1")>-1}catch(e){return false}}
function ls(){try{return window.localStorage}catch(e){return null}}
function cookie(n,v,a){try{document.cookie=n+"="+v+"; Max-Age="+a+"; Path=/; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")}catch(e){}}
function pick(q,k){var v=q.get(k);return v&&v.trim()?v.trim().slice(0,120):null}
function norm(v){return typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(v.trim())?v.trim():null}
function uuid(){if(window.crypto&&window.crypto.randomUUID)return window.crypto.randomUUID();return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16)})}
function attr(){
var s=ls();
try{var e=s&&s.getItem(ATTR);if(e)return JSON.parse(e)}catch(x){}
try{
var u=new URL(location.href),q=u.searchParams,ref=document.referrer||null,same=false;
try{same=!!ref&&new URL(ref).hostname===location.hostname}catch(x){}
var a={source:pick(q,"utm_source"),medium:pick(q,"utm_medium"),campaign:pick(q,"utm_campaign"),term:pick(q,"utm_term"),content:pick(q,"utm_content"),code:norm(q.get("vpv")),referrer:same?null:(ref?ref.slice(0,300):null),landingPath:(u.pathname+u.search).slice(0,300),at:Date.now()};
if(s)s.setItem(ATTR,JSON.stringify(a));
return a
}catch(x){return null}
}
function sid(){
try{
var s=ls();if(!s)return null;
var raw=s.getItem(SID),now=Date.now();
if(raw){var o=JSON.parse(raw);if(o&&o.id&&now-o.at<IDLE){s.setItem(SID,JSON.stringify({id:o.id,at:now}));return o.id}}
var id=uuid();s.setItem(SID,JSON.stringify({id:id,at:now}));return id
}catch(e){return null}
}
function send(name,meta,path){
if(out())return;
var a=attr()||{};
var body=JSON.stringify({name:name,path:path||location.pathname+location.search,referrer:document.referrer||null,sessionId:sid(),utmSource:a.source||null,utmMedium:a.medium||null,utmCampaign:a.campaign||null,code:a.code||null,meta:meta||null});
try{
if(meta&&navigator.sendBeacon&&navigator.sendBeacon("/api/track",new Blob([body],{type:"application/json"})))return
}catch(e){}
try{
fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:body}).catch(function(){})
}catch(e){}
}
var T={path:null,since:null,active:0,deep:0};
function pct(){var d=document.documentElement,room=d.scrollHeight-window.innerHeight;if(room<=0)return 100;var p=window.scrollY/room*100;return p>100?100:p<0?0:p}
function onScroll(){var p=pct();if(p>T.deep)T.deep=p}
function begin(p){T.path=p;T.active=0;T.deep=0;T.since=document.visibilityState==="visible"?Date.now():null;onScroll()}
function flush(){
if(T.since){T.active+=Date.now()-T.since;T.since=null}
var sec=Math.min(1800,Math.round(T.active/1000));
T.active=0;
if(T.path&&sec>=1&&!out()){
var m={seconds:sec,scroll:Math.max(0,Math.min(100,Math.round(T.deep/10)*10))};
send("page_time",m,T.path);
try{if(gaOk&&typeof window.gtag==="function")window.gtag("event","page_time",m)}catch(e){}
}
}
var tagged=null;
function tag(){
var a=attr();
if(!a||!a.code||a.code===tagged||out())return;
try{
if(typeof window.clarity!=="function")return;
window.clarity("identify",a.code);window.clarity("set","qr_code",a.code);
if(gaOk&&typeof window.gtag==="function")window.gtag("set","user_properties",{qr_code:a.code});
tagged=a.code
}catch(e){}
}
var loaded=false;
function load(){
if(loaded||out())return;
loaded=true;
try{
if(gaOk){
window.dataLayer=window.dataLayer||[];
window.gtag=function(){window.dataLayer.push(arguments)};
window.gtag("js",new Date());
window.gtag("config",C.ga,{send_page_view:false,anonymize_ip:true});
var g=document.createElement("script");g.async=true;g.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(C.ga);document.head.appendChild(g)
}
if(clOk){
(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",C.cl)
}
}catch(e){}
}
var last=null;
function view(){
var p=location.pathname+location.search;
if(p===last)return;
flush();
last=p;
if(out())return;
attr();
begin(p);
send("page_view");
try{if(gaOk&&typeof window.gtag==="function")window.gtag("event","page_view",{page_path:p,page_location:location.href,page_title:document.title})}catch(e){}
}
function route(){setTimeout(view,120)}
function notice(){
if(!(gaOk||clOk))return;
var s=ls();
try{if(s&&s.getItem(SEEN))return}catch(e){}
if(document.getElementById("vpv-cookie-bar")||!document.body)return;
var b=document.createElement("div");
b.id="vpv-cookie-bar";b.setAttribute("role","region");b.setAttribute("aria-label","Cookie notice");
b.innerHTML='<style>#vpv-cookie-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147482000;background:rgba(255,255,255,.97);border-top:1px solid #e2e8f0;box-shadow:0 -6px 24px rgba(15,23,42,.08);padding:12px 16px;font-family:inherit}#vpv-cookie-bar .in{max-width:64rem;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}#vpv-cookie-bar p{margin:0;flex:1 1 320px;font-size:13.5px;line-height:1.5;color:#334155}#vpv-cookie-bar a{color:${BRAND};font-weight:600;text-decoration:underline;text-underline-offset:2px}#vpv-cookie-bar .btns{display:flex;gap:8px;flex:none}#vpv-cookie-bar button{font:inherit;font-size:13px;font-weight:600;border-radius:9999px;padding:9px 18px;cursor:pointer}#vpv-cookie-bar .ess{background:#fff;border:1px solid #cbd5e1;color:#334155}#vpv-cookie-bar .ess:hover{background:#f8fafc}#vpv-cookie-bar .all{background:${BRAND};border:1px solid ${BRAND};color:#fff;padding:9px 22px}#vpv-cookie-bar .all:hover{opacity:.9}@media(max-width:520px){#vpv-cookie-bar .btns{width:100%}#vpv-cookie-bar button{flex:1}}</style><div class="in"><p>We use cookies to see how people find and use this site, so we can make it better. Read our <a href="/cookies">Cookie Policy</a>.</p><div class="btns"><button type="button" class="ess">Decline</button><button type="button" class="all">Accept all</button></div></div>';
function close(essential){
try{var l=ls();if(l)l.setItem(SEEN,essential?"essential":"accepted")}catch(e){}
if(b.parentNode)b.parentNode.removeChild(b);
if(essential){cookie(OPT,"1",YEAR);try{location.reload()}catch(e){}}
}
b.querySelector(".ess").addEventListener("click",function(){close(true)});
b.querySelector(".all").addEventListener("click",function(){close(false)});
window.addEventListener("storage",function(e){if(e.key===SEEN&&e.newValue&&b.parentNode)b.parentNode.removeChild(b)});
document.body.appendChild(b);
}
load();
view();
tag();setTimeout(tag,2000);setTimeout(tag,6000);
window.addEventListener("scroll",onScroll,{passive:true});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flush();else if(T.path&&T.since===null)T.since=Date.now()});
window.addEventListener("pagehide",flush);
["pushState","replaceState"].forEach(function(k){var f=history[k];history[k]=function(){var r=f.apply(this,arguments);route();return r}});
window.addEventListener("popstate",route);
notice();
})();`;

/** The <script> block for the marketing shell: config first, then the body. */
export function measureScriptTag(ids?: { ga?: string; clarity?: string }): string {
  const ga = ids?.ga ?? (gaConfigured ? GA_MEASUREMENT_ID : "");
  const cl = ids?.clarity ?? (clarityConfigured ? CLARITY_PROJECT_ID : "");
  // The ids are format-checked in the browser too; JSON.stringify and the
  // "<" escape keep a stray value from ever closing the script tag.
  const cfg = JSON.stringify({ ga, cl }).replace(/</g, "\\u003c");
  return `<script id="vpv-measure">window.__VPV_MEASURE__=${cfg};${BODY}</script>`;
}
