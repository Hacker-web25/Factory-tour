function Ve(t){let r=t.leads*t.valueLakh*1e5,n=r*t.conv/100,o=r-n,c=Math.min(t.lift,100-t.conv),w=t.conv+c,P=r*c/100;return{opportunity:r,won:n,lost:o,liftApplied:c,newConv:w,recovered:P}}function Le(t,r={}){let n=Ve(t),o={leads:t.leads,valueLakh:t.valueLakh,conv:t.conv,lift:t.lift,opportunity:Math.round(n.opportunity),recovered:Math.round(n.recovered)};return r.field&&(o.field=r.field),typeof r.saves=="number"&&(o.saves=r.saves),o}var Me="vpv_no_analytics";var je="vpv.attr.v1",Z="vpv.sid.v1";function Se(){try{return window.localStorage}catch{return null}}function Ke(){try{return document.cookie.includes(`${Me}=1`)}catch{return!1}}function Xe(){try{let t=Se()?.getItem(je);return t?JSON.parse(t):null}catch{return null}}function We(){try{let t=Se();if(!t)return null;let r=t.getItem(Z),n=Date.now();if(r){let{id:c,at:w}=JSON.parse(r);if(c&&n-w<1800*1e3)return t.setItem(Z,JSON.stringify({id:c,at:n})),c}let o=crypto.randomUUID();return t.setItem(Z,JSON.stringify({id:o,at:n})),o}catch{return null}}function Ge(t,r){try{let n=window.gtag;typeof n=="function"&&t!=="page_view"&&n("event",t,r??{})}catch{}}function _e(t,r,n={}){if(typeof window>"u"||Ke())return;let o=Xe(),c=JSON.stringify({name:t,path:n.path??window.location.pathname+window.location.search,referrer:document.referrer||null,sessionId:We(),utmSource:o?.source??null,utmMedium:o?.medium??null,utmCampaign:o?.campaign??null,code:o?.code??null,meta:r??null});Ge(t,r);try{if(n.beacon&&typeof navigator.sendBeacon=="function"){navigator.sendBeacon("/api/track",new Blob([c],{type:"application/json"}));return}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:c,keepalive:!0}).catch(()=>{})}catch{}}var Ae=`.hs{--ink:#0b2a5b;--brand:#0b5cff;--muted:#475569;--loss:#e5484d;position:relative;height:calc(var(--hs-parts,6) * 100vh);background:linear-gradient(180deg,#f2f7ff 0%,#fff 55%,#f4f8fd 100%);color:var(--ink);font-family:"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.hs *{box-sizing:border-box}
.hs-pin{position:sticky;top:var(--hs-top,64px);height:calc(100vh - var(--hs-top,64px));height:calc(100svh - var(--hs-top,64px));overflow:hidden}
.hs-glow{position:absolute;right:-8%;top:8%;width:62vw;height:62vw;max-width:880px;max-height:880px;border-radius:50%;filter:blur(80px);opacity:.55;background:radial-gradient(closest-side,rgba(11,92,255,.28),transparent);transition:background 1s ease;pointer-events:none}
.hs[data-part=conversion] .hs-glow{background:radial-gradient(closest-side,rgba(229,72,77,.24),transparent)}
.hs[data-part=international] .hs-glow{background:radial-gradient(closest-side,rgba(25,184,242,.3),transparent)}
.hs[data-part=privacy] .hs-glow{background:radial-gradient(closest-side,rgba(16,163,106,.22),transparent)}
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
.hs-part{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;opacity:0;visibility:hidden;transform:translateY(34px);transition:opacity .55s cubic-bezier(.22,1,.36,1),transform .65s cubic-bezier(.22,1,.36,1),visibility 0s .65s}
.hs[data-dir=up] .hs-part:not(.is-active){transform:translateY(34px)}
.hs-part.is-past{transform:translateY(-34px)}
.hs-part.is-active{opacity:1;visibility:visible;transform:none;transition-delay:.12s,.12s,0s}
.hs-eyebrow{margin:0;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
.hs-h1{margin:14px 0 0;font-size:clamp(36px,4.5vw,64px);line-height:1.03;font-weight:800;letter-spacing:-.035em}
.hs-h2{margin:10px 0 0;font-size:clamp(30px,3.6vw,50px);line-height:1.06;font-weight:800;letter-spacing:-.03em}
.hs-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.hs-w>span{display:inline-block;transform:translateY(105%);transition:transform .7s cubic-bezier(.22,1,.36,1);transition-delay:calc(.15s + var(--i) * 45ms)}
.is-active .hs-w>span{transform:none}
.hs-in{opacity:0;transform:translateY(16px);transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1);transition-delay:calc(var(--d,0) * 60ms + .1s)}
.is-active .hs-in{opacity:1;transform:none}
.hs-lede{margin:22px 0 0;max-width:34rem;font-size:clamp(17px,1.4vw,21px);line-height:1.55;color:var(--muted)}
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
.hs-calc{margin-top:20px;max-width:35rem;padding:6px 24px 4px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(11,42,91,.06),0 24px 50px -28px rgba(11,42,91,.4);border:1px solid #e6edf7}
.hs-cq{padding:16px 0;border-bottom:1px solid #e8eef6}
.hs-cq-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.hs-cq-t{display:block;margin:0;font-size:17px;font-weight:700;line-height:1.3;color:var(--ink);letter-spacing:-.01em}
.hs-cq-t small{display:block;margin-top:3px;font-size:13.5px;font-weight:500;color:#64748b;letter-spacing:0}
.hs-val{flex:none;min-width:84px;padding:8px 14px;border-radius:14px;background:#eef4ff;color:var(--brand);font-size:26px;font-weight:800;line-height:1.1;text-align:center;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hs-ends{display:flex;justify-content:space-between;margin:6px 0 0;font-size:13px;font-weight:600;color:#64748b;font-variant-numeric:tabular-nums}
.hs-conv-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;margin-top:12px;font-size:14px;font-weight:700;color:#334155;font-variant-numeric:tabular-nums}
.hs-conv-row .hs-range{margin:0}
.hs-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;margin:14px 0 0;border-radius:999px;outline:none;cursor:pointer;background:linear-gradient(90deg,var(--brand) var(--p,11%),#e3eaf5 var(--p,11%))}
.hs-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:999px;background:#fff;border:3px solid var(--brand);box-shadow:0 4px 12px rgba(11,92,255,.35)}
.hs-range::-moz-range-thumb{width:20px;height:20px;border-radius:999px;background:#fff;border:3px solid var(--brand)}
.hs-range:focus-visible{box-shadow:0 0 0 4px rgba(11,92,255,.2)}
.hs-chips{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.hs-chips button{all:unset;cursor:pointer;height:38px;padding:0 16px;border-radius:999px;background:#f1f5f9;font-size:15px;font-weight:700;color:#334155;transition:background .2s,color .2s,box-shadow .2s}
.hs-chips button[aria-pressed=true]{background:var(--brand);color:#fff;box-shadow:0 6px 16px -6px rgba(11,92,255,.6)}
.hs-res{padding:4px 0}
.hs-res-row{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);align-items:center;padding:12px 0}
.hs-res-row+.hs-res-row{border-top:1px solid #e8eef6}
.hs-res-row p{margin:0;padding-right:16px;border-right:1px solid #e2e8f0;font-size:15px;font-weight:700;line-height:1.3;color:var(--ink)}
.hs-res-row small{display:block;margin-top:3px;font-size:13px;font-weight:500;color:#64748b}
.hs-res-row b{padding-left:20px;font-size:clamp(22px,2.1vw,30px);font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}
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
.hs-switch{flex:none;position:relative;width:40px;height:24px;border-radius:999px;background:#cbd5e1;transition:background .3s;transition-delay:calc(.7s + var(--k) * .18s)}
.hs-switch::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:999px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.22,1,.36,1);transition-delay:calc(.7s + var(--k) * .18s)}
.is-active .hs-switch{background:#10a36a}
.is-active .hs-switch::after{transform:translateX(16px)}
/* answers */
.hs-answers{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px;max-width:32rem}
.hs-ans{align-items:flex-start;padding:16px}
/* demo */
.hs-demo{position:relative;align-self:center}
.hs-frame{position:relative;aspect-ratio:4/4.3;max-height:calc(100vh - var(--hs-top,64px) - 64px);margin-left:auto;border-radius:28px;overflow:hidden;background:#0b1424;box-shadow:0 40px 80px -36px rgba(11,42,91,.55),0 0 0 1px rgba(11,42,91,.08);transition:transform .8s cubic-bezier(.22,1,.36,1),box-shadow .8s}
.hs[data-part=conversion] .hs-frame{box-shadow:0 40px 80px -36px rgba(180,40,46,.5),0 0 0 2px rgba(229,72,77,.35)}
.hs[data-part=privacy] .hs-frame{box-shadow:0 40px 80px -36px rgba(16,120,80,.45),0 0 0 2px rgba(16,163,106,.35)}
.hs-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
.hs-frame::before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,#0b1424 30%,#17233a 50%,#0b1424 70%);background-size:250% 100%;opacity:0;transition:opacity .4s}
.hs-frame.is-loading::before,.hs-frame:not(:has(iframe[src]))::before{opacity:1;animation:hs-shimmer 1.6s linear infinite}
@keyframes hs-shimmer{to{background-position:-150% 0}}
.hs-guard{all:unset;position:absolute;inset:0;cursor:pointer;display:flex;align-items:flex-end;justify-content:center;padding-bottom:84px}
.hs-guard span{padding:9px 16px;border-radius:999px;background:rgba(11,20,36,.78);color:#fff;font-size:14px;font-weight:700;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s}
.hs-guard:hover span,.hs-guard:focus-visible span{opacity:1;transform:none}
.hs-frame.is-open .hs-guard{pointer-events:none;visibility:hidden}
.hs-steps{display:none}
/* motion-only extras */
@media (prefers-reduced-motion:no-preference){
  .hs-arc{stroke-dasharray:4 6;animation:hs-flow 1.2s linear infinite}
  .hs-part:not(.is-active) .hs-arc{animation:none}
  .hs-city{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .45s cubic-bezier(.34,1.56,.64,1);transition-delay:calc(.6s + var(--k) * .15s)}
  .is-active .hs-city{transform:scale(1)}
  .hs-tl:not(.hs-tl--home){opacity:0;transition:opacity .4s;transition-delay:calc(.75s + var(--k) * .15s)}
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
  .hs-frame{aspect-ratio:auto;height:38svh;max-height:none;border-radius:20px;margin:0}
  .hs-guard{padding-bottom:16px}
  .hs-guard span{display:none}
  .hs-stage{grid-row:2}
  .hs-part{justify-content:flex-start;padding-top:14px}
  .hs-eyebrow{font-size:11px}
  .hs-h1{font-size:clamp(28px,7.6vw,40px);margin-top:8px}
  .hs-h2{font-size:clamp(25px,6.6vw,36px);margin-top:4px}
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
  .hs-range{margin-top:8px}
  .hs-ends{display:none}
  .hs-conv-row{margin-top:6px;gap:10px;font-size:12px}
  .hs-chips{gap:5px;margin-top:7px;flex-wrap:nowrap}
  .hs-chips button{flex:1 1 0;min-width:0;height:30px;padding:0;text-align:center;font-size:12.5px}
  .hs-res{padding:0}
  .hs-res-row{padding:7px 0}
  .hs-res-row p{font-size:12.5px;padding-right:10px}
  .hs-res-row small{font-size:11px;margin-top:1px}
  .hs-res-row b{padding-left:12px;font-size:19px}
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
  .hs-lede{margin-top:14px;font-size:17px}
  .hs-body{margin-top:10px;font-size:15.5px}
  .hs-ctas{margin-top:20px}
  .hs-cue{margin-top:22px}
  .hs-calc{margin-top:12px;padding:2px 20px}
  .hs-cq{padding:10px 0}
  .hs-cq-t{font-size:15.5px}
  .hs-cq-t small{font-size:12.5px}
  .hs-val{font-size:21px;padding:5px 12px}
  .hs-range{margin-top:10px}
  .hs-conv-row{margin-top:8px}
  .hs-chips{margin-top:8px}
  .hs-chips button{height:33px;padding:0 13px;font-size:14px}
  .hs-res-row{padding:8px 0}
  .hs-res-row b{font-size:25px}
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
  .hs-scribble path{stroke-dashoffset:320;transition:stroke-dashoffset .8s cubic-bezier(.65,0,.35,1) 1.05s}
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
  .hs-res-row b{font-size:17px}
}
`;var v=3,Je=[5,10,25,50,100,500],Qe=t=>t>=100?`\u20B9${t/100}CR`:`\u20B9${t}L`,h={min:500,max:1e4,step:50,start:3350},y={min:1,max:20},et=1500,J=t=>{let r=n=>n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});return t>=1e7?`\u20B9${r(t/1e7)} Crore`:`\u20B9${r(t/1e5)} Lakh`},Q='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';var g={link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',device:'<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',chart:'<path d="M3 21h18"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/>',trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'},Te=(t,r=20)=>`<svg viewBox="0 0 24 24" width="${r}" height="${r}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t}</svg>`,x=(t,r=0)=>t.split(" ").map((n,o)=>`<span class="hs-w"><span style="--i:${r+o}">${n}</span></span>`).join(" "),ee=[{id:"exhibitions",label:"Exhibitions",weight:1.1},{id:"conversion",label:"Conversion",weight:1.5},{id:"international",label:"International buyers",weight:1.1},{id:"privacy",label:"Privacy",weight:1.1},{id:"helps",label:"How VPV helps",weight:1.5}],ze=!1;function pt(t){if(!ze){let e=document.createElement("style");e.id="hs-style",e.textContent=Ae,document.head.appendChild(e),ze=!0}let r=matchMedia("(prefers-reduced-motion: reduce)").matches,n=document.createElement("section");n.className="hs",n.setAttribute("data-testid","home-story"),n.innerHTML=`
  <div class="hs-pin">
    <div class="hs-glow" aria-hidden="true"></div>
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-story-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1 hs-h1--hero" data-testid="landing-heading">${x("You spend lakhs meeting global buyers.")}<span class="hs-red">${x("How much business are you losing",6)} <span class="hs-mark">${x("after they leave?",12)}<svg class="hs-scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 60 5, 140 4, 297 9"/></svg></span></span></h1>
          <p class="hs-lede hs-in" style="--d:12">Meeting a buyer is just the beginning. You need to give them enough proof, confidence and reasons to choose you, even after the exhibition is over.</p>
          <div class="hs-ctas hs-in" style="--d:14">
            <a class="hs-btn" href="/why-vpv" data-testid="home-story-why-vpv">Why VPV? ${Q}</a>
            <a class="hs-pill" href="/case-studies" data-testid="home-story-case-study"><span class="hs-play" aria-hidden="true"></span><span><b>80%+ conversion with VPV</b><small>Anuj Anand's story \xB7 See here</small></span></a>
          </div>
          <p class="hs-cue hs-in" style="--d:16" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <h2 class="hs-h2">${x(`Converting only ${v}% of your leads?`)}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-leads">Total Qualified Leads in 5 Years</label><output class="hs-val hs-leads-out" for="hs-leads">0</output></div>
              <input id="hs-leads" class="hs-range hs-range--leads" type="range" min="${h.min}" max="${h.max}" step="${h.step}" value="${h.start}">
              <p class="hs-ends"><span>${h.min.toLocaleString("en-IN")}</span><span>${h.max.toLocaleString("en-IN")}</span></p>
            </div>
            <div class="hs-cq">
              <p class="hs-cq-t" id="hs-value-t">Average Potential Business Per Lead Year</p>
              <div class="hs-chips" role="group" aria-labelledby="hs-value-t">${Je.map(e=>`<button type="button" data-v="${e}" aria-pressed="${e===5}">${Qe(e)}</button>`).join("")}</div>
            </div>
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-conv">Your conversion ratio?<small>What % of leads turn into business?</small></label><output class="hs-val hs-conv-out" for="hs-conv">${v}%</output></div>
              <div class="hs-conv-row"><span>${y.min}%</span><input id="hs-conv" class="hs-range hs-range--conv" type="range" min="${y.min}" max="${y.max}" step="1" value="${v}"><span>${y.max}%</span></div>
            </div>
            <div class="hs-res" aria-live="polite">
              <div class="hs-res-row"><p>Business you win<small class="hs-won-sub">(at ${v}% conversion)</small></p><b class="hs-won">\u20B90</b></div>
              <div class="hs-res-row hs-loss"><p>Business going to competition<small class="hs-lost-sub">(remaining ${100-v}% leads)</small></p><b class="hs-loss-num">\u20B90</b></div>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2">${x("Want to show your factory to international clients?")}</h2>
          <p class="hs-body hs-in" style="--d:5">Walk an international buyer through your plant on Zoom, with no travel on either side. Send your VPV with your company profile, so they understand your capability before deciding on a physical audit.</p>
          <div class="hs-map hs-in" style="--d:7" aria-hidden="true">
            <svg viewBox="0 0 440 150">
              <path class="hs-arc" style="--k:0" d="M300 104 Q255 40 190 58"/>
              <path class="hs-arc" style="--k:1" d="M300 104 Q230 20 120 44"/>
              <path class="hs-arc" style="--k:2" d="M300 104 Q190 10 64 66"/>
              <path class="hs-arc" style="--k:3" d="M300 104 Q360 50 392 92"/>
              <circle class="hs-home" cx="300" cy="104" r="7"/>
              <circle class="hs-city" style="--k:0" cx="190" cy="58" r="5"/><circle class="hs-city" style="--k:1" cx="120" cy="44" r="5"/>
              <circle class="hs-city" style="--k:2" cx="64" cy="66" r="5"/><circle class="hs-city" style="--k:3" cx="392" cy="92" r="5"/>
              <text class="hs-tl hs-tl--home" x="300" y="130">Your factory</text>
              <text class="hs-tl" style="--k:0" x="196" y="80">Dubai</text><text class="hs-tl" style="--k:1" x="120" y="30">Frankfurt</text>
              <text class="hs-tl" style="--k:2" x="64" y="52">Paris</text><text class="hs-tl" style="--k:3" x="392" y="78">Singapore</text>
            </svg>
          </div>
        </article>

        <article class="hs-part" data-i="3">
          <h2 class="hs-h2">${x("Don't want to share your factory with your competition?")}</h2>
          <p class="hs-body hs-in" style="--d:5">Decide exactly who gets in. Protect each link you send:</p>
          <ul class="hs-locks">
            ${[[g.link,"One-time links","A link opens once, for the buyer you sent it to."],[g.timer,"Links that expire","Give a link 24 hours, or a week."],[g.device,"Device limits","Decide how many devices a link works on."],[g.key,"Password protection","Only the buyer you gave it to can get in."]].map(([e,i,s],a)=>`<li class="hs-lock hs-in" style="--d:${6+a}"><span class="hs-ic">${Te(e,18)}</span><span><b>${i}</b><small>${s}</small></span><i class="hs-switch" style="--k:${a}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">How VPV helps</p>
          <h2 class="hs-h2">${x("Buyers trust what they can see.")}</h2>
          <ol class="hs-answers">
            ${[[g.zap,"70% Faster Deal Closures","Buyers get all the key factory information they need, so decisions happen sooner."],[g.chart,"50% Increased Conversion Ratio","More of your exhibition and online leads turn into real business."],[g.trophy,"Helps Differentiate from your competition","Show real operations, scale and quality, something most competitors still don't."]].map(([e,i,s],a)=>`<li class="hs-ans hs-in" style="--d:${4+a*2}"><span class="hs-ic hs-ic--grad">${Te(e,20)}</span><span><b>${i}</b><small>${s}</small></span></li>`).join("")}
          </ol>
          <div class="hs-ctas hs-in" style="--d:11">
            <a class="hs-btn" href="/assessment" data-testid="home-story-cta">Find the Right VPV for Your Factory ${Q}</a>
            <a class="hs-link" href="/why-vpv">See everything VPV does ${Q}</a>
          </div>
        </article>
      </div>

      <div class="hs-demo" data-testid="home-story-demo">
        <div class="hs-frame">
          <iframe data-src="/experience" title="Live VPV: walk through a real factory in 360\xB0" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay" allowfullscreen></iframe>
          <button type="button" class="hs-guard" aria-label="Explore the live factory tour"><span>Click to explore the live tour</span></button>
        </div>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${ee.map(()=>"<i></i>").join("")}</div>
  </div>`,t.appendChild(n);let o=e=>n.querySelector(e),c=Array.from(n.querySelectorAll(".hs-part")),w=Array.from(n.querySelectorAll(".hs-steps i")),P=o(".hs-pin"),R=o(".hs-range--leads"),Y=o(".hs-range--conv"),Ce=o(".hs-leads-out"),Ie=o(".hs-conv-out"),te=o(".hs-loss-num"),q=o(".hs-loss"),$e=o(".hs-won"),Oe=o(".hs-won-sub"),Ne=o(".hs-lost-sub"),ne=Array.from(n.querySelectorAll(".hs-chips button")),l={leads:h.start,valueLakh:5,conv:v},Pe=()=>({leads:Math.max(1,Math.round(l.leads/5)),valueLakh:l.valueLakh,conv:l.conv,lift:5}),S="leads",k=0,_=0,H=0,A=0,F=!1,Re=e=>{if(cancelAnimationFrame(_),r){k=e,te.textContent=J(e);return}let i=k,s=performance.now(),a=f=>{let O=Math.min(1,(f-s)/700),N=1-Math.pow(1-O,3);k=i+(e-i)*N,te.textContent=J(k),O<1&&(_=requestAnimationFrame(a))};_=requestAnimationFrame(a)},se=(e,i,s,a)=>e.style.setProperty("--p",`${(i-s)/(a-s)*100}%`),B=()=>{let e=l.leads*l.valueLakh*1e5,i=e*l.conv/100,s=e-i;Ce.textContent=l.leads.toLocaleString("en-IN"),Ie.textContent=`${l.conv}%`,se(R,l.leads,h.min,h.max),se(Y,l.conv,y.min,y.max),$e.textContent=J(i),Oe.textContent=`(at ${l.conv}% conversion)`,Ne.textContent=`(remaining ${100-l.conv}% leads)`,Re(s),s>H+1&&H>0&&!r&&(q.classList.remove("hs-hit"),q.offsetWidth,q.classList.add("hs-hit")),H=s,ne.forEach(a=>a.setAttribute("aria-pressed",String(Number(a.dataset.v)===l.valueLakh)))},ie=(e=!1)=>{clearTimeout(A),F&&(F=!1,_e("calculator_used",Le(Pe(),{field:S}),{beacon:e,path:"/"}))},D=()=>{F=!0,clearTimeout(A),A=window.setTimeout(()=>ie(),et),B()};R.addEventListener("input",()=>{l.leads=Number(R.value),S="leads",D()}),Y.addEventListener("input",()=>{l.conv=Number(Y.value),S="conv",D()}),ne.forEach(e=>e.addEventListener("click",()=>{l.valueLakh=Number(e.dataset.v),S="valueLakh",D()}));let T=()=>ie(!0),ae=()=>{document.visibilityState==="hidden"&&T()};addEventListener("pagehide",T),document.addEventListener("visibilitychange",ae);let b=o(".hs-frame"),Ye=o(".hs-guard"),qe=()=>b.classList.add("is-open"),re=()=>b.classList.remove("is-open");Ye.addEventListener("click",qe),b.addEventListener("mouseleave",re);let oe=e=>{b.contains(e.target)||re()};document.addEventListener("touchstart",oe,{passive:!0});let z=o(".hs-frame iframe"),le=()=>{z.src||(z.src=z.dataset.src||"/experience"),b.classList.add("is-loading"),z.addEventListener("load",()=>b.classList.remove("is-loading"),{once:!0})},ce=e=>"requestIdleCallback"in window?window.requestIdleCallback(e,{timeout:1200}):setTimeout(e,300);document.readyState==="complete"?ce(le):addEventListener("load",()=>ce(le),{once:!0});let u=ee.length;n.style.setProperty("--hs-parts",String(u));let E=()=>{let e=document.getElementById("vpv-site-header");return e?e.getBoundingClientRect().height:0},pe=()=>Math.max(1,n.offsetHeight-(innerHeight-E())),de=()=>Math.min(1,Math.max(0,(E()-n.getBoundingClientRect().top)/pe())),C=e=>Math.round(n.getBoundingClientRect().top+scrollY-E()+e/(u-1)*pe()),I=()=>{let e=n.getBoundingClientRect();return e.top<=E()+2&&e.bottom>=innerHeight-2},p=-1,He=e=>{if(e===p)return;let i=e>p?"down":"up";c.forEach((s,a)=>{s.classList.toggle("is-active",a===e),s.classList.toggle("is-past",a<e),s.setAttribute("aria-hidden",String(a!==e)),s.inert=a!==e}),n.dataset.dir=i,n.dataset.part=ee[e].id,w.forEach((s,a)=>s.classList.toggle("on",a<=e)),e===1&&p!==1&&(k=0,B()),p=e},d=!1,$=0,V=0,he=e=>scrollTo({top:e,behavior:"instant"}),U=(e,i,s)=>{cancelAnimationFrame($);let a=scrollY,f=e-a;if(r||Math.abs(f)<2){he(e),d=!1;return}d=!0;let O=performance.now(),N=De=>{let Ee=Math.min(1,(De-O)/i);he(a+f*s(Ee)),Ee<1?$=requestAnimationFrame(N):d=!1};$=requestAnimationFrame(N)},Fe=e=>e<.5?4*e*e*e:1-Math.pow(-2*e+2,3)/2,ue=e=>1-Math.pow(1-e,4),j=e=>U(C(e),720,Fe),me=0,K=0,X=!1,L=!1,fe=e=>{if(e.ctrlKey||!I()||Math.abs(e.deltaY)<Math.abs(e.deltaX))return;let i=performance.now(),s=i-me>180;me=i,s&&(K=0,X=!1,L=!1);let a=Math.sign(e.deltaY);if(!a)return;let f=p+a;if(f<0||f>=u){s&&!d&&Math.abs(scrollY-C(p))<4&&(L=!0),L||e.preventDefault();return}L||(e.preventDefault(),!(X||d)&&(K+=e.deltaY,Math.abs(K)>=18&&(X=!0,j(f))))},W=0,ge=0,m="",G=!1,xe=e=>{G=!0,m="",W=e.touches[0].clientY,ge=e.touches[0].clientX,(!I()||e.target.closest?.(".hs-calc"))&&(m="native")},be=e=>{if(m==="native")return;let i=W-e.touches[0].clientY,s=ge-e.touches[0].clientX;if(!m){if(Math.abs(i)<6&&Math.abs(s)<6)return;let a=p+Math.sign(i);m=Math.abs(s)>Math.abs(i)||a<0||a>=u?"native":"story"}m==="story"&&e.preventDefault()},ve=e=>{if(G=!1,m==="story"&&!d){let i=W-e.changedTouches[0].clientY,s=p+Math.sign(i);Math.abs(i)>40&&s>=0&&s<u?j(s):U(C(p),300,ue)}m=""},ye=e=>{if(!I()||e.altKey||e.ctrlKey||e.metaKey)return;let i=e.target;if(i&&(i.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(i.tagName)))return;let s=["ArrowDown","PageDown"].includes(e.key)||e.key===" "&&!e.shiftKey?1:["ArrowUp","PageUp"].includes(e.key)||e.key===" "&&e.shiftKey?-1:0,a=p+s;!s||a<0||a>=u||(e.preventDefault(),d||j(a))},Be=()=>{if(d||G||L||!I())return;let e=Math.round(de()*(u-1)),i=C(e);Math.abs(scrollY-i)>3&&U(i,380,ue)},M=()=>{P.style.setProperty("--hs-top",E()+"px"),He(Math.round(de()*(u-1))),d||(clearTimeout(V),V=window.setTimeout(Be,160))};addEventListener("scroll",M,{passive:!0}),addEventListener("resize",M),addEventListener("wheel",fe,{passive:!1}),addEventListener("touchstart",xe,{passive:!0}),addEventListener("touchmove",be,{passive:!1}),addEventListener("touchend",ve,{passive:!0}),addEventListener("keydown",ye),B(),M();let we=new MutationObserver(()=>{t.isConnected||ke()});we.observe(document.body,{childList:!0,subtree:!0});function ke(){T(),we.disconnect(),cancelAnimationFrame(_),cancelAnimationFrame($),clearTimeout(A),clearTimeout(V),removeEventListener("scroll",M),removeEventListener("resize",M),removeEventListener("pagehide",T),removeEventListener("wheel",fe),removeEventListener("touchstart",xe),removeEventListener("touchmove",be),removeEventListener("touchend",ve),removeEventListener("keydown",ye),document.removeEventListener("touchstart",oe),document.removeEventListener("visibilitychange",ae)}return ke}export{pt as mount};
