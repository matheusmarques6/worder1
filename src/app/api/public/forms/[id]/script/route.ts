import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, name, status, design_json, behavior, form_type, success_message, redirect_url')
      .eq('id', params.id)
      .single()

    if (!form || form.status !== 'published') {
      return new Response('/* Form not published */', { headers: { 'Content-Type': 'application/javascript' } })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
    const design = form.design_json || {}
    const beh = form.behavior || design.behavior || {}

    const script = `(function(){
"use strict";
var FID="${params.id}",BU="${baseUrl}",D=${JSON.stringify(design)},B=${JSON.stringify(beh)};
var shown=false,ck="_wf_"+FID;
function gc(n){var m=document.cookie.match("(^|;)\\\\s*"+n+"=([^;]*)");return m?m[2]:null}
function sc(n,v,d){var e=new Date();e.setDate(e.getDate()+d);document.cookie=n+"="+v+";path=/;expires="+e.toUTCString()+";SameSite=Lax"}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function cornerPx(c,r){return c==="none"?0:c==="small"?4:c==="medium"?8:c==="large"?16:c==="custom"?(r||0):8}
function inputStyleStr(p){
  var r=cornerPx(p.corners||"medium",p.cornerRadius||8);
  var und=p.inputStyle==="underline";
  var bw=p.borderWidth==null?1:p.borderWidth;
  var bs=p.borderStyle||"solid";
  var bc=p.borderColor||"#E5E7EB";
  var bg=und?"transparent":(p.backgroundColor||"#FFFFFF");
  var fam=p.fontFamily&&p.fontFamily!=="inherit"?p.fontFamily:"inherit";
  var s="width:100%;box-sizing:border-box;outline:none;";
  s+="padding:"+(p.inputPadTop==null?12:p.inputPadTop)+"px "+(p.inputPadRight==null?16:p.inputPadRight)+"px "+(p.inputPadBottom==null?12:p.inputPadBottom)+"px "+(p.inputPadLeft==null?16:p.inputPadLeft)+"px;";
  s+="background:"+bg+";color:"+(p.textColor||"#111827")+";";
  s+="font-family:"+fam+";font-size:"+(p.fontSize||14)+"px;";
  s+="font-weight:"+(p.bold?"700":"400")+";font-style:"+(p.italic?"italic":"normal")+";text-decoration:"+(p.underline?"underline":"none")+";";
  s+="text-align:"+(p.textAlign||"left")+";";
  if(und){s+="border:none;border-bottom:"+bw+"px "+bs+" "+bc+";border-radius:0;"}
  else{s+="border:"+bw+"px "+bs+" "+bc+";border-radius:"+r+"px;"}
  return s;
}
function wrapStyleStr(p){
  var a=p.align||"full";
  var jc=a==="center"?"center":(a==="right"?"flex-end":"flex-start");
  var s="display:flex;justify-content:"+jc+";width:100%;";
  s+="padding:"+(p.paddingTop||0)+"px "+(p.paddingRight||0)+"px "+(p.paddingBottom==null?8:p.paddingBottom)+"px "+(p.paddingLeft||0)+"px;";
  return s;
}
function innerWrapStyleStr(p){
  var a=p.align||"full";
  return "width:"+(a==="full"?"100%":"auto")+";max-width:100%;";
}
function labelStyleStr(p){
  return "display:block;font-size:13px;font-weight:500;color:"+(p.labelColor||"#374151")+";margin-bottom:4px;text-align:"+(p.textAlign||"left")+";";
}
if(gc(ck))return;
var freq=B.frequency||{};
var vis=B.visibility||{};
var isMob=window.innerWidth<768;
if(vis.devices==="desktop"&&isMob)return;
if(vis.devices==="mobile"&&!isMob)return;
if(vis.hideFromSubscribers&&gc("_wf_sub"))return;
var tgt=B.targeting||{};
if(tgt.pages==="specific"&&tgt.pageUrls&&tgt.pageUrls.length>0){
  var u=location.pathname;
  if(!tgt.pageUrls.some(function(p){return u.indexOf(p)>=0}))return;
}
var sched=B.scheduling||{};
if(sched.enabled){
  var now=Date.now();
  if(sched.startDate&&now<new Date(sched.startDate).getTime())return;
  if(sched.endDate&&now>new Date(sched.endDate).getTime())return;
}
var st=D.styles||{};
var steps=D.steps||[];
var successStep=D.successStep||{blocks:[{id:"s1",type:"text",props:{content:"Obrigado!",fontSize:24,color:"#111827",fontWeight:"bold",align:"center",tag:"h2"}},{id:"s2",type:"text",props:{content:"Sua inscrição foi confirmada.",fontSize:15,color:"#6B7280",align:"center",tag:"p"}}]};
var curStep=0;
var allData={};
function renderBlock(b){
  var p=b.props||{},h="";
  switch(b.type){
    case"text":h='<div style="font-size:'+((p.fontSize||16))+'px;color:'+(p.color||"#111827")+';font-weight:'+(p.fontWeight||"normal")+';text-align:'+(p.align||"left")+';margin:0 0 8px;line-height:1.3">'+((p.content||""))+'</div>';break;
    case"image":h=p.src?'<img src="'+p.src+'" alt="'+(p.alt||"")+'" style="width:'+(p.width||"100%")+';border-radius:'+(p.borderRadius||0)+'px;display:block;margin:0 0 12px" />':'';break;
    case"email":case"phone":case"name-input":case"text-input":case"date-input":{
      var nm=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"field")):(p.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"field"));
      var itype=b.type==="email"?"email":b.type==="phone"?"tel":b.type==="date-input"?"date":"text";
      var req=p.required||b.type==="email"?' required':'';
      var phc=p.placeholderColor||"#9CA3AF";
      var iid="wi_"+b.id;
      var lbl=(p.showLabel&&p.label)?'<label for="'+iid+'" style="'+labelStyleStr(p)+'">'+esc(p.label)+'</label>':'';
      var inputHtml='<input id="'+iid+'" name="'+esc(nm)+'" type="'+itype+'" placeholder="'+esc(p.placeholder||"")+'"'+req+' style="'+inputStyleStr(p)+'" />';
      var customCss='<style>#'+iid+'::placeholder{color:'+phc+';opacity:1}</style>';
      if(b.type==="phone"&&p.countryCode){
        var cc=esc(p.countryCode||"+55");
        var ccStyle="display:flex;align-items:center;padding:0 12px;border:"+(p.borderWidth==null?1:p.borderWidth)+"px "+(p.borderStyle||"solid")+" "+(p.borderColor||"#E5E7EB")+";border-radius:"+cornerPx(p.corners||"medium",p.cornerRadius||8)+"px;font-size:"+(p.fontSize||14)+"px;color:"+(p.textColor||"#111827")+";background:"+(p.backgroundColor||"#F9FAFB")+";white-space:nowrap;font-family:"+(p.fontFamily||"inherit")+";";
        inputHtml='<div style="display:flex;gap:8px;width:100%;"><span style="'+ccStyle+'">'+cc+'</span>'+inputHtml+'</div>';
      }
      h=customCss+'<div style="'+wrapStyleStr(p)+'"><div style="'+innerWrapStyleStr(p)+'">'+lbl+inputHtml+'</div></div>';
      break;
    }
    case"dropdown":var opts=(p.options||[]).map(function(o){return'<option value="'+o+'">'+o+'</option>'}).join("");h='<select name="'+(p.label||"select")+'" style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box;margin:0 0 8px"><option value="">'+(p.placeholder||"Selecione")+'</option>'+opts+'</select>';break;
    case"radio":var ri=(p.options||[]).map(function(o,i){return'<label style="display:'+(p.layout==="horizontal"?"inline-flex":"flex")+';align-items:center;gap:6px;margin:0 12px 6px 0;font-size:14px;cursor:pointer"><input type="radio" name="'+(p.label||"radio")+'" value="'+o+'" style="margin:0" />'+o+'</label>'}).join("");h='<div style="margin:0 0 8px">'+ri+'</div>';break;
    case"checkbox":var ci=(p.options||[]).map(function(o){return'<label style="display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:14px;cursor:pointer"><input type="checkbox" name="'+(p.label||"check")+'" value="'+o+'" style="margin:0" />'+o+'</label>'}).join("");h='<div style="margin:0 0 8px">'+ci+'</div>';break;
    case"legal-consent":h='<label style="display:flex;align-items:flex-start;gap:8px;font-size:'+(p.fontSize||12)+'px;color:#6B7280;margin:0 0 8px;cursor:pointer;line-height:1.4"><input type="checkbox" name="consent" '+(p.required?"required":"")+' style="margin-top:2px;flex-shrink:0" /><span>'+(p.text||"Concordo com a política de privacidade")+'</span></label>';break;
    case"button":var act=p.action||"submit";h='<button type="'+(act==="submit"?"submit":"button")+'" data-action="'+act+'" style="width:'+(p.fullWidth?"100%":"auto")+';padding:14px 28px;background:'+(p.bgColor||"#111827")+';color:'+(p.textColor||"#fff")+';font-size:'+(p.fontSize||15)+'px;font-weight:700;border-radius:'+(p.borderRadius||8)+'px;border:none;cursor:pointer;margin:0 0 8px;display:block">'+(p.text||"Enviar")+'</button>';break;
    case"spacer":h='<div style="height:'+(p.height||16)+'px"></div>';break;
    case"line":h='<hr style="border:none;border-top:'+(p.thickness||1)+'px solid '+(p.color||"#E5E7EB")+';margin:8px 0" />';break;
    case"coupon":h='<div style="margin:8px 0;padding:12px 16px;border:2px dashed '+(p.borderColor||"#F97316")+';border-radius:8px;text-align:center;background:'+(p.bgColor||"#FFF7ED")+'"><p style="font-size:11px;color:#6B7280;margin:0 0 4px">'+(p.description||"Seu cupom:")+'</p><p style="font-size:'+(p.fontSize||20)+'px;font-weight:bold;color:#F97316;letter-spacing:2px;margin:0;cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent)">'+(p.code||"CODIGO")+'</p></div>';break;
  }
  return h;
}
function renderStep(stepIdx){
  var step=stepIdx<0?successStep:(steps[stepIdx]||{blocks:[]});
  return(step.blocks||[]).map(renderBlock).join("");
}
function show(){
  if(shown)return;shown=true;
  var ov=document.createElement("div");ov.id="wf-ov-"+FID;
  var ovBg=st.overlay||{};
  ov.style.cssText="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,"+(ovBg.opacity!=null?ovBg.opacity/100:0.5)+");animation:wfFade .3s ease";
  if(ovBg.closeOnClick!==false)ov.addEventListener("click",function(e){if(e.target===ov)close()});
  var w=isMob?Math.min(st.width||480,window.innerWidth-32):(st.width||480);
  var hasSide=st.sideImage&&st.sideImage.enabled&&st.sideImage.src&&!isMob;
  var popW=hasSide?w+w*(st.sideImage.width||50)/100:w;
  var pop=document.createElement("div");pop.id="wf-pop-"+FID;
  pop.style.cssText="position:relative;display:flex;max-width:"+popW+"px;width:calc(100% - 32px);border-radius:"+(st.borderRadius||16)+"px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);animation:wfSlide .3s ease";
  var content=document.createElement("div");
  content.style.cssText="flex:1;background:"+(st.backgroundColor||"#fff")+";padding:"+(st.padding&&typeof st.padding==="object"?(st.padding.top||32)+"px "+(st.padding.right||32)+"px "+(st.padding.bottom||32)+"px "+(st.padding.left||32)+"px":(st.padding||32)+"px")+";overflow-y:auto;max-height:90vh";
  if(st.closeButton&&st.closeButton.show!==false){
    var cb=document.createElement("button");cb.innerHTML="&times;";cb.onclick=close;
    cb.style.cssText="position:absolute;top:12px;right:12px;z-index:2;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.06);border:none;font-size:20px;color:"+(st.closeButton.color||"#6B7280")+";cursor:pointer;display:flex;align-items:center;justify-content:center";
    pop.appendChild(cb);
  }
  content.innerHTML='<form id="wf-form-'+FID+'">'+renderStep(0)+'</form>';
  pop.appendChild(content);
  if(hasSide){
    var side=document.createElement("div");
    side.style.cssText="width:"+(st.sideImage.width||50)+"%;flex-shrink:0;background:url("+st.sideImage.src+") center/cover no-repeat";
    if(st.sideImage.position==="left")pop.insertBefore(side,content);else pop.appendChild(side);
  }
  ov.appendChild(pop);document.body.appendChild(ov);
  // Track impression
  fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({_track:"impression"})}).catch(function(){});
  // Form events
  var form=document.getElementById("wf-form-"+FID);
  if(form){
    form.addEventListener("click",function(e){
      var btn=e.target.closest("[data-action]");
      if(!btn)return;
      var act=btn.getAttribute("data-action");
      if(act==="next-step"){e.preventDefault();curStep++;content.innerHTML='<form id="wf-form-'+FID+'">'+renderStep(curStep)+'</form>';bindForm()}
      if(act==="close"){e.preventDefault();close()}
      if(act==="url"&&btn.dataset.url){e.preventDefault();window.open(btn.dataset.url,"_blank")}
    });
    bindForm();
  }
  function bindForm(){
    var f=document.getElementById("wf-form-"+FID);
    if(!f)return;
    f.addEventListener("submit",function(e){
      e.preventDefault();
      var fd=new FormData(f);
      fd.forEach(function(v,k){allData[k]=v});
      fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({answers:allData})})
      .then(function(){
        content.innerHTML=renderStep(-1);
        sc(ck,"1",freq.showAfterDays||30);
        if(freq.stopAfterSubmission)sc(ck,"1",365);
        sc("_wf_sub","1",365);
        setTimeout(close,4000);
      }).catch(function(){});
    });
  }
}
function close(){var o=document.getElementById("wf-ov-"+FID);if(o)o.remove();sc(ck,"1",freq.showAfterDays||1)}
var disp=B.display||{};
var trigger=disp.trigger||"time";
if(trigger==="time")setTimeout(show,(disp.delay||5)*1000);
else if(trigger==="scroll"){var sp=disp.scrollPercent||50;window.addEventListener("scroll",function(){if((window.scrollY/(document.body.scrollHeight-window.innerHeight))*100>=sp)show()})}
else if(trigger==="exit-intent")document.addEventListener("mouseout",function(e){if(e.clientY<5)show()});
else if(trigger==="immediate")show();
else if(trigger==="click"&&disp.clickSelector){document.querySelectorAll(disp.clickSelector).forEach(function(el){el.addEventListener("click",function(e){e.preventDefault();show()})})}
var s=document.createElement("style");s.textContent="@keyframes wfFade{from{opacity:0}to{opacity:1}}@keyframes wfSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}";document.head.appendChild(s);
})();`

    return new Response(script, {
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=300' },
    })
  } catch {
    return new Response('/* Error */', { headers: { 'Content-Type': 'application/javascript' } })
  }
}
