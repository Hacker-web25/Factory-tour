function st(n){let r=n.leads*n.valueLakh*1e5,s=r*n.conv/100,i=r-s,p=Math.min(n.lift,100-n.conv),M=n.conv+p,B=r*p/100;return{opportunity:r,won:s,lost:i,liftApplied:p,newConv:M,recovered:B}}function He(n,r={}){let s=st(n),i={leads:n.leads,valueLakh:n.valueLakh,conv:n.conv,lift:n.lift,opportunity:Math.round(s.opportunity),recovered:Math.round(s.recovered)};return r.field&&(i.field=r.field),typeof r.saves=="number"&&(i.saves=r.saves),i}var Pe="vpv_no_analytics";var at="vpv.attr.v1",ae="vpv.sid.v1";function Ye(){try{return window.localStorage}catch{return null}}function ot(){try{return document.cookie.includes(`${Pe}=1`)}catch{return!1}}function rt(){try{let n=Ye()?.getItem(at);return n?JSON.parse(n):null}catch{return null}}function lt(){try{let n=Ye();if(!n)return null;let r=n.getItem(ae),s=Date.now();if(r){let{id:p,at:M}=JSON.parse(r);if(p&&s-M<1800*1e3)return n.setItem(ae,JSON.stringify({id:p,at:s})),p}let i=crypto.randomUUID();return n.setItem(ae,JSON.stringify({id:i,at:s})),i}catch{return null}}function ct(n,r){try{let s=window.gtag;typeof s=="function"&&n!=="page_view"&&s("event",n,r??{})}catch{}}function qe(n,r,s={}){if(typeof window>"u"||ot())return;let i=rt(),p=JSON.stringify({name:n,path:s.path??window.location.pathname+window.location.search,referrer:document.referrer||null,sessionId:lt(),utmSource:i?.source??null,utmMedium:i?.medium??null,utmCampaign:i?.campaign??null,code:i?.code??null,meta:r??null});ct(n,r);try{if(s.beacon&&typeof navigator.sendBeacon=="function"){navigator.sendBeacon("/api/track",new Blob([p],{type:"application/json"}));return}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:p,keepalive:!0}).catch(()=>{})}catch{}}var Fe=`.hs{--ink:#0b2a5b;--brand:#0b5cff;--muted:#475569;--loss:#e5484d;position:relative;height:calc(var(--hs-parts,6) * 100vh);background:linear-gradient(180deg,#f2f7ff 0%,#fff 55%,#f4f8fd 100%);color:var(--ink);font-family:"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
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
.hs-h2--calc{font-size:clamp(24px,2.5vw,34px);line-height:1.12;letter-spacing:-.025em;max-width:34rem}
.hs-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.hs-w>span{display:inline-block;transform:translateY(105%);transition:transform .7s cubic-bezier(.22,1,.36,1);transition-delay:calc(.15s + var(--i) * 45ms)}
.is-active .hs-w>span{transform:none}
.hs-in{opacity:0;transform:translateY(16px);transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1);transition-delay:calc(var(--d,0) * 60ms + .1s)}
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
.hs-guard{all:unset;position:absolute;inset:0;cursor:pointer}
/* the permanent line under the tour */
.hs-hint{margin:10px 0 0;text-align:center;font-size:12.5px;font-weight:600;letter-spacing:.01em;color:#64748b}
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
  .hs-res-row b{font-size:calc(17px * var(--fit,1))}
}
`;var I=3,pt=[5,10,25,50,100,500],ht=n=>n>=100?`\u20B9${n/100}CR`:`\u20B9${n}L`,c={min:100,max:5e3,step:50,start:1e3},Be=100,L={min:1,max:50},ut=1500,C=n=>{let r=s=>{let i=s>=1e3?0:2;return s.toLocaleString("en-IN",{minimumFractionDigits:i,maximumFractionDigits:i})};return n>=1e7?`\u20B9${r(n/1e7)} Crore`:`\u20B9${r(n/1e5)} Lakh`},oe='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';var b={link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',device:'<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',chart:'<path d="M3 21h18"/><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/>',trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'},De=(n,r=20)=>`<svg viewBox="0 0 24 24" width="${r}" height="${r}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${n}</svg>`,v=(n,r=0)=>n.split(" ").map((s,i)=>`<span class="hs-w"><span style="--i:${r+i}">${s}</span></span>`).join(" "),re=[{id:"exhibitions",label:"Exhibitions",weight:1.1},{id:"conversion",label:"Conversion",weight:1.5},{id:"international",label:"International buyers",weight:1.1},{id:"privacy",label:"Privacy",weight:1.1},{id:"helps",label:"How VPV helps",weight:1.5}],Ue=!1;function Et(n){if(!Ue){let e=document.createElement("style");e.id="hs-style",e.textContent=Fe,document.head.appendChild(e),Ue=!0}let r=matchMedia("(prefers-reduced-motion: reduce)").matches,s=document.createElement("section");s.className="hs",s.setAttribute("data-testid","home-story"),s.innerHTML=`
  <div class="hs-pin">
    <div class="hs-glow" aria-hidden="true"></div>
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-story-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1 hs-h1--hero" data-testid="landing-heading">${v("You spend lakhs meeting global buyers in exhibitions.")}<span class="hs-red">${v("How much business are you losing",8)} <span class="hs-mark">${v("after they leave?",14)}<svg class="hs-scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 60 5, 140 4, 297 9"/></svg></span></span></h1>
          <p class="hs-lede hs-in" style="--d:14">Meeting a buyer is just the beginning. <strong>You need to give them enough proof, confidence and reasons to choose you</strong>, even after the exhibition is over.</p>
          <div class="hs-ctas hs-in" style="--d:16">
            <a class="hs-btn" href="/why-vpv" data-testid="home-story-why-vpv">Why VPV? ${oe}</a>
            <a class="hs-pill" href="/case-studies" data-testid="home-story-case-study"><span class="hs-play" aria-hidden="true"></span><span><b>80%+ conversion with VPV</b><small>Anuj Anand's story \xB7 See here</small></span></a>
          </div>
          <p class="hs-cue hs-in" style="--d:18" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <h2 class="hs-h2 hs-h2--calc">${v("What's the cost of not giving buyers enough confidence to buy from you?")}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-leads">Total Qualified Leads in 5 Years</label><input id="hs-leads-num" class="hs-val hs-leads-in" type="text" inputmode="numeric" autocomplete="off" maxlength="7" value="0" aria-label="Total qualified leads in 5 years: type a number from ${c.min} to ${c.max}"></div>
              <input id="hs-leads" class="hs-range hs-range--leads" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.start}">
              <p class="hs-ends"><span>${c.min.toLocaleString("en-IN")}</span><span>${c.max.toLocaleString("en-IN")}</span></p>
            </div>
            <div class="hs-cq">
              <p class="hs-cq-t" id="hs-value-t">Average Potential Business Per Lead Year</p>
              <div class="hs-chips" role="group" aria-labelledby="hs-value-t">${pt.map(e=>`<button type="button" data-v="${e}" aria-pressed="${e===Be}">${ht(e)}</button>`).join("")}<button type="button" class="hs-chip-custom" aria-pressed="false" aria-expanded="false" aria-controls="hs-custom-box">Custom</button></div>
              <div class="hs-custom" id="hs-custom-box" hidden>
                <label class="hs-custom-field"><span aria-hidden="true">\u20B9</span><input id="hs-custom" type="text" inputmode="decimal" autocomplete="off" placeholder="Type an amount" aria-label="Your own business per lead, a year"></label>
                <select class="hs-custom-unit" aria-label="Unit"><option value="1">Lakh</option><option value="100" selected>Crore</option></select>
              </div>
            </div>
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-conv">Your current conversion ratio?<small>What % of leads turn into business?</small></label><output class="hs-val hs-conv-out" for="hs-conv">${I}%</output></div>
              <div class="hs-conv-row"><span>${L.min}%</span><input id="hs-conv" class="hs-range hs-range--conv" type="range" min="${L.min}" max="${L.max}" step="1" value="${I}"><span>${L.max}%</span></div>
            </div>
            <div class="hs-res" aria-live="polite">
              <div class="hs-res-row"><p>Business you win<small class="hs-won-sub">(at ${I}% conversion)</small></p><b class="hs-won">\u20B90</b></div>
              <div class="hs-res-row hs-loss"><p>Business going to competition<small class="hs-lost-sub">(remaining ${100-I}% leads)</small></p><b class="hs-loss-num">\u20B90</b></div>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2">${v("Give international buyers the confidence to choose you.")}</h2>
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
          <h2 class="hs-h2">${v("Show your factory only to buyers. Keep competitors out.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Decide exactly who gets to see your factory.</p>
          <ul class="hs-locks">
            ${[[b.link,"One-time view links","A link opens once, for the buyer you sent it to."],[b.timer,"Control link expiry time","Give a link 24 hours, or a week."],[b.device,"Limit device access","Decide how many devices a link works on."],[b.key,"Password protected link","Only the buyer you gave it to can get in."]].map(([e,t,a],o)=>`<li class="hs-lock hs-in" style="--d:${6+o}"><span class="hs-ic">${De(e,18)}</span><span><b>${t}</b><small>${a}</small></span><i class="hs-switch" style="--k:${o}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">How VPV helps</p>
          <h2 class="hs-h2">${v("Buyers trust what they can see.")}</h2>
          <ol class="hs-answers">
            ${[[b.zap,"Up to 70% Faster Deal Closures","Buyers get all the key factory information they need, so decisions happen sooner."],[b.chart,"Up to 50% Increased Conversion Ratio","More of your exhibition and online leads turn into real business."],[b.trophy,"Helps Differentiate from your competition","Show real operations, scale and quality, something most competitors still don't."]].map(([e,t,a],o)=>`<li class="hs-ans hs-in" style="--d:${4+o*2}"><span class="hs-ic hs-ic--grad">${De(e,20)}</span><span><b>${t}</b><small>${a}</small></span></li>`).join("")}
          </ol>
          <div class="hs-ctas hs-in" style="--d:11">
            <a class="hs-btn" href="/plans" data-testid="home-story-cta">Find the Right VPV for Your Factory ${oe}</a>
            <a class="hs-link" href="/why-vpv">See everything VPV does ${oe}</a>
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
    <div class="hs-steps" aria-hidden="true">${re.map(()=>"<i></i>").join("")}</div>
  </div>`,n.appendChild(s);let i=e=>s.querySelector(e),p=Array.from(s.querySelectorAll(".hs-part")),M=Array.from(s.querySelectorAll(".hs-steps i")),B=i(".hs-pin"),S=i(".hs-range--leads"),D=i(".hs-range--conv"),d=i(".hs-leads-in"),Ve=i(".hs-conv-out"),U=i(".hs-loss-num"),V=i(".hs-loss"),le=i(".hs-won"),je=i(".hs-won-sub"),Ke=i(".hs-lost-sub"),ce=Array.from(s.querySelectorAll(".hs-chips button[data-v]")),j=i(".hs-chip-custom"),We=i(".hs-custom"),K=i("#hs-custom"),de=i(".hs-custom-unit"),l={leads:c.start,valueLakh:Be,conv:I},y=!1,Xe=()=>({leads:Math.max(1,Math.round(l.leads/5)),valueLakh:Math.min(1e4,Math.max(.1,l.valueLakh)),conv:l.conv,lift:5}),x="leads",T=0,$=0,W=0,O=0,X=!1,Ge=e=>{if(cancelAnimationFrame($),r){T=e,U.textContent=C(e);return}let t=T,a=performance.now(),o=g=>{let q=Math.min(1,(g-a)/700),F=1-Math.pow(1-q,3);T=t+(e-t)*F,U.textContent=C(T),q<1&&($=requestAnimationFrame(o))};$=requestAnimationFrame(o)},pe=(e,t)=>e.style.setProperty("--fit",t.length>15?".7":t.length>13?".85":"1"),he=(e,t,a,o)=>e.style.setProperty("--p",`${(t-a)/(o-a)*100}%`),N=()=>{let e=l.leads*l.valueLakh*1e5,t=e*l.conv/100,a=e-t;document.activeElement!==d&&(d.value=l.leads.toLocaleString("en-IN")),Ve.textContent=`${l.conv}%`,he(S,l.leads,c.min,c.max),he(D,l.conv,L.min,L.max),le.textContent=C(t),pe(le,C(t)),pe(U,C(a)),je.textContent=`(at ${l.conv}% conversion)`,Ke.textContent=`(remaining ${100-l.conv}% leads)`,Ge(a),a>W+1&&W>0&&!r&&(V.classList.remove("hs-hit"),V.offsetWidth,V.classList.add("hs-hit")),W=a,ce.forEach(o=>o.setAttribute("aria-pressed",String(!y&&Number(o.dataset.v)===l.valueLakh))),j.setAttribute("aria-pressed",String(y)),j.setAttribute("aria-expanded",String(y)),We.hidden=!y},ue=(e=!1)=>{clearTimeout(O),X&&(X=!1,qe("calculator_used",He(Xe(),{field:x}),{beacon:e,path:"/"}))},w=()=>{X=!0,clearTimeout(O),O=window.setTimeout(()=>ue(),ut),N()};S.addEventListener("input",()=>{l.leads=Number(S.value),x="leads",w()});let Ze=()=>parseInt(d.value.replace(/\D/g,""),10);d.addEventListener("focus",()=>d.select()),d.addEventListener("input",()=>{let e=d.value.replace(/\D/g,"");e!==d.value&&(d.value=e);let t=parseInt(e,10);t>=c.min&&t<=c.max&&(l.leads=t,S.value=String(t),x="leads",w())});let Je=()=>{let e=Ze(),t=Number.isFinite(e)?Math.min(c.max,Math.max(c.min,e)):l.leads;t!==l.leads&&(l.leads=t,S.value=String(t),x="leads",w()),d.value=t.toLocaleString("en-IN")};d.addEventListener("blur",Je),d.addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),d.blur())}),D.addEventListener("input",()=>{l.conv=Number(D.value),x="conv",w()}),ce.forEach(e=>e.addEventListener("click",()=>{y=!1,l.valueLakh=Number(e.dataset.v),x="valueLakh",w()}));let G=()=>{let e=parseFloat(K.value.replace(/[^0-9.]/g,""));e>0&&(l.valueLakh=e*Number(de.value),x="valueLakh",w())};j.addEventListener("click",()=>{y=!0,N(),K.focus(),G()}),K.addEventListener("input",G),de.addEventListener("change",G);let R=()=>ue(!0),me=()=>{document.visibilityState==="hidden"&&R()};addEventListener("pagehide",R),document.addEventListener("visibilitychange",me);let k=i(".hs-frame"),Z=i(".hs-guard"),fe=()=>k.classList.add("is-open"),ge=()=>k.classList.remove("is-open");Z.addEventListener("click",fe);let xe=-1e4;Z.addEventListener("wheel",()=>{xe=performance.now()},{passive:!0}),Z.addEventListener("pointermove",e=>{e.pointerType!=="mouse"||performance.now()-xe<900||Math.abs(e.movementX)+Math.abs(e.movementY)<2||fe()}),k.addEventListener("mouseleave",ge);let be=e=>{k.contains(e.target)||ge()};document.addEventListener("touchstart",be,{passive:!0});let E=i(".hs-frame iframe"),ve=()=>{E.src||(E.src=E.dataset.src||"/experience"),k.classList.add("is-loading"),E.addEventListener("load",()=>k.classList.remove("is-loading"),{once:!0})},ye=e=>"requestIdleCallback"in window?window.requestIdleCallback(e,{timeout:1200}):setTimeout(e,300);document.readyState==="complete"?ye(ve):addEventListener("load",()=>ye(ve),{once:!0});let we=e=>{try{E.contentWindow?.postMessage({type:"vpv-hero-scene",index:e},location.origin)}catch{}},ke=e=>{e.origin!==location.origin||e.source!==E.contentWindow||e.data&&e.data.type==="vpv-hero-ready"&&we(Math.max(0,h))};addEventListener("message",ke);let m=re.length;s.style.setProperty("--hs-parts",String(m));let A=()=>{let e=document.getElementById("vpv-site-header");return e?e.getBoundingClientRect().height:0},Ee=()=>Math.max(1,s.offsetHeight-(innerHeight-A())),Le=()=>Math.min(1,Math.max(0,(A()-s.getBoundingClientRect().top)/Ee())),H=e=>Math.round(s.getBoundingClientRect().top+scrollY-A()+e/(m-1)*Ee()),P=()=>{let e=s.getBoundingClientRect();return e.top<=A()+2&&e.bottom>=innerHeight-2},h=-1,Qe=e=>{if(e===h)return;let t=e>h?"down":"up";p.forEach((a,o)=>{a.classList.toggle("is-active",o===e),a.classList.toggle("is-past",o<e),a.setAttribute("aria-hidden",String(o!==e)),a.inert=o!==e}),s.dataset.dir=t,s.dataset.part=re[e].id,M.forEach((a,o)=>a.classList.toggle("on",o<=e)),e===1&&h!==1&&(T=0,N()),h=e,we(e)},u=!1,Y=0,J=0,Me=e=>scrollTo({top:e,behavior:"instant"}),Q=(e,t,a)=>{cancelAnimationFrame(Y);let o=scrollY,g=e-o;if(r||Math.abs(g)<2){Me(e),u=!1;return}u=!0;let q=performance.now(),F=nt=>{let Re=Math.min(1,(nt-q)/t);Me(o+g*a(Re)),Re<1?Y=requestAnimationFrame(F):u=!1};Y=requestAnimationFrame(F)},et=e=>e<.5?4*e*e*e:1-Math.pow(-2*e+2,3)/2,Se=e=>1-Math.pow(1-e,4),ee=e=>Q(H(e),720,et),Te=0,te=0,ne=!1,_=!1,Ae=e=>{if(e.ctrlKey||!P()||Math.abs(e.deltaY)<Math.abs(e.deltaX))return;let t=performance.now(),a=t-Te>180;Te=t,a&&(te=0,ne=!1,_=!1);let o=Math.sign(e.deltaY);if(!o)return;let g=h+o;if(g<0||g>=m){a&&!u&&Math.abs(scrollY-H(h))<4&&(_=!0),_||e.preventDefault();return}_||(e.preventDefault(),!(ne||u)&&(te+=e.deltaY,Math.abs(te)>=18&&(ne=!0,ee(g))))},se=0,_e=0,f="",ie=!1,ze=e=>{ie=!0,f="",se=e.touches[0].clientY,_e=e.touches[0].clientX,(!P()||e.target.closest?.(".hs-calc"))&&(f="native")},Ie=e=>{if(f==="native")return;let t=se-e.touches[0].clientY,a=_e-e.touches[0].clientX;if(!f){if(Math.abs(t)<6&&Math.abs(a)<6)return;let o=h+Math.sign(t);f=Math.abs(a)>Math.abs(t)||o<0||o>=m?"native":"story"}f==="story"&&e.preventDefault()},Ce=e=>{if(ie=!1,f==="story"&&!u){let t=se-e.changedTouches[0].clientY,a=h+Math.sign(t);Math.abs(t)>40&&a>=0&&a<m?ee(a):Q(H(h),300,Se)}f=""},$e=e=>{if(!P()||e.altKey||e.ctrlKey||e.metaKey)return;let t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)))return;let a=["ArrowDown","PageDown"].includes(e.key)||e.key===" "&&!e.shiftKey?1:["ArrowUp","PageUp"].includes(e.key)||e.key===" "&&e.shiftKey?-1:0,o=h+a;!a||o<0||o>=m||(e.preventDefault(),u||ee(o))},tt=()=>{if(u||ie||_||!P())return;let e=Math.round(Le()*(m-1)),t=H(e);Math.abs(scrollY-t)>3&&Q(t,380,Se)},z=()=>{B.style.setProperty("--hs-top",A()+"px"),Qe(Math.round(Le()*(m-1))),u||(clearTimeout(J),J=window.setTimeout(tt,160))};addEventListener("scroll",z,{passive:!0}),addEventListener("resize",z),addEventListener("wheel",Ae,{passive:!1}),addEventListener("touchstart",ze,{passive:!0}),addEventListener("touchmove",Ie,{passive:!1}),addEventListener("touchend",Ce,{passive:!0}),addEventListener("keydown",$e),N(),z();let Oe=new MutationObserver(()=>{n.isConnected||Ne()});Oe.observe(document.body,{childList:!0,subtree:!0});function Ne(){R(),Oe.disconnect(),cancelAnimationFrame($),cancelAnimationFrame(Y),clearTimeout(O),clearTimeout(J),removeEventListener("scroll",z),removeEventListener("resize",z),removeEventListener("pagehide",R),removeEventListener("wheel",Ae),removeEventListener("touchstart",ze),removeEventListener("touchmove",Ie),removeEventListener("touchend",Ce),removeEventListener("keydown",$e),document.removeEventListener("touchstart",be),removeEventListener("message",ke),document.removeEventListener("visibilitychange",me)}return Ne}export{Et as mount};
