// =============================================
// Popup runtime script generator
//
// Builds the JavaScript string served by GET /api/public/forms/[id]/script.
// Extracted from the route handler so the generated script can be unit
// tested without touching Supabase (see __tests__/script-gen.test.ts).
//
// The exported helper functions below are PURE and are inlined into the
// emitted script via Function.prototype.toString() — they run both on the
// server (tests) and in the merchant's storefront (runtime). They MUST stay
// fully self-contained (no references to other module-scope bindings), and
// written in browser-safe ES2017.
// =============================================

/** HTML-escape a merchant-provided string for text/attribute interpolation. */
export function escHtml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Style-value sanitizer (R7): strips characters that could break out of an
 * inline style attribute or declaration (; " ' < > { } \) and caps length.
 * Falls back to `d` when the prop is missing or sanitizes to nothing.
 */
export function sv(x: unknown, d?: unknown): string {
  var fallback = d == null ? '' : String(d)
  if (x == null || x === '') return fallback
  var s = String(x).replace(/[;"'<>{}\\]/g, '').slice(0, 120)
  return s === '' ? fallback : s
}

/** URL whitelist for navigation targets: http(s) absolute or site-relative. */
export function safeUrl(u: unknown): string {
  var s = String(u == null ? '' : u).trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.charAt(0) === '/' && s.charAt(1) !== '/') return s
  return ''
}

/** URL whitelist for images: http(s), protocol-relative, root-relative, data:image. */
export function safeImgUrl(u: unknown): string {
  var s = String(u == null ? '' : u).trim()
  if (!s) return ''
  if (/^(https?:\/\/|\/\/|data:image\/)/i.test(s)) return s
  if (s.charAt(0) === '/') return s
  return ''
}

/**
 * legal-consent sanitizer (R7): escape EVERYTHING, then re-emit only <a>
 * tags whose href passes the scheme whitelist (http/https/mailto). Anchor
 * inner text is escaped; all other markup is neutralized.
 */
export function legalConsentHtml(raw: unknown, linkColor: unknown): string {
  var esc = function (s: unknown) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
  var color =
    String(linkColor == null || linkColor === '' ? '#F97316' : linkColor)
      .replace(/[;"'<>{}\\]/g, '')
      .slice(0, 120) || '#F97316'
  var text = String(raw == null ? '' : raw)
  var re = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi
  var out = ''
  var last = 0
  var m
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index))
    var attrs = m[1] || ''
    var inner = m[2] || ''
    var hrefM = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    var href = (hrefM ? hrefM[1] || hrefM[2] || hrefM[3] || '' : '').trim()
    if (/^(https?:|mailto:)/i.test(href)) {
      out +=
        '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" style="color:' +
        color + ';text-decoration:underline">' + esc(inner) + '</a>'
    } else {
      out += esc(inner)
    }
    last = re.lastIndex
  }
  out += esc(text.slice(last))
  return out
}

/**
 * R4: tracker.js writes _worder_vid as a JSON envelope {"v":"<uuid>","e":ts};
 * _worder_canonical may be raw or an envelope. Parse either shape.
 */
export function parseVisitorEnvelope(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  var s = String(raw).trim()
  if (s.charAt(0) === '{') {
    try {
      var j = JSON.parse(s)
      if (j && j.v) return String(j.v)
    } catch (e) { /* fall through */ }
    return null
  }
  return s
}

/**
 * Contract: phone is sent as the FULL value with country code prepended
 * (e.g. "+5531999999999"). Values already carrying "+" are kept as-is.
 */
export function normalizePhoneValue(v: unknown, cc: unknown): string {
  var raw = String(v == null ? '' : v).trim()
  if (!raw) return raw
  var digits = raw.replace(/[^0-9+]/g, '')
  if (digits.charAt(0) === '+') return digits
  var code = String(cc == null ? '' : cc).replace(/[^0-9]/g, '')
  if (!code) return digits
  return '+' + code + digits.replace(/^0+/, '')
}

export interface PopupFormRecord {
  id: string
  name?: string | null
  success_message?: string | null
  design_json?: any
  behavior?: any
  /** Experimento em andamento: sorteio por visitante entre o pai e as variantes. */
  experiment?: {
    id: string
    mode: 'split' | 'bandit'
    split: Record<string, number>
    variants: Array<{ id: string; design: any }>
    bandit?: Record<string, Record<string, number>>
  } | null
}

/**
 * Tira o que o navegador não precisa: linhas de comentário e recuo. Não é
 * um minificador (não renomeia nada) — é o corte barato e seguro que cabe
 * num template literal: linhas cujo conteúdo começa com `//` e espaços à
 * esquerda. Uma URL dentro de string ("https://…") nunca começa a linha.
 */
export function compactScript(js: string): string {
  return js
    .split('\n')
    .map((line) => line.replace(/^\s+/, ''))
    .filter((line) => line.length > 0 && !line.startsWith('//'))
    .join('\n')
}

// Inline the pure helpers. Bound via `var <name>=(<fn>)` so internal
// (possibly minified) function names never matter.
const helpers = [
  'var esc=' + escHtml.toString() + ';',
  'var sv=' + sv.toString() + ';',
  'var safeUrl=' + safeUrl.toString() + ';',
  'var safeImg=' + safeImgUrl.toString() + ';',
  'var legalHtml=' + legalConsentHtml.toString() + ';',
  'var parseVEnv=' + parseVisitorEnvelope.toString() + ';',
  'var normPhone=' + normalizePhoneValue.toString() + ';',
].join('\n')

// ---------------------------------------------------------------------------
// O runtime é IGUAL para todos os popups: só os dados mudam. Ele é emitido
// uma vez por bundle como uma função global, e cada popup vira uma chamada
// com os seus dados. Antes o bundle repetia ~69 KB por popup publicado.
//
// Nada aqui dentro pode depender do formulário — o que varia entra pelos
// parâmetros (FID, FNAME, BU, D, B, EXP, VARIANT_ID, SMSG).
// ---------------------------------------------------------------------------
const RUNTIME_BODY = `var PD=D;// design do popup principal: o cupom (e a oferta por intenção) é sempre dele
// Guard against double injection (Theme App Embed + ScriptTag loader).
if(window["__wf_ran_"+FID])return;
window["__wf_ran_"+FID]=true;
var shown=false,ck="_wf_"+FID;
// Shadow DOM: o popup inteiro vive num shadow root. O CSS do tema não entra
// (nenhum "div{margin:8px!important}" quebra o layout), o nosso não sai, e os
// keyframes moram aqui dentro porque animação não atravessa a fronteira.
var ROOT=null,HOST=null;
function $(id){try{if(ROOT){var e=ROOT.getElementById(id);if(e)return e}return document.getElementById(id)}catch(e){return null}}
var BASE_CSS=":host{all:initial}*,*::before,*::after{box-sizing:border-box}@keyframes wfFade{from{opacity:0}to{opacity:1}}@keyframes wfSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes wfHand{0%,100%{transform:translate(-5px,0) rotate(-8deg)}50%{transform:translate(5px,-2px) rotate(6deg)}}.wf-hand{animation:wfHand 1.5s ease-in-out infinite}@keyframes wfWGlow{0%,100%{opacity:.25}50%{opacity:.95}}.wf-wglow{animation:wfWGlow 1s ease-in-out 2}.wf-cd{cursor:pointer;transition:transform .18s ease-out;-webkit-tap-highlight-color:transparent}.wf-cd:hover{transform:translateY(-6px)}.wf-cd[data-sel='1']{transform:translateY(-10px)}.wf-cd-in{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .75s cubic-bezier(.2,.75,.2,1)}.wf-cd-in.wf-flip{transform:rotateY(180deg)}.wf-cd-f,.wf-cd-b{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:inherit;-webkit-backface-visibility:hidden;backface-visibility:hidden;overflow:hidden}.wf-cd-b{transform:rotateY(180deg);overflow-wrap:anywhere}[data-done] .wf-cd:hover{transform:none}@media (prefers-reduced-motion:reduce){.wf-hand{animation:none}.wf-wglow{animation:none;opacity:.9}.wf-cd,.wf-cd-in{transition:none}}.wf-pop{color:#111827;line-height:1.4;font-size:14px;-webkit-font-smoothing:antialiased;text-align:left}.wf-pop button,.wf-pop input,.wf-pop select,.wf-pop textarea{font:inherit;color:inherit;margin:0}.wf-pop input::placeholder{opacity:1}.wf-pop a{color:inherit}.wf-pop p,.wf-pop h1,.wf-pop h2,.wf-pop h3{margin:0}";
function mountRoot(target){
  var host=document.createElement("div");
  host.id="wf-host-"+FID;
  host.setAttribute("data-worder-popup",FID);
  // display:contents: o host não ocupa lugar; o overlay é fixed e o embed
  // flui no lugar do container do lojista.
  host.style.cssText="all:initial;display:contents";
  var r=host.attachShadow?host.attachShadow({mode:"open"}):null;
  var css=document.createElement("style");css.textContent=BASE_CSS;
  if(r){r.appendChild(css);ROOT=r}else{host.appendChild(css);ROOT=null}
  target.appendChild(host);
  HOST=host;
  return r||host;
}
function unmountRoot(){
  if(HOST&&HOST.parentNode)HOST.parentNode.removeChild(HOST);
  HOST=null;ROOT=null;
}
// Prioridade entre popups (behavior.priority, maior vence). Cada script se
// registra; quando o gatilho de um dispara e há outro de prioridade maior
// ainda decidindo (delay maior, gate assíncrono), ele espera até 3 s antes
// de tomar a vez. Sem isso a ordem era "quem chegou primeiro".
var PRIORITY=nv((B&&B.priority),0);
window.__wfReg=window.__wfReg||{};
window.__wfReg[FID]={priority:PRIORITY,state:"pending"};
function regState(s){try{window.__wfReg[FID].state=s}catch(e){}}
function higherPending(){
  var reg=window.__wfReg||{};
  // Só "pending" (gates ainda decidindo) segura os outros. "armed" é um
  // gatilho esperando o visitante (exit, scroll, manual) — pode nunca vir.
  for(var k in reg){if(k!==FID&&reg[k]&&reg[k].state==="pending"&&reg[k].priority>PRIORITY)return k}
  return null;
}
var ELIG;
var _prevFocus=null,_keyHandler=null;
function focusables(){try{var pp=$("wf-pop-"+FID);if(!pp)return[];return Array.prototype.filter.call(pp.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),function(el){return !el.disabled&&el.offsetParent!==null&&el.getAttribute("aria-hidden")!=="true"&&el.getAttribute("name")!=="_wf_hp"})}catch(e){return[]}}
var submitted=false;// R3: suppression cookie must not be clobbered by close() after subscribe
var dismissSent=false;// R6: at most one dismissal beacon per pageview
var _cleanupSize=null;
var DBG=(function(){try{
  var u=new URL(location.href);
  var on=u.searchParams.get("wf_debug")==="1"||sessionStorage.getItem("__wf_debug")==="1";
  if(u.searchParams.get("wf_debug")==="1")sessionStorage.setItem("__wf_debug","1");
  if(u.searchParams.get("wf_debug")==="0")sessionStorage.removeItem("__wf_debug");
  return on;
}catch(e){return false}})();
function dlog(){if(!DBG)return;try{
  var args=["[WorderPopup]","["+FID.slice(0,8)+"]"].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console,args);
}catch(e){}}
function blockedBy(reason){dlog("BLOCKED:",reason);try{ELIG="blocked"}catch(e){}try{if(window.__wfReg&&window.__wfReg[FID])window.__wfReg[FID].state="blocked"}catch(e){}}
dlog("script start",{ design: !!D, behavior: B });
function gc(n){var m=document.cookie.match("(^|;)\\\\s*"+n+"=([^;]*)");return m?m[2]:null}
function sc(n,v,d){var e=new Date();e.setDate(e.getDate()+d);document.cookie=n+"="+v+";path=/;expires="+e.toUTCString()+";SameSite=Lax"}
// Safari ITP mirror (S7): cookies set via document.cookie are capped at 7
// days by ITP. Mirror gate cookies in localStorage with an explicit expiry
// timestamp; reads accept whichever store still has the flag.
function lsSet(n,v,d){try{localStorage.setItem("_wfls_"+n,JSON.stringify({v:v,e:Date.now()+d*86400000}))}catch(e){}}
function lsGet(n){try{var r=localStorage.getItem("_wfls_"+n);if(!r)return null;var j=JSON.parse(r);if(j&&j.e&&Date.now()<j.e)return j.v;localStorage.removeItem("_wfls_"+n);return null}catch(e){return null}}
function gcx(n){return gc(n)||lsGet(n)}
function scx(n,v,d){sc(n,v,d);lsSet(n,v,d)}
function sessGet(k){try{return JSON.parse(sessionStorage.getItem(k)||"null")}catch(e){return null}}
function sessSet(k,v){try{sessionStorage.setItem(k,JSON.stringify(v))}catch(e){}}
// Smart Triggering: segunda chance na sessão para quem fechou o popup e
// depois mostrou intenção (rolagem, permanência, páginas, carrinho).
var stCfg=B.smartTrigger||{};
var RETRIG=false;
// Eventos para o script da loja (GTM, pixels próprios, testes):
//   window.addEventListener("worder:signup", function(e){ e.detail... })
// Nomes: campaignMatched, popupView, stepView, popupClose, signup,
// rewardClaimed, submitError. O detail sempre carrega formId e formName.
function wfEmit(n,d){
  try{
    var det={formId:FID,formName:FNAME,variantId:VARIANT_ID};
    if(d)for(var k in d)det[k]=d[k];
    window.dispatchEvent(new CustomEvent("worder:"+n,{detail:det}));
  }catch(e){}
}
function nv(x,d){var n=parseFloat(x);return isFinite(n)?n:d}
function bid(x){return String(x==null?"":x).replace(/[^a-zA-Z0-9_-]/g,"")}
function looksUuid(s){return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(s||""))}
// R4: robust visitor identity — tracker.js JSON envelope, canonical id,
// theme-embed cookie. (The Shopify pixel's storage is sandboxed/unreachable.)
function getVisitorId(){
  try{
    var c=parseVEnv(localStorage.getItem("_worder_canonical"));
    if(c)return c;
    var r=localStorage.getItem("_worder_vid");
    if(r){
      if(r.charAt(0)==="{"){var p=parseVEnv(r);if(p)return p}
      else if(looksUuid(r))return r;
    }
  }catch(e){}
  var k=gc("__worder_id");
  if(k){try{return decodeURIComponent(k)}catch(e){return k}}
  return null;
}
function getSessionId(){try{return sessionStorage.getItem("_worder_sid")||sessionStorage.getItem("__worder_sid")||null}catch(e){return null}}
// Beacon do ciclo de vida → /events (persistido na série diária).
// text/plain de propósito: application/json exige preflight, e sendBeacon
// não faz preflight — o navegador descartava o envio cross-origin em
// silêncio. O servidor aceita e faz o parse do texto.
function beacon(type,extra){
  var body={type:type};
  // O servidor confere de onde veio: sem isto ele depende só do cabeçalho
  // Origin, que nem todo navegador antigo manda no sendBeacon.
  try{body.domain=location.hostname}catch(e){}
  var vid=getVisitorId();if(vid)body.visitor_id=vid;
  var sid=getSessionId();if(sid)body.session_id=sid;
  if(EXP)body.variant_id=VARIANT_ID;
  try{body.url=location.href;if(document.referrer)body.referrer=document.referrer}catch(e){}
  if(extra)for(var k in extra)if(extra[k]!=null)body[k]=extra[k];
  var payload=JSON.stringify(body);
  var url=BU+"/api/public/forms/"+FID+"/events";
  try{
    if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([payload],{type:"text/plain;charset=UTF-8"})))return;
  }catch(e){}
  try{
    fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:payload,keepalive:true}).catch(function(){});
  }catch(e){}
}
function cornerPx(c,r){return c==="none"?0:c==="small"?4:c==="medium"?8:c==="large"?16:c==="custom"?nv(r,0):8}
function inputStyleStr(p){
  var r=cornerPx(p.corners||"medium",p.cornerRadius||8);
  var und=p.inputStyle==="underline";
  var bw=nv(p.borderWidth,1);
  var bs=sv(p.borderStyle,"solid");
  var bc=sv(p.borderColor,"#E5E7EB");
  var bg=und?"transparent":sv(p.backgroundColor,"#FFFFFF");
  var fam=p.fontFamily&&p.fontFamily!=="inherit"?sv(p.fontFamily,"inherit"):"inherit";
  var s="width:100%;box-sizing:border-box;outline:none;";
  s+="padding:"+nv(p.inputPadTop,12)+"px "+nv(p.inputPadRight,16)+"px "+nv(p.inputPadBottom,12)+"px "+nv(p.inputPadLeft,16)+"px;";
  s+="background:"+bg+";color:"+sv(p.textColor,"#111827")+";";
  s+="font-family:"+fam+";font-size:"+nv(p.fontSize,14)+"px;";
  s+="font-weight:"+(p.bold?"700":nv(p.inputFontWeight,400))+";font-style:"+(p.italic?"italic":"normal")+";text-decoration:"+(p.underline?"underline":"none")+";";
  s+="text-align:"+sv(p.textAlign,"left")+";";
  if(und){s+="border:none;border-bottom:"+bw+"px "+bs+" "+bc+";border-radius:0;"}
  else{s+="border:"+bw+"px "+bs+" "+bc+";border-radius:"+r+"px;"}
  return s;
}
// Generic per-block Layout-tab wrapper (R10): Fill/Stroke/Effects/Layout
// props the editor previews (page.tsx BlockPreview blockStyle) now render
// in the storefront too.
function blockStyleStr(p,noBorder,noShadow){
  var s="margin:"+nv(p.marginTop,0)+"px 0 "+nv(p.marginBottom,8)+"px;";
  if(p.blockPadding!=null&&nv(p.blockPadding,0)>0)s+="padding:"+nv(p.blockPadding,0)+"px;";
  if(p.blockBg)s+="background:"+sv(p.blockBg,"")+";";
  if(p.blockRadius!=null&&nv(p.blockRadius,0)>0)s+="border-radius:"+nv(p.blockRadius,0)+"px;";
  if(!noBorder&&p.borderWidth&&nv(p.borderWidth,0)>0)s+="border:"+nv(p.borderWidth,1)+"px "+sv(p.borderStyle,"solid")+" "+sv(p.borderColor,"#E5E7EB")+";";
  if(!noShadow&&p.shadow)s+="box-shadow:"+sv(p.shadow,"")+";";
  if(p.opacity!=null&&nv(p.opacity,100)<100)s+="opacity:"+(nv(p.opacity,100)/100)+";";
  return s;
}
function wrapStyleStr(p){
  var a=p.align||"full";
  var jc=a==="center"?"center":(a==="right"?"flex-end":"flex-start");
  var s="display:flex;justify-content:"+jc+";width:100%;";
  s+="padding:"+nv(p.paddingTop,0)+"px "+nv(p.paddingRight,0)+"px "+nv(p.paddingBottom,8)+"px "+nv(p.paddingLeft,0)+"px;";
  s+="margin:"+nv(p.marginTop,0)+"px 0 "+nv(p.marginBottom,0)+"px;";
  if(p.blockBg)s+="background:"+sv(p.blockBg,"")+";";
  if(p.blockRadius!=null&&nv(p.blockRadius,0)>0)s+="border-radius:"+nv(p.blockRadius,0)+"px;";
  if(p.shadow)s+="box-shadow:"+sv(p.shadow,"")+";";
  if(p.opacity!=null&&nv(p.opacity,100)<100)s+="opacity:"+(nv(p.opacity,100)/100)+";";
  return s;
}
function innerWrapStyleStr(p){
  var a=p.align||"full";
  return "width:"+(a==="full"?"100%":"auto")+";max-width:"+(a==="full"?"100%":"80%")+";";
}
function labelStyleStr(p){
  return "display:block;font-size:13px;font-weight:500;color:"+sv(p.labelColor,"#374151")+";margin-bottom:4px;text-align:"+sv(p.textAlign,"left")+";";
}
// Per-block validation-message attributes (R9): requiredMsg/errorMsg/errorColor
// travel on the element so the shared validator can surface them.
function vaStr(p){
  var s="";
  if(p.requiredMsg)s+=' data-wfreqmsg="'+esc(p.requiredMsg)+'"';
  if(p.errorMsg)s+=' data-wferrmsg="'+esc(p.errorMsg)+'"';
  if(p.errorColor)s+=' data-wferrcolor="'+esc(p.errorColor)+'"';
  return s;
}
var freq=B.frequency||{};
// R3: single source of truth for the suppression window (gate log, submit
// and close previously used 30 / 30-365 / 1 respectively).
var SHOW_AFTER_DAYS=nv(freq.showAfterDays,30)||30;
var vis=B.visibility||{};
// R10: device class evaluated at CALL time, not script-load time.
function mob(){return window.innerWidth<768}
// Device gate
if(vis.devices==="desktop"&&mob()){blockedBy("device:desktop-only on mobile");return}
if(vis.devices==="mobile"&&!mob()){blockedBy("device:mobile-only on desktop");return}
// Fast subscriber gate — _wf_sub is set on any submit in this browser.
if(!DBG&&vis.hideFromSubscribers&&gcx("_wf_sub")){blockedBy("hideFromSubscribers + _wf_sub flag present");return}
// Visitor type gate (R8): read the PRE-EXISTING value once per pageview and
// share it across all form scripts via window.__wf_seen_prev, so the first
// script's cookie write doesn't turn the visitor "returning" for the second.
var firstSeenCk="_wf_seen";
if(window.__wf_seen_prev===undefined)window.__wf_seen_prev=gcx(firstSeenCk)||"";
var isReturning=!!window.__wf_seen_prev;
scx(firstSeenCk,"1",365);
if(vis.visitorType==="new"&&isReturning){blockedBy("visitorType=new but visitor is returning");return}
if(vis.visitorType==="returning"&&!isReturning){blockedBy("visitorType=returning but visitor is new");return}
var useCustomTrigger=!!B.customTrigger;
var formType=D.formType||"popup";
var isEmbed=formType==="embed";
// Frequency gate (skipped for custom trigger and for embeds — S10: embedded
// forms are page content, never frequency-suppressed).
var dismissedAt=Number(sessGet("_wf_sd_"+FID)||0);
var canRetrig=!!stCfg.enabled&&!isEmbed&&dismissedAt>0&&!sessGet("_wf_rt_"+FID)&&!gcx("_wf_sub");
if(!DBG&&!isEmbed&&gcx(ck)&&!useCustomTrigger){
  // Fechou nesta sessão: em vez de sumir pelo prazo da frequência, o popup
  // fica de olho na intenção e volta UMA vez, nunca antes do delay mínimo.
  if(canRetrig){RETRIG=true;dlog("frequency flag present — smart re-trigger will watch intent")}
  else{blockedBy("frequency flag "+ck+" present — wait "+SHOW_AFTER_DAYS+" days or open ?wf_debug=1");return}
}
// URL include/exclude (wildcard: *)
function matchUrl(pattern,url){
  if(!pattern)return false;
  var re=new RegExp("^"+pattern.replace(/[-\\/\\\\^$+?.()|[\\]{}]/g,"\\\\$&").replace(/\\*/g,".*")+"$");
  return re.test(url);
}
var pagePath=location.pathname;
var urls=B.urls||{};
if(urls.includeEnabled&&urls.includeUrls&&urls.includeUrls.length>0){
  if(!urls.includeUrls.some(function(p){return matchUrl(p,pagePath)||pagePath.indexOf(p)>=0})){blockedBy("url include filter — current path "+pagePath+" not in "+JSON.stringify(urls.includeUrls));return}
}
if(urls.excludeEnabled&&urls.excludeUrls&&urls.excludeUrls.length>0){
  if(urls.excludeUrls.some(function(p){return matchUrl(p,pagePath)||pagePath.indexOf(p)>=0})){blockedBy("url exclude filter — current path "+pagePath+" matched");return}
}
// Legacy targeting.pageUrls still supported for old popups
var tgt=B.targeting||{};
if(tgt.pages==="specific"&&tgt.pageUrls&&tgt.pageUrls.length>0){
  if(!tgt.pageUrls.some(function(p){return pagePath.indexOf(p)>=0})){blockedBy("legacy page filter");return}
}
// Contexto da página (B.page): tipo de template e, em produto/coleção, o
// que está sendo visto. Vem do bloco de tema (window.__worder.template /
// product / collection); sem ele, deduz pelo caminho da Shopify.
function lc(v){return String(v==null?"":v).toLowerCase().trim()}
function lcList(a){return(a||[]).map(lc).filter(Boolean)}
function anyMatch(list,value){var v=lc(value);if(!v)return false;return list.some(function(p){return p===v||matchUrl(p,v)})}
function pageContext(){
  var w=window.__worder||{};
  var tpl=lc(w.template);
  if(!tpl){
    if(pagePath==="/"||pagePath==="")tpl="index";
    else if(pagePath.indexOf("/products/")>=0)tpl="product";
    else if(pagePath.indexOf("/collections")>=0)tpl=(/\\/collections\\/?$/.test(pagePath))?"list-collections":"collection";
    else if(pagePath.indexOf("/cart")===0)tpl="cart";
    else if(pagePath.indexOf("/search")===0)tpl="search";
    else if(pagePath.indexOf("/blogs/")>=0)tpl=(pagePath.split("/").filter(Boolean).length>=3)?"article":"blog";
    else if(pagePath.indexOf("/pages/")>=0)tpl="page";
    else tpl="other";
  }
  var kind=tpl.split(".")[0];
  if(["index","product","collection","list-collections","cart","search","blog","article","page"].indexOf(kind)<0)kind="other";
  var product=w.product||null;
  if(!product&&kind==="product"){var mh=pagePath.match(/\\/products\\/([^\\/?#]+)/);if(mh)product={handle:decodeURIComponent(mh[1])}}
  var collection=w.collection||null;
  if(!collection&&kind==="collection"){var mc=pagePath.match(/\\/collections\\/([^\\/?#]+)/);if(mc)collection={handle:decodeURIComponent(mc[1])}}
  return{kind:kind,product:product,collection:collection};
}
var pageCfg=B.page||{};
var PAGE=pageContext();
if(pageCfg.enabled){
  var tpls=lcList(pageCfg.templates);
  if(tpls.length&&tpls.indexOf(PAGE.kind)<0){blockedBy("page gate — template "+PAGE.kind+" not in "+JSON.stringify(tpls));return}
  var pH=lcList(pageCfg.productHandles),pT=lcList(pageCfg.productTypes),pV=lcList(pageCfg.productVendors),pG=lcList(pageCfg.productTags);
  if(pH.length||pT.length||pV.length||pG.length){
    var pr=PAGE.product;
    if(!pr){blockedBy("page gate — product filter but no product on page");return}
    var prTags=Array.isArray(pr.tags)?pr.tags:String(pr.tags||"").split(",");
    var okP=(pH.length&&anyMatch(pH,pr.handle))||(pT.length&&anyMatch(pT,pr.type))||(pV.length&&anyMatch(pV,pr.vendor))||
            (pG.length&&prTags.some(function(t){return anyMatch(pG,t)}));
    if(!okP){blockedBy("page gate — product does not match filters");return}
  }
  var cH=lcList(pageCfg.collectionHandles);
  if(cH.length){
    if(!PAGE.collection||!anyMatch(cH,PAGE.collection.handle)){blockedBy("page gate — collection does not match");return}
  }
}
// Origem do tráfego (B.traffic): classificada uma vez por sessão a partir
// dos parâmetros da URL de entrada e do referrer, e guardada na sessão para
// valer nas navegações internas (onde o referrer vira a própria loja).
function classifyTraffic(){
  var qs=new URLSearchParams(location.search);
  var med=lc(qs.get("utm_medium")),src=lc(qs.get("utm_source"));
  var ref="";try{ref=document.referrer||""}catch(e){}
  var refHost="";try{if(ref)refHost=new URL(ref).hostname.toLowerCase()}catch(e){}
  var internal=refHost&&(refHost===location.hostname.toLowerCase());
  var hasUtm=!!(med||src);
  if(/cpc|ppc|paid|display|retarget|cpm|banner|ads?$/.test(med))return"paid";
  if(qs.get("gclid")||qs.get("gbraid")||qs.get("wbraid")||qs.get("ttclid")||qs.get("msclkid"))return"paid";
  // fbclid vem em qualquer clique saído do Instagram/Facebook, pago ou não.
  if(qs.get("fbclid")&&!med)return"social";
  if(/^e?mail|newsletter/.test(med)||/mail|newsletter|klaviyo|mailchimp|rd ?station/.test(src))return"email";
  if(/whatsapp|sms|messag|zap/.test(med)||/whatsapp|sms|zap/.test(src))return"messaging";
  if(/social|instagram|facebook|tiktok|youtube|pinterest|twitter|linkedin/.test(med)||/instagram|facebook|tiktok|youtube|pinterest|twitter|linkedin|^ig$|^fb$/.test(src))return"social";
  if(hasUtm)return"referral";
  if(!ref||internal)return null;
  if(/(^|\\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|ask)\\./.test(refHost))return"organic";
  if(/(^|\\.)(facebook|instagram|tiktok|youtube|pinterest|twitter|x|t|linkedin|reddit|threads|snapchat)\\.(com|co|net|org)$/.test(refHost)||/^(l|lm|m|www)\\.(facebook|instagram)\\.com$/.test(refHost))return"social";
  return"referral";
}
function trafficType(){
  var key="_wf_traffic",stored=null;
  try{stored=sessionStorage.getItem(key)}catch(e){}
  var t=classifyTraffic();
  if(t){try{sessionStorage.setItem(key,t)}catch(e){}return t}
  if(stored)return stored;
  t="direct";
  try{sessionStorage.setItem(key,t)}catch(e){}
  return t;
}
var trafficCfg=B.traffic||{};
var TRAFFIC=trafficType();
if(trafficCfg.enabled&&trafficCfg.types&&trafficCfg.types.length){
  if(trafficCfg.types.indexOf(TRAFFIC)<0){blockedBy("traffic gate — "+TRAFFIC+" not in "+JSON.stringify(trafficCfg.types));return}
}
// Propensão (0–100): sinais da sessão que alimentam o Smart Triggering e as
// Smart Offers. Pesos padrão somam 100; o lojista (ou uma calibração
// futura) pode sobrescrever em behavior.smartTrigger.weights.
var PW=stCfg.weights||{};
function pw(k,d){var v=Number(PW[k]);return isFinite(v)?v:d}
var propS={scroll:0,dwellStart:Date.now()};
var sessP=sessGet("_wf_prop")||{dwell:0,products:0,pages:0,cartItems:0,cartAt:0};
if(!window.__wf_prop_bumped){window.__wf_prop_bumped=true;sessP.pages=(sessP.pages||0)+1;if(PAGE.kind==="product")sessP.products=(sessP.products||0)+1;sessSet("_wf_prop",sessP)}
function onPropScroll(){try{var max=document.body.scrollHeight-window.innerHeight;var pp=max>0?Math.round(window.scrollY/max*100):100;if(pp>propS.scroll)propS.scroll=Math.min(100,pp)}catch(e){}}
window.addEventListener("scroll",onPropScroll,{passive:true});
window.addEventListener("pagehide",function(){sessP.dwell=(sessP.dwell||0)+(Date.now()-propS.dwellStart)/1000;propS.dwellStart=Date.now();sessSet("_wf_prop",sessP)});
var wantsIntent=!!stCfg.enabled||!!((couponBlock()||{}).smartOffer||{}).enabled;
if(wantsIntent&&window.Shopify&&!(sessP.cartAt&&Date.now()-sessP.cartAt<300000)){
  try{fetch("/cart.js",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(c){sessP.cartItems=Number(c&&c.item_count||0);sessP.cartAt=Date.now();sessSet("_wf_prop",sessP)}).catch(function(){})}catch(e){}
}
function propensity(){
  var dwell=(sessP.dwell||0)+(Date.now()-propS.dwellStart)/1000;
  var sc=0;
  sc+=Math.min(1,propS.scroll/100)*pw("scroll",20);
  sc+=Math.min(1,dwell/120)*pw("dwell",20);
  sc+=Math.min(1,(sessP.pages||0)/5)*pw("pages",15);
  sc+=Math.min(1,(sessP.products||0)/3)*pw("products",15);
  if((sessP.cartItems||0)>0)sc+=pw("cart",15);
  if(isReturning)sc+=pw("returning",10);
  if(TRAFFIC==="paid"||TRAFFIC==="email"||TRAFFIC==="messaging")sc+=pw("traffic",5);
  return Math.max(0,Math.min(100,Math.round(sc)));
}
// Smart Offers: a oferta escolhida para esta pessoa (base, um nível, ou
// nenhuma), pela intenção medida na hora de mostrar. O controle recebe a
// base sempre — é o que permite medir a margem ganha.
var OFFER={intent:null,bucket:null,tier:null,label:""};
// Jogo (roleta/raspadinha): o resultado vem do servidor no envio.
var GAME={result:null};
function couponBlock(){
  var all=[];(PD.steps||[]).forEach(function(st){(st.blocks||[]).forEach(function(b){all.push(b)})});
  ((PD.successStep||{}).blocks||[]).forEach(function(b){all.push(b)});
  for(var i=0;i<all.length;i++)if(all[i]&&all[i].type==="coupon")return all[i].props||{};
  return null;
}
function offerText(kind,value,label){
  if(label)return label;
  if(kind==="free_shipping")return"Frete grátis";
  if(kind==="fixed_amount"||kind==="fixed")return"R$ "+(Math.round(Number(value)*100)/100)+" OFF";
  return Math.round(Number(value)||0)+"% OFF";
}
function computeOffer(){
  var cp=couponBlock();
  if(!cp){OFFER.label="";return}
  var baseLabel=offerText(cp.discountType,cp.discountValue,cp.offerLabel);
  var so=cp.smartOffer||{};
  if(!so.enabled){OFFER.label=baseLabel;return}
  var lowMax=Math.max(5,Math.min(90,nv(so.lowMax,35))),highMin=Math.max(lowMax+5,Math.min(95,nv(so.highMin,70)));
  var sc=propensity();
  OFFER.intent=sc<lowMax?"low":sc>=highMin?"high":"mid";
  var vid=getVisitorId();
  if(!vid){try{vid=sessionStorage.getItem("_wf_anon")||"";if(!vid){vid="anon-"+Math.random().toString(36).slice(2);sessionStorage.setItem("_wf_anon",vid)}}catch(e){vid="anon"}}
  var hs=vid+"|offer|"+FID,hv=0;for(var i=0;i<hs.length;i++){hv=(hv*31+hs.charCodeAt(i))>>>0}
  var ctl=Math.max(0,Math.min(50,nv(so.controlPercent,20)));
  OFFER.bucket=(hv%100)<ctl?"control":"smart";
  var pick=OFFER.bucket==="control"?"base":(so[OFFER.intent+"Tier"]||"base");
  if(pick!=="base"&&pick!=="none"){
    var tiers=Array.isArray(cp.tiers)?cp.tiers:[],found=null;
    for(var t=0;t<tiers.length;t++)if(tiers[t]&&tiers[t].id===pick){found=tiers[t];break}
    if(!found)pick="base";else OFFER.label=offerText(found.discountType,found.discountValue,found.label);
  }
  OFFER.tier=pick;
  if(pick==="base")OFFER.label=baseLabel;
  if(pick==="none")OFFER.label="";
  dlog("smart offer",OFFER);
}
function applyOffer(txt){return String(txt==null?"":txt).replace(/\\{\\{\\s*offer\\s*\\}\\}/g,OFFER.label||"").replace(/\\{\\{\\s*prize\\s*\\}\\}/g,GAME.result?String(GAME.result.label||""):"")}
// Location gate — país resolvido pela NOSSA borda (/api/public/geo), nunca
// por um terceiro que receberia o IP do visitante. Cache de sessão; falha
// aberta.
var locCfg=B.location||{};
function runLocationGate(cb){
  var needs=(locCfg.includeEnabled&&locCfg.includeCountries&&locCfg.includeCountries.length>0)||
            (locCfg.excludeEnabled&&locCfg.excludeCountries&&locCfg.excludeCountries.length>0);
  if(!needs){cb(true);return}
  var cached=null;try{cached=sessionStorage.getItem("_wf_country")}catch(e){}
  function check(cc){
    cc=(cc||"").toUpperCase();
    if(!cc){cb(true);return}
    var inc=locCfg.includeCountries||[],exc=locCfg.excludeCountries||[];
    if(locCfg.includeEnabled&&inc.length>0&&inc.indexOf(cc)<0){cb(false);return}
    if(locCfg.excludeEnabled&&exc.length>0&&exc.indexOf(cc)>=0){cb(false);return}
    cb(true);
  }
  if(cached){check(cached);return}
  fetch(BU+"/api/public/geo",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){
    var cc=(j&&j.country)||"";
    if(cc){try{sessionStorage.setItem("_wf_country",cc)}catch(e){}}
    check(cc);
  }).catch(function(){cb(true)});
}
// UTM parameter gate
var utmCfg=B.utm||{};
function getUtms(){
  var qs=new URLSearchParams(location.search);
  var out={};
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(function(k){
    var v=qs.get(k);
    try{
      if(v){out[k]=v;localStorage.setItem("_wf_"+k,v)}
      else{var stored=localStorage.getItem("_wf_"+k);if(stored)out[k]=stored}
    }catch(e){if(v)out[k]=v}
  });
  return out;
}
var currentUtms=getUtms();
if(utmCfg.filterEnabled&&utmCfg.filters&&utmCfg.filters.length>0){
  var utmOk=utmCfg.filters.every(function(f){
    if(!f.param||!f.value)return true;
    return(currentUtms[f.param]||"").toLowerCase().indexOf(f.value.toLowerCase())>=0;
  });
  if(!utmOk){blockedBy("utm filter");return}
}
// Page view count (R8): bump ONCE per pageview globally — N popups on the
// page used to inflate the counter by N.
function incPv(){
  // Com "bloquear todos os cookies" o getItem lança: sem o try, o bundle
  // inteiro morria antes de qualquer popup rodar.
  var n=0;
  try{n=parseInt(sessionStorage.getItem("_wf_pv")||"0",10)||0}catch(e){n=0}
  if(!window.__wf_pv_bumped){
    window.__wf_pv_bumped=true;
    n=n+1;
    try{sessionStorage.setItem("_wf_pv",String(n))}catch(e){}
  }
  return n;
}
var pvCount=incPv();
// Scheduling window
var sched=B.scheduling||{};
if(sched.enabled){
  var now=Date.now();
  if(sched.startDate&&now<new Date(sched.startDate).getTime()){blockedBy("scheduled: not started");return}
  if(sched.endDate&&now>new Date(sched.endDate).getTime()){blockedBy("scheduled: ended");return}
}
// Experimento A/B: uma variante por visitante, sorteada pelo hash do id
// e pegajosa por 30 dias. No modo bandit os pesos vêm por contexto
// (página × origem × dispositivo) quando o cron já os calculou; senão o
// split fixo. A variante troca só o DESIGN — regras de exibição são as do
// popup principal.
if(EXP&&EXP.variants&&EXP.variants.length){
  var abKey="ab_"+EXP.id,chosenV=lsGet(abKey);
  var wts=EXP.split||{};
  if(EXP.mode==="bandit"&&EXP.bandit){var cw=EXP.bandit[PAGE.kind+"|"+TRAFFIC+"|"+(mob()?"mobile":"desktop")];if(cw)wts=cw}
  if(!chosenV||!(chosenV in wts)){
    var vid0=getVisitorId();
    if(!vid0){try{vid0=sessionStorage.getItem("_wf_anon")||"";if(!vid0){vid0="anon-"+Math.random().toString(36).slice(2);sessionStorage.setItem("_wf_anon",vid0)}}catch(e){vid0="anon"}}
    var hs=vid0+"|"+EXP.id,hv=0;for(var hi=0;hi<hs.length;hi++){hv=(hv*31+hs.charCodeAt(hi))>>>0}
    var frac=(hv%10000)/10000,vids=[],tot=0;for(var wk in wts){vids.push(wk);tot+=Math.max(0,Number(wts[wk])||0)}
    chosenV=vids.length?vids[vids.length-1]:FID;
    if(tot>0){var acc=0;for(var vj=0;vj<vids.length;vj++){acc+=Math.max(0,Number(wts[vids[vj]])||0);if(frac*tot<acc){chosenV=vids[vj];break}}}
    lsSet(abKey,chosenV,30);
  }
  VARIANT_ID=chosenV;
  for(var vi=0;vi<EXP.variants.length;vi++){if(EXP.variants[vi].id===chosenV&&EXP.variants[vi].design&&EXP.variants[vi].design.steps){D=EXP.variants[vi].design;break}}
  dlog("experiment variant",VARIANT_ID);
}
var st=D.styles||{};
var steps=D.steps||[];
var successStep=D.successStep||{blocks:[{id:"s1",type:"text",props:{content:"Obrigado!",fontSize:24,color:"#111827",fontWeight:"bold",align:"center",tag:"h2"}},{id:"s2",type:"text",props:{content:"Sua inscrição foi confirmada.",fontSize:15,color:"#6B7280",align:"center",tag:"p"}}]};
var hasSuccessBlocks=!!(D.successStep&&D.successStep.blocks&&D.successStep.blocks.length);
var successMsg=D.successMessage||SMSG;
var postSubmit=D.postSubmit||{action:"show-success",redirectUrl:"",closeDelay:4};
var curStep=0;
var allData={};
// Ramificação: o caminho percorrido (ids das etapas) vai no submit e decide
// o tier da recompensa; a próxima etapa vem da opção escolhida (bloco de
// escolha com props.branches), do botão (props.nextStepId) ou da sequência.
var stepPath=[];
function stepIndexById(id){if(!id)return -1;for(var i=0;i<steps.length;i++){if(steps[i]&&steps[i].id===id)return i}return -1}
function branchAttr(p){
  var br=p&&p.branches;
  if(!br||typeof br!=="object")return"";
  var clean={};var any=false;
  for(var k in br){if(typeof br[k]==="string"&&stepIndexById(br[k])>=0){clean[k]=br[k];any=true}}
  return any?' data-wfbranch="'+esc(JSON.stringify(clean))+'"':"";
}
// Progressive profiling — known-fields contract is now per-field BOOLEANS
// ({fields:{email:true,...}}) used only for HIDING already-known fields.
// Prefill-by-email is discontinued.
var _knownFields={};
var _ppEnabled=!!(B.progressiveProfiling&&B.progressiveProfiling.enabled);
var _ppHide=_ppEnabled&&B.progressiveProfiling.hideKnownFields!==false;
// Prefill: merchant turned OFF hide-known-fields but ON prefill. Only the
// visitor_id known-fields path returns string VALUES (the email path returns
// booleans to avoid a PII oracle), so prefill naturally applies to string
// entries only; a boolean true never becomes an input value.
var _ppFill=_ppEnabled&&!!B.progressiveProfiling.prefillKnownFields;
function loadKnownFields(cb){
  if(!_ppEnabled){cb();return}
  var em=gc("__worder_id_email")||"";
  var vid=getVisitorId()||"";
  if(!em&&!vid){cb();return}
  var u=BU+"/api/public/forms/"+FID+"/known-fields?";
  if(em){var dem=em;try{dem=decodeURIComponent(em)}catch(e){}u+="email="+encodeURIComponent(dem)}
  if(vid)u+=(em?"&":"")+"visitor_id="+encodeURIComponent(vid);
  fetch(u).then(function(r){return r.json()}).then(function(j){
    _knownFields=(j&&j.fields)||{};
    dlog("Progressive profiling: known fields",_knownFields);
    cb();
  }).catch(function(){cb()});
}
function isInputBlock(t){return t==="email"||t==="phone"||t==="name-input"||t==="text-input"||t==="date-input"||t==="dropdown"}
function visibleBlocks(bs){
  var m=mob();
  return (bs||[]).filter(function(b){
    var pp=b.props||{};
    if(m&&pp.hideOnMobile){dlog("hide block "+b.type+"#"+b.id+" (hideOnMobile)");return false;}
    if(!m&&pp.hideOnDesktop){dlog("hide block "+b.type+"#"+b.id+" (hideOnDesktop)");return false;}
    if(_ppHide&&isInputBlock(b.type)){
      var mapTo=pp.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"");
      if(mapTo&&_knownFields[mapTo]){
        dlog("progressive: hiding "+b.type+" ("+mapTo+" already known)");
        return false;
      }
    }
    return true;
  });
}
// Segmentos do jogo como o runtime os desenha (o servidor sanitiza os
// mesmos campos ao sortear — o índice devolvido bate com esta lista).
function gameSegs(p){
  var l=Array.isArray(p.segments)?p.segments.slice(0,12):[],o=[],cols=["#F97316","#111827","#FDBA74","#374151","#FB923C","#1F2937","#FED7AA","#4B5563"];
  for(var i=0;i<l.length;i++){
    var s=l[i];
    // Mesmo filtro do servidor: uma entrada inválida pulada aqui e lá
    // mantém os índices alinhados com o segmento sorteado.
    if(!s||typeof s!=="object")continue;
    o.push({label:String(s.label||("Pr\\u00eamio "+(i+1))).slice(0,40),color:/^#[0-9a-fA-F]{6}$/.test(String(s.color||""))?s.color:cols[i%cols.length],textColor:/^#[0-9a-fA-F]{6}$/.test(String(s.textColor||""))?s.textColor:null});
  }
  return o;
}
function gameBtn(p,def){
  // Nas referências que convertem, o cartão (e a roleta) não tem botão
  // grudado embaixo: a ação fica onde o resto do formulário está. Com
  // showButton:false o bloco entrega só o jogo, e quem dispara é o botão
  // da etapa — o sorteio acontece no submit de qualquer jeito.
  if(p&&p.showButton===false)return"";
  return '<button type="submit" data-action="submit" style="box-sizing:border-box;margin:14px 0 0;padding:'+nv(p.paddingV,14)+'px '+nv(p.paddingH,28)+'px;background:'+sv(p.bgColor,"#F97316")+';color:'+sv(p.textColor,"#fff")+';font-size:'+nv(p.fontSize,15)+'px;font-weight:700;font-family:inherit;line-height:1.2;border:none;border-radius:'+nv(p.borderRadius,8)+'px;cursor:pointer;display:'+(p.fullWidth?"block":"inline-block")+';width:'+(p.fullWidth?"100%":"auto")+';transition:opacity .2s">'+esc(applyOffer(p.buttonText||def))+'</button>';
}
// A lâmina da raspadinha: gradiente diagonal + listras finas, no lugar
// do cinza chapado. É o que faz o cartão PARECER raspável antes de
// qualquer instrução — e é desenhada no canvas porque é ela que o dedo
// vai apagar.
//
// O canvas é dimensionado em pixels de dispositivo: com width/height
// fixos no HTML, a lâmina saía borrada em tela retina.
function paintFoil(cv,cor,lw,lh){
  if(!cv)return;
  var cx=null;try{cx=cv.getContext?cv.getContext("2d"):null}catch(e){}
  if(!cx)return;
  var r=cv.getBoundingClientRect();
  var dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  var w=Math.max(1,Math.round((r.width||lw||300)*dpr));
  var h=Math.max(1,Math.round((r.height||lh||160)*dpr));
  cv.width=w;cv.height=h;
  var g=cx.createLinearGradient(0,0,w,h);
  g.addColorStop(0,wfShade(cor,20));g.addColorStop(.45,cor);g.addColorStop(.55,wfShade(cor,12));g.addColorStop(1,wfShade(cor,-16));
  cx.fillStyle=g;cx.fillRect(0,0,w,h);
  cx.globalAlpha=.10;cx.strokeStyle="#FFFFFF";cx.lineWidth=Math.max(1,dpr);
  for(var x=-h;x<w+h;x+=Math.max(8,12*dpr)){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x+h,h);cx.stroke()}
  cx.globalAlpha=1;
}
function wfShade(hex,amt){
  var m=/^#([0-9a-fA-F]{6})$/.exec(String(hex||""));if(!m)return String(hex||"#C0C6CF");
  var n=parseInt(m[1],16),R=(n>>16)+amt,G=((n>>8)&255)+amt,B=(n&255)+amt;
  function cl(v){return v<0?0:v>255?255:v}
  return"#"+((1<<24)+(cl(R)<<16)+(cl(G)<<8)+cl(B)).toString(16).slice(1);
}
// Depois do envio: gira a roleta (ou libera a raspadinha) até o segmento
// que o servidor sorteou, e só então chama done() — a etapa de sucesso.
function playGameAnim(el,g,done){
  var type=el.getAttribute("data-game"),gid=el.getAttribute("data-game-id"),fin=false,cleanup=null;
  function end(ms){if(fin)return;fin=true;if(cleanup){try{cleanup()}catch(e){}cleanup=null}setTimeout(done,ms==null?900:ms)}
  try{
    // A ROLETA
    //
    // O que separa uma roleta profissional de um gráfico de pizza dando
    // voltas não é a velocidade: são quatro coisas, e todas moram aqui.
    //
    //   1. desaceleração exponencial. Roleta de verdade perde energia por
    //      atrito, então a curva é uma cauda longa — os últimos 20 graus
    //      levam quase um segundo. É a cauda que cria a expectativa. Com
    //      a curva errada (ou com uma transition qualquer) o giro parece
    //      travar de repente, e a sensação é de animação, não de sorteio.
    //   2. impulso. Antes de sair, o disco RECUA um tico. É o mesmo
    //      truque do desenho animado: o olho lê o recuo como força.
    //   3. encaixe. No fim, passa alguns graus do alvo e volta. Sem isso
    //      o disco "estaciona", e nada mecânico estaciona.
    //   4. o ponteiro batendo nos pinos. Cada divisão que passa empurra o
    //      ponteiro, que volta com uma molinha, e faz um tique. É o
    //      detalhe que quase ninguém nota — e o único que, faltando, faz
    //      qualquer roleta na tela parecer de brinquedo.
    //
    // Quem gira é só o disco (wf-wdisc). O aro, o brilho de cima, o cubo
    // e o ponteiro ficam parados: luz e ponteiro que giram junto com o
    // objeto entregam na hora que aquilo é uma imagem rodando.
    if(type==="wheel"){
      var disco=$("wf-wdisc-"+gid),ptr=$("wf-wptr-"+gid),sr=$("wf-wsr-"+gid),cf=$("wf-wcf-"+gid);
      var n=parseInt(el.getAttribute("data-n"),10)||0,i=Math.max(0,Math.min(n-1,parseInt(g.segment,10)||0));
      if(!disco||n<2){end(0);return}
      var seg=360/n;
      // Cinco voltas e para no centro do setor sorteado, com uma folga
      // dentro dele para não parar sempre no mesmo pixel.
      var alvo=360*5-((i+0.5)*seg)+(Math.random()-0.5)*seg*0.4;
      // O tempo varia um pouco a cada giro. Roleta que demora exatamente
      // o mesmo tanto toda vez denuncia que o resultado já estava dado.
      var ANT=9,OVER=Math.min(7,seg*0.28),DA=260,DS=Math.round(3300+n*40+(Math.random()*300-150)),DB=400,TOT=DA+DS+DB;
      var acabou=false,ultimoSetor=null,ultimoTique=0,ac=null,trava=null;
      var lento=false;try{lento=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches)}catch(e){}
      // O atributo transform do SVG, não a propriedade CSS: o atributo
      // gira em torno do centro que a gente informa, sem depender de
      // transform-origin/transform-box (que em SVG variam por navegador).
      function girar(d){try{disco.setAttribute("transform","rotate("+d.toFixed(2)+" 150 150)")}catch(e){}}
      function eoc(u){return 1-Math.pow(1-u,3)}
      function eoq(u){return 1-Math.pow(1-u,5)}
      function onde(t){
        if(t<DA)return -ANT*eoc(t/DA);
        if(t<DA+DS)return -ANT+(alvo+OVER+ANT)*eoq((t-DA)/DS);
        return alvo+OVER-OVER*eoc(Math.min(1,(t-DA-DS)/DB));
      }
      // O tique é sintetizado, não baixado: um clique curto de 50ms não
      // vale um arquivo de áudio no bundle de todo mundo.
      function tique(){
        if(lento||el.getAttribute("data-sound")==="0")return;
        try{
          var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
          if(!ac)ac=new AC();
          var o=ac.createOscillator(),v=ac.createGain(),t=ac.currentTime;
          o.type="square";o.frequency.value=1150;
          v.gain.setValueAtTime(0.045,t);v.gain.exponentialRampToValueAtTime(0.0008,t+0.05);
          o.connect(v);v.connect(ac.destination);o.start(t);o.stop(t+0.055);
        }catch(e){}
      }
      // Uma divisão passou pelo ponteiro? Empurra e toca. A trava de 45ms
      // é o que faz a batida aparecer só quando o giro já está lento — no
      // começo passam dezenas de pinos por segundo, e piscar o ponteiro
      // em todos viraria tremedeira.
      function bater(rot,agora){
        var s=Math.floor((rot+seg/2)/seg);
        if(ultimoSetor===null){ultimoSetor=s;return}
        if(s===ultimoSetor)return;
        ultimoSetor=s;
        if(agora-ultimoTique<45)return;
        ultimoTique=agora;
        if(ptr&&!lento){
          ptr.style.transition="transform .06s ease-out";
          ptr.style.transform="rotate(-15deg)";
          setTimeout(function(){if(ptr){ptr.style.transition="transform .17s cubic-bezier(.34,1.5,.64,1)";ptr.style.transform="rotate(0deg)"}},60);
        }
        tique();
      }
      // Confete de DOM puro: 18 retângulos que saem do centro e caem.
      // Sem biblioteca, sem canvas e sem imagem — o popup inteiro tem de
      // continuar cabendo no bundle da loja.
      function confete(){
        if(!cf||lento)return;
        var cores=[];
        for(var c=0;c<n;c++){var pc=$("wf-wsec-"+gid+"-"+c);if(pc&&pc.getAttribute)cores.push(pc.getAttribute("fill")||"#F97316")}
        if(!cores.length)cores=["#F97316"];
        for(var q=0;q<18;q++){
          var ang=(-90+(Math.random()*160-80))*Math.PI/180,dist=70+Math.random()*130;
          var d=document.createElement("i");
          d.style.cssText="position:absolute;left:50%;top:38%;margin:-6px 0 0 -3px;width:7px;height:11px;border-radius:2px;background:"+cores[q%cores.length]+";transform:translate(0,0) rotate(0deg);will-change:transform,opacity";
          cf.appendChild(d);
          (function(node,dx,dy,rot){
            setTimeout(function(){
              node.style.transition="transform 1.05s cubic-bezier(.18,.62,.3,1),opacity .75s ease-in .35s";
              node.style.transform="translate("+dx.toFixed(0)+"px,"+dy.toFixed(0)+"px) rotate("+rot+"deg)";
              node.style.opacity="0";
            },20+q*14);
            setTimeout(function(){if(node.parentNode)node.parentNode.removeChild(node)},1700+q*14);
          })(d,Math.cos(ang)*dist,Math.sin(ang)*dist+40+Math.random()*90,Math.round(Math.random()*540-270));
        }
      }
      function terminar(){
        if(acabou)return;acabou=true;
        girar(alvo);
        // O prêmio da pessoa fica sozinho aceso: os outros setores
        // apagam, e o sorteado ganha um contorno pulsante. Sem esse
        // fecho, a roleta para e ninguém sabe onde ela parou.
        for(var k=0;k<n;k++){var pk=$("wf-wsec-"+gid+"-"+k);if(pk&&k!==i)pk.style.fillOpacity="0.28"}
        var pv=$("wf-wsec-"+gid+"-"+i);
        if(pv&&pv.getAttribute){
          try{
            var ov=document.createElementNS("http://www.w3.org/2000/svg","path");
            ov.setAttribute("d",pv.getAttribute("d")||"");
            ov.setAttribute("fill","none");ov.setAttribute("stroke","#FFFFFF");
            ov.setAttribute("stroke-width","4");ov.setAttribute("stroke-linejoin","round");
            ov.setAttribute("class","wf-wglow");
            disco.appendChild(ov);
          }catch(e){}
        }
        // Quem usa leitor de tela não vê a roleta parar: ouve o prêmio.
        if(sr)sr.textContent=String(g.label||"");
        if(g.prize!=="none")confete();
        try{wfEmit("gameWheelStop",{game:"wheel",segment:i,label:g.label||null})}catch(e){}
        end(900);
      }
      // Quem pediu menos movimento não recebe cinco voltas: o disco vai
      // direto para o prêmio.
      if(lento){girar(((alvo%360)+360)%360);trava=setTimeout(terminar,450);cleanup=function(){clearTimeout(trava)};return}
      function pedir(f){if(window.requestAnimationFrame)window.requestAnimationFrame(f);else setTimeout(function(){f(Date.now())},16)}
      var t0=null;
      function passo(ts){
        if(fin||acabou)return;
        if(t0===null)t0=ts;
        var t=ts-t0;
        if(t>=TOT){terminar();return}
        var r=onde(t);girar(r);bater(r,ts);
        pedir(passo);
      }
      pedir(passo);
      // Trava: o quadro a quadro pode simplesmente não rodar (aba em
      // segundo plano, navegador sem rAF). O prêmio não pode ficar preso
      // atrás de uma animação.
      trava=setTimeout(terminar,TOT);
      cleanup=function(){clearTimeout(trava)};
      return;
    }
    // CARTAS: a escolhida vira primeiro, sozinha. As outras só depois —
    // e apagadas. Virar todas juntas transformaria o momento do prêmio
    // numa tabela.
    if(type==="cards"){
      var kn=parseInt(el.getAttribute("data-n"),10)||0;
      if(kn<1){end(0);return}
      var kpickAttr=el.getAttribute("data-pick");
      // Ninguém escolheu (mandou o formulário direto): a casa escolhe.
      var kpick=kpickAttr!==null&&kpickAttr!==""?parseInt(kpickAttr,10):Math.floor(Math.random()*kn);
      if(!(kpick>=0&&kpick<kn))kpick=0;
      el.setAttribute("data-done","1");
      var krot=[];
      try{krot=JSON.parse(el.getAttribute("data-labels")||"[]")}catch(e){krot=[]}
      // O rótulo da carta escolhida é o do servidor. Os das outras são os
      // que sobraram — tirando UMA ocorrência do prêmio ganho, para a
      // pessoa não ver o mesmo prêmio duas vezes e achar que foi roubada.
      var ksobra=[],kjaTirou=false;
      for(var kx=0;kx<krot.length;kx++){
        if(!kjaTirou&&krot[kx]===String(g.label||"")){kjaTirou=true;continue}
        ksobra.push(krot[kx]);
      }
      var klento=false;try{klento=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches)}catch(e){}
      var kcaixas=[],ksobraIdx=0;
      for(var kc=0;kc<kn;kc++){
        var kface=$("wf-cdb-"+gid+"-"+kc);
        if(kface)kface.textContent=kc===kpick?String(g.label||""):String(ksobra[ksobraIdx++]||"");
        var kin=$("wf-cdi-"+gid+"-"+kc);
        kcaixas.push(kin);
        var kcd=kin&&kin.parentNode;
        // Acabou o jogo: as cartas deixam de convidar o clique.
        if(kcd){kcd.style.cursor="default";kcd.removeAttribute("tabindex")}
      }
      var ksr=$("wf-cdsr-"+gid);
      function kvirar(idx){var n2=kcaixas[idx];if(!n2)return;if(n2.className.indexOf("wf-flip")<0)n2.className=n2.className+" wf-flip"}
      function kfim(){
        if(ksr)ksr.textContent=String(g.label||"");
        try{wfEmit("gameCardsRevealed",{game:"cards",card:kpick,label:g.label||null})}catch(e){}
        end(1000);
      }
      if(klento){for(var kk=0;kk<kn;kk++)kvirar(kk);kfim();return}
      var ktimers=[];
      kvirar(kpick);
      try{if(navigator.vibrate)navigator.vibrate(18)}catch(e){}
      ktimers.push(setTimeout(function(){
        for(var kj=0;kj<kn;kj++){
          if(kj===kpick)continue;
          (function(idx){ktimers.push(setTimeout(function(){
            var cd=kcaixas[idx]&&kcaixas[idx].parentNode;
            if(cd){cd.style.transition="opacity .4s";cd.style.opacity="0.45"}
            kvirar(idx);
          },idx*110))})(kj);
        }
      },760));
      ktimers.push(setTimeout(kfim,760+kn*110+520));
      cleanup=function(){for(var kt=0;kt<ktimers.length;kt++)clearTimeout(ktimers[kt])};
      return;
    }
    if(type==="scratch"){
      var cv=$("wf-scr-c-"+gid),pz=$("wf-scr-p-"+gid),hint=$("wf-scr-h-"+gid),badge=$("wf-scr-b-"+gid);
      if(pz)pz.textContent=String(g.label||"");
      var cx=null;try{cx=cv&&cv.getContext?cv.getContext("2d"):null}catch(e){}
      // Sem canvas (navegador antigo, leitor de tela): revela direto.
      if(!cv||!cx){if(cv)cv.style.display="none";if(badge)badge.style.display="none";end(1200);return}
      if(!cv.width||!cv.height)paintFoil(cv,cv.getAttribute("data-cover")||"#C0C6CF");
      var W=cv.width,H=cv.height,riscando=false,ultimo=null,passos=0,comecou=false,ocioso=null,auto=null;
      // O pincel acompanha o tamanho do cartão: num cartão pequeno, um
      // pincel fixo apagaria tudo num traço; num grande, levaria uma
      // eternidade.
      var pincel=Math.max(14,Math.min(W,H)/6);
      cv.style.cursor="grab";
      cv.setAttribute("data-scratchable","1");
      function revelar(){
        if(fin)return;
        cv.style.transition="opacity .45s";cv.style.opacity="0";cv.style.pointerEvents="none";
        if(badge)badge.style.opacity="0";
        end(1050);
      }
      function ponto(ev){
        var r=cv.getBoundingClientRect(),t=(ev.touches&&ev.touches[0])||ev;
        return{x:(t.clientX-r.left)*W/Math.max(1,r.width),y:(t.clientY-r.top)*H/Math.max(1,r.height)};
      }
      // Quanto da lâmina já saiu. Amostra 1 pixel a cada 64 — o suficiente
      // para a proporção e barato o bastante para rodar durante o arrasto.
      function conferir(){
        try{
          var d=cx.getImageData(0,0,W,H).data,vazios=0,tot=0;
          for(var k=3;k<d.length;k+=64){tot++;if(d[k]===0)vazios++}
          if(tot&&vazios/tot>0.5)revelar();
        }catch(e){revelar()}
      }
      // O traço é uma LINHA entre o ponto anterior e o atual, não um
      // círculo solto por evento: com o dedo rápido, os arcos soltos
      // deixavam buracos e a raspadinha parecia quebrada.
      function traco(q){
        cx.globalCompositeOperation="destination-out";
        cx.lineCap="round";cx.lineJoin="round";cx.lineWidth=pincel*2;
        if(ultimo){cx.beginPath();cx.moveTo(ultimo.x,ultimo.y);cx.lineTo(q.x,q.y);cx.stroke()}
        cx.beginPath();cx.arc(q.x,q.y,pincel,0,Math.PI*2);cx.fill();
        ultimo=q;
      }
      function adiarOcioso(){
        if(ocioso)clearTimeout(ocioso);
        // Começou a raspar e parou: já entendeu a brincadeira, abre o
        // resto em vez de deixar o prêmio pela metade.
        ocioso=setTimeout(revelar,6000);
      }
      function mover(ev){
        if(fin||!riscando)return;
        if(ev.cancelable)ev.preventDefault();
        if(!comecou){
          comecou=true;
          cv.style.cursor="grabbing";
          if(badge)badge.style.opacity="0";
          if(auto){clearTimeout(auto);auto=null}
          try{if(navigator.vibrate)navigator.vibrate(12)}catch(e){}
          try{wfEmit("gameScratchStart",{game:"scratch"})}catch(e){}
        }
        traco(ponto(ev));
        if(++passos%4===0)conferir();
        adiarOcioso();
      }
      function comecar(ev){if(fin)return;riscando=true;ultimo=null;mover(ev)}
      function soltar(){if(!riscando)return;riscando=false;ultimo=null;cv.style.cursor="grab";conferir()}
      // Pointer Events cobre mouse, dedo e caneta com um caminho só, e o
      // capture mantém o traço quando o dedo sai do cartão no meio.
      if(window.PointerEvent){
        cv.addEventListener("pointerdown",function(e){try{cv.setPointerCapture(e.pointerId)}catch(_e){}comecar(e)});
        cv.addEventListener("pointermove",mover);
        cv.addEventListener("pointerup",soltar);
        cv.addEventListener("pointercancel",soltar);
      }else{
        cv.addEventListener("mousedown",comecar);
        cv.addEventListener("mousemove",mover);
        window.addEventListener("mouseup",soltar);
        cv.addEventListener("touchstart",comecar,{passive:false});
        cv.addEventListener("touchmove",mover,{passive:false});
        cv.addEventListener("touchend",soltar);
      }
      // Quem não pode arrastar (teclado, leitor de tela) tem o atalho.
      if(hint){hint.style.display="block";hint.addEventListener("click",function(e){e.preventDefault();revelar()})}
      // Quem nunca encostou vê o prêmio mesmo assim.
      auto=setTimeout(revelar,20000);
      cleanup=function(){if(auto)clearTimeout(auto);if(ocioso)clearTimeout(ocioso);window.removeEventListener("mouseup",soltar)};
      return;
    }
  }catch(e){}
  end(0);
}
function renderBlock(b){
  var p=b.props||{},h="";
  switch(b.type){
    case"text":{
      var tag=({h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,p:1,div:1,span:1})[p.tag]?p.tag:"p";
      var ts=blockStyleStr(p);
      ts+="font-size:"+nv(p.fontSize,16)+"px;color:"+sv(p.color,"#111827")+";font-weight:"+sv(p.fontWeight,"normal")+";font-style:"+sv(p.fontStyle,"normal")+";text-decoration:"+sv(p.textDecoration,"none")+";text-align:"+sv(p.align,"left")+";line-height:"+nv(p.lineHeight,1.4)+";font-family:"+sv(p.fontFamily,"inherit")+";white-space:pre-wrap;";
      if(p.letterSpacing!=null)ts+="letter-spacing:"+nv(p.letterSpacing,0)+"px;";
      if(p.blockPadTop!=null||p.blockPadRight!=null||p.blockPadBottom!=null||p.blockPadLeft!=null)ts+="padding:"+nv(p.blockPadTop,0)+"px "+nv(p.blockPadRight,0)+"px "+nv(p.blockPadBottom,0)+"px "+nv(p.blockPadLeft,0)+"px;";
      h='<'+tag+' style="'+ts+'">'+esc(applyOffer(p.content||""))+'</'+tag+'>';
      break;
    }
    case"image":{
      var src=safeImg(p.src);
      if(!src){h="";break}
      var ist="width:"+(p.imgWidth?nv(p.imgWidth,100)+"%":sv(p.width,"100%"))+";max-height:"+nv(p.maxHeight,300)+"px;object-fit:"+sv(p.objectFit,"contain")+";border-radius:"+nv(p.borderRadius,0)+"px;display:inline-block;";
      if(p.shadow)ist+="box-shadow:"+sv(p.shadow,"")+";";
      var imgTag='<img src="'+esc(src)+'" alt="'+esc(p.alt||"")+'" style="'+ist+'" />';
      var hu=safeUrl(p.href);
      if(hu)imgTag='<a href="'+esc(hu)+'" target="_blank" rel="noopener noreferrer" style="display:inline-block">'+imgTag+'</a>';
      h='<div style="'+blockStyleStr(p,false,true)+'text-align:'+sv(p.align,"center")+';padding:'+nv(p.padding,0)+'px">'+imgTag+'</div>';
      break;
    }
    case"email":case"phone":case"name-input":case"text-input":case"date-input":{
      var nm=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"field")):(p.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"field"));
      var itype=b.type==="email"?"email":b.type==="phone"?"tel":b.type==="date-input"?"date":"text";
      var req=(p.required||b.type==="email")?' required':'';
      var phc=sv(p.placeholderColor,"#9CA3AF");
      var iid="wi_"+bid(b.id);
      var lbl=(p.showLabel&&p.label)?'<label for="'+iid+'" style="'+labelStyleStr(p)+'">'+esc(p.label)+'</label>':'';
      var ccAttr=(b.type==="phone"&&p.countryCode)?' data-cc="'+esc(p.countryCode)+'"':'';
      // Progressive-profiling prefill (bug fix): emit value= for a known
      // field so a returning visitor sees it pre-populated. Same mapTo
      // derivation as visibleBlocks; only string values prefill.
      var _mk=p.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"");
      var _pfv=(_ppFill&&_mk&&typeof _knownFields[_mk]==="string")?_knownFields[_mk]:"";
      var _va=_pfv?' value="'+esc(_pfv)+'"':'';
      var inputHtml='<input id="'+iid+'" name="'+esc(nm)+'" type="'+itype+'" placeholder="'+esc(p.placeholder||"")+'"'+req+_va+vaStr(p)+ccAttr+' style="'+inputStyleStr(p)+'" />';
      var customCss='<style>#'+iid+'::placeholder{color:'+phc+';opacity:1}</style>';
      if(b.type==="phone"&&p.countryCode){
        var cc=esc(p.countryCode||"+55");
        var ccStyle="display:flex;align-items:center;padding:0 12px;border:"+nv(p.borderWidth,1)+"px "+sv(p.borderStyle,"solid")+" "+sv(p.borderColor,"#E5E7EB")+";border-radius:"+cornerPx(p.corners||"medium",p.cornerRadius||8)+"px;font-size:"+nv(p.fontSize,14)+"px;color:"+sv(p.textColor,"#111827")+";background:"+sv(p.backgroundColor,"#F9FAFB")+";white-space:nowrap;font-family:"+sv(p.fontFamily,"inherit")+";";
        inputHtml='<div style="display:flex;gap:8px;width:100%;"><span style="'+ccStyle+'">'+cc+'</span>'+inputHtml+'</div>';
      }
      h=customCss+'<div style="'+wrapStyleStr(p)+'"><div style="'+innerWrapStyleStr(p)+'">'+lbl+inputHtml+'</div></div>';
      break;
    }
    case"dropdown":{
      var ddName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"select")):(p.mapTo||p.label||"select");
      var ff=sv(st.fontFamily,"inherit");
      var opts=(p.options||[]).map(function(o){return'<option value="'+esc(o)+'">'+esc(o)+'</option>'}).join("");
      var ddLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:4px;font-family:'+ff+'">'+esc(p.label)+'</label>':"";
      // R9: no hardcoded PT placeholder — empty option label when absent.
      h='<div style="'+blockStyleStr(p,true)+'"'+branchAttr(p)+'>'+ddLabel+'<select name="'+esc(ddName)+'"'+(p.required?' required':'')+vaStr(p)+' style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box;font-family:'+ff+'"><option value="">'+esc(p.placeholder||"")+'</option>'+opts+'</select></div>';
      break;
    }
    case"radio":{
      var rName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"radio")):(p.mapTo||p.label||"radio");
      var rff=sv(st.fontFamily,"inherit");
      var rLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;font-family:'+rff+'">'+esc(p.label)+'</label>':"";
      var ri=(p.options||[]).map(function(o){return'<label style="display:'+(p.layout==="horizontal"?"inline-flex":"flex")+';align-items:center;gap:8px;margin:0 12px 8px 0;font-size:14px;cursor:pointer;font-family:'+rff+'"><input type="radio" name="'+esc(rName)+'" value="'+esc(o)+'"'+(p.required?" required":"")+' style="margin:0;accent-color:#F97316" />'+esc(o)+'</label>'}).join("");
      // R9: required radio group — container marker consumed by validateStep.
      h='<div style="'+blockStyleStr(p,true)+'"'+branchAttr(p)+'>'+rLabel+'<div'+(p.required?' data-wfreq="1"'+vaStr(p):'')+'>'+ri+'</div></div>';
      break;
    }
    // Escolha: os botões empilhados que abrem quase todo popup bom que
    // existe por aí ("What are you shopping for?"). Clicar é a resposta E
    // o avanço — sem bolinha de rádio, sem segundo botão "continuar".
    // A resposta vai num campo escondido, então cai na submissão como
    // qualquer outro campo, e cada opção pode levar a uma etapa própria.
    case"choice":{
      var chOpts=[];
      var chRaw=p.options||[];
      for(var ci=0;ci<chRaw.length&&ci<8;ci++){
        var co=chRaw[ci];
        if(typeof co==="string")chOpts.push({label:co,value:co,next:""});
        else if(co&&typeof co==="object")chOpts.push({label:String(co.label||co.value||""),value:String(co.value!=null?co.value:co.label||""),next:String(co.next||"")});
      }
      chOpts=chOpts.filter(function(o){return o.label});
      if(!chOpts.length)break;
      var chId=bid(b.id),chName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"escolha")):(p.mapTo||p.label||"escolha");
      var chFf=sv(st.fontFamily,"inherit");
      var chGap=nv(p.gap,10),chRad=nv(p.borderRadius,10);
      var chBg=sv(p.optionBg,"#FFFFFF"),chFg=sv(p.optionColor,"#111827");
      var chBw=nv(p.borderWidth,0),chBc=sv(p.borderColor,"#111827");
      var chFs=nv(p.fontSize,15),chFw=sv(p.fontWeight,"600");
      var chPv=nv(p.paddingV,16),chPh=nv(p.paddingH,18);
      var chUp=p.uppercase?"text-transform:uppercase;letter-spacing:"+nv(p.letterSpacing,1)+"px;":"";
      var chHover=sv(p.hoverBg,"");
      var chCss=chHover?'<style>#'+chId+' .wf-ch:hover{background:'+chHover+'!important}</style>':"";
      var chBtns="";
      for(var cj=0;cj<chOpts.length;cj++){
        var op=chOpts[cj];
        var nextAt=op.next&&stepIndexById(op.next)>=0?' data-next="'+esc(op.next)+'"':"";
        chBtns+='<button type="button" class="wf-ch" data-action="next-step" data-choice="'+esc(op.value)+'" data-choice-input="wf-cho-'+chId+'"'+nextAt
          +' style="box-sizing:border-box;display:block;width:100%;margin:0;padding:'+chPv+'px '+chPh+'px;background:'+chBg+';color:'+chFg+';font-family:'+chFf+';font-size:'+chFs+'px;font-weight:'+chFw+';line-height:1.25;text-align:center;'+chUp
          +'border:'+(chBw>0?chBw+'px solid '+chBc:"none")+';border-radius:'+chRad+'px;cursor:pointer;transition:background .18s,transform .18s;-webkit-tap-highlight-color:transparent">'+esc(applyOffer(op.label))+'</button>';
      }
      var chDecline=p.declineText?'<button type="button" data-action="close" style="display:block;margin:'+nv(p.declineGap,14)+'px auto 0;background:none;border:none;padding:4px;font-family:'+chFf+';font-size:'+nv(p.declineSize,13)+'px;color:'+sv(p.declineColor,"#6B7280")+';text-decoration:underline;cursor:pointer">'+esc(p.declineText)+'</button>':"";
      var chLabel=(p.showLabel!==false&&p.label)?'<div style="font-family:'+chFf+';font-size:'+nv(p.labelSize,15)+'px;color:'+sv(p.labelColor,"#374151")+';text-align:center;margin:0 0 '+nv(p.labelGap,14)+'px">'+esc(applyOffer(p.label))+'</div>':"";
      h=chCss+'<div id="'+chId+'" style="'+blockStyleStr(p,true)+'">'+chLabel
        +'<input type="hidden" id="wf-cho-'+chId+'" name="'+esc(chName)+'" value="" />'
        +'<div style="display:flex;flex-direction:column;gap:'+chGap+'px">'+chBtns+'</div>'+chDecline+'</div>';
      break;
    }
    case"checkbox":{
      var cbName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"check")):(p.mapTo||p.label||"check");
      var cbff=sv(st.fontFamily,"inherit");
      var cbLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;font-family:'+cbff+'">'+esc(p.label)+'</label>':"";
      var ci=(p.options||[]).map(function(o){return'<label style="display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;cursor:pointer;font-family:'+cbff+'"><input type="checkbox" name="'+esc(cbName)+'" value="'+esc(o)+'" style="margin:0;accent-color:#F97316" />'+esc(o)+'</label>'}).join("");
      // R9: required checkbox group = at least one checked of that name.
      h='<div style="'+blockStyleStr(p,true)+'"'+branchAttr(p)+'>'+cbLabel+'<div'+(p.required?' data-wfreq="1"'+vaStr(p):'')+'>'+ci+'</div></div>';
      break;
    }
    case"legal-consent":{
      // R7: escape everything, re-allow only whitelisted-scheme anchors.
      // Um input por bloco (consent__<id>): cada bloco é uma decisão
      // própria, por canal. Nunca pré-marcado — a ANPD veda.
      var chs=Array.isArray(p.channels)&&p.channels.length?p.channels.join(","):"email";
      h='<div style="'+blockStyleStr(p,true)+'"><label style="display:flex;align-items:flex-start;gap:8px;font-size:'+nv(p.fontSize,12)+'px;color:'+sv(p.color,"#6B7280")+';cursor:pointer;line-height:'+nv(p.lineHeight,1.4)+'"><input type="checkbox" name="consent__'+bid(b.id)+'" data-channels="'+esc(chs)+'"'+(p.required?" required":"")+vaStr(p)+' style="margin-top:2px;flex-shrink:0" /><span>'+legalHtml(p.text||"",p.linkColor)+'</span></label></div>';
      break;
    }
    case"button":{
      var act=p.action||"submit";
      var btnBorder=p.btnBorderWidth?"border:"+nv(p.btnBorderWidth,1)+"px "+sv(p.btnBorderStyle,"solid")+" "+sv(p.btnBorderColor,"#E5E7EB"):"border:none";
      var btnId="wb_"+bid(b.id);
      var hoverCss=p.hoverColor?'<style>#'+btnId+':hover{background:'+sv(p.hoverColor,"")+'!important}</style>':"";
      var btnFam=sv(p.fontFamily||st.fontFamily,"inherit");
      var btnLs=p.btnLetterSpacing!=null?(nv(p.btnLetterSpacing,0)+"px"):"normal";
      var btnFw=sv(p.btnFontWeight,"700");
      // R7: data-url only when the URL passes the scheme whitelist.
      var bu2=act==="url"?safeUrl(p.url):"";
      var nextAttr=(act==="next-step"&&p.nextStepId&&stepIndexById(p.nextStepId)>=0)?' data-next="'+esc(p.nextStepId)+'"':"";
      var btn='<button id="'+btnId+'" type="'+(act==="submit"?"submit":"button")+'" data-action="'+esc(act)+'"'+nextAttr+(bu2?' data-url="'+esc(bu2)+'"':"")+' style="box-sizing:border-box!important;width:'+(p.fullWidth?"100%":"auto")+'!important;padding:'+nv(p.paddingV,14)+'px '+nv(p.paddingH,28)+'px!important;background:'+sv(p.bgColor,"#F97316")+';color:'+sv(p.textColor,"#fff")+'!important;font-size:'+nv(p.fontSize,15)+'px!important;font-weight:'+btnFw+'!important;font-family:'+btnFam+'!important;letter-spacing:'+btnLs+'!important;line-height:1.2!important;text-align:center!important;text-transform:none!important;border-radius:'+nv(p.borderRadius,8)+'px!important;'+btnBorder+'!important;cursor:pointer!important;margin:0!important;display:'+(p.fullWidth?"block":"inline-block")+'!important;transition:background 0.2s">'+esc(applyOffer(p.text||"OK"))+'</button>';
      // R10: honor p.align via wrapper when not fullWidth (editor default center).
      h='<div style="'+blockStyleStr(p)+(p.fullWidth?"":"text-align:"+sv(p.align,"center")+";")+'">'+hoverCss+btn+'</div>';
      break;
    }
    case"spacer":h='<div style="'+blockStyleStr(p)+'height:'+nv(p.height,24)+'px"></div>';break;
    case"line":h='<div style="'+blockStyleStr(p)+'"><hr style="border:none;border-top:'+nv(p.thickness,1)+'px '+sv(p.style,"solid")+' '+sv(p.color,"#E5E7EB")+';margin:0 auto;width:'+Math.min(Math.max(nv(p.width!=null?p.width:p.widthPct,100),1),100)+'%" /></div>';break;
    case"coupon":{
      if(OFFER.tier==="none"||(GAME.result&&GAME.result.prize==="none")){h="";break}
      var dyn=window.__wfDynCoupon&&window.__wfDynCoupon[FID];
      // Depois do envio, o código é o que o servidor emitiu. Se ele não
      // emitiu nada (a pessoa já usou o dela, pool vazio sem reserva), o
      // bloco some: mostrar o código de exemplo do editor entregava um
      // cupom que o checkout recusa, sem ninguém ficar sabendo.
      if(submitted&&!(dyn&&dyn.code)){h="";break}
      var couponCode=(dyn&&dyn.code)||p.code||"CODIGO";
      var boxCss=blockStyleStr(p,true)+'padding:12px 16px;border:2px '+sv(p.borderStyle,"dashed")+' '+sv(p.borderColor,"#F97316")+';border-radius:'+nv(p.borderRadius,8)+'px;text-align:center;background:'+sv(p.bgColor,"#FFF7ED");
      if(dyn&&dyn.show_code===false&&dyn.auto_apply!==false&&window.Shopify){
        // Aplicado sozinho no checkout: mostrar o código só confunde.
        h='<div style="'+boxCss+'"><p style="font-size:'+Math.round(nv(p.fontSize,20)*0.8)+'px;font-weight:bold;color:'+sv(p.codeColor,"#F97316")+';margin:0">'+esc(p.appliedText||"Desconto aplicado no seu carrinho")+'</p></div>';
      } else {
        h='<div style="'+boxCss+'"><p style="font-size:11px;color:#6B7280;margin:0 0 4px">'+esc(p.description||"")+'</p><p style="font-size:'+nv(p.fontSize,20)+'px;font-weight:bold;color:'+sv(p.codeColor,"#F97316")+';letter-spacing:2px;margin:0;cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent)">'+esc(couponCode)+'</p></div>';
      }
      break;
    }
    case"wheel":{
      var wsg=gameSegs(p);if(wsg.length<2)break;
      // Um disco que gira dentro de um aro que fica parado.
      //
      // A separação é o que faz a peça parecer objeto: aro metálico com
      // volume, brilho FIXO no alto (luz não gira junto com a coisa
      // iluminada), pinos nas divisões — que é onde o ponteiro bate — e
      // cubo cobrindo o miolo, onde todos os setores se encontram e
      // qualquer roleta desenhada fica feia.
      var wn=wsg.length,wid=bid(b.id),WR=132,WC=150,wsz=Math.max(200,Math.min(460,nv(p.size,320))),wp="",wpin="";
      var wStroke=sv(p.strokeColor,"#FFFFFF"),wRim=sv(p.rimColor,"#111827"),wPtr=sv(p.pointerColor,"#111827");
      for(var wi=0;wi<wn;wi++){
        var a0=(wi*360/wn-90)*Math.PI/180,a1=((wi+1)*360/wn-90-(wn===2?0.01:0))*Math.PI/180;
        wp+='<path id="wf-wsec-'+wid+'-'+wi+'" d="M'+WC+' '+WC+' L'+(WC+WR*Math.cos(a0)).toFixed(2)+' '+(WC+WR*Math.sin(a0)).toFixed(2)+' A'+WR+' '+WR+' 0 0 1 '+(WC+WR*Math.cos(a1)).toFixed(2)+' '+(WC+WR*Math.sin(a1)).toFixed(2)+' Z" fill="'+wsg[wi].color+'" stroke="'+wStroke+'" stroke-width="2" style="transition:fill-opacity .45s"></path>';
        var am=(wi+0.5)*360/wn-90,ar=am*Math.PI/180,tx=(WC+WR*0.63*Math.cos(ar)).toFixed(2),ty=(WC+WR*0.63*Math.sin(ar)).toFixed(2);
        wp+='<text x="'+tx+'" y="'+ty+'" transform="rotate('+am.toFixed(2)+' '+tx+' '+ty+')" text-anchor="middle" dominant-baseline="middle" font-size="'+nv(p.labelSize,13)+'" font-weight="800" font-family="inherit" fill="'+(wsg[wi].textColor||sv(p.labelColor,"#FFFFFF"))+'">'+esc(wsg[wi].label)+'</text>';
        // O pino fica na divisão, na borda do disco: gira com ele e é o
        // que passa por baixo do ponteiro.
        var ap=(wi*360/wn-90)*Math.PI/180;
        wpin+='<circle cx="'+(WC+(WR-4)*Math.cos(ap)).toFixed(2)+'" cy="'+(WC+(WR-4)*Math.sin(ap)).toFixed(2)+'" r="3.2" fill="#FFFFFF" fill-opacity=".92"></circle>';
      }
      // As luzinhas do aro. Elas NÃO giram — é o que faz o aro parecer a
      // moldura da máquina, e não a borda do desenho que roda.
      var wluz="",wnl=Math.min(24,Math.max(12,wn*3));
      for(var wl=0;wl<wnl;wl++){
        var wla=(wl*360/wnl-90)*Math.PI/180;
        wluz+='<circle cx="'+(WC+141*Math.cos(wla)).toFixed(2)+'" cy="'+(WC+141*Math.sin(wla)).toFixed(2)+'" r="2.3" fill="#FFFFFF" fill-opacity="'+(wl%2?".32":".62")+'"></circle>';
      }
      h='<div data-game="wheel" data-game-id="'+wid+'" data-n="'+wn+'"'+(p.sound===false?' data-sound="0"':'')+' style="'+blockStyleStr(p,true,true)+'text-align:center">'
        +'<div style="position:relative;display:inline-block;width:'+wsz+'px;max-width:100%;filter:drop-shadow(0 14px 28px rgba(0,0,0,.24))">'
        +'<svg id="wf-wheel-'+wid+'" viewBox="0 0 300 300" role="img" aria-label="'+esc(p.ariaLabel||"Roleta de pr\\u00eamios")+'" style="width:100%;height:auto;display:block;overflow:visible">'
        +'<defs>'
        +'<linearGradient id="wf-wrim-'+wid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+wfShade(wRim,46)+'"></stop><stop offset=".48" stop-color="'+wRim+'"></stop><stop offset="1" stop-color="'+wfShade(wRim,-30)+'"></stop></linearGradient>'
        +'<radialGradient id="wf-wsh-'+wid+'" cx=".33" cy=".24" r=".8"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".3"></stop><stop offset=".52" stop-color="#FFFFFF" stop-opacity=".05"></stop><stop offset="1" stop-color="#000000" stop-opacity=".16"></stop></radialGradient>'
        +'</defs>'
        +'<circle cx="150" cy="150" r="141" fill="none" stroke="url(#wf-wrim-'+wid+')" stroke-width="17"></circle>'
        +'<g id="wf-wdisc-'+wid+'" transform="rotate(0 150 150)">'+wp+wpin+'</g>'
        +'<circle cx="150" cy="150" r="132" fill="url(#wf-wsh-'+wid+')" pointer-events="none"></circle>'
        +'<circle cx="150" cy="150" r="132.5" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.5"></circle>'
        +wluz
        +'<circle cx="150" cy="150" r="26" fill="'+wStroke+'"></circle><circle cx="150" cy="150" r="26" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1"></circle><circle cx="150" cy="150" r="8.5" fill="'+wPtr+'"></circle>'
        +'</svg>'
        // O ponteiro fica FORA do svg que gira, com o pivô no topo: é ele
        // que a batida dos pinos empurra.
        +'<div id="wf-wptr-'+wid+'" style="position:absolute;left:50%;top:-3px;width:30px;height:46px;margin-left:-15px;z-index:2;transform-origin:50% 13%;transform:rotate(0deg);pointer-events:none"><svg viewBox="0 0 30 46" width="30" height="46" aria-hidden="true" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.32))"><path d="M15 46 L4.4 17.5 A11 11 0 1 1 25.6 17.5 Z" fill="'+wPtr+'" stroke="#FFFFFF" stroke-width="2.6" stroke-linejoin="round"></path><circle cx="15" cy="14.5" r="3.4" fill="#FFFFFF" fill-opacity=".92"></circle></svg></div>'
        +'<div id="wf-wcf-'+wid+'" style="position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:visible"></div>'
        +'<div id="wf-wsr-'+wid+'" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;white-space:nowrap;clip:rect(0 0 0 0)"></div>'
        +'</div>'+gameBtn(p,"Girar")+'</div>';
      break;
    }
    case"scratch":{
      var ssg=gameSegs(p);if(!ssg.length)break;
      var scid=bid(b.id),SW=Math.max(160,Math.min(480,nv(p.width,320))),SH=Math.max(80,Math.min(360,nv(p.height,190)));
      var scCov=sv(p.coverColor,"#C0C6CF"),scTxc=sv(p.coverTextColor,"#FFFFFF"),scTxt=String(p.coverText||"Raspe aqui").slice(0,40);
      h='<div data-game="scratch" data-game-id="'+scid+'" style="'+blockStyleStr(p,true,true)+'text-align:center">'
        +'<div id="wf-scr-'+scid+'" style="position:relative;display:inline-block;width:'+SW+'px;max-width:100%;height:'+SH+'px;border-radius:'+nv(p.cardRadius,14)+'px;overflow:hidden;background:'+sv(p.prizeBg,"#FFF7ED")+';box-shadow:0 6px 20px rgba(0,0,0,.14);-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent">'
        +'<div id="wf-scr-p-'+scid+'" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;padding:12px;font-size:'+nv(p.prizeSize,26)+'px;font-weight:800;color:'+sv(p.prizeColor,"#F97316")+';text-align:center;line-height:1.2">?</div>'
        +'<canvas id="wf-scr-c-'+scid+'" data-cover="'+scCov+'" aria-hidden="true" style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab"></canvas>'
        +'<div id="wf-scr-b-'+scid+'" style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);pointer-events:none;display:flex;align-items:center;justify-content:center;gap:9px;color:'+scTxc+';font-weight:800;font-size:13px;letter-spacing:1.6px;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.28);transition:opacity .25s">'
        +'<svg class="wf-hand" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V6a1.5 1.5 0 0 1 3 0v5"></path><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11"></path><path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V13"></path><path d="M9 11V9.5a1.5 1.5 0 0 0-3 0V14c0 3.3 2.7 6 6 6h1.5a4.5 4.5 0 0 0 4.5-4.5V13"></path></svg>'
        +'<span>'+esc(scTxt)+'</span></div>'
        +'</div>'
        +'<div id="wf-scr-h-'+scid+'" style="display:none;margin-top:10px;font-size:12px;color:#6B7280"><a href="#" style="color:inherit;text-decoration:underline">'+esc(p.revealText||"Revelar pr\\u00eamio")+'</a></div>'
        +gameBtn(p,"Raspar")+'</div>';
      (function(cid,cor,lw,lh){setTimeout(function(){
        var cv=$(cid);if(!cv)return;
        paintFoil(cv,cor,lw,lh);
        // Antes do envio o prêmio ainda não foi sorteado, então raspar não
        // teria o que revelar. Em vez de deixar o arrasto morrer no vazio
        // (ou, pior, de pintar um "cursor: não permitido" no cartão), o
        // primeiro toque leva o visitante ao campo que falta preencher.
        cv.addEventListener("pointerdown",function(){
          if(cv.getAttribute("data-scratchable"))return;
          var f=cv.closest?cv.closest("form"):null;
          // O primeiro input do formulário é a armadilha de robô
          // (_wf_hp, escondida fora da tela): focar nela levaria o
          // visitante para lugar nenhum.
          var alvo=f&&f.querySelector?f.querySelector('input:not([type=hidden]):not([disabled]):not([name="_wf_hp"]):not([tabindex="-1"])'):null;
          if(alvo&&alvo.focus)try{alvo.focus()}catch(e){}
        });
      },60)})("wf-scr-c-"+scid,scCov,SW,SH);
      break;
    }
    // AS CARTAS
    //
    // Três (ou quatro) cartas viradas para baixo. O visitante escolhe uma
    // — escolher é o jogo — e, no envio, ela vira em 3D e mostra o
    // prêmio. As outras viram depois, apagadas, mostrando o que dava para
    // ter tirado: é o que transforma "ganhei 10%" em "ganhei 10% e quase
    // peguei o frete grátis".
    //
    // O prêmio continua sendo do servidor. O que o navegador decide é só
    // QUAL carta a pessoa escolheu — que não muda nada do que ela ganha.
    case"cards":{
      var kseg=gameSegs(p);if(kseg.length<2)break;
      var kid=bid(b.id),kn=Math.max(2,Math.min(5,nv(p.count,3)));
      var kw=Math.max(60,Math.min(160,nv(p.cardWidth,96))),kh=Math.max(80,Math.min(220,nv(p.cardHeight,128)));
      var krad=nv(p.cardRadius,12),kgap=nv(p.gap,12);
      var kback=sv(p.backColor,"#FFFFFF"),kmark=String(p.backText||"?").slice(0,3),kmarkc=sv(p.backTextColor,"#F97316");
      var kfaceBg=sv(p.faceBg,"#111827"),kfaceFg=sv(p.faceColor,"#FFFFFF"),kfaceFs=nv(p.faceSize,15);
      // Os rótulos vão no container: na hora de virar, a carta escolhida
      // recebe o prêmio que o servidor sorteou e as outras recebem os
      // rótulos que sobraram.
      var klabels=[];for(var ka=0;ka<kseg.length;ka++)klabels.push(String(kseg[ka].label||""));
      var kcards="";
      for(var ki=0;ki<kn;ki++){
        kcards+='<div class="wf-cd" data-i="'+ki+'" role="button" tabindex="0" aria-label="'+esc(p.cardLabel||"Escolher carta")+' '+(ki+1)+'" style="width:'+kw+'px;height:'+kh+'px;border-radius:'+krad+'px;perspective:900px;flex:0 0 auto">'
          +'<div class="wf-cd-in" id="wf-cdi-'+kid+'-'+ki+'" style="border-radius:'+krad+'px">'
          +'<div class="wf-cd-f" style="background:'+kback+';color:'+kmarkc+';font-size:'+Math.round(kh*0.34)+'px;font-weight:800;box-shadow:0 6px 16px rgba(0,0,0,.16)">'+esc(kmark)+'</div>'
          +'<div class="wf-cd-b" id="wf-cdb-'+kid+'-'+ki+'" style="background:'+kfaceBg+';color:'+kfaceFg+';font-size:'+kfaceFs+'px;font-weight:800;line-height:1.2;padding:10px;box-shadow:0 6px 16px rgba(0,0,0,.16)"></div>'
          +'</div></div>';
      }
      h='<div data-game="cards" data-game-id="'+kid+'" data-n="'+kn+'" data-labels="'+esc(JSON.stringify(klabels))+'" style="'+blockStyleStr(p,true,true)+'text-align:center">'
        +'<div id="wf-cdw-'+kid+'" style="display:flex;flex-wrap:wrap;justify-content:center;gap:'+kgap+'px">'+kcards+'</div>'
        +'<div id="wf-cdsr-'+kid+'" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;white-space:nowrap;clip:rect(0 0 0 0)"></div>'
        +'<div id="wf-cdcf-'+kid+'" style="position:relative;height:0;pointer-events:none"></div>'
        +gameBtn(p,"Revelar")+'</div>';
      (function(gid){setTimeout(function(){
        var wrap=$("wf-cdw-"+gid);if(!wrap)return;
        var caixa=wrap.parentNode;
        function escolher(cd){
          if(caixa.getAttribute("data-done"))return;
          var todas=wrap.querySelectorAll(".wf-cd");
          for(var i=0;i<todas.length;i++)todas[i].removeAttribute("data-sel");
          cd.setAttribute("data-sel","1");
          caixa.setAttribute("data-pick",cd.getAttribute("data-i")||"0");
          try{wfEmit("gameCardPick",{game:"cards",card:parseInt(cd.getAttribute("data-i"),10)||0})}catch(e){}
          try{if(navigator.vibrate)navigator.vibrate(10)}catch(e){}
          // Escolheu: o que falta é o e-mail. Levar o cursor até ele é o
          // que fecha a distância entre brincar e se inscrever.
          var f=wrap.closest?wrap.closest("form"):null;
          var alvo=f&&f.querySelector?f.querySelector('input:not([type=hidden]):not([disabled]):not([name="_wf_hp"]):not([tabindex="-1"])'):null;
          if(alvo&&alvo.focus&&!alvo.value)try{alvo.focus()}catch(e){}
        }
        wrap.addEventListener("click",function(ev){
          var cd=ev.target&&ev.target.closest?ev.target.closest(".wf-cd"):null;
          if(cd&&wrap.contains(cd))escolher(cd);
        });
        // Teclado: as cartas são botões de verdade, não divs clicáveis.
        wrap.addEventListener("keydown",function(ev){
          if(ev.key!=="Enter"&&ev.key!==" ")return;
          var cd=ev.target&&ev.target.closest?ev.target.closest(".wf-cd"):null;
          if(!cd||!wrap.contains(cd))return;
          ev.preventDefault();escolher(cd);
        });
      },60)})(kid);
      break;
    }
    case"countdown":{
      var cdId="wcd_"+bid(b.id);
      var lbls=p.labels||{days:"DIAS",hours:"HORAS",minutes:"MIN",seconds:"SEG"};
      var fs=nv(p.fontSize,28);
      var nc=sv(p.numberColor,"#FFFFFF");
      var lc=sv(p.labelColor,"#9CA3AF");
      var bc2=sv(p.boxColor,"#1F2937");
      function cdCell(id,lbl){return'<span style="display:flex;flex-direction:column;align-items:center"><span id="'+id+'" style="font-size:'+fs+'px;font-weight:800;color:'+nc+';line-height:1">00</span><span style="font-size:9px;color:'+lc+';margin-top:4px;letter-spacing:1px">'+esc(lbl)+'</span></span>'}
      var sep='<span style="color:'+lc+';font-size:20px;font-weight:700;padding:0 4px">:</span>';
      h='<div style="'+blockStyleStr(p,true)+'text-align:center;padding:16px;background:'+bc2+';border-radius:8px"><div style="display:inline-flex;align-items:center;gap:4px">'+cdCell(cdId+"_d",lbls.days)+sep+cdCell(cdId+"_h",lbls.hours)+sep+cdCell(cdId+"_m",lbls.minutes)+sep+cdCell(cdId+"_s",lbls.seconds)+'</div></div>';
      var endDate=p.endDate;
      if(endDate){
        setTimeout(function(){
          var end=new Date(endDate).getTime();
          function tick(){
            var now=Date.now();var diff=Math.max(0,end-now);
            var d=Math.floor(diff/86400000);var hh=Math.floor((diff%86400000)/3600000);var mm=Math.floor((diff%3600000)/60000);var ss=Math.floor((diff%60000)/1000);
            var ed=$(cdId+"_d");if(ed)ed.textContent=String(d).padStart(2,"0");
            var eh=$(cdId+"_h");if(eh)eh.textContent=String(hh).padStart(2,"0");
            var em=$(cdId+"_m");if(em)em.textContent=String(mm).padStart(2,"0");
            var es=$(cdId+"_s");if(es)es.textContent=String(ss).padStart(2,"0");
            // Popup fechado: os elementos somem e o tique para.
            if(diff>0&&ed)setTimeout(tick,1000);
          }
          tick();
        },100);
      }
      break;
    }
  }
  return h;
}
function renderStep(stepIdx){
  var step=stepIdx<0?successStep:(steps[stepIdx]||{blocks:[]});
  // R10: success fallback — short design.successMessage when the merchant
  // configured no success-step blocks.
  if(stepIdx<0&&!hasSuccessBlocks&&successMsg){
    return '<p style="font-size:16px;color:#111827;text-align:center;margin:0">'+esc(successMsg)+'</p>';
  }
  return visibleBlocks(step.blocks||[]).map(renderBlock).join("");
}
// R6: at most one dismissal beacon per pageview, only for user-initiated closes.
function sendDismiss(){
  if(dismissSent)return;
  dismissSent=true;
  sessSet("_wf_sd_"+FID,Date.now());
  beacon("dismissed",{step:curStep});
}
// Fonts só quando o popup aparece: injetar o <link> em toda página, mesmo
// sem popup, custava LCP em cada visita da loja.
function ensureFonts(){
  // Só as famílias que o design usa — o link antigo baixava cinco de uma vez.
  var G={"Inter":"Inter:wght@400;500;600;700;800","Montserrat":"Montserrat:wght@400;500;600;700;800","Poppins":"Poppins:wght@400;500;600;700;800","Roboto":"Roboto:wght@400;500;700","Open Sans":"Open+Sans:wght@400;500;600;700"};
  var used={};
  function fam(v){if(!v)return;var f=String(v).split(",")[0].replace(/['"]/g,"").trim();if(G[f])used[f]=true}
  fam(st.fontFamily||"Inter, sans-serif");
  try{JSON.stringify(D,function(k,v){if(k==="fontFamily")fam(v);return v})}catch(e){}
  var q=[];for(var f in used)q.push("family="+G[f]);
  if(!q.length)return;
  var key=q.join("|").replace(/[^A-Za-z]/g,"");
  if(document.querySelector('link[data-wf-fonts="'+key+'"]'))return;
  var lid=document.getElementById("wf-fonts-link")?"wf-fonts-"+key.slice(0,40):"wf-fonts-link";
  if(!document.getElementById("wf-fonts-pre")){var pc=document.createElement("link");pc.id="wf-fonts-pre";pc.rel="preconnect";pc.href="https://fonts.gstatic.com";pc.crossOrigin="anonymous";document.head.appendChild(pc)}
  var fl=document.createElement("link");
  fl.id=lid;fl.setAttribute("data-wf-fonts",key);
  fl.rel="stylesheet";
  fl.href="https://fonts.googleapis.com/css2?"+q.join("&")+"&display=swap";
  document.head.appendChild(fl);
}
// R1: merchant-configurable error copy → server 400 error string → neutral
// English fallback (never PT-BR to international visitors).
function submitErrorText(status,res){
  var m=D.errorMessage||B.errorMessage||"";
  if(m)return String(m);
  if(status===400&&res&&typeof res.error==="string"&&res.error)return res.error;
  return "Something went wrong. Please try again.";
}
var showWaits=0;
function show(){
  if(shown){dlog("show() ignored — already shown this pageview");return}
  // R11: one-popup-at-a-time mutex (embed exempt — it's page content).
  if(!isEmbed){
    if(window.__wfOpenPopup&&window.__wfOpenPopup!==FID){dlog("another popup ("+window.__wfOpenPopup+") is open — skipping this pageview");regState("blocked");return}
    // Um popup mais importante ainda não decidiu: espera até 3 s por ele.
    var hp=higherPending();
    if(hp&&showWaits<2){showWaits++;dlog("waiting for higher-priority popup "+hp);setTimeout(show,1500);return}
    window.__wfOpenPopup=FID;
  }
  shown=true;
  regState("shown");
  dlog("show() — popup rendering now");
  computeOffer();
  ensureFonts();
  try{
    if(perVisitorCfg.enabled){
      var perVisitorCk2="_wf_vt_"+FID;
      var prev=localStorage.getItem(perVisitorCk2);
      var d2=prev?JSON.parse(prev):{shows:[]};
      d2.shows=(d2.shows||[]).concat([Date.now()]).slice(-10);
      localStorage.setItem(perVisitorCk2,JSON.stringify(d2));
    }
  }catch(e){}
  var ov=document.createElement("div");ov.id="wf-ov-"+FID;
  var ovBg=st.overlay||{};
  var ovOn=ovBg.enabled!==false;
  var ovColor=sv(ovBg.color,"#000000");
  function hexRgba(hex,a){hex=hex.replace("#","");if(hex.length===3)hex=hex.split("").map(function(c){return c+c}).join("");var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);return"rgba("+r+","+g+","+b+","+a+")"}
  var ovBgStr=ovOn?hexRgba(ovColor,(ovBg.opacity!=null?ovBg.opacity/100:0.5)):"transparent";
  var ovStyle="position:fixed;z-index:999999;"+(st.animation==="none"?"":"animation:wfFade .3s ease;");
  if(formType==="flyout"){
    ovStyle+="right:16px;bottom:16px;top:auto;left:auto;display:block;background:transparent;";
  } else if(formType==="banner"){
    ovStyle+="top:0;left:0;right:0;bottom:auto;display:flex;justify-content:center;background:transparent;";
  } else if(formType==="fullpage"){
    ovStyle+="top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:"+(ovOn?ovBgStr:sv(st.backgroundColor,"#fff"))+";";
  } else {
    ovStyle+="top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:"+ovBgStr+";";
  }
  ov.style.cssText=ovStyle;
  var cox=B.clickOutsideClose||{desktop:true,mobile:true};
  var coxEnabled=mob()?cox.mobile!==false:cox.desktop!==false;
  if(coxEnabled&&(formType==="popup"||formType==="fullpage"))ov.addEventListener("click",function(e){if(e.target===ov)close(true)});
  var si=st.sideImage||{};
  var rawSideUrl=si.src?safeImg(String(si.src).trim()):"";
  var sideUrlOk=!!rawSideUrl;
  var sidePct=Math.min(Math.max(nv(si.width,50),20),80);
  // R10: side image collapses on mobile; banner/flyout never host one.
  function hasSideAt(m){return sideUrlOk&&!!si.enabled&&!m&&formType!=="banner"&&formType!=="flyout"}
  var embedHost=isEmbed?document.querySelector('[data-worder-form="'+FID+'"]'):null;
  var pop=document.createElement("div");pop.id="wf-pop-"+FID;pop.className="wf-pop";
  // Fundo de imagem sangrando: é o formato de quase todo popup que
  // converte hoje — foto ocupando o cartão inteiro, marca pequena,
  // título grande por cima. Antes só existia imagem em COLUNA lateral,
  // que é o formato de e-mail, não de popup.
  var bgi=st.backgroundImage||{};
  var bgUrl=safeUrl(bgi.src||"");
  var hasBgImg=!!(bgi.enabled&&bgUrl);
  // O véu é o que mantém o texto legível sobre a foto. Gradiente por
  // padrão (escurece só onde o texto fica); estilo 'flat' quando a foto
  // é clara demais e precisa de um tom por cima inteiro.
  function veuCss(){
    var ov=bgi.overlay||{};
    if(ov.enabled===false)return "";
    var cor=sv(ov.color,"#000000"),op=Math.min(Math.max(nv(ov.opacity,45),0),100)/100;
    var rgba=hexToRgba(cor,op);
    if(ov.style==="flat")return "background-image:linear-gradient("+rgba+","+rgba+");";
    return "background-image:linear-gradient(to bottom,"+hexToRgba(cor,Math.max(0,op*0.15))+" 0%,"+hexToRgba(cor,Math.max(0,op*0.35))+" 45%,"+rgba+" 100%);";
  }
  function hexToRgba(hex,a){
    var m=/^#([0-9a-fA-F]{6})$/.exec(String(hex||""));
    if(!m)return "rgba(0,0,0,"+a+")";
    var n=parseInt(m[1],16);
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
  }
  var padT=st.paddingTop!=null?nv(st.paddingTop,32):(typeof st.padding==="number"?st.padding:32);
  var padR=st.paddingRight!=null?nv(st.paddingRight,32):(typeof st.padding==="number"?st.padding:32);
  var padB=st.paddingBottom!=null?nv(st.paddingBottom,32):(typeof st.padding==="number"?st.padding:32);
  var padL=st.paddingLeft!=null?nv(st.paddingLeft,32):(typeof st.padding==="number"?st.padding:32);
  var fontFam=sv(st.fontFamily,"Inter, sans-serif");
  // R10: width/min-height derived at SHOW time from the CURRENT viewport,
  // re-derived on resize/orientationchange while open.
  function popCss(m){
    var hs=hasSideAt(m);
    var w=m?Math.min(nv(st.width,480),window.innerWidth-32):nv(st.width,480);
    var minH=hs?Math.max(nv(st.minHeight,500),400):nv(st.minHeight,0);
    if(minH>0)minH=Math.min(minH,Math.floor(window.innerHeight*0.92));
    var anim=(st.animation==="none"||isEmbed)?"":"animation:"+(st.animation==="slide-up"?"wfSlide":"wfFade")+" .3s ease;";
    var s="box-sizing:border-box!important;position:relative!important;display:flex!important;flex-direction:row!important;overflow:hidden!important;background:"+sv(st.backgroundColor,"#fff")+"!important;"+anim;
    if(hasBgImg){
      s+='background-image:url("'+bgUrl+'")!important;background-size:'+sv(bgi.size,"cover")+'!important;background-position:'+sv(bgi.position,"center")+'!important;background-repeat:no-repeat!important;';
    }
    // Tela cheia no celular: é assim que as referências aparecem no
    // telefone, e é o que resolve o popup espremido em 320px de altura.
    if(m&&st.fullscreenMobile&&formType!=="banner"&&formType!=="fullpage"&&!isEmbed){
      s+="width:100vw!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;border-radius:0!important;box-shadow:none!important;";
      return s;
    }
    if(formType==="banner"){
      s+="width:100%!important;max-width:100%!important;border-radius:0;box-shadow:0 2px 8px rgba(0,0,0,0.08);";
    } else if(formType==="flyout"){
      s+="width:"+(m?"calc(100vw - 32px)":Math.min(w,400)+"px")+"!important;max-width:calc(100vw - 32px)!important;border-radius:"+nv(st.borderRadius,16)+"px;box-shadow:0 20px 40px -10px rgba(0,0,0,0.3);";
    } else if(formType==="fullpage"){
      s+="width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;border-radius:0;box-shadow:none;";
    } else if(isEmbed&&embedHost){
      s+="width:100%!important;max-width:100%!important;border-radius:"+nv(st.borderRadius,16)+"px;box-shadow:none;";
    } else {
      s+="width:"+w+"px!important;max-width:calc(100vw - 32px)!important;border-radius:"+nv(st.borderRadius,16)+"px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);";
    }
    if(minH>0&&formType!=="fullpage")s+="min-height:"+minH+"px!important;";
    return s;
  }
  function contentCss(m){
    var hs=hasSideAt(m);
    var basis=hs?(100-sidePct)+"%":"100%";
    var maxH=formType==="banner"?"none":(formType==="flyout"?"80vh":(formType==="fullpage"?"100vh":"90vh"));
    // display:flex column + margin:auto on the child = editor's vertical
    // centering parity, safe under overflow (auto margins collapse to 0).
    var fundo=hasBgImg?"background:transparent;"+veuCss():"background:"+sv(st.backgroundColor,"#fff")+";";
    if(m&&st.fullscreenMobile&&formType!=="banner"&&!isEmbed)maxH="100dvh";
    return "box-sizing:border-box!important;flex:1 1 "+basis+"!important;min-width:0!important;max-width:"+basis+"!important;"+fundo+"padding:"+padT+"px "+padR+"px "+padB+"px "+padL+"px;overflow-y:auto;max-height:"+maxH+";font-family:"+fontFam+";display:flex;flex-direction:column;";
  }
  var content=document.createElement("div");
  var sideEl=null;
  function applySize(){
    var m=mob();
    pop.style.cssText=popCss(m);
    content.style.cssText=contentCss(m);
    if(sideEl)sideEl.style.display=hasSideAt(m)?"block":"none";
  }
  applySize();
  window.addEventListener("resize",applySize);
  window.addEventListener("orientationchange",applySize);
  _cleanupSize=function(){window.removeEventListener("resize",applySize);window.removeEventListener("orientationchange",applySize)};
  if(st.closeButton&&st.closeButton.show!==false){
    var cbs=Math.min(Math.max(nv(st.closeButton.size,32),20),56);
    var cb=document.createElement("button");cb.innerHTML="&times;";
    cb.type="button";cb.setAttribute("aria-label","Fechar");cb.setAttribute("data-action","close");
    cb.onclick=function(ev){if(ev&&ev.preventDefault)ev.preventDefault();close(true)};
    cb.style.cssText="position:absolute;top:12px;right:12px;z-index:2;width:"+cbs+"px;height:"+cbs+"px;border-radius:50%;background:rgba(0,0,0,0.06);border:none;font-size:"+Math.round(cbs*0.625)+"px;color:"+sv(st.closeButton.color,"#6B7280")+";cursor:pointer;display:flex;align-items:center;justify-content:center";
    pop.appendChild(cb);
  }
  pop.appendChild(content);
  if(sideUrlOk&&si.enabled&&formType!=="banner"&&formType!=="flyout"){
    sideEl=document.createElement("div");
    sideEl.style.cssText="box-sizing:border-box!important;flex:0 0 "+sidePct+"%!important;width:"+sidePct+"%!important;max-width:"+sidePct+"%!important;align-self:stretch!important;background-color:#F4F4F5;overflow:hidden;position:relative;";
    var sideImg=document.createElement("img");
    sideImg.src=rawSideUrl;
    sideImg.alt="";
    sideImg.style.cssText="display:block;width:100%;height:100%;object-fit:cover;object-position:center;";
    sideImg.onerror=function(){this.style.display="none"};
    sideEl.appendChild(sideImg);
    if(si.position==="left")pop.insertBefore(sideEl,content);else pop.appendChild(sideEl);
    sideEl.style.display=hasSideAt(mob())?"block":"none";
  }
  if(isEmbed){
    if(!embedHost){shown=false;regState("blocked");blockedBy("embed container [data-worder-form] missing");if(_cleanupSize){_cleanupSize();_cleanupSize=null}return}
    embedHost.innerHTML="";
    mountRoot(embedHost).appendChild(pop);
  } else {
    // Banner e flyout convivem com a página: marcá-los como modal prendia
    // o Tab dentro deles e roubava o foco de quem estava navegando.
    var isModal=formType==="popup"||formType==="fullpage";
    pop.setAttribute("role",isModal?"dialog":"region");
    if(isModal)pop.setAttribute("aria-modal","true");
    pop.setAttribute("aria-label",FNAME||"Popup");
    ov.appendChild(pop);
    mountRoot(document.body).appendChild(ov);
    // Teclado: ESC fecha, Tab circula dentro do popup, e o foco volta para
    // onde estava quando fechar.
    _prevFocus=document.activeElement;
    _keyHandler=function(e){
      if(e.key==="Escape"){e.preventDefault();close(true);return}
      if(e.key!=="Tab"||!isModal)return;
      var fs=focusables();if(!fs.length)return;
      var first=fs[0],last=fs[fs.length-1],cur=(ROOT&&ROOT.activeElement)||document.activeElement;
      if(e.shiftKey&&cur===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&cur===last){e.preventDefault();first.focus()}
    };
    document.addEventListener("keydown",_keyHandler);
    setTimeout(function(){var fs=focusables();var target=null;for(var i=0;i<fs.length;i++){if(/^(INPUT|SELECT|TEXTAREA)$/.test(fs[i].tagName)){target=fs[i];break}}(target||fs[0])&&(target||fs[0]).focus()},50);
  }
  // Impressão → /events: persiste na série diária E bate os contadores.
  // (O antigo {_track:'impression'} no submit só batia contador.)
  beacon("impression",{bucket:"exposed",traffic:TRAFFIC,page:PAGE.kind,propensity:propensity(),retrigger:RETRIG});
  wfEmit("popupView",{formType:formType});
  // novalidate: our validator replaces browser-native bubbles (R9), so
  // visitors never see the browser's locale-specific messages.
  var progressMax=0;
  function renderForm(html,forward){
    // Honeypot: an off-screen field real users never see or tab to, but
    // naive bots auto-fill. Harvested like any input; the submit handler
    // lifts it out of answers into payload._hp and the server silently
    // drops any submission that carries a value. autocomplete=off +
    // tabindex=-1 + aria-hidden keep humans and screen readers away.
    var hp='<div aria-hidden="true" style="position:absolute!important;left:-9999px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important"><label>Deixe este campo em branco<input type="text" name="_wf_hp" tabindex="-1" autocomplete="off" value="" /></label></div>';
    var sid=steps[curStep]&&steps[curStep].id;
    if(sid&&stepPath[stepPath.length-1]!==sid)stepPath.push(sid);
    // Barra de progresso (styles.progress): posição pela ordem das etapas.
    var prog="";
    var pg=st.progress||{};
    if(pg.enabled&&steps.length>1){
      // Pela trilha percorrida, nunca encolhe ao voltar e só fecha em 100
      // na última etapa do caminho.
      var isLast=curStep>=steps.length-1||(steps[curStep]&&steps[curStep].id&&stepPath.length>=steps.length);
      var pct=isLast?100:Math.max(progressMax,Math.min(95,Math.round((stepPath.length/steps.length)*100)));
      progressMax=pct;
      prog='<div class="wf-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'" style="height:'+nv(pg.height,4)+'px;background:'+sv(pg.trackColor,"#E5E7EB")+';border-radius:999px;margin:0 0 16px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:'+sv(pg.color,"#F97316")+';transition:width .3s ease"></div></div>';
    }
    content.innerHTML='<form id="wf-form-'+FID+'" novalidate style="margin:auto 0;width:100%">'+hp+prog+html+'</form>';
    bindForm();
    wfEmit("stepView",{step:curStep,stepId:sid||null,kind:(steps[curStep]&&steps[curStep].kind)||"form",steps:steps.length,path:stepPath.slice()});
    if(forward&&curStep>0)beacon("step",{step:curStep});
  }
  // Para onde ir depois desta etapa: opção escolhida com ramificação →
  // botão com etapa fixa → sequência.
  function nextStepFor(frm,btn){
    var target=-1;
    var holders=frm?frm.querySelectorAll("[data-wfbranch]"):[];
    for(var i=0;i<holders.length&&target<0;i++){
      var map=null;try{map=JSON.parse(holders[i].getAttribute("data-wfbranch")||"{}")}catch(e){map=null}
      if(!map)continue;
      var chosen=[];
      holders[i].querySelectorAll("select").forEach(function(s){if(s.value)chosen.push(s.value)});
      holders[i].querySelectorAll("input[type=radio],input[type=checkbox]").forEach(function(c){if(c.checked)chosen.push(c.value)});
      for(var j=0;j<chosen.length;j++){var idx=stepIndexById(map[chosen[j]]);if(idx>=0){target=idx;break}}
    }
    if(target<0&&btn&&btn.getAttribute("data-next"))target=stepIndexById(btn.getAttribute("data-next"));
    if(target<0)target=curStep<steps.length-1?curStep+1:-2;
    return target;
  }
  // R9: shared validator for submit AND next-step. Paints borders with the
  // block's errorColor and shows the block's requiredMsg/errorMsg when
  // provided; otherwise just the border — no hardcoded PT text.
  function clearErrors(f){
    f.querySelectorAll(".wf-fe").forEach(function(el){if(el.parentNode)el.parentNode.removeChild(el)});
    f.querySelectorAll("input,select,textarea").forEach(function(el){el.style.borderColor="";el.style.outline=""});
    f.querySelectorAll("[data-wfreq]").forEach(function(el){el.style.outline="";el.style.outlineOffset=""});
    var ea=$("wf-err-"+FID);
    if(ea)ea.style.display="none";
  }
  function fieldErr(afterEl,msg,color){
    if(!msg)return;
    var d=document.createElement("div");
    d.className="wf-fe";
    d.style.cssText="font-size:12px;margin:4px 0 8px;color:"+sv(color,"#EF4444")+";";
    d.textContent=msg;
    if(afterEl.parentNode)afterEl.parentNode.insertBefore(d,afterEl.nextSibling);
  }
  function validateStep(f){
    clearErrors(f);
    var ok=true,focusEl=null;
    function fail(el,msg,ec){ok=false;el.style.borderColor=ec;fieldErr(el,msg,ec);if(!focusEl)focusEl=el}
    f.querySelectorAll("input,select,textarea").forEach(function(inp){
      var t=(inp.type||"").toLowerCase();
      if(t==="radio")return;
      var ec=inp.getAttribute("data-wferrcolor")||"#EF4444";
      var req=inp.hasAttribute("required");
      if(t==="checkbox"){
        if(req&&!inp.checked){
          ok=false;
          inp.style.outline="2px solid "+ec;
          fieldErr(inp.closest("label")||inp,inp.getAttribute("data-wfreqmsg")||"",ec);
          if(!focusEl)focusEl=inp;
        }
        return;
      }
      var v=inp.value?String(inp.value).trim():"";
      if(req&&!v){fail(inp,inp.getAttribute("data-wfreqmsg")||"",ec);dlog("required input empty",inp.name);return}
      if(t==="email"&&v&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)){fail(inp,inp.getAttribute("data-wferrmsg")||"",ec);dlog("invalid email",v)}
    });
    // Required radio/checkbox groups: at least one checked per group.
    f.querySelectorAll("[data-wfreq]").forEach(function(g){
      var any=false;
      g.querySelectorAll("input").forEach(function(i){if(i.checked)any=true});
      if(!any){
        ok=false;
        var ec=g.getAttribute("data-wferrcolor")||"#EF4444";
        g.style.outline="1px solid "+ec;
        g.style.outlineOffset="2px";
        fieldErr(g,g.getAttribute("data-wfreqmsg")||"",ec);
        if(!focusEl)focusEl=g.querySelector("input");
      }
    });
    if(focusEl&&focusEl.focus){try{focusEl.focus()}catch(e){}}
    return ok;
  }
  // R2: keyed merge — LAST harvest of a name wins (re-submits/step re-visits
  // replace instead of appending "João,João"); same-name values within ONE
  // pass (checkbox groups) aggregate comma-separated.
  function harvest(f){
    // Campo desmarcado nesta etapa não pode sobreviver de uma visita
    // anterior: apaga o que pertence a este formulário e lê de novo.
    f.querySelectorAll("[name]").forEach(function(el){var k=el.getAttribute("name");if(k&&k!=="_wf_hp")delete allData[k]});
    var fd=new FormData(f);
    var seen={};
    fd.forEach(function(v,k){
      if(seen[k]){allData[k]=allData[k]+","+v}
      else{allData[k]=v;seen[k]=true}
    });
    // Contract: phone sent as FULL value with country code prepended.
    f.querySelectorAll('input[type="tel"]').forEach(function(inp){
      var k=inp.getAttribute("name");
      if(k&&allData[k])allData[k]=normPhone(allData[k],inp.getAttribute("data-cc")||"");
    });
  }
  var submitting=false;
  content.addEventListener("click",function(e){
    var btn=e.target.closest("[data-action]");
    if(!btn)return;
    var act=btn.getAttribute("data-action");
    dlog("button click action="+act);
    if(act==="next-step"){
      e.preventDefault();
      if(submitted)return;
      var frm=btn.closest("form")||$("wf-form-"+FID);
      if(!frm)return;
      // Bloco de escolha: o próprio botão é a resposta. Guarda no campo
      // escondido ANTES do harvest, senão a resposta não entra na
      // submissão.
      var chosen=btn.getAttribute("data-choice");
      if(chosen!=null){
        var hidId=btn.getAttribute("data-choice-input");
        var hidEl=hidId?$(hidId):null;
        if(hidEl)hidEl.value=chosen;
        wfEmit("choice",{value:chosen,step:curStep});
      }
      // R2: validate the CURRENT step before advancing, then harvest it.
      if(!validateStep(frm)){dlog("next-step blocked by validation");return}
      harvest(frm);
      var nxt=nextStepFor(frm,btn);
      dlog("next-step →",nxt);
      if(nxt>=0){curStep=nxt;renderForm(renderStep(curStep),true)}
      else if(nxt===-2){
        // Última etapa sem destino: o botão "próxima" envia.
        if(frm.requestSubmit)frm.requestSubmit();else{var sb=frm.querySelector('button[type="submit"]');if(sb)sb.click();else frm.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))}
      }
    }
    if(act==="prev-step"){
      e.preventDefault();
      if(submitted)return;
      var pf=btn.closest("form")||$("wf-form-"+FID);
      if(!pf)return;
      harvest(pf);
      // Volta pela trilha percorrida, não pela sequência: quem pulou uma
      // etapa não cai nela ao voltar.
      if(stepPath.length>=2){stepPath.pop();var back=stepIndexById(stepPath[stepPath.length-1]);if(back<0)back=Math.max(0,curStep-1);stepPath.pop();curStep=back;renderForm(renderStep(curStep),false)}
      else if(curStep>0){curStep--;renderForm(renderStep(curStep),false)}
    }
    if(act==="close"){e.preventDefault();close(true)}
    if(act==="url"&&btn.dataset.url){e.preventDefault();var uu=safeUrl(btn.dataset.url);if(uu)window.open(uu,"_blank","noopener")}
    if(act==="submit"){
      e.preventDefault();
      var fEl=btn.closest("form")||$("wf-form-"+FID);
      if(fEl){
        if(typeof fEl.requestSubmit==="function"){fEl.requestSubmit();}
        else{
          var ev=new Event("submit",{bubbles:true,cancelable:true});
          fEl.dispatchEvent(ev);
        }
      }
    }
  });
  function bindForm(){
    var f=$("wf-form-"+FID);
    if(!f)return;
    f.addEventListener("submit",function(e){
      e.preventDefault();
      dlog("submit event fired");
      // R5: hard re-entrancy guard against double submit.
      if(submitting){dlog("submit ignored — already in flight");return}
      if(!validateStep(f)){dlog("validation failed, abort submit");return}
      harvest(f);
      var sbtn=f.querySelector('button[type="submit"],button[data-action="submit"]');
      var sbtnTxt=sbtn?sbtn.textContent:"";
      function setLoading(on){
        if(!sbtn)return;
        sbtn.disabled=on;
        sbtn.style.opacity=on?"0.6":"";
        sbtn.textContent=on?(sbtnTxt+"…"):sbtnTxt;
      }
      // R1: inline error area INSIDE the form — no step navigation on failure.
      function showFormError(txt){
        var ea=$("wf-err-"+FID);
        if(!ea){
          ea=document.createElement("div");
          ea.id="wf-err-"+FID;
          ea.style.cssText="margin:8px 0 0;padding:10px 12px;border-radius:8px;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;font-size:13px;line-height:1.4;text-align:center;";
          f.appendChild(ea);
        }
        ea.style.display="block";
        ea.textContent=txt;
      }
      submitting=true;
      setLoading(true);
      dlog("submit posting to backend...");
      // Lift the honeypot out of answers into a top-level signal so it
      // never lands in the submission record; server drops non-empty _hp.
      var _hp=allData._wf_hp||"";
      if(allData._wf_hp!==undefined)delete allData._wf_hp;
      var payload={answers:allData};
      if(_hp)payload._hp=_hp;
      if(currentUtms.utm_source)payload.utm_source=currentUtms.utm_source;
      if(currentUtms.utm_medium)payload.utm_medium=currentUtms.utm_medium;
      if(currentUtms.utm_campaign)payload.utm_campaign=currentUtms.utm_campaign;
      if(currentUtms.utm_term)payload.utm_term=currentUtms.utm_term;
      if(currentUtms.utm_content)payload.utm_content=currentUtms.utm_content;
      // R4: identity signals so the server stitches this submission into the
      // visitor_identities row tracking this browser anonymously.
      var vid=getVisitorId();
      if(vid)payload.visitor_id=vid;
      var sid=getSessionId();
      if(sid)payload.session_id=sid;
      try{payload.page_url=location.href;payload.domain=location.hostname}catch(e){}
      if(stepPath.length)payload.step_path=stepPath.slice(0,30);
      payload.traffic_type=TRAFFIC;payload.page_kind=PAGE.kind;
      if(EXP)payload.variant_id=VARIANT_ID;
      payload.propensity_score=propensity();
      if(OFFER.bucket){payload.intent=OFFER.intent;payload.offer_bucket=OFFER.bucket;payload.offer_tier=OFFER.tier}
      fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,status:r.status,body:j}})})
      .then(function(out){
        var res=out.body||{};
        // R1: only run the success path on 2xx + success!==false. On failure:
        // inline error, re-enable button, NO cookies, NO pixels.
        if(!out.ok||res.success===false){
          submitting=false;
          setLoading(false);
          showFormError(submitErrorText(out.status,res));
          wfEmit("submitError",{status:out.status,code:res&&res.code||null});
          dlog("submit failed",out.status,res);
          return;
        }
        onSuccess(res);
      })
      .catch(function(err){
        submitting=false;
        setLoading(false);
        showFormError(submitErrorText(0,null));
        wfEmit("submitError",{status:0,code:"network"});
        dlog("submit network error",err);
      });
    });
  }
  function onSuccess(res){
    submitted=true;
    // R3: single write with the unified window (365d when stopAfterSubmission).
    scx(ck,"1",freq.stopAfterSubmission?365:SHOW_AFTER_DAYS);
    scx("_wf_sub","1",365);
    try{
      var idData={};
      var fullNameVal=allData.full_name||"";
      var fn=allData.first_name||(fullNameVal?String(fullNameVal).trim().split(/\\s+/)[0]:"");
      var ln=allData.last_name||(fullNameVal?String(fullNameVal).trim().split(/\\s+/).slice(1).join(" "):"");
      if(allData.email)idData.email=allData.email;
      if(allData.phone)idData.phone=allData.phone;
      if(fn)idData.firstName=fn;
      if(ln)idData.lastName=ln;
      idData.source="popup_form";
      idData.properties={form_id:FID,form_name:FNAME};
      if(idData.email||idData.phone){
        if(window.worder&&typeof window.worder.identify==="function"){
          window.worder.identify(idData);
        } else {
          var trackEp=(window.__worder&&window.__worder.config&&window.__worder.config.endpoint)||(BU+"/api/track");
          fetch(trackEp+"/identify",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:JSON.stringify({
            storeDomain:(window.__worder&&window.__worder.config&&window.__worder.config.shopDomain)||location.hostname,
            email:idData.email||null,phone:idData.phone||null,
            firstName:idData.firstName||null,lastName:idData.lastName||null,
            source:"popup_form",properties:idData.properties,
            timestamp:new Date().toISOString()
          })}).catch(function(){});
        }
        if(idData.email){
          var ed=new Date();ed.setTime(ed.getTime()+730*24*60*60*1000);
          document.cookie="__worder_id_email="+encodeURIComponent(idData.email)+";expires="+ed.toUTCString()+";path=/;SameSite=Lax";
          fetch("/cart/update.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
            attributes:{"_worder_email":idData.email,"_worder_fn":idData.firstName||"","_worder_ln":idData.lastName||"","_worder_phone":idData.phone||""}
          })}).catch(function(){});
          try{
            if(window.Shopify&&window.Shopify.analytics&&typeof window.Shopify.analytics.publish==="function"){
              window.Shopify.analytics.publish("worder_identified",{
                email:idData.email||"",
                phone:idData.phone||"",
                firstName:idData.firstName||"",
                lastName:idData.lastName||""
              });
            }
          }catch(e){}
        }
      }
    }catch(err){}
    try{
      var tr=res&&res.tracking||{};
      var evts=tr.events||[];
      if(tr.facebook_pixel_id&&typeof window.fbq==="function"){
        evts.forEach(function(ev){
          if(ev.platforms&&ev.platforms.facebook){
            var fbData={};
            if(ev.value)fbData.value=parseFloat(ev.value)||0;
            if(ev.currency)fbData.currency=ev.currency;
            window.fbq("trackCustom",ev.name||"Lead",fbData);
          }
        });
        if(evts.length===0)window.fbq("track","Lead");
      }
      if((tr.google_analytics_id||tr.google_ads_id)&&typeof window.gtag==="function"){
        evts.forEach(function(ev){
          if(ev.platforms&&ev.platforms.google){
            var gaData={};
            if(ev.value)gaData.value=parseFloat(ev.value)||0;
            if(ev.currency)gaData.currency=ev.currency;
            window.gtag("event",ev.name||"generate_lead",gaData);
          }
        });
        if(evts.length===0)window.gtag("event","generate_lead",{});
      }
    }catch(err){}
    var act=postSubmit.action||"show-success";
    // R7: redirect target must pass the scheme whitelist, else the action drops.
    // O que o editor configurou vence a coluna legada redirect_url (que só
    // a tela de formulários clássicos edita e costuma estar desatualizada).
    var redirectUrl=safeUrl(postSubmit.redirectUrl||(res&&res.redirect_url)||"");
    // Inscrição e cupom valem para QUALQUER ação pós-envio: quem redireciona
    // para o carrinho é justamente quem mais precisa do auto-apply.
    wfEmit("signup",{
      email:allData.email||null,phone:allData.phone||null,
      submissionId:res&&res.submission_id||null,contactId:res&&res.contact_id||null,
      consent:res&&res.consent||null,doubleOptIn:!!(res&&res.double_optin_sent),whatsappOptIn:!!(res&&res.whatsapp_optin_sent)
    });
    var willAutoApply=false;
    if(res&&res.coupon&&res.coupon.code){
      window.__wfDynCoupon=window.__wfDynCoupon||{};
      window.__wfDynCoupon[FID]=res.coupon;
      willAutoApply=res.coupon.auto_apply!==false&&!!window.Shopify;
      // Auto-apply: a rota /discount/CODE da Shopify grava o cupom na
      // sessão do carrinho e o checkout já nasce com ele. O cookie vem no
      // próprio 302 — não precisa seguir o redirect nem baixar a página.
      if(willAutoApply&&!(act==="redirect"&&redirectUrl)){
        try{
          var du="/discount/"+encodeURIComponent(res.coupon.code)+"?redirect="+encodeURIComponent(location.pathname||"/");
          fetch(du,{credentials:"same-origin",redirect:"manual",cache:"no-store"}).catch(function(){});
        }catch(e){}
      }
      try{localStorage.setItem("_worder_coupon",JSON.stringify({code:res.coupon.code,kind:res.coupon.kind||null,ends_at:res.coupon.ends_at||null}))}catch(e){}
      beacon("reward",{kind:res.coupon.kind||null});
      wfEmit("rewardClaimed",{code:res.coupon.code,kind:res.coupon.kind||null,value:res.coupon.value!=null?res.coupon.value:null,endsAt:res.coupon.ends_at||null,autoApplied:willAutoApply});
    }
    function finish(){
    if(act==="redirect"&&redirectUrl){
      if(willAutoApply){
        // Mesma loja: a própria Shopify aplica e redireciona. Fora dela,
        // aplica pelo fetch e só então navega.
        var samePath=redirectUrl.charAt(0)==="/"?redirectUrl:null;
        try{var ru=new URL(redirectUrl,location.href);if(ru.origin===location.origin)samePath=ru.pathname+ru.search+ru.hash}catch(e){}
        if(samePath){window.location.href="/discount/"+encodeURIComponent(res.coupon.code)+"?redirect="+encodeURIComponent(samePath);return}
        try{fetch("/discount/"+encodeURIComponent(res.coupon.code)+"?redirect=%2F",{credentials:"same-origin",redirect:"manual",cache:"no-store"}).catch(function(){}).then(function(){window.location.href=redirectUrl})}catch(e){window.location.href=redirectUrl}
        setTimeout(function(){window.location.href=redirectUrl},1500);
        return;
      }
      window.location.href=redirectUrl;
      return;
    }
    if(act==="close"&&!isEmbed){
      close(false);
      return;
    }
    // R10: success content carries the same vertical-centering wrapper.
    content.innerHTML='<div id="wf-succ-'+FID+'" style="margin:auto 0;width:100%">'+renderStep(-1)+'</div>';
    if(res&&res.whatsapp_optin_sent){
      var wan=document.createElement("div");
      wan.style.cssText="margin:0 0 12px;padding:12px 14px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;font-size:13px;color:#065F46;line-height:1.45;text-align:center;";
      var waMsg=D.whatsappOptInMessage||B.whatsappOptInMessage||"";
      if(waMsg){wan.textContent=String(waMsg)}
      else{wan.innerHTML="<strong>Confirme no WhatsApp.</strong> Mandamos uma mensagem para voc\\u00ea responder e liberar as novidades por l\\u00e1."}
      var wsw=$("wf-succ-"+FID);
      if(wsw&&wsw.firstChild)wsw.insertBefore(wan,wsw.firstChild);
      else if(wsw)wsw.appendChild(wan);
      else content.insertBefore(wan,content.firstChild);
    }
    if(res&&res.double_optin_sent){
      // S9: attach the DOI notice to the success container (the old lookup
      // targeted a form id that no longer exists after the success render).
      var doi=document.createElement("div");
      doi.style.cssText="margin:0 0 12px;padding:12px 14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-size:13px;color:#9A3412;line-height:1.45;text-align:center;";
      var doiMsg=D.doiMessage||B.doiMessage||"";
      if(doiMsg){doi.textContent=String(doiMsg)}
      else{doi.innerHTML="<strong>Quase l\\u00e1!</strong> Enviamos um email para voc\\u00ea confirmar sua inscri\\u00e7\\u00e3o. Verifique sua caixa de entrada."}
      var sw=$("wf-succ-"+FID);
      if(sw&&sw.firstChild)sw.insertBefore(doi,sw.firstChild);
      else if(sw)sw.appendChild(doi);
      else content.insertBefore(doi,content.firstChild);
    }
    // O embed vive dentro da página do lojista: sumir com ele deixaria um
    // buraco onde estava o formulário.
    var delay=postSubmit.closeDelay!=null?nv(postSubmit.closeDelay,4):4;
    if(delay>0&&!isEmbed)setTimeout(function(){close(false)},delay*1000);
    }
    // Jogo: o servidor já sorteou. A roleta gira (ou a raspadinha abre) até
    // o prêmio, e só então entra a etapa de sucesso — que pode mostrar
    // {{prize}} e o cupom daquele nível.
    // O resultado vale mesmo se o jogo ficou numa etapa anterior: {{prize}}
    // e o cupom escondido em "nada" dependem dele; só a animação precisa
    // do elemento na tela.
    var gameEl=content.querySelector("[data-game]");
    if(res&&res.game){
      GAME.result=res.game;
      wfEmit("gameResult",{game:res.game.type||null,segment:res.game.segment,label:res.game.label||null,prize:res.game.prize||null});
    }
    if(res&&res.game&&gameEl)playGameAnim(gameEl,res.game,finish);
    else finish();
  }
  // Progressive profiling loads known fields before first render.
  loadKnownFields(function(){renderForm(renderStep(0))});
}
// R3/R6/S10: close(byUser). User-initiated closes fire the dismissal beacon
// (once, never after subscribe). The suppression cookie is only (re)written
// when the visitor did NOT subscribe, and never for embeds.
function close(byUser){
  var o=$("wf-ov-"+FID);
  if(o){o.remove()}
  else{
    var pp=$("wf-pop-"+FID);
    if(pp&&pp.parentNode)pp.parentNode.removeChild(pp);
  }
  unmountRoot();
  regState("done");
  if(_keyHandler){document.removeEventListener("keydown",_keyHandler);_keyHandler=null}
  if(_prevFocus&&_prevFocus.focus){try{_prevFocus.focus()}catch(e){}_prevFocus=null}
  if(window.__wfOpenPopup===FID)window.__wfOpenPopup=null;
  if(_cleanupSize){_cleanupSize();_cleanupSize=null}
  if(byUser&&!submitted)sendDismiss();
  if(shown)wfEmit("popupClose",{byUser:!!byUser,submitted:submitted,step:curStep});
  if(isEmbed)return;
  if(!submitted)scx(ck,"1",SHOW_AFTER_DAYS);
}
// Expose custom trigger API (always available)
window._worderOnsite=window._worderOnsite||[];
var _origPush=window._worderOnsite.push;
// openForm só abre depois dos gates (e nunca para quem caiu no controle):
// pedido antes da decisão fica na fila; bloqueado, é descartado.
if(ELIG===undefined)ELIG="pending";var pendingOpen=false;
function processCmd(cmd){
  if(!(Array.isArray(cmd)&&cmd[0]==="openForm"&&cmd[1]===FID))return;
  if(ELIG==="ok"){show()}
  else if(ELIG==="pending"){pendingOpen=true;dlog("openForm queued until gates decide")}
  else dlog("openForm ignored — popup not eligible on this page");
}
for(var _i=0;_i<window._worderOnsite.length;_i++){processCmd(window._worderOnsite[_i])}
window._worderOnsite.push=function(cmd){_origPush.call(window._worderOnsite,cmd);processCmd(cmd);return window._worderOnsite.length};

// Triggers (Klaviyo-style multi-condition with AND/OR). S4: when the boolean
// flags are absent, fall back to the legacy disp.trigger value — mirrors the
// editor's reads (timeEnabled ?? trigger==='time_delay', etc).
var disp=B.display||{};
var useExit=disp.exitEnabled===undefined?disp.trigger==="exit_intent":disp.exitEnabled===true;
var useTime=disp.timeEnabled===undefined?disp.trigger==="time_delay":disp.timeEnabled===true;
var useScroll=disp.scrollEnabled===undefined?disp.trigger==="scroll":disp.scrollEnabled===true;
var usePageView=disp.pageViewEnabled===true;
var matchAll=disp.matchAll===true;
var anyEnabled=useExit||useTime||useScroll||usePageView;
var delaySec=disp.delay!=null?disp.delay:(disp.delaySeconds!=null?disp.delaySeconds:5);

// Cart-value gate — async, fails open.
var cartCfg=B.cart||{};
var cartHas=cartCfg.contains||{};
var chH=lcList(cartHas.handles),chT=lcList(cartHas.types),chV=lcList(cartHas.vendors);
var cartHasOn=!!cartHas.enabled&&(chH.length||chT.length||chV.length);
function cartItemMatches(it){
  return(chH.length&&anyMatch(chH,it.handle))||(chT.length&&anyMatch(chT,it.product_type))||(chV.length&&anyMatch(chV,it.vendor));
}
function runCartGate(cb){
  var minP=Number(cartCfg.minTotal||0);
  var maxP=Number(cartCfg.maxTotal||0);
  var minI=Number(cartCfg.minItems||0);
  var wantsTotals=!!cartCfg.enabled&&(minP>0||maxP>0||minI>0);
  if(!wantsTotals&&!cartHasOn){cb(true);return}
  try{
    fetch("/cart.js",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(c){
      var total=Number(c.total_price||0)/100;
      var items=Number(c.item_count||0);
      try{sessP.cartItems=items;sessP.cartAt=Date.now();sessSet("_wf_prop",sessP)}catch(e){}
      if(wantsTotals){
        if(minP>0&&total<minP){cb(false);return}
        if(maxP>0&&total>maxP){cb(false);return}
        if(minI>0&&items<minI){cb(false);return}
      }
      if(cartHasOn){
        // "any": só mostra se o carrinho tem um dos produtos; "none": só se
        // não tem nenhum (ex.: oferecer o item que falta no kit).
        var hit=(c.items||[]).some(cartItemMatches);
        if(cartHas.match==="none"?hit:!hit){cb(false);return}
      }
      cb(true);
    }).catch(function(){cb(true)});
  }catch(e){cb(true)}
}
var perVisitorCfg=freq.perVisitor||{};
function perVisitorBlocked(){
  if(!perVisitorCfg.enabled)return false;
  var vid=getVisitorId();
  if(!vid)return false;
  var perVisitorCk="_wf_vt_"+FID;
  var raw=localStorage.getItem(perVisitorCk);
  if(!raw)return false;
  try{
    var d=JSON.parse(raw);
    var windowMs=Number(perVisitorCfg.windowDays||7)*86400000;
    var since=Date.now()-windowMs;
    var recent=(d.shows||[]).filter(function(t){return t>since});
    return recent.length>=Number(perVisitorCfg.maxShows||1);
  }catch(e){return false}
}
if(perVisitorBlocked()&&!useCustomTrigger&&!isEmbed&&!RETRIG){blockedBy("per-visitor cap");return}

var expCfg=B.experiment||{};
var HOLDOUT_PCT=Math.max(0,Math.min(50,nv(expCfg.holdoutPercent,0)));
function holdoutBucket(){
  if(HOLDOUT_PCT<=0)return"exposed";
  var key="bk_"+FID;
  var prev=lsGet(key);
  if(prev==="holdout"||prev==="exposed")return prev;
  var vid=getVisitorId();
  if(!vid){try{vid=sessionStorage.getItem("_wf_anon")||"";if(!vid){vid="anon-"+Math.random().toString(36).slice(2);sessionStorage.setItem("_wf_anon",vid)}}catch(e){vid="anon"}}
  var s=vid+"|"+FID,h=0;
  for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0}
  var b=(h%100)<HOLDOUT_PCT?"holdout":"exposed";
  lsSet(key,b,90);
  return b;
}

// Gate do servidor — inscritos e audiência (segmentos/listas). Uma ida só,
// cache de 10 minutos, falha aberta. Segmento "somente quem está" sem
// visitante identificado é a exceção: desconhecido não está em segmento.
var audCfg=B.audienceTargeting||{};
var audOn=(audCfg.mode==="include"||audCfg.mode==="exclude")&&(((audCfg.segmentIds||[]).length+(audCfg.listIds||[]).length)>0);
function runSubscriberGate(cb){
  if(DBG){dlog("subscriber gate bypassed (debug mode)");cb(true);return}
  if(!vis.hideFromSubscribers&&!audOn){cb(true);return}
  // O mesmo id que a submissão grava — não só o cookie, que o Safari apaga.
  var vid=getVisitorId();
  if(!vid){if(audOn&&audCfg.mode==="include"){blockedBy("audience gate — no visitor id");cb(false);return}cb(true);return}
  var cfgSig=vid+"|"+(vis.hideFromSubscribers?1:0)+"|"+JSON.stringify(audCfg),hh=0;
  for(var ci=0;ci<cfgSig.length;ci++){hh=(hh*31+cfgSig.charCodeAt(ci))>>>0}
  var ckCache="_wf_paw_"+FID+"_"+hh.toString(36);
  try{
    var raw=localStorage.getItem(ckCache);
    if(raw){
      var c=JSON.parse(raw);
      if(c&&c.t&&Date.now()-c.t<600000){
        if(c.a===false)blockedBy("subscriber gate (cached)");
        cb(c.a!==false);return;
      }
    }
  }catch(e){}
  var url=BU+"/api/public/forms/"+FID+"/preview-allowed?vid="+encodeURIComponent(vid)+
    "&domain="+encodeURIComponent((window.__worder&&window.__worder.config&&window.__worder.config.shopDomain)||location.hostname);
  fetch(url).then(function(r){return r.json()}).then(function(j){
    var allowed=j&&j.allowed!==false;
    try{localStorage.setItem(ckCache,JSON.stringify({t:Date.now(),a:allowed}))}catch(e){}
    if(!allowed)blockedBy("server gate — "+(j&&j.reason||"not allowed"));
    cb(allowed);
  }).catch(function(){cb(true)});
}

runSubscriberGate(function(subOk){
  if(!subOk)return;
runLocationGate(function(locOk){
  if(!locOk){blockedBy("location gate");return}
runCartGate(function(cartOk){
  if(!cartOk){blockedBy("cart gate");return}
  dlog("all gates passed",{ useExit:useExit, useTime:useTime, useScroll:useScroll, usePageView:usePageView, useCustomTrigger:useCustomTrigger, matchAll:matchAll, delay:delaySec });
  // Grupo de controle (hold-out): uma fatia dos elegíveis nunca vê o popup.
  // É o que separa receita ATRIBUÍDA de receita INCREMENTAL. Sorteio
  // determinístico por visitante+popup e pegajoso por 90 dias, para a
  // mesma pessoa não mudar de grupo entre visitas.
  var bucket=holdoutBucket();
  if(bucket==="holdout"&&!isEmbed&&!DBG){
    if(!window["__wf_ho_"+FID]){window["__wf_ho_"+FID]=true;beacon("holdout",{bucket:"holdout"})}
    wfEmit("campaignMatched",{holdout:true});
    blockedBy("holdout group ("+HOLDOUT_PCT+"%)");
    return;
  }
  wfEmit("campaignMatched",{holdout:false});
  ELIG="ok";
  if(pendingOpen){pendingOpen=false;dlog("openForm was queued — showing");show();return}
  // S10: embedded forms render immediately — no triggers, no frequency.
  if(isEmbed){dlog("embed form type — rendering immediately");show();return}
  if(RETRIG){
    // Segunda chance: sem gatilhos normais. Olha a intenção a cada segundo
    // e só volta quando o score passa do limiar — e nunca antes do delay
    // mínimo, contado do carregamento da página e do fechamento.
    var thr=Math.max(0,Math.min(100,nv(stCfg.threshold,60)));
    var minDelay=Math.max(5,nv(stCfg.minDelaySec,20))*1000;
    var t0=Date.now();
    regState("armed");
    dlog("smart re-trigger armed: threshold "+thr+", min delay "+minDelay+"ms");
    var rtTimer=setInterval(function(){
      if(shown){clearInterval(rtTimer);return}
      if(Date.now()-t0<minDelay)return;
      if(Date.now()-dismissedAt<minDelay)return;
      var sc=propensity();
      if(sc>=thr){clearInterval(rtTimer);sessSet("_wf_rt_"+FID,1);dlog("smart re-trigger fired, score "+sc);show()}
    },1000);
    return;
  }
  if(!anyEnabled&&!useCustomTrigger){
    dlog("no triggers configured, default 5s delay");
    setTimeout(function(){dlog("default 5s elapsed, showing");show();},5000);
    return;
  }
  if(!anyEnabled&&useCustomTrigger){
    dlog("custom trigger only — waiting for openForm");
    regState("armed");
    return;
  }
  // Tempo é determinístico (vai disparar): continua "pending" para os de
  // menor prioridade esperarem. Exit/scroll/páginas podem nunca vir.
  if(!useTime)regState("armed");

  var satisfied={exit:false,time:false,scroll:false,pv:false};
  function tryShow(which){
    dlog("tryShow:",which,"satisfied=",JSON.stringify(satisfied),"matchAll=",matchAll);
    satisfied[which]=true;
    if(matchAll){
      if((!useExit||satisfied.exit)&&(!useTime||satisfied.time)&&(!useScroll||satisfied.scroll)&&(!usePageView||satisfied.pv))show();
    } else {
      show();
    }
  }

  if(useTime){
    var td=nv(delaySec,5)*1000;
    dlog("time trigger armed: "+td+"ms");
    setTimeout(function(){dlog("time trigger fired");tryShow("time")},td);
  }

  if(useScroll){
    var sp=nv(disp.scrollPercent,30)||30;
    dlog("scroll trigger armed: "+sp+"%");
    var onScroll=function(){
      var max=document.body.scrollHeight-window.innerHeight;
      if(max<=0)return;
      var pct=(window.scrollY/max)*100;
      if(pct>=sp){window.removeEventListener("scroll",onScroll);dlog("scroll trigger fired at "+Math.round(pct)+"%");tryShow("scroll")}
    };
    window.addEventListener("scroll",onScroll,{passive:true});
  }

  if(useExit){
    dlog("exit-intent armed");
    // S13: require the cursor to actually LEAVE the document (relatedTarget /
    // toElement null), not just pass through the top 10px band.
    function onLeave(e){
      if(e.clientY<10&&!e.relatedTarget&&!e.toElement){
        dlog("exit-intent fired (desktop mouseout)");cleanupExit();tryShow("exit");
      }
    }
    document.addEventListener("mouseout",onLeave);
    var lastY=window.scrollY,lastT=Date.now();
    function onMobScroll(){
      if(window.innerWidth>=768)return;
      var y=window.scrollY,t=Date.now();
      var dy=lastY-y,dt=t-lastT;
      if(dy>=250&&dt<400&&y<window.innerHeight){dlog("exit-intent fired (mobile rapid scroll up)");cleanupExit();tryShow("exit");return}
      lastY=y;lastT=t;
    }
    window.addEventListener("scroll",onMobScroll,{passive:true});
    function onHide(){if(document.visibilityState==="hidden"){dlog("exit-intent fired (visibility hidden)");cleanupExit();tryShow("exit")}}
    document.addEventListener("visibilitychange",onHide);
    window.addEventListener("pagehide",onHide,{once:true});
    function cleanupExit(){
      document.removeEventListener("mouseout",onLeave);
      window.removeEventListener("scroll",onMobScroll);
      document.removeEventListener("visibilitychange",onHide);
    }
  }

  if(usePageView){
    var need=disp.pageViewCount||3;
    if(pvCount>=need)tryShow("pv");
  }
  });
});
});
`

/** Id do runtime na janela: muda quando o código muda, para versões conviverem. */
function runtimeKey(src: string): string {
  let h = 2166136261
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619) }
  return 'wfRT' + (h >>> 0).toString(36)
}

const RUNTIME_SRC = `(function(){
"use strict";
${helpers}
window[${JSON.stringify('__RTKEY__')}]=function(FID,FNAME,BU,D,B,EXP,VARIANT_ID,SMSG){
${RUNTIME_BODY}
};
})();`

const RUNTIME_ID = runtimeKey(RUNTIME_SRC)

/** Versão do runtime: entra no ETag do bundle para um deploy invalidar o cache. */
export const RUNTIME_VERSION = RUNTIME_ID

/**
 * O runtime, uma vez. Idempotente: se já estiver na página (outro bundle,
 * o script individual de um popup), a segunda cópia não faz nada.
 */
export function buildRuntimeScript(): string {
  const src = RUNTIME_SRC.replace('__RTKEY__', RUNTIME_ID)
  return `if(!window[${JSON.stringify(RUNTIME_ID)}]){${src}}`
}

/** A chamada de um popup: só os dados dele. */
export function buildPopupCall(form: PopupFormRecord, baseUrl: string): string {
  const design = form.design_json || {}
  // Coluna vazia ({}) não é "sem regras": é popup criado sem esse campo.
  // Nesse caso valem as regras do design, como o editor também faz.
  const beh = form.behavior && Object.keys(form.behavior).length ? form.behavior : (design.behavior || {})
  const args = [
    JSON.stringify(String(form.id)),
    JSON.stringify(String(form.name || '')),
    JSON.stringify(baseUrl),
    JSON.stringify(design),
    JSON.stringify(beh),
    JSON.stringify(form.experiment || null),
    JSON.stringify(String(form.id)),
    JSON.stringify(String(form.success_message || '')),
  ].join(',')
  return `window[${JSON.stringify(RUNTIME_ID)}](${args});`
}

/** Runtime + chamada: o script individual de um popup, autossuficiente. */
export function buildPopupScript(form: PopupFormRecord, baseUrl: string): string {
  return buildRuntimeScript() + '\n' + buildPopupCall(form, baseUrl)
}
