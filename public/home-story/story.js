function ut(n){let r=n.leads*n.valueLakh*1e5,a=r*n.conv/100,i=r-a,d=Math.min(n.lift,100-n.conv),z=n.conv+d,B=r*d/100;return{opportunity:r,won:a,lost:i,liftApplied:d,newConv:z,recovered:B}}function Ke(n,r={}){let a=ut(n),i={leads:n.leads,valueLakh:n.valueLakh,conv:n.conv,lift:n.lift,opportunity:Math.round(a.opportunity),recovered:Math.round(a.recovered)};return r.field&&(i.field=r.field),typeof r.saves=="number"&&(i.saves=r.saves),i}var Xe="vpv_no_analytics";var ft="vpv.attr.v1",he="vpv.sid.v1";function Ge(){try{return window.localStorage}catch{return null}}function gt(){try{return document.cookie.includes(`${Xe}=1`)}catch{return!1}}function xt(){try{let n=Ge()?.getItem(ft);return n?JSON.parse(n):null}catch{return null}}function bt(){try{let n=Ge();if(!n)return null;let r=n.getItem(he),a=Date.now();if(r){let{id:d,at:z}=JSON.parse(r);if(d&&a-z<1800*1e3)return n.setItem(he,JSON.stringify({id:d,at:a})),d}let i=crypto.randomUUID();return n.setItem(he,JSON.stringify({id:i,at:a})),i}catch{return null}}function vt(n,r){try{let a=window.gtag;typeof a=="function"&&n!=="page_view"&&a("event",n,r??{})}catch{}}function Ze(n,r,a={}){if(typeof window>"u"||gt())return;let i=xt(),d=JSON.stringify({name:n,path:a.path??window.location.pathname+window.location.search,referrer:document.referrer||null,sessionId:bt(),utmSource:i?.source??null,utmMedium:i?.medium??null,utmCampaign:i?.campaign??null,code:i?.code??null,meta:r??null});vt(n,r);try{if(a.beacon&&typeof navigator.sendBeacon=="function"){navigator.sendBeacon("/api/track",new Blob([d],{type:"application/json"}));return}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:d,keepalive:!0}).catch(()=>{})}catch{}}var Je=`.hs{--ink:#0b2a5b;--brand:#0b5cff;--muted:#475569;--loss:#e5484d;position:relative;height:calc(var(--hs-parts,6) * 100vh);background:linear-gradient(180deg,#f2f7ff 0%,#fff 55%,#f4f8fd 100%);color:var(--ink);font-family:"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.hs *{box-sizing:border-box}
.hs-pin{position:sticky;top:var(--hs-top,64px);height:calc(100vh - var(--hs-top,64px));height:calc(100svh - var(--hs-top,64px));overflow:hidden}
/* the coloured glow behind the story: four ready-made layers that cross-fade
   (opacity only, which the graphics chip does for free). Before Nov 2026 one
   layer animated its gradient under an 80px blur, repainting a huge blurred
   area on every frame of every part change. */
.hs-glow{position:absolute;right:-8%;top:8%;width:62vw;height:62vw;max-width:880px;max-height:880px;border-radius:50%;opacity:0;transition:opacity .5s ease;pointer-events:none;will-change:opacity}
.hs-glow--base{background:radial-gradient(closest-side,rgba(11,92,255,.2),rgba(11,92,255,.08) 55%,transparent)}
.hs-glow--conversion{background:radial-gradient(closest-side,rgba(229,72,77,.17),rgba(229,72,77,.06) 55%,transparent)}
.hs-glow--international{background:radial-gradient(closest-side,rgba(25,184,242,.22),rgba(25,184,242,.08) 55%,transparent)}
.hs-glow--privacy{background:radial-gradient(closest-side,rgba(16,163,106,.16),rgba(16,163,106,.06) 55%,transparent)}
.hs:not([data-part=conversion]):not([data-part=international]):not([data-part=privacy]) .hs-glow--base,.hs[data-part=conversion] .hs-glow--conversion,.hs[data-part=international] .hs-glow--international,.hs[data-part=privacy] .hs-glow--privacy{opacity:1}
.hs-grid{position:relative;height:100%;max-width:72rem;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:28px 56px;align-items:center}
/* rail */
.hs-rail{display:flex;flex-direction:column;gap:18px;align-self:center}
.hs-rail button{all:unset;cursor:pointer;position:relative;width:24px;height:24px;display:grid;place-items:center}
.hs-rail i{width:8px;height:8px;border-radius:999px;background:rgba(11,42,91,.2);transition:transform .3s,background .3s,box-shadow .3s}
.hs-rail button.done i{background:rgba(11,92,255,.45)}
.hs-rail button.on i{background:var(--brand);transform:scale(1.5);box-shadow:0 0 0 5px rgba(11,92,255,.14)}
.hs-rail span{position:absolute;left:30px;white-space:nowrap;font-size:12px;font-weight:700;color:var(--ink);background:#fff;padding:4px 10px;border-radius:999px;box-shadow:0 8px 20px -10px rgba(11,42,91,.45);opacity:0;translate:-4px 0;transition:opacity .2s,translate .2s;pointer-events:none}
.hs-rail button:hover span,.hs-rail button:focus-visible span{opacity:1;translate:0 0}
.hs-rail button:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:999px}
/* stage + parts */
.hs-stage{position:relative;height:100%}
.hs-part{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;opacity:0;visibility:hidden;transform:translateY(22px);transition:opacity .28s cubic-bezier(.22,1,.36,1),transform .42s cubic-bezier(.22,1,.36,1),visibility 0s .42s}
.hs[data-dir=up] .hs-part:not(.is-active){transform:translateY(22px)}
.hs-part.is-past{transform:translateY(-22px)}
.hs-part.is-active{opacity:1;visibility:visible;transform:none;transition-delay:0s,0s,0s}
.hs-eyebrow{margin:0;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
.hs-h1{margin:14px 0 0;font-size:clamp(36px,4.5vw,64px);line-height:1.03;font-weight:800;letter-spacing:-.035em}
.hs-h2{margin:10px 0 0;font-size:clamp(30px,3.6vw,50px);line-height:1.06;font-weight:800;letter-spacing:-.03em}
.hs-h2--calc{font-size:clamp(24px,2.5vw,34px);line-height:1.12;letter-spacing:-.025em;max-width:34rem}
.hs-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.hs-w>span{display:inline-block;transform:translateY(105%);transition:transform .5s cubic-bezier(.22,1,.36,1);transition-delay:calc(min(var(--i) * 14ms, .22s))}
.is-active .hs-w>span{transform:none}
.hs-in{opacity:0;transform:translateY(12px);transition:opacity .4s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1);transition-delay:calc(min(var(--d,0) * 18ms, .32s))}
.is-active .hs-in{opacity:1;transform:none}
.hs-lede{margin:22px 0 0;max-width:34rem;font-size:clamp(17px,1.4vw,21px);line-height:1.55;color:var(--muted)}
.hs-lede strong{font-weight:800}
.hs-body{margin:16px 0 0;max-width:34rem;font-size:16.5px;line-height:1.6;color:var(--muted)}
.hs-ctas{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:30px}
.hs-btn{display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:0 28px;border-radius:999px;background:var(--brand);color:#fff;font-weight:700;font-size:17px;text-decoration:none;box-shadow:0 14px 30px -12px rgba(11,92,255,.6);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
.hs-btn:hover{background:#0a4fe0;transform:translateY(-2px);box-shadow:0 18px 36px -12px rgba(11,92,255,.65)}
.hs-pill{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:6px 20px 6px 8px;border-radius:999px;border:2px solid rgba(11,92,255,.22);background:#fff;text-decoration:none;color:var(--ink);transition:border-color .2s,transform .2s}
.hs-pill:hover{border-color:var(--brand);transform:translateY(-2px)}
.hs-pill b{display:block;font-size:15px;font-weight:800}
.hs-pill small{display:block;font-size:13px;font-weight:600;color:var(--brand)}
.hs-play{position:relative;width:40px;height:40px;border-radius:999px;background:var(--brand);flex:none;box-shadow:0 0 0 6px rgba(11,92,255,.12)}
.hs-play::after{content:"";position:absolute;left:16px;top:12px;border-style:solid;border-width:8px 0 8px 12px;border-color:transparent transparent transparent #fff}
.hs-link{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:15px;color:var(--brand);text-decoration:none}
.hs-link:hover{text-decoration:underline}
.hs-btn:focus-visible,.hs-pill:focus-visible,.hs-link:focus-visible,.hs-chips button:focus-visible,.hs-guard:focus-visible{outline:3px solid var(--brand);outline-offset:3px}
.hs-cue{display:flex;align-items:center;gap:10px;margin:40px 0 0;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#64748b}
.hs-cue span{width:22px;height:34px;border-radius:12px;border:2px solid #94a3b8;position:relative}
.hs-cue span::after{content:"";position:absolute;left:50%;top:6px;width:4px;height:7px;margin-left:-2px;border-radius:2px;background:var(--brand);animation:hs-wheel 1.6s ease-in-out infinite}
@keyframes hs-wheel{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(10px)}}
/* calculator */
.hs-calc{margin-top:20px;max-width:37rem;padding:6px 24px 4px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(11,42,91,.06),0 24px 50px -28px rgba(11,42,91,.4);border:1px solid #e6edf7}
.hs-cq{padding:16px 0;border-bottom:1px solid #e8eef6}
.hs-cq-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.hs-cq-t{display:block;margin:0;font-size:17px;font-weight:700;line-height:1.3;color:var(--ink);letter-spacing:-.01em}
.hs-cq-t small{display:block;margin-top:3px;font-size:13.5px;font-weight:500;color:#64748b;letter-spacing:0}
.hs-val{flex:none;min-width:84px;padding:8px 14px;border-radius:14px;background:#eef4ff;color:var(--brand);font-size:26px;font-weight:800;line-height:1.1;text-align:center;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hs-leads-in{width:112px;border:2px solid #d3e1f8;font-family:inherit;outline:none;cursor:text;transition:border-color .2s,box-shadow .2s,background .2s}
.hs-leads-in:hover{border-color:#9db9ea}
.hs-leads-in:focus{border-color:var(--brand);background:#fff;box-shadow:0 0 0 4px rgba(11,92,255,.15)}
.hs-ends{display:flex;justify-content:space-between;margin:6px 0 0;font-size:13px;font-weight:600;color:#64748b;font-variant-numeric:tabular-nums}
.hs-conv-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;margin-top:12px;font-size:14px;font-weight:700;color:#334155;font-variant-numeric:tabular-nums}
.hs-conv-row .hs-range{margin:0}
.hs-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;margin:14px 0 0;border-radius:999px;outline:none;cursor:pointer;background:linear-gradient(90deg,var(--brand) var(--p,11%),#e3eaf5 var(--p,11%))}
.hs-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:999px;background:#fff;border:3px solid var(--brand);box-shadow:0 4px 12px rgba(11,92,255,.35)}
.hs-range::-moz-range-thumb{width:20px;height:20px;border-radius:999px;background:#fff;border:3px solid var(--brand)}
.hs-range:focus-visible{box-shadow:0 0 0 4px rgba(11,92,255,.2)}
.hs-chips{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}
.hs-chips button{all:unset;cursor:pointer;height:38px;padding:0 11px;border-radius:999px;background:#f1f5f9;font-size:15px;font-weight:700;color:#334155;transition:background .2s,color .2s,box-shadow .2s}
.hs-custom{display:flex;gap:8px;margin-top:10px}
.hs-custom[hidden]{display:none}
.hs-custom-field{flex:1;display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:12px;border:1.5px solid #cfdcf0;background:#fff;font-size:17px;font-weight:700;color:var(--ink);transition:border-color .2s,box-shadow .2s}
.hs-custom-field:focus-within{border-color:var(--brand);box-shadow:0 0 0 4px rgba(11,92,255,.15)}
.hs-custom-field input{all:unset;flex:1;min-width:0;font-size:17px;font-weight:700;color:var(--ink)}
.hs-custom-field input::placeholder{color:#94a3b8;font-weight:500}
.hs-custom-unit{height:44px;padding:0 12px;border-radius:12px;border:1.5px solid #cfdcf0;background:#f8fafc;font:inherit;font-size:15px;font-weight:700;color:#334155;cursor:pointer}
.hs-custom-unit:focus-visible{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px rgba(11,92,255,.15)}
.hs-chips button[aria-pressed=true]{background:var(--brand);color:#fff;box-shadow:0 6px 16px -6px rgba(11,92,255,.6)}
.hs-res{padding:4px 0}
.hs-res-row{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);align-items:center;padding:12px 0}
.hs-res-row+.hs-res-row{border-top:1px solid #e8eef6}
.hs-res-row p{margin:0;padding-right:16px;border-right:1px solid #e2e8f0;font-size:15px;font-weight:700;line-height:1.3;color:var(--ink)}
.hs-res-row small{display:block;margin-top:3px;font-size:13px;font-weight:500;color:#64748b}
.hs-res-row b{padding-left:20px;font-size:calc(clamp(22px,2.1vw,30px) * var(--fit,1));font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}
.hs-won{color:#1e9e50}
.hs-loss-num{color:#d92d2d}
.hs-loss{transform-origin:left center}
@keyframes hs-hit{0%{transform:scale(1)}30%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes hs-flash{0%{box-shadow:0 0 0 0 rgba(229,72,77,.45)}100%{box-shadow:0 0 0 16px rgba(229,72,77,0)}}
.hs-hit{animation:hs-hit .5s cubic-bezier(.22,1,.36,1),hs-flash .8s ease-out}
/* map */
.hs-map{margin-top:22px;max-width:30rem}
.hs-map svg{display:block;width:100%;height:auto;overflow:visible}
.hs-arc{fill:none;stroke:#19b8f2;stroke-width:2;stroke-linecap:round;stroke-dasharray:4 6;opacity:.9}
.hs-home{fill:var(--brand);stroke:#fff;stroke-width:3;filter:drop-shadow(0 4px 8px rgba(11,92,255,.5))}
.hs-city{fill:#fff;stroke:#19b8f2;stroke-width:3}
.hs-tl{font-size:12px;font-weight:700;fill:var(--ink);text-anchor:middle}
.hs-tl--home{fill:var(--brand)}
/* locks */
.hs-locks{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px;max-width:30rem}
.hs-lock,.hs-ans{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #e6edf7;box-shadow:0 12px 28px -22px rgba(11,42,91,.5)}
.hs-lock b,.hs-ans b{display:block;font-size:15px;font-weight:800;color:var(--ink)}
.hs-lock small,.hs-ans small{display:block;margin-top:2px;font-size:13.5px;line-height:1.45;color:var(--muted)}
.hs-lock>span:nth-child(2){flex:1}
.hs-ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#eaf2fe;color:var(--brand)}
.hs-ic--grad{background:linear-gradient(135deg,#0b2a5b,#0b5cff);color:#fff;box-shadow:0 0 0 5px rgba(11,92,255,.1)}
.hs-switch{flex:none;position:relative;width:40px;height:24px;border-radius:999px;background:#cbd5e1;transition:background .3s;transition-delay:calc(.3s + var(--k) * .08s)}
.hs-switch::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:999px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.22,1,.36,1);transition-delay:calc(.3s + var(--k) * .08s)}
.is-active .hs-switch{background:#10a36a}
.is-active .hs-switch::after{transform:translateX(16px)}
/* answers */
.hs-answers{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px;max-width:32rem}
.hs-ans{align-items:flex-start;padding:16px}
/* demo */
.hs-demo{position:relative;align-self:center}
.hs-frame{position:relative;aspect-ratio:4/4.3;max-height:calc(100vh - var(--hs-top,64px) - 64px);margin-left:auto;border-radius:28px;overflow:hidden;background:#0b1424;box-shadow:0 40px 80px -36px rgba(11,42,91,.55),0 0 0 1px rgba(11,42,91,.08);transition:transform .8s cubic-bezier(.22,1,.36,1)}
.hs[data-part=conversion] .hs-frame{box-shadow:0 40px 80px -36px rgba(180,40,46,.5),0 0 0 2px rgba(229,72,77,.35)}
.hs[data-part=privacy] .hs-frame{box-shadow:0 40px 80px -36px rgba(16,120,80,.45),0 0 0 2px rgba(16,163,106,.35)}
.hs-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
.hs-frame::before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,#0b1424 30%,#17233a 50%,#0b1424 70%);background-size:250% 100%;opacity:0;transition:opacity .4s}
.hs-frame.is-loading::before,.hs-frame:not(:has(iframe[src]))::before{opacity:1;animation:hs-shimmer 1.6s linear infinite}
@keyframes hs-shimmer{to{background-position:-150% 0}}
.hs-guard{all:unset;position:absolute;inset:0;cursor:pointer}
/* the permanent line under the tour */
.hs-hint{margin:10px 0 0;text-align:center;font-size:12.5px;font-weight:600;letter-spacing:.01em;color:#64748b}
.hs-frame.is-open .hs-guard{pointer-events:none;visibility:hidden}
.hs-steps{display:none}
/* motion-only extras */
@media (prefers-reduced-motion:no-preference){
  .hs-arc{stroke-dasharray:4 6;animation:hs-flow 1.2s linear infinite}
  .hs-part:not(.is-active) .hs-arc{animation:none}
  .hs-city{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .45s cubic-bezier(.34,1.56,.64,1);transition-delay:calc(.2s + var(--k) * .06s)}
  .is-active .hs-city{transform:scale(1)}
  .hs-tl:not(.hs-tl--home){opacity:0;transition:opacity .4s;transition-delay:calc(.3s + var(--k) * .06s)}
  .is-active .hs-tl{opacity:1}
}
@keyframes hs-flow{to{stroke-dashoffset:-20}}
@media (prefers-reduced-motion:reduce){
  .hs-part,.hs-w>span,.hs-in,.hs-switch,.hs-switch::after,.hs-frame,.hs-glow{transition:none!important}
  .hs-cue span::after{animation:none}
}
/* phones and small tablets: demo pinned on top, the story underneath */
@media (max-width:1023px){
  .hs-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);align-items:stretch;gap:12px;padding:12px 16px 0}
  .hs-rail{display:none}
  .hs-demo{grid-row:1}
  .hs-frame{aspect-ratio:auto;height:calc(38svh - 18px);max-height:none;border-radius:20px;margin:0}
  .hs-hint{margin-top:6px;font-size:11.5px;line-height:1.2}
  .hs-stage{grid-row:2}
  .hs-part{justify-content:flex-start;padding-top:14px}
  .hs-eyebrow{font-size:11px}
  .hs-h1{font-size:clamp(28px,7.6vw,40px);margin-top:8px}
  .hs-h2{font-size:clamp(25px,6.6vw,36px);margin-top:4px}
  .hs-h2--calc{font-size:clamp(17px,4.6vw,22px);line-height:1.18}
  .hs-lede{font-size:15.5px;margin-top:12px}
  .hs-body{font-size:14.5px;margin-top:10px}
  .hs-ctas{margin-top:16px;gap:10px}
  .hs-btn{min-height:50px;padding:0 22px;font-size:15.5px}
  .hs-pill{min-height:50px}
  .hs-pill b{font-size:13.5px}.hs-pill small{font-size:12px}
  .hs-play{width:34px;height:34px}.hs-play::after{left:13px;top:10px;border-width:7px 0 7px 10px}
  .hs-cue{display:none}
  .hs-calc{margin-top:10px;padding:0 14px;border-radius:18px}
  .hs-cq{padding:9px 0}
  .hs-cq-t{font-size:14px}
  .hs-cq-t small{font-size:11.5px;margin-top:1px}
  .hs-val{min-width:58px;padding:4px 10px;border-radius:10px;font-size:18px}
  .hs-leads-in{width:84px}
  .hs-range{margin-top:8px}
  .hs-ends{display:none}
  .hs-conv-row{margin-top:6px;gap:10px;font-size:12px}
  .hs-chips{gap:5px;margin-top:7px;flex-wrap:nowrap}
  .hs-chips button{flex:1 1 0;min-width:0;height:30px;padding:0;text-align:center;font-size:12px}
  .hs-chips .hs-chip-custom{flex:1.45 1 0}
  .hs-custom{margin-top:6px;gap:6px}
  .hs-custom-field,.hs-custom-unit{height:34px;border-radius:10px;font-size:14px}
  .hs-custom-field input{font-size:15px}
  .hs-res{padding:0}
  .hs-res-row{padding:7px 0}
  .hs-res-row p{font-size:12.5px;padding-right:10px}
  .hs-res-row small{font-size:11px;margin-top:1px}
  .hs-res-row b{padding-left:12px;font-size:calc(19px * var(--fit,1))}
  .hs-map{margin-top:10px}
  .hs-locks{margin-top:10px;gap:7px}
  .hs-lock{padding:9px 12px;gap:10px}
  .hs-lock small{display:none}
  .hs-ic{width:34px;height:34px}
  .hs-answers{margin-top:12px;gap:8px}
  .hs-ans{padding:10px 12px}
  .hs-ans small{display:none}
  .hs-ans{align-items:center}
  .hs-link{display:none}
  .hs-steps{position:absolute;left:16px;right:16px;bottom:10px;display:flex;gap:6px}
  .hs-steps i{flex:1;height:3px;border-radius:3px;background:rgba(11,42,91,.14);transition:background .3s}
  .hs-steps i.on{background:var(--brand)}
}

/* short laptop screens: keep every part inside the pinned area */
@media (min-width:1024px) and (max-height:820px){
  .hs-h1{font-size:clamp(32px,3.7vw,50px)}
  .hs-h2{font-size:clamp(28px,3vw,40px)}
  .hs-h2--calc{font-size:clamp(21px,2.1vw,27px)}
  .hs-lede{margin-top:14px;font-size:17px}
  .hs-body{margin-top:10px;font-size:15.5px}
  .hs-ctas{margin-top:20px}
  .hs-cue{margin-top:22px}
  .hs-calc{margin-top:12px;padding:2px 20px}
  .hs-cq{padding:10px 0}
  .hs-cq-t{font-size:15.5px}
  .hs-cq-t small{font-size:12.5px}
  .hs-val{font-size:21px;padding:5px 12px}
  .hs-leads-in{width:100px}
  .hs-range{margin-top:10px}
  .hs-conv-row{margin-top:8px}
  .hs-chips{margin-top:8px}
  .hs-chips button{height:33px;padding:0 13px;font-size:14px}
  .hs-res-row{padding:8px 0}
  .hs-res-row b{font-size:calc(25px * var(--fit,1))}
  .hs-map{margin-top:12px;max-width:26rem}
  .hs-locks{margin-top:12px;gap:8px}
  .hs-lock{padding:9px 12px}
  .hs-lock small{display:none}
  .hs-answers{margin-top:12px;gap:8px}
  .hs-ans{padding:11px 14px}
  .hs-ans small{font-size:13px}
}
@media (min-width:1024px) and (max-height:680px){
  .hs-ans small{font-size:12.5px;line-height:1.4}
  .hs-ans{padding:9px 12px}
}

/* opening line: navy question, red follow-up, hand-drawn underline */
.hs-h1--hero{font-size:clamp(32px,3.7vw,54px);line-height:1.06}
.hs-red{display:block;margin-top:.12em;color:#d92d2d}
.hs-mark{position:relative;display:inline-block;white-space:nowrap}
.hs-scribble{position:absolute;left:-2%;right:-2%;bottom:-.24em;width:104%;height:.32em;overflow:visible}
.hs-scribble path{fill:none;stroke:#d92d2d;stroke-width:4;stroke-linecap:round;vector-effect:non-scaling-stroke;stroke-dasharray:320;stroke-dashoffset:0}
@media (prefers-reduced-motion:no-preference){
  .hs-scribble path{stroke-dashoffset:320;transition:stroke-dashoffset .6s cubic-bezier(.65,0,.35,1) .35s}
  .is-active .hs-scribble path{stroke-dashoffset:0}
}
/* how VPV helps: solid blue tiles */
.hs-ic--grad{background:linear-gradient(140deg,#2f7bff,#0b4fe0);border-radius:14px;box-shadow:0 0 0 5px rgba(11,92,255,.12),0 10px 18px -8px rgba(11,92,255,.6)}
.hs-ans b{font-size:16px}
@media (min-width:1024px) and (max-height:820px){.hs-h1--hero{font-size:clamp(28px,3vw,42px)}}
@media (max-width:1023px){.hs-h1--hero{font-size:clamp(25px,6.6vw,36px)}}
/* short phones: the calculator keeps only what it needs to fit */
@media (max-width:1023px) and (max-height:780px){
  .hs-calc .hs-cq-t small,.hs-res-row small{display:none}
  .hs-cq{padding:7px 0}
  .hs-res-row{padding:5px 0}
  .hs-res-row b{font-size:calc(17px * var(--fit,1))}
}
/* phones: the calculator gets the room it needs (Nov 2026). Every part stops
   above the progress bar; when one still does not fit, the tour gives up
   height (fitPart in story.ts); the WhatsApp button steps aside while the
   calculator shows, so it cannot cover the results. */
@media (max-width:1023px){
  .hs-part{bottom:22px}
  .hs-part[data-i="1"]{padding-top:8px}
  [data-testid=floating-whatsapp]{transition:opacity .2s ease,transform .2s ease}
  html.hs-on:has(.hs[data-part=conversion]) [data-testid=floating-whatsapp]{opacity:0;transform:scale(.6);pointer-events:none}
}
`;var Y=3,wt=[5,10,25,50,100,500],kt=n=>n>=100?`\u20B9${n/100}CR`:`\u20B9${n}L`,h={min:100,max:5e3,step:50,start:1e3},Qe=100,_={min:1,max:50},Et=1500,q=n=>{let r=a=>{let i=a>=1e3?0:2;return a.toLocaleString("en-IN",{minimumFractionDigits:i,maximumFractionDigits:i})};return n>=1e7?`\u20B9${r(n/1e7)} Crore`:`\u20B9${r(n/1e5)} Lakh`},ue='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';var L={link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',device:'<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',chart:'<path d="M3 21h18"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/>',trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'},et=(n,r=20)=>`<svg viewBox="0 0 24 24" width="${r}" height="${r}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${n}</svg>`,M=(n,r=0)=>n.split(" ").map((a,i)=>`<span class="hs-w"><span style="--i:${r+i}">${a}</span></span>`).join(" "),me=[{id:"exhibitions",label:"Exhibitions",weight:1.1},{id:"conversion",label:"Conversion",weight:1.5},{id:"international",label:"International buyers",weight:1.1},{id:"privacy",label:"Privacy",weight:1.1},{id:"helps",label:"How VPV helps",weight:1.5}],tt=!1;function $t(n){if(!tt){let e=document.createElement("style");e.id="hs-style",e.textContent=Je,document.head.appendChild(e),tt=!0}let r=matchMedia("(prefers-reduced-motion: reduce)").matches,a=document.createElement("section");a.className="hs",a.setAttribute("data-testid","home-story"),a.innerHTML=`
  <div class="hs-pin">
    ${["base","conversion","international","privacy"].map(e=>`<div class="hs-glow hs-glow--${e}" aria-hidden="true"></div>`).join("")}
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-story-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1 hs-h1--hero" data-testid="landing-heading">${M("You spend lakhs meeting global buyers in exhibitions.")}<span class="hs-red">${M("How much business are you losing",8)} <span class="hs-mark">${M("after they leave?",14)}<svg class="hs-scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 60 5, 140 4, 297 9"/></svg></span></span></h1>
          <p class="hs-lede hs-in" style="--d:14">Meeting a buyer is just the beginning. <strong>You need to give them enough proof, confidence and reasons to choose you</strong>, even after the exhibition is over.</p>
          <div class="hs-ctas hs-in" style="--d:16">
            <a class="hs-btn" href="/why-vpv" data-testid="home-story-why-vpv">Why VPV? ${ue}</a>
            <a class="hs-pill" href="/case-studies" data-testid="home-story-case-study"><span class="hs-play" aria-hidden="true"></span><span><b>80%+ conversion with VPV</b><small>Anuj Anand's story \xB7 See here</small></span></a>
          </div>
          <p class="hs-cue hs-in" style="--d:18" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <h2 class="hs-h2 hs-h2--calc">${M("What's the cost of not giving buyers enough confidence to buy from you?")}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-leads">Total Qualified Leads in 5 Years</label><input id="hs-leads-num" class="hs-val hs-leads-in" type="text" inputmode="numeric" autocomplete="off" maxlength="7" value="0" aria-label="Total qualified leads in 5 years: type a number from ${h.min} to ${h.max}"></div>
              <input id="hs-leads" class="hs-range hs-range--leads" type="range" min="${h.min}" max="${h.max}" step="${h.step}" value="${h.start}">
              <p class="hs-ends"><span>${h.min.toLocaleString("en-IN")}</span><span>${h.max.toLocaleString("en-IN")}</span></p>
            </div>
            <div class="hs-cq">
              <p class="hs-cq-t" id="hs-value-t">Average Potential Business Per Lead Year</p>
              <div class="hs-chips" role="group" aria-labelledby="hs-value-t">${wt.map(e=>`<button type="button" data-v="${e}" aria-pressed="${e===Qe}">${kt(e)}</button>`).join("")}<button type="button" class="hs-chip-custom" aria-pressed="false" aria-expanded="false" aria-controls="hs-custom-box">Custom</button></div>
              <div class="hs-custom" id="hs-custom-box" hidden>
                <label class="hs-custom-field"><span aria-hidden="true">\u20B9</span><input id="hs-custom" type="text" inputmode="decimal" autocomplete="off" placeholder="Type an amount" aria-label="Your own business per lead, a year"></label>
                <select class="hs-custom-unit" aria-label="Unit"><option value="1">Lakh</option><option value="100" selected>Crore</option></select>
              </div>
            </div>
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-conv">Your current conversion ratio?<small>What % of leads turn into business?</small></label><output class="hs-val hs-conv-out" for="hs-conv">${Y}%</output></div>
              <div class="hs-conv-row"><span>${_.min}%</span><input id="hs-conv" class="hs-range hs-range--conv" type="range" min="${_.min}" max="${_.max}" step="1" value="${Y}"><span>${_.max}%</span></div>
            </div>
            <div class="hs-res" aria-live="polite">
              <div class="hs-res-row"><p>Business you win<small class="hs-won-sub">(at ${Y}% conversion)</small></p><b class="hs-won">\u20B90</b></div>
              <div class="hs-res-row hs-loss"><p>Business going to competition<small class="hs-lost-sub">(remaining ${100-Y}% leads)</small></p><b class="hs-loss-num">\u20B90</b></div>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2">${M("Give international buyers the confidence to choose you.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Walk an international buyer through your plant on Zoom, with no travel on either side. Send your VPV with your company profile, so they understand your capability before deciding on a physical audit.</p>
          <div class="hs-map hs-in" style="--d:7" aria-hidden="true">
            <svg viewBox="0 0 440 150">
              <path class="hs-arc" style="--k:0" d="M300 104 Q255 40 190 58"/>
              <path class="hs-arc" style="--k:1" d="M300 104 Q230 20 120 44"/>
              <path class="hs-arc" style="--k:2" d="M300 104 Q190 10 64 66"/>
              <path class="hs-arc" style="--k:3" d="M300 104 Q360 50 392 92"/>
              <path class="hs-arc" style="--k:4" d="M300 104 Q286 48 330 30"/>
              <path class="hs-arc" style="--k:5" d="M300 104 Q376 4 414 44"/>
              <circle class="hs-home" cx="300" cy="104" r="7"/>
              <circle class="hs-city" style="--k:0" cx="190" cy="58" r="5"/><circle class="hs-city" style="--k:1" cx="120" cy="44" r="5"/>
              <circle class="hs-city" style="--k:2" cx="64" cy="66" r="5"/><circle class="hs-city" style="--k:3" cx="392" cy="92" r="5"/>
              <circle class="hs-city" style="--k:4" cx="330" cy="30" r="5"/><circle class="hs-city" style="--k:5" cx="414" cy="44" r="5"/>
              <text class="hs-tl hs-tl--home" x="300" y="130">Your factory</text>
              <text class="hs-tl" style="--k:0" x="196" y="80">Dubai</text><text class="hs-tl" style="--k:1" x="120" y="30">Frankfurt</text>
              <text class="hs-tl" style="--k:2" x="64" y="52">Paris</text><text class="hs-tl" style="--k:3" x="392" y="78">Singapore</text>
              <text class="hs-tl" style="--k:4" x="330" y="16">Russia</text><text class="hs-tl" style="--k:5" x="414" y="30">USA</text>
            </svg>
          </div>
        </article>

        <article class="hs-part" data-i="3">
          <h2 class="hs-h2">${M("Show your factory only to buyers. Keep competitors out.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Decide exactly who gets to see your factory.</p>
          <ul class="hs-locks">
            ${[[L.link,"One-time view links"],[L.timer,"Control link expiry time"],[L.device,"Limit device access"],[L.key,"Password protected link"]].map(([e,t],s)=>`<li class="hs-lock hs-in" style="--d:${6+s}"><span class="hs-ic">${et(e,18)}</span><span><b>${t}</b></span><i class="hs-switch" style="--k:${s}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">How VPV helps</p>
          <h2 class="hs-h2">${M("Buyers trust what they can see.")}</h2>
          <ol class="hs-answers">
            ${[[L.zap,"Up to 70% Faster Deal Closures","Buyers get all the key factory information they need, so decisions happen sooner."],[L.chart,"Up to 50% Increased Conversion Ratio","More of your exhibition and online leads turn into real business."],[L.trophy,"Helps Differentiate from your competition","Show real operations, scale and quality, something most competitors still don't."]].map(([e,t,s],o)=>`<li class="hs-ans hs-in" style="--d:${4+o*2}"><span class="hs-ic hs-ic--grad">${et(e,20)}</span><span><b>${t}</b><small>${s}</small></span></li>`).join("")}
          </ol>
          <div class="hs-ctas hs-in" style="--d:11">
            <a class="hs-btn" href="/plans" data-testid="home-story-cta">Find the Right VPV for Your Factory ${ue}</a>
            <a class="hs-link" href="/why-vpv">See everything VPV does ${ue}</a>
          </div>
        </article>
      </div>

      <div class="hs-demo" data-testid="home-story-demo">
        <div class="hs-frame">
          <iframe data-src="/experience" title="Live VPV: walk through a real factory in 360\xB0" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay" allowfullscreen></iframe>
          <button type="button" class="hs-guard" aria-label="Click to explore the live factory tour"></button>
        </div>
        <p class="hs-hint">Drag to explore, click to experience</p>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${me.map(()=>"<i></i>").join("")}</div>
  </div>`,n.appendChild(a);let i=e=>a.querySelector(e),d=Array.from(a.querySelectorAll(".hs-part")),z=Array.from(a.querySelectorAll(".hs-steps i")),B=i(".hs-pin"),C=i(".hs-range--leads"),J=i(".hs-range--conv"),u=i(".hs-leads-in"),nt=i(".hs-conv-out"),Q=i(".hs-loss-num"),ee=i(".hs-loss"),fe=i(".hs-won"),st=i(".hs-won-sub"),at=i(".hs-lost-sub"),ge=Array.from(a.querySelectorAll(".hs-chips button[data-v]")),te=i(".hs-chip-custom"),xe=i(".hs-custom"),ne=i("#hs-custom"),be=i(".hs-custom-unit"),l={leads:h.start,valueLakh:Qe,conv:Y},y=!1,it=()=>({leads:Math.max(1,Math.round(l.leads/5)),valueLakh:Math.min(1e4,Math.max(.1,l.valueLakh)),conv:l.conv,lift:5}),w="leads",I=0,D=0,se=0,U=0,ae=!1,ot=e=>{if(cancelAnimationFrame(D),r){I=e,Q.textContent=q(e);return}let t=I,s=performance.now(),o=p=>{let g=Math.min(1,(p-s)/700),E=1-Math.pow(1-g,3);I=t+(e-t)*E,Q.textContent=q(I),g<1&&(D=requestAnimationFrame(o))};D=requestAnimationFrame(o)},ve=(e,t)=>e.style.setProperty("--fit",t.length>15?".7":t.length>13?".85":"1"),ye=(e,t,s,o)=>e.style.setProperty("--p",`${(t-s)/(o-s)*100}%`),V=()=>{let e=l.leads*l.valueLakh*1e5,t=e*l.conv/100,s=e-t;document.activeElement!==u&&(u.value=l.leads.toLocaleString("en-IN")),nt.textContent=`${l.conv}%`,ye(C,l.leads,h.min,h.max),ye(J,l.conv,_.min,_.max),fe.textContent=q(t),ve(fe,q(t)),ve(Q,q(s)),st.textContent=`(at ${l.conv}% conversion)`,at.textContent=`(remaining ${100-l.conv}% leads)`,ot(s),s>se+1&&se>0&&!r&&(ee.classList.remove("hs-hit"),ee.offsetWidth,ee.classList.add("hs-hit")),se=s,ge.forEach(o=>o.setAttribute("aria-pressed",String(!y&&Number(o.dataset.v)===l.valueLakh))),te.setAttribute("aria-pressed",String(y)),te.setAttribute("aria-expanded",String(y)),xe.hidden===y&&(xe.hidden=!y,N())},we=(e=!1)=>{clearTimeout(U),ae&&(ae=!1,Ze("calculator_used",Ke(it(),{field:w}),{beacon:e,path:"/"}))},S=()=>{ae=!0,clearTimeout(U),U=window.setTimeout(()=>we(),Et),V()};C.addEventListener("input",()=>{l.leads=Number(C.value),w="leads",S()});let rt=()=>parseInt(u.value.replace(/\D/g,""),10);u.addEventListener("focus",()=>u.select()),u.addEventListener("input",()=>{let e=u.value.replace(/\D/g,"");e!==u.value&&(u.value=e);let t=parseInt(e,10);t>=h.min&&t<=h.max&&(l.leads=t,C.value=String(t),w="leads",S())});let lt=()=>{let e=rt(),t=Number.isFinite(e)?Math.min(h.max,Math.max(h.min,e)):l.leads;t!==l.leads&&(l.leads=t,C.value=String(t),w="leads",S()),u.value=t.toLocaleString("en-IN")};u.addEventListener("blur",lt),u.addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),u.blur())}),J.addEventListener("input",()=>{l.conv=Number(J.value),w="conv",S()}),ge.forEach(e=>e.addEventListener("click",()=>{y=!1,l.valueLakh=Number(e.dataset.v),w="valueLakh",S()}));let ie=()=>{let e=parseFloat(ne.value.replace(/[^0-9.]/g,""));e>0&&(l.valueLakh=e*Number(be.value),w="valueLakh",S())};te.addEventListener("click",()=>{y=!0,V(),ne.focus(),ie()}),ne.addEventListener("input",ie),be.addEventListener("change",ie);let j=()=>we(!0),ke=()=>{document.visibilityState==="hidden"&&j()};addEventListener("pagehide",j),document.addEventListener("visibilitychange",ke);let m=i(".hs-frame"),oe=i(".hs-guard"),Ee=()=>m.classList.add("is-open"),Le=()=>m.classList.remove("is-open");oe.addEventListener("click",Ee);let Me=-1e4;oe.addEventListener("wheel",()=>{Me=performance.now()},{passive:!0}),oe.addEventListener("pointermove",e=>{e.pointerType!=="mouse"||performance.now()-Me<900||Math.abs(e.movementX)+Math.abs(e.movementY)<2||Ee()}),m.addEventListener("mouseleave",Le);let Se=e=>{m.contains(e.target)||Le()};document.addEventListener("touchstart",Se,{passive:!0});let T=i(".hs-frame iframe"),Te=()=>{T.src||(T.src=T.dataset.src||"/experience"),m.classList.add("is-loading"),T.addEventListener("load",()=>m.classList.remove("is-loading"),{once:!0})},Ae=e=>"requestIdleCallback"in window?window.requestIdleCallback(e,{timeout:1200}):setTimeout(e,300);document.readyState==="complete"?Ae(Te):addEventListener("load",()=>Ae(Te),{once:!0});let _e=e=>{try{T.contentWindow?.postMessage({type:"vpv-hero-scene",index:e},location.origin)}catch{}},ze=e=>{e.origin!==location.origin||e.source!==T.contentWindow||e.data&&e.data.type==="vpv-hero-ready"&&_e(Math.max(0,c))};addEventListener("message",ze);let f=me.length;a.style.setProperty("--hs-parts",String(f));let $=()=>{let e=document.getElementById("vpv-site-header");return e?e.getBoundingClientRect().height:0},Ce=()=>Math.max(1,a.offsetHeight-(innerHeight-$())),Ie=()=>Math.min(1,Math.max(0,($()-a.getBoundingClientRect().top)/Ce())),W=e=>Math.round(a.getBoundingClientRect().top+scrollY-$()+e/(f-1)*Ce()),K=()=>{let e=a.getBoundingClientRect();return e.top<=$()+2&&e.bottom>=innerHeight-2},c=-1,$e=e=>{if(e===c)return;let t=e>c?"down":"up";d.forEach((s,o)=>{s.classList.toggle("is-active",o===e),s.classList.toggle("is-past",o<e),s.setAttribute("aria-hidden",String(o!==e)),s.inert=o!==e}),a.dataset.dir=t,a.dataset.part=me[e].id,z.forEach((s,o)=>s.classList.toggle("on",o<=e)),e===1&&c!==1&&(I=0,V()),c=e,_e(e)},ct=matchMedia("(max-width: 1023px)"),Ne=e=>{let t=Array.from(e.children).filter(ht=>getComputedStyle(ht).display!=="none"),s=t[0],o=t[t.length-1];if(!s||!o)return{need:0,room:1,by:0};let p=getComputedStyle(e),g=getComputedStyle(s),E=getComputedStyle(o),v=o.offsetTop+o.offsetHeight+parseFloat(E.marginBottom)-(s.offsetTop-parseFloat(g.marginTop)),F=e.clientHeight-parseFloat(p.paddingTop)-parseFloat(p.paddingBottom)-6;return{need:v,room:F,by:v-F}},N=()=>{if(!n.isConnected)return;d.forEach(t=>t.style.removeProperty("zoom")),m.style.removeProperty("height");let e=Math.max(...d.map(t=>Ne(t).by));if(e>0&&ct.matches){let t=m.offsetHeight,s=Math.round(B.clientHeight*.25);t>s&&(m.style.height=`${Math.max(s,t-e-2)}px`)}d.forEach(t=>{let s=Ne(t);s.by>0&&t.style.setProperty("zoom",String(Math.max(.72,Math.floor(s.room/s.need*100)/100)))})},k=!1,X=0,re=0,x=-1,He=e=>scrollTo({top:e,behavior:"instant"}),le=(e,t,s)=>{cancelAnimationFrame(X);let o=scrollY,p=e-o;if(r||Math.abs(p)<2){He(e),k=!1,x=-1;return}k=!0;let g=performance.now(),E=v=>{let F=Math.min(1,(v-g)/t);He(o+p*s(F)),F<1?X=requestAnimationFrame(E):(k=!1,x=-1)};X=requestAnimationFrame(E)},pt=e=>1-Math.pow(1-e,3),Oe=e=>1-Math.pow(1-e,4),ce=e=>{e<0||e>=f||(x=e,$e(e),le(W(e),480,pt))},Pe=0,Re=-1e9,A=!0,H=0,O=!1,G=0,pe=!1,P=1/0,Fe=e=>{if(e.ctrlKey||!K()||Math.abs(e.deltaY)<Math.abs(e.deltaX))return;let t=e.timeStamp,s=t-Pe;Pe=t;let o=e.deltaMode===1?e.deltaY*33:e.deltaMode===2?e.deltaY*innerHeight:e.deltaY,p=Math.abs(o);s>160?(A=!0,H=0,O=!1):A||(pe?p<P?P=p:p>8&&p>P*1.8+2&&t-Re>200&&(A=!0,H=0):p>G?G=p:p<G*.6&&(pe=!0,P=p));let g=Math.sign(o);if(!g)return;let v=(x>=0?x:c)+g;if(v<0||v>=f){A&&!k&&Math.abs(scrollY-W(c))<4&&(O=!0),O||e.preventDefault();return}O||(e.preventDefault(),A&&(H+=o,Math.abs(H)>=4&&(A=!1,Re=t,H=0,G=p,pe=!1,P=1/0,ce(v))))},Ye=0,qe=0,b="",de=!1,Z=!1,Be=e=>{de=!0,b="",Z=!1,Ye=e.touches[0].clientY,qe=e.touches[0].clientX,(!K()||e.target.closest?.(".hs-calc"))&&(b="native")},De=e=>{if(b==="native")return;let t=Ye-e.touches[0].clientY,s=qe-e.touches[0].clientX;if(!b){if(Math.abs(t)<6&&Math.abs(s)<6)return;let o=c+Math.sign(t);b=Math.abs(s)>Math.abs(t)||o<0||o>=f?"native":"story"}b==="story"&&(e.preventDefault(),!Z&&Math.abs(t)>28&&(Z=!0,ce(c+Math.sign(t))))},Ue=()=>{de=!1,b==="story"&&!Z&&!k&&le(W(c),260,Oe),b=""},Ve=e=>{if(!K()||e.altKey||e.ctrlKey||e.metaKey)return;let t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)))return;let s=["ArrowDown","PageDown"].includes(e.key)||e.key===" "&&!e.shiftKey?1:["ArrowUp","PageUp"].includes(e.key)||e.key===" "&&e.shiftKey?-1:0,o=(x>=0?x:c)+s;!s||o<0||o>=f||(e.preventDefault(),ce(o))},dt=()=>{if(k||de||O||!K())return;let e=Math.round(Ie()*(f-1)),t=W(e);Math.abs(scrollY-t)>3&&le(t,320,Oe)},R=()=>{if(B.style.setProperty("--hs-top",$()+"px"),k&&x>=0)return;let e=Ie()*(f-1),t=c<0?Math.round(e):e>c?e-c>.33?Math.ceil(e-.33):c:c-e>.33?Math.floor(e+.33):c;$e(Math.min(f-1,Math.max(0,t))),clearTimeout(re),re=window.setTimeout(dt,140)};addEventListener("scroll",R,{passive:!0}),addEventListener("resize",R),addEventListener("resize",N),addEventListener("wheel",Fe,{passive:!1}),addEventListener("touchstart",Be,{passive:!0}),addEventListener("touchmove",De,{passive:!1}),addEventListener("touchend",Ue,{passive:!0}),addEventListener("keydown",Ve),V(),R(),N(),document.fonts?.ready.then(N);let je=new MutationObserver(()=>{n.isConnected||We()});je.observe(document.body,{childList:!0,subtree:!0});function We(){j(),je.disconnect(),cancelAnimationFrame(D),cancelAnimationFrame(X),clearTimeout(U),clearTimeout(re),removeEventListener("scroll",R),removeEventListener("resize",R),removeEventListener("resize",N),removeEventListener("pagehide",j),removeEventListener("wheel",Fe),removeEventListener("touchstart",Be),removeEventListener("touchmove",De),removeEventListener("touchend",Ue),removeEventListener("keydown",Ve),document.removeEventListener("touchstart",Se),removeEventListener("message",ze),document.removeEventListener("visibilitychange",ke)}return We}export{$t as mount};
